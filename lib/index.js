import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { createConnection } from 'node:net'
import os from 'node:os'
import path from 'node:path'

export const name = 'dsh-plugin-opencode2api'

const VERSION = process.env.OPENCODE2API_VERSION || '1.5.1'
const REPO = 'jasonxu114514/opencode2api'
const API_PORT = Number(process.env.OPENCODE2API_PORT || 8080)
const WEB_PORT = API_PORT + 1
const DOWNLOAD_TIMEOUT_MS = 120_000
const MIRRORS = ['', 'https://gh-proxy.com/', 'https://ghproxy.net/', 'https://ghfast.top/']

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const IS_CHECK = /dsh-go-check-/.test(HOME)
const DATA = path.join(HOME, 'dsh-go', 'opencode2api')
const IS_WIN = process.platform === 'win32'
const BIN = path.join(DATA, IS_WIN ? 'opencode2api.exe' : 'opencode2api')
const CFG = path.join(DATA, 'config.json')
const PID = path.join(DATA, 'opencode2api.pid')
const LOG = path.join(DATA, 'opencode2api.log')
const PASS = path.join(DATA, 'webui-password.txt')

let desired = true
let busy = false
let installing = null
let lastError = ''

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function human(error) {
  const message = String(error?.message ?? error ?? '')
  if (message.includes('ENOEXEC') || message.includes('ENOENT')) return '程序无法在当前平台运行，请手动安装或换平台'
  if (message.includes('EACCES')) return '程序没有执行权限'
  if (message.includes('sha256')) return '下载校验失败，请重试'
  if (/HTTP \d+/.test(message) || message.includes('fetch')) return '下载失败，请检查网络后重试'
  return message.slice(0, 60) || '操作失败'
}

function target() {
  const arch = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : null
  if (!arch) return null
  if (process.platform === 'win32') return { os: 'windows', arch, ext: 'zip', bin: 'opencode2api.exe' }
  if (process.platform === 'darwin') return { os: 'darwin', arch, ext: 'tar.gz', bin: 'opencode2api' }
  if (process.platform === 'linux') return { os: 'linux', arch, ext: 'tar.gz', bin: 'opencode2api' }
  return null
}

function randomKey(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length]
  return out
}

function defaultConfig() {
  return {
    listen: `0.0.0.0:${API_PORT}`,
    server_keys: [randomKey(32)],
    zen_keys: [],
    go_keys: [],
    anonymous: true,
    warp: { enabled: false, pool_size: 2, stack: 'ipv6', source_ipv6: '' },
    proxies: ['direct'],
    proxyfile: '',
    upstream: {
      zen: 'https://opencode.ai/zen',
      go: 'https://opencode.ai/zen/go',
      anonymous: 'https://opencode.ai/inference',
      prompt_environment: {},
    },
    retry: { max_attempts: 3, timeout_seconds: 300 },
    models: { refresh_seconds: 300, protocols: {}, free_only: false, active_probes: false },
    performance: {
      max_idle_conns: 2048,
      max_idle_conns_per_host: 256,
      max_conns_per_host: 0,
      idle_conn_timeout_seconds: 120,
      connect_timeout_seconds: 5,
      failure_cooldown_seconds: 15,
      attempt_timeout_seconds: 0,
      first_event_timeout_seconds: 0,
      max_anonymous_exits: 8,
      free_tier_block_seconds: 900,
    },
    logging: { level: 'info', ring_size: 2000, dump_request_bodies: false },
    webui: {
      enabled: true,
      listen: `0.0.0.0:${WEB_PORT}`,
      username: 'admin',
      password: randomKey(14),
      session_ttl_minutes: 720,
    },
    prefer: 'go',
    reasoning: { effort: 'high', effort_by_model: {} },
    rotation: {
      sota: {
        alias: 'sota',
        order: ['deepseek-v4.1-flash', 'glm-5.3', 'grok-4.6', 'kimi-k3', 'qwen3.8-max'],
      },
      sweet: { alias: 'sweet', order: [] },
      first_output_seconds: 30,
    },
  }
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CFG, 'utf8'))
  } catch {
    return defaultConfig()
  }
}

