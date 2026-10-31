# CcoreBox-Plugin-Hub

CcoreBox 插件中心的官方插件仓库。主项目：[CcoreBox](https://github.com/csy6666/ccorebox_Windows)。

所有插件都是 **纯前端 JS 模块**，由 CcoreBox 在 Web Worker（无界面）或 sandbox iframe（带界面）中执行，通过受限 RPC 访问网络、通知与插件私有数据目录。

## 已收录插件

| 插件 | 类型 | 权限 | 说明 |
|---|---|---|---|
| `subscription-insight` | 界面 | `ui` `net` `fs:data` | 订阅流量、到期与最近检查结果 |
| `core-event-log` | 混合 | `ui` `fs:data` `notify` | 核心启停时间线，用于排查断线 |
| `plugin-dashboard` | 界面 | `ui` `net` `notify` `fs:data` | 界面与 RPC 示例 |
| `plugin-http-probe` | 无界面 | `net` `notify` `fs:data` | 配置项与 HTTP 探测示例 |
| `plugin-hello` | 无界面 | `notify` | 最小插件示例 |

## 目录结构

```
.
├─ hub/
│  ├─ plugins.json              # 生成的目录（勿手改）
│  └─ plugins/
│     ├─ <id>.json              # 插件元数据（名称、版本、权限、触发器、配置）
│     └─ <id>.js                # 插件代码
├─ scripts/
│  └─ Publish-PluginHub.ps1     # 从 plugins/ 生成 plugins.json
└─ .github/workflows/pages.yml  # 推送到 main 后自动发布到 GitHub Pages
```

`<id>` 必须匹配 `^[a-z0-9][a-z0-9-]{0,47}$`，且与文件名一致。

## 本地生成目录

需要 PowerShell 5.1 或 PowerShell 7：

```powershell
./scripts/Publish-PluginHub.ps1 `
  -SourceDir ./hub/plugins `
  -Output ./hub/plugins.json `
  -HubName 'CcoreBox Plugin Hub'
```

脚本会：

1. 扫描 `hub/plugins/*.json`（跳过 `plugins.json`）作为元数据。
2. 校验 ID 格式与权限白名单。
3. 为每个 `<id>.js` 计算 SHA256。
4. 写出 `schema_version: 1` 的目录。

不传 `-BaseURL` 时，`code_url` 写成相对路径 `plugins/<id>.js`。CcoreBox 会相对目录 URL 解析，因此同一份目录可以放在 GitHub Pages、对象存储或自己的服务器上，不需要改内容。

> 传入 `-BaseURL https://example.com/hub/` 可强制写成绝对地址；一般没必要。

## 插件元数据

```json
{
  "id": "plugin-hello",
  "name": "Hello 示例",
  "version": "1.0.0",
  "description": "最小示例。",
  "group": "示例",
  "tags": ["示例"],
  "permissions": ["notify"],
  "triggers": ["onInstall", "onManual"],
  "configuration": []
}
```

字段限制：

| 字段 | 说明 |
|---|---|
| `name` | ≤ 48 字 |
| `version` | ≤ 32 字，建议语义化版本 |
| `description` | ≤ 200 字 |
| `group` | ≤ 24 字，用于 Hub 分组 |
| `tags` | ≤ 8 个，每个 ≤ 16 字 |
| `permissions` | 见下表 |
| `triggers` | 至少一个，见下表 |
| `configuration` | ≤ 24 项 |

### 权限

| 权限 | 能力 |
|---|---|
| `fs:data` | 读写插件私有数据目录（`fs.read/write/list/remove`） |
| `net` | `http.request`，仅公网 HTTPS，禁止私网地址 |
| `notify` | 系统通知 |
| `ui` | 允许渲染自定义界面 |
| `clipboard` / `profiles:*` / `subscriptions:*` / `tray` / `exec` | 已定义，尚未开放实现 |

### 触发器

`onInstall`、`onUninstall`、`onEnabled`、`onDisabled`、`onManual`、`onStartup`、`onReady`、`onReload`、`onShutdown`、`onSubscribe`、`onGenerate`、`onTrayUpdate`、`onBeforeCoreStart`、`onCoreStarted`、`onBeforeCoreStop`、`onCoreStopped`、`onTask`、`onConfigure`、`onDispose`。

CcoreBox 当前执行：`onInstall`、`onManual`、`onEnabled`、`onDisabled`、`onStartup`、`onReady`、`onShutdown`、`onReload`、`onCoreStarted`、`onCoreStopped`。其余为预留。

超时：`onManual` 60 秒，`onInstall` 15 秒，其余 2 秒。

### 配置项

```json
{
  "id": "url",
  "key": "url",
  "title": "探测地址",
  "component": "Input",
  "value": "https://www.gstatic.com/generate_204"
}
```

`component` 可选：`Input`、`CodeEditor`、`Switch`、`CheckBox`、`Select`、`Radio`、`MultipleSelect`、`InputList`。`Select` / `Radio` / `MultipleSelect` 必须提供 `options`。

## 插件代码

代码是 ES module，导出与触发器同名的函数（或字符串）：

```js
export async function onManual(context) {
  // context: { event, payload, settings, plugin }
  await ccorebox.notify('Hello', `版本 ${context.plugin.version}`)
  return 'ok'
}
```

可用 API：

```js
ccorebox.log(...) / warn(...) / error(...) / progress(...)
ccorebox.settings                 // 当前配置
ccorebox.plugin                   // { id, name, version }
ccorebox.fs.read(path)            // 需要 fs:data
ccorebox.fs.write(path, content)  // 需要 fs:data
ccorebox.fs.list(path)            // 需要 fs:data
ccorebox.fs.remove(path)          // 需要 fs:data
ccorebox.http.request({ method, url, headers, body })  // 需要 net
ccorebox.notify(title, body)      // 需要 notify
```

## 带界面的插件

清单加 `"ui"` 权限。代码额外导出 `ui`（字符串或返回字符串的函数），返回内容会作为 iframe 的 `<body>` 片段插入：

```js
export const ui = (context) => `
  <button id="go">运行</button>
  <pre id="out"></pre>
  <script>
    document.getElementById('go').onclick = async () => {
      const result = await ccorebox.http.request({ url: 'https://example.com/' })
      document.getElementById('out').textContent = result.status
    }
    ccorebox.setHeight(160)
  <\/script>
`
```

约束：

- iframe 使用 `sandbox="allow-scripts"`（无同源），CSP `connect-src 'none'`：**不能直接 `fetch` / `XMLHttpRequest`**，网络请求必须走 `ccorebox.http.request`。
- 内联 `<style>`、`<script>` 允许；外链脚本被禁止。
- 可用 `ccorebox.setHeight(px)` 回报高度，宿主限制在 120–720 px。
- 返回内容上限 256 KiB。
- 样式建议使用 `var(--cb-*)` 主题变量，宿主会自动注入并跟随主题切换。

## 本地测试的限制

CcoreBox 只接受**公网 HTTPS** 目录地址，`localhost`、私网 IP、带账号密码或查询串的 URL 都会被拒绝。所以本地目录只能用来生成与检查 `plugins.json`，真机安装需要以下任一方式：

- GitHub Pages（推荐，见下）
- Cloudflare Pages / 对象存储静态站
- 自己的 HTTPS 服务器
- `cloudflared` / `ngrok` 之类的临时隧道（仅调试）

## 发布到 GitHub Pages

1. 在 GitHub 新建仓库（例如 `CcoreBox-Plugin-Hub`），推送本目录。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 推送到 `main`。工作流会重新生成 `hub/plugins.json` 并把 `hub/` 发布为站点。
4. 目录地址为：

```
https://csy6666.github.io/CcoreBox-Plugin-Hub/plugins.json
```

把这个地址填进 CcoreBox 插件中心的 Hub 源即可。

> 自定义域名时，把站点根目录指向 `hub/`，目录地址改为 `https://<域名>/plugins.json`。

## 发布新版本

1. 修改 `<id>.js`，同时更新 `<id>.json` 里的 `version`。
2. 重新运行 `Publish-PluginHub.ps1`（或直接推送到 `main` 让工作流生成）。
3. 推送。CcoreBox 的「全部更新」会按版本号对比。

SHA256 由脚本自动计算，不要手写。

## 安全边界

- 插件代码在隔离环境执行，只能通过清单声明的权限访问宿主能力。
- 目录里的 SHA256 只能防代码包被替换，不能防整个目录被替换。请只添加可信来源。
- `exec`、`profiles:write`、`subscriptions:write` 等高危权限尚未开放。

## 许可证

待定。在确定许可证前，请勿将本仓库内容用于再分发。
