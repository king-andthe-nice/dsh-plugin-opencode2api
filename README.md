# dsh-plugin-opencode2api · 本地免费 API

一键把 [opencode2api](https://github.com/jasonxu114514/opencode2api) 装进 DSH：自动下载对应平台的程序、生成配置、启动并常驻，并自动把「本地免费 API」注册成 DSH 的模型商（模型列表从网关动态获取）。装好后本机就有一个专属的、兼容 OpenAI 的免费 API；DSH 关闭再打开会自动重启。

## 适用平台

| 平台 | 架构 | 状态 |
|---|---|---|
| Windows 10/11 | x64 / arm64 | 支持 |
| macOS | Intel / Apple Silicon | 支持 |
| Linux | x64 / arm64 | 支持 |
| Android（DSH Go，proot） | arm64 | 支持 |
| iOS | — | 暂不支持（App 沙箱不能运行外部程序） |

## 安装

在 DSH 的插件市场搜索 `dsh-plugin-opencode2api` 安装；或命令行：

```sh
dsh plugin --profile web add github:king-andthe-nice/dsh-plugin-opencode2api
```

> npm 版发布后也可以 `dsh plugin --profile web add dsh-plugin-opencode2api`。

装好后引擎会自动下载程序（约 5 MB）、生成配置并在 `0.0.0.0:8080` 启动（本机和局域网都能连）。首次下载失败会每 30 秒重试。

## 使用

装好后插件会自动把本地 API 注册成模型商「本地免费 API」，模型列表从 `/v1/models` 动态获取。直接在 DSH 的模型选择器里选它下面的免费模型即可，不需要手动填 URL 和 Key。

面板会显示「模型商：已自动配置」。如果没配上，点面板里的「自动配置」重试；仍然失败时再手动接入：

1. 打开「本地免费 API」面板。
2. 点「复制接入」，得到：

   ```text
   本机：http://127.0.0.1:8080/v1
   局域网：http://<你的局域网IP>:8080/v1
   API Key：<随机生成>
   推荐模型：deepseek-v4.1-flash-free
   ```

3. 在 DSH 里添加 OpenAI 兼容服务商，Base URL 填上面的地址，API Key 填生成的 Key。

## 面板功能

- **启动 / 停止 / 重启 / 重装**：重装会重新下载程序。
- **仅本机 / 开局域网**：切换监听地址（`127.0.0.1` 或 `0.0.0.0`）。
- **复制接入 / 复制后台**：复制 API 接入信息或管理后台地址与密码。
- **自动配置**：重新把本地 API 注册为模型商「本地免费 API」，并同步最新模型列表。
- 状态条实时显示运行状态，进程挂掉会自动拉起。

## 自动配置

网关就绪后，插件会：

- 把 `http://127.0.0.1:8080/v1` 注册为 `llm-pi-ai` 的提供方 `opencode2api`，显示名「本地免费 API」；
- 把本地 API Key 写入 DSH 凭据 `OPENCODE2API_API_KEY`（不写进配置文件）；
- 从 `/v1/models` 读取模型，写入上下文窗口、输出上限、图片输入和推理档位；
- 模型列表变化时自动更新，没变化不重复写。

不想自动配置时，在 DSH 的「设置 → 模型」里删掉「本地免费 API」即可；插件不会再加回来，除非模型列表变化或你点「自动配置」。

## 管理后台

浏览器打开 `http://127.0.0.1:8081`（或局域网地址），账号 `admin`，初始密码见面板「复制后台」，也可在后台修改。后台可以改密码、查看请求、管理上游 Key 等。

## 数据目录

```text
$DSH_HOME/dsh-go/opencode2api/      # 默认 ~/.dsh/dsh-go/opencode2api/
├── opencode2api                    # 程序
├── config.json                     # 网关配置（监听、Key、匿名开关等）
├── webui-password.txt              # 后台初始密码（后台改过后会失效）
├── auto-provider.json              # 自动配置状态（模型列表指纹）
└── opencode2api.log                # 运行日志
```

## 配置说明

本插件为了开箱即用，默认开启匿名免费通道，并生成随机 `server_keys` 保护 `/v1/*`。注意：上游 opencode2api 本身默认**关闭**匿名，且明确提示匿名流量可能被大量拦截。想更稳可以：

- 在后台填入自己的 Zen / Go Key（`zen_keys` / `go_keys`），或
- 关闭匿名，只用自己的 Key。

匿名通道由上游提供，可能被限流或拦截，仅供个人轻量使用；请遵守 OpenCode 与各模型服务的条款。

## 卸载

```sh
dsh plugin --profile web remove dsh-plugin-opencode2api
```

卸载不会删除 `$DSH_HOME/dsh-go/opencode2api/`；需要时手动删除该目录。

## 能力与风险

插件会读写本地文件、下载并运行外部程序、访问网络。请只从可信来源安装；公开分发代理免费模型时，请遵守上游服务条款。

## 出处与许可

本插件是 [opencode2api](https://github.com/jasonxu114514/opencode2api) 的**非官方**安装器，与作者无隶属关系。

- opencode2api：**GPL-3.0-or-later**，源码与许可证见[上游仓库](https://github.com/jasonxu114514/opencode2api)。
- 本插件**不打包、不修改** opencode2api；安装时从上游 GitHub Releases 下载官方原版二进制，以独立进程运行。
- 本插件自身代码：**MIT**（见 `LICENSE`）。
- 上游程序按“无担保”提供；匿名通道可能被上游限流或拦截，长期使用建议在后台填入自己的 Zen / Go Key，并遵守 OpenCode 与各模型服务的条款。

详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## License

MIT