function ensureConfig() {
  if (!fs.existsSync(CFG)) {
    const cfg = defaultConfig()
    fs.mkdirSync(DATA, { recursive: true })
    fs.writeFileSync(PASS, `${cfg.webui.password}\n`, { mode: 0o600 })
    fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2))
  }
  return readConfig()
}

function readPassword() {
  try {
    return fs.readFileSync(PASS, 'utf8').trim()
  } catch {
    return ''
  }
}

function setListen(host) {
  const cfg = readConfig()
  cfg.listen = `${host}:${API_PORT}`
  cfg.webui = { ...(cfg.webui || {}), listen: `${host}:${WEB_PORT}` }
  fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2))
}

function lanAddress() {
  try {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const item of list || []) {
        if (item && item.family === 'IPv4' && !item.internal) return item.address
      }
    }
  } catch {}
  return ''
}

function findFile(dir, filename) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = findFile(full, filename)
      if (nested) return nested
    } else if (entry.name === filename) {
      return full
    }
  }
  return null
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.once('error', reject)
    child.once('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exit ${code}`))))
  })
}

async function fetchBuffer(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

async function download(relative, destination) {
  let lastFailure = null
  for (const prefix of MIRRORS) {
    const url = `${prefix}https://github.com/${REPO}/releases/download/v${VERSION}/${relative}`
    try {
      const body = await fetchBuffer(url)
      try {
        const shaBody = await fetchBuffer(`${url}.sha256`)
        const expected = shaBody.toString('utf8').trim().split(/\s+/)[0].toLowerCase()
        const actual = createHash('sha256').update(body).digest('hex')
        if (expected && expected !== actual) throw new Error('sha256 mismatch')
      } catch (error) {
        if (String(error?.message).includes('sha256')) throw error
      }
      await fsp.writeFile(destination, body)
      return
    } catch (error) {
      lastFailure = error
    }
  }
  throw lastFailure || new Error('download failed')
}

async function extract(archive, destination) {
  try {
    await runCommand('tar', ['-xf', archive, '-C', destination])
  } catch (error) {
    if (archive.endsWith('.zip') && IS_WIN) {
      await runCommand('powershell', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath "${archive}" -DestinationPath "${destination}" -Force`,
      ])
    } else {
      throw error
    }
  }
}

async function ensureInstalled(force = false) {
  if (installing) return installing
  installing = (async () => {
    fs.mkdirSync(DATA, { recursive: true })
    if (!force && fs.existsSync(BIN)) return
    const plat = target()
    if (!plat) throw new Error('当前平台暂不支持')
    const relative = `opencode2api_v${VERSION}_${plat.os}_${plat.arch}.${plat.ext}`
    const temp = path.join(DATA, `.install-${Date.now()}`)
    fs.mkdirSync(temp, { recursive: true })
    try {
      const archive = path.join(temp, relative)
      await download(relative, archive)
      await extract(archive, temp)
      const found = findFile(temp, plat.bin)
      if (!found) throw new Error('压缩包里没有找到程序')
      if (fs.existsSync(BIN)) fs.unlinkSync(BIN)
      await fsp.copyFile(found, BIN)
      if (!IS_WIN) fs.chmodSync(BIN, 0o755)
      lastError = ''
    } finally {
      await fsp.rm(temp, { recursive: true, force: true }).catch(() => {})
    }
  })()
  try {
    return await installing
  } finally {
    installing = null
  }
}

function portOpen(port = API_PORT, timeout = 800) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = (value) => {
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeout)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function readPid() {
  try {
    return Number(fs.readFileSync(PID, 'utf8').trim()) || null
  } catch {
    return null
  }
}

function alive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function health() {
  try {
    const res = await fetch(`http://127.0.0.1:${API_PORT}/healthz`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return null
    const body = await res.json()
    return body && (body.status === 'ok' || body.ready === true || body.models) ? body : null
  } catch {
    return null
  }
}

async function start() {
  if (!fs.existsSync(BIN)) await ensureInstalled()
  ensureConfig()
  if (await portOpen()) return true
  const fd = fs.openSync(LOG, 'a')
  let child
  try {
    child = spawn(BIN, ['-config', CFG], { cwd: DATA, detached: true, stdio: ['ignore', fd, fd] })
  } finally {
    fs.closeSync(fd)
  }
  child.unref()
  try {
    fs.writeFileSync(PID, String(child.pid))
  } catch {}
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    if (await portOpen()) return true
    if (!alive(child.pid) && i > 3) break
  }
  return portOpen()
}

async function killProcess() {
  const pid = readPid()
  if (pid && alive(pid)) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {}
    for (let i = 0; i < 24 && alive(pid); i++) await sleep(250)
    if (alive(pid)) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {}
    }
  }
  try {
    fs.unlinkSync(PID)
  } catch {}
  for (let i = 0; i < 12; i++) {
    if (!(await portOpen())) return true
    await sleep(250)
  }
  return !(await portOpen())
}

