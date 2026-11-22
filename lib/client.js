window.__ModuleLoader__.load({
  id: 'dsh-plugin-opencode2api',
  factory: require => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { createElement: h, useCallback, useEffect, useState } = React
    const inject = ['slots']

    const TONE = {
      good: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warning-primary)',
      bad: 'var(--dsw-alias-state-error-primary)',
      info: 'var(--dsw-alias-state-business-primary)',
      muted: 'var(--dsw-alias-label-tertiary)',
    }

    const CSS = `
      .oc2a button:hover:not(:disabled) { filter: brightness(1.08); }
      .oc2a code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; background: var(--dsw-alias-bg-layer-2); padding: 1px 4px; border-radius: 4px; }
      .oc2a summary { user-select: none; }
    `

    const calloutStyle = {
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 9,
      padding: '9px 11px',
      margin: '8px 0',
      fontSize: 12,
      lineHeight: 1.6,
      background: 'var(--dsw-alias-bg-layer-1)',
    }

    async function request(path, init) {
      const res = await fetch(`/api/opencode2api${path}`, init)
      const text = await res.text()
      let data = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = null
      }
      if (!res.ok) throw new Error(data?.error || text || `HTTP ${res.status}`)
      return data
    }

    function useCopy() {
      const [copied, setCopied] = useState('')
      const copy = useCallback(async (label, value) => {
        try {
          await navigator.clipboard.writeText(value)
        } catch {
          const area = document.createElement('textarea')
          area.value = value
          document.body.appendChild(area)
          area.select()
          try {
            document.execCommand('copy')
          } catch {}
          area.remove()
        }
        setCopied(label)
        setTimeout(() => setCopied(''), 1500)
      }, [])
      return [copied, copy]
    }

    function Button({ children, onClick, disabled, primary }) {
      return h(
        'button',
        {
          type: 'button',
          onClick,
          disabled,
          style: {
            appearance: 'none',
            border: primary ? 'none' : '1px solid var(--dsw-alias-border-l1)',
            background: primary
              ? 'var(--dsw-alias-state-business-primary)'
              : 'var(--dsw-alias-bg-layer-2)',
            color: primary
              ? 'var(--dsw-alias-label-on-accent)'
              : 'var(--dsw-alias-label-primary)',
            borderRadius: 8,
            padding: '7px 12px',
            font: 'inherit',
            fontSize: 13,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.55 : 1,
          },
        },
        children,
      )
    }

    function Metric({ label, value, tone }) {
      return h(
        'div',
        {
          style: {
            border: '1px solid var(--dsw-alias-border-l1)',
            borderRadius: 10,
            padding: '10px 12px',
            background: 'var(--dsw-alias-bg-layer-1)',
            minWidth: 0,
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 11,
              color: 'var(--dsw-alias-label-tertiary)',
              marginBottom: 4,
            },
          },
          label,
        ),
        h(
          'div',
          {
            style: {
              fontSize: 13,
              fontWeight: 600,
              color: tone || 'var(--dsw-alias-label-primary)',
              overflowWrap: 'anywhere',
            },
          },
          value,
        ),
      )
    }

    function Page() {
      const [state, setState] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState('')
      const [copied, copy] = useCopy()

      const load = useCallback(async () => {
        try {
          setState(await request('/state'))
          setError('')
        } catch (err) {
          setError(String(err?.message || err))
        }
      }, [])

      useEffect(() => {
        void load()
        const timer = setInterval(load, 5000)
        return () => clearInterval(timer)
      }, [load])

      const act = async action => {
        setBusy(action)
        setError('')
        try {
          const result = await request('/action', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action }),
          })
          if (result?.state) setState(result.state)
          else void load()
        } catch (err) {
          setError(String(err?.message || err))
        } finally {
          setBusy('')
        }
      }

      const tone = state
        ? TONE[state.tone] || 'var(--dsw-alias-label-secondary)'
        : 'var(--dsw-alias-label-secondary)'
      const running = state?.running === true
      const installed = state?.installed === true
      const statusText = state
        ? state.state || (running ? '运行中' : installed ? '已停止' : '未安装')
        : '读取中…'
      const disabled = busy !== ''
      const secretHidden = state?.keyHidden === true

      return h(
        'div',
        {
          className: 'oc2a',
          style: {
            padding: '18px 20px 28px',
            maxWidth: 820,
            color: 'var(--dsw-alias-label-primary)',
          },
        },
        h('style', null, CSS),
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 4,
            },
          },
          h('div', { style: { fontSize: 18, fontWeight: 700 } }, '本地免费 API'),
          h(
            'span',
            {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: tone,
              },
            },
            h('span', {
              style: {
                width: 7,
                height: 7,
                borderRadius: 99,
                background: tone,
              },
            }),
            statusText,
          ),
        ),
        h(
          'div',
          {
            style: {
              fontSize: 12,
              color: 'var(--dsw-alias-label-tertiary)',
              marginBottom: 14,
            },
          },
          'opencode2api · 自动下载、启动、掉线拉起；模型商自动配置，无需手动填 URL 和 Key。',
        ),
        error
          ? h(
              'div',
              {
                style: {
                  ...calloutStyle,
                  borderColor: 'var(--dsw-alias-state-error-primary)',
                  color: 'var(--dsw-alias-state-error-primary)',
                },
              },
              error,
            )
          : null,
        state?.note
          ? h(
              'div',
              {
                style: {
                  ...calloutStyle,
                  borderColor:
                    state.noteTone === 'warn'
                      ? 'var(--dsw-alias-state-warning-primary)'
                      : 'var(--dsw-alias-border-l1)',
                  color:
                    state.noteTone === 'warn'
                      ? 'var(--dsw-alias-state-warning-primary)'
                      : 'var(--dsw-alias-label-secondary)',
                },
              },
              state.note,
            )
          : null,
        h(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 10,
              margin: '14px 0',
            },
          },
          h(Metric, { label: '本机地址', value: state?.baseUrl || '—' }),
          h(Metric, { label: '局域网', value: state?.lanUrl || '—' }),
          h(Metric, { label: '模型数', value: state?.models || '—' }),
          h(Metric, {
            label: '模型商',
            value: state?.provider || '—',
            tone: TONE[state?.providerTone] || undefined,
          }),
          h(Metric, { label: '监听', value: state?.listenMode || '—' }),
          h(Metric, { label: '平台', value: state?.platform || '—' }),
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 10,
            },
          },
          running
            ? h(Button, { onClick: () => act('stop'), disabled }, '停止')
            : h(
                Button,
                {
                  primary: true,
                  onClick: () => act('start'),
                  disabled,
                },
                busy === 'start' ? '启动中…' : '启动',
              ),
          h(Button, { onClick: () => act('restart'), disabled }, '重启'),
          h(Button, { onClick: () => act('listenLocal'), disabled }, '仅本机'),
          h(Button, { onClick: () => act('listenLan'), disabled }, '开局域网'),
          h(
            Button,
            { onClick: () => act('autoConfig'), disabled },
            busy === 'autoConfig' ? '配置中…' : '自动配置',
          ),
          h(Button, { onClick: () => act('reinstall'), disabled }, '重装'),
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 14,
            },
          },
          h(
            Button,
            {
              onClick: () => void copy('本机地址', state?.baseUrl || ''),
              disabled: !state?.baseUrl,
            },
            copied === '本机地址' ? '已复制地址' : '复制地址',
          ),
          h(
            Button,
            {
              onClick: () => void copy('Key', state?.key || ''),
              disabled: !state?.key,
            },
            secretHidden
              ? 'Key 仅本机可见'
              : copied === 'Key'
                ? '已复制 Key'
                : '复制 Key',
          ),
          h(
            Button,
            {
              onClick: () =>
                window.open(
                  state?.webUrl || 'http://127.0.0.1:8081',
                  '_blank',
                  'noopener',
                ),
            },
            '打开后台',
          ),
          h(
            Button,
            {
              onClick: () =>
                window.open(
                  'https://github.com/king-andthe-nice/dsh-plugin-opencode2api',
                  '_blank',
                  'noopener',
                ),
            },
            '项目主页',
          ),
        ),
        h(
          'div',
          {
            style: {
              fontSize: 12,
              color: 'var(--dsw-alias-label-tertiary)',
              lineHeight: 1.7,
              marginBottom: 12,
            },
          },
          'DSH 模型选择器里应出现「本地免费 API」。后台账号 admin，密码见 ',
          h('code', null, state?.webPasswordPath || 'webui-password.txt'),
          secretHidden || !state?.password
            ? null
            : h('span', null, '；当前密码：', h('code', null, state.password)),
        ),
        h(
          'details',
          {
            style: {
              borderTop: '1px solid var(--dsw-alias-border-l1)',
              paddingTop: 10,
            },
          },
          h(
            'summary',
            {
              style: {
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--dsw-alias-label-secondary)',
              },
            },
            '运行日志',
          ),
          h(
            'pre',
            {
              style: {
                margin: '8px 0 0',
                padding: 10,
                borderRadius: 8,
                background: 'var(--dsw-alias-bg-layer-2)',
                color: 'var(--dsw-alias-label-secondary)',
                fontSize: 11,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 220,
                overflow: 'auto',
              },
            },
            state?.log || '暂无日志',
          ),
        ),
        h(
          'div',
          {
            style: {
              marginTop: 12,
              fontSize: 11,
              color: 'var(--dsw-alias-label-tertiary)',
            },
          },
          '网关来自 opencode2api（GPL-3.0-or-later）官方 Release，本插件不打包、不修改它。',
        ),
      )
    }

    function apply(ctx) {
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'opencode2api',
            order: 36,
            label: () => '本地免费 API',
          },
          () => h(Page),
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    exports.name = 'opencode2api'
    return module.exports
  },
})