async function stop() {
  desired = false
  return killProcess()
}

async function restart() {
  desired = true
  await killProcess()
  return start()
}

async function boot() {
  if (!desired) return
  try {
    await ensureInstalled()
    await start()
    lastError = ''
  } catch (error) {
    lastError = human(error)
  }
}

async function snapshot() {
  const body = await health()
  const installed = fs.existsSync(BIN)
  const running = Boolean(body)
  let state = '未安装'
  let tone = 'bad'
  if (IS_CHECK) {
    state = '未安装'
    tone = 'muted'
  } else if (busy) {
    state = '处理中…'
    tone = 'warn'
  } else if (running) {
    state = '运行中'
    tone = 'good'
  } else if (installed) {
    state = '已停止'
    tone = 'warn'
  }
  const models = body?.models?.total ?? body?.models ?? '—'
  const plat = target()
  const cfg = readConfig()
  const lan = lanAddress()
  return {
    state,
    tone,
    baseUrl: `http://127.0.0.1:${API_PORT}/v1`,
    webUrl: `http://127.0.0.1:${WEB_PORT}`,
    lanUrl: lan ? `http://${lan}:${API_PORT}/v1` : '—',
    listenMode: String(cfg.listen || '').startsWith('0.0.0.0') ? '局域网' : '仅本机',
    models: String(models),
    platform: plat ? `${plat.os}/${plat.arch}` : '不支持',
    note: lastError || '后台可改密码与监听地址；重装会重新下载程序',
    noteTone: lastError ? 'warn' : 'info',
  }
}

function pendingWork(label, work) {
  return {
    pending: { label, timeoutMs: 50000 },
    result: async () => {
      busy = true
      try {
        return await work()
      } catch (error) {
        lastError = human(error)
        return { toast: '操作失败' }
      } finally {
        busy = false
      }
    },
  }
}

function registerUi(ctx) {
  ctx.dshGo.panel('gateway', {
    view: () => ({
      type: 'stack',
      title: '本地免费 API',
      children: [
        { type: 'metric', label: '状态', value: { $: 'data.state' }, tone: { $: 'data.tone' } },
        {
          type: 'keyValue',
          items: [
            { label: 'API', value: { $: 'data.baseUrl' } },
            { label: '后台', value: { $: 'data.webUrl' } },
            { label: '监听', value: { $: 'data.listenMode' } },
            { label: '局域网', value: { $: 'data.lanUrl' } },
            { label: '模型', value: { $: 'data.models' } },
            { label: '平台', value: { $: 'data.platform' } },
          ],
        },
        {
          type: 'actions',
          items: [
            { label: '启动', action: 'start', style: 'primary' },
            { label: '停止', action: 'stop' },
            { label: '重启', action: 'restart' },
          ],
        },
        {
          type: 'actions',
          items: [
            { label: '仅本机', action: 'listenLocal' },
            { label: '开局域网', action: 'listenLan' },
          ],
        },
        {
          type: 'actions',
          items: [
            { label: '复制接入', action: 'copyInfo' },
            { label: '复制后台', action: 'copyWeb' },
            { label: '重装', action: 'reinstall' },
          ],
        },
        { type: 'callout', text: { $: 'data.note' }, tone: { $: 'data.noteTone' } },
      ],
    }),
    data: (scope, emit) => {
      if (IS_CHECK) {
        emit({
          state: '未安装',
          tone: 'info',
          baseUrl: `http://127.0.0.1:${API_PORT}/v1`,
          webUrl: `http://127.0.0.1:${WEB_PORT}`,
          lanUrl: '—',
          listenMode: '局域网',
          models: '—',
          platform: target() ? `${target().os}/${target().arch}` : '不支持',
          note: '检查模式',
          noteTone: 'info',
        })
        return () => {}
      }
      let closed = false
      const tick = async () => {
        try {
          const data = await snapshot()
          if (!closed) emit(data)
        } catch {}
      }
      void tick()
      const timer = setInterval(tick, 5000)
      return () => {
        closed = true
        clearInterval(timer)
      }
    },
    actions: {
      start: () =>
        pendingWork('正在启动', async () => {
          desired = true
          const ok = await start()
          return { toast: ok ? '已启动' : '启动失败，看日志' }
        }),
      stop: () =>
        pendingWork('正在停止', async () => {
          const ok = await stop()
          return { toast: ok ? '已停止' : '停止失败' }
        }),
      restart: () =>
        pendingWork('正在重启', async () => {
          const ok = await restart()
          return { toast: ok ? '已重启' : '重启失败' }
        }),
      listenLocal: () =>
        pendingWork('正在切换', async () => {
          setListen('127.0.0.1')
          desired = true
          await killProcess()
          const ok = await start()
          return { toast: ok ? '已仅本机监听' : '切换失败' }
        }),
      listenLan: () =>
        pendingWork('正在切换', async () => {
          setListen('0.0.0.0')
          desired = true
          await killProcess()
          const ok = await start()
          return { toast: ok ? '已开局域网' : '切换失败' }
        }),
      copyInfo: () => {
        const cfg = readConfig()
        const key = cfg.server_keys?.[0] || ''
        const lan = lanAddress()
        const lanLine = lan ? `\n局域网：http://${lan}:${API_PORT}/v1` : ''
        return {
          copy: `本机：http://127.0.0.1:${API_PORT}/v1${lanLine}\nAPI Key：${key}\n推荐模型：deepseek-v4.1-flash-free`,
          toast: '接入信息已复制',
        }
      },
      copyWeb: () => {
        const cfg = readConfig()
        const password = readPassword() || '（已在后台改过，请用新密码）'
        return {
          copy: `后台：http://127.0.0.1:${WEB_PORT}\n账号：${cfg.webui?.username || 'admin'}\n密码：${password}`,
          toast: '后台信息已复制',
        }
      },
      reinstall: () => {
        void (async () => {
          busy = true
          try {
            desired = true
            await killProcess()
            await ensureInstalled(true)
            await start()
            lastError = ''
          } catch (error) {
            lastError = human(error)
          } finally {
            busy = false
          }
        })()
        return { toast: '后台重装中…' }
      },
    },
  })

  ctx.dshGo.strip('status', (scope, emit) => {
    if (IS_CHECK) {
      emit({ text: '本地 API', icon: 'server' })
      return () => {}
    }
    let closed = false
    const tick = async () => {
      try {
        const body = await health()
        const text = body ? '本地API 运行中' : fs.existsSync(BIN) ? '本地API 已停止' : '本地API 未安装'
        if (!closed) emit({ text, icon: 'server', tone: body ? 'good' : 'warn' })
      } catch {}
    }
    void tick()
    const timer = setInterval(tick, 8000)
    return () => {
      closed = true
      clearInterval(timer)
    }
  })
}

export function apply(ctx) {
  if (!IS_CHECK) {
    ctx.effect(() => {
      const bootTimer = setTimeout(() => {
        void boot()
      }, 1500)
      const watchdog = setInterval(() => {
        if (desired && !busy) void boot()
      }, 30000)
      return () => {
        clearTimeout(bootTimer)
        clearInterval(watchdog)
      }
    }, 'opencode2api autostart')
  }
  ctx.inject(['dshGo'], (ctx) => {
    registerUi(ctx)
  })
}
