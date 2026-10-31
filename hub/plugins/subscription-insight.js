const SNAPSHOT_FILE = 'last.json'
const REFRESH_MS = 5 * 60 * 1000

const USER_AGENTS = {
  clash: 'clash-verge/v2.0.0',
  v2rayn: 'v2rayN/6.0',
  ccorebox: 'CcoreBox-PluginHost/1',
}

function userAgentOf(name) {
  return USER_AGENTS[name] || USER_AGENTS.clash
}

function parseUserinfo(raw) {
  if (!raw || typeof raw !== 'string') return null
  const usage = { upload: 0, download: 0, total: 0, expire: 0 }
  let seen = false
  for (const part of raw.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim().toLowerCase()
    const value = Number(part.slice(index + 1).trim())
    if (!Number.isFinite(value)) continue
    if (key === 'upload') {
      usage.upload = value
      seen = true
    } else if (key === 'download') {
      usage.download = value
      seen = true
    } else if (key === 'total') {
      usage.total = value
      seen = true
    } else if (key === 'expire') {
      usage.expire = value
      seen = true
    }
  }
  return seen ? usage : null
}

function formatBytes(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let size = number
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return (size >= 100 || index === 0 ? size.toFixed(0) : size.toFixed(1)) + ' ' + units[index]
}

function daysUntil(expire) {
  const seconds = Number(expire)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return Math.ceil((seconds * 1000 - Date.now()) / 86400000)
}

function summarize(usage) {
  const used = Number(usage.upload || 0) + Number(usage.download || 0)
  const total = Number(usage.total || 0)
  return {
    used: used,
    total: total,
    percent: total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0,
    remaining: total > 0 ? Math.max(0, total - used) : null,
    days: daysUntil(usage.expire),
  }
}

function warningFor(snapshot, settings) {
  const summary = summarize(snapshot.usage || {})
  const warnDays = Number(settings.warnDays) || 7
  const parts = []
  if (summary.days !== null && summary.days <= warnDays) {
    parts.push(summary.days <= 0 ? '订阅已到期' : '订阅将在 ' + summary.days + ' 天后到期')
  }
  if (summary.percent >= 90) parts.push('流量已用 ' + summary.percent.toFixed(0) + '%')
  return parts.join('，')
}

async function check(settings) {
  const url = String(settings.url || '').trim()
  if (!url) throw new Error('未配置订阅地址')
  const response = await ccorebox.http.request({
    method: 'GET',
    url: url,
    headers: { 'User-Agent': userAgentOf(settings.userAgent) },
  })
  if (!response || response.status < 200 || response.status >= 300) {
    throw new Error('订阅请求失败（HTTP ' + (response ? response.status : '?') + '）')
  }
  const raw = response.headers ? response.headers['subscription-userinfo'] : ''
  const usage = parseUserinfo(raw)
  if (!usage) throw new Error('服务端未返回 subscription-userinfo，无法获取用量')
  const snapshot = {
    label: String(settings.label || '订阅'),
    checkedAt: new Date().toISOString(),
    usage: usage,
  }
  await ccorebox.fs.write(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2))
  return snapshot
}

export async function onManual(context) {
  const settings = context.settings || {}
  const snapshot = await check(settings)
  if (settings.notify) {
    const warning = warningFor(snapshot, settings)
    if (warning) await ccorebox.notify('订阅提醒', warning)
  }
  const summary = summarize(snapshot.usage)
  const total = summary.total > 0 ? ' / ' + formatBytes(summary.total) : ''
  return snapshot.label + '：已用 ' + formatBytes(summary.used) + total
}

export function ui(context) {
  const settings = context.settings || {}
  const config = {
    url: String(settings.url || ''),
    label: String(settings.label || '订阅'),
    userAgent: String(settings.userAgent || 'clash'),
    warnDays: String(settings.warnDays || '7'),
    autoRefresh: settings.autoRefresh !== false,
  }
  const serialized = JSON.stringify(config).replace(/</g, '\\u003c')
  return `
  <style>
    .sub { display: grid; gap: 12px; padding: 14px; }
    .sub-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .sub-head strong { font-size: 14px; }
    .muted { color: var(--cb-text-3, #6b7280); font-size: 11px; }
    .bar { height: 8px; border-radius: 999px; background: var(--cb-glass-3, rgba(0,0,0,.08)); overflow: hidden; }
    #bar { display: block; height: 100%; width: 0; background: var(--cb-accent, #3b82f6); transition: width var(--cb-dur, .2s) var(--cb-ease, ease); }
    #bar.danger { background: var(--cb-bad, #ef4444); }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .grid div { display: grid; gap: 2px; padding: 8px 10px; border: 1px solid var(--cb-line, rgba(0,0,0,.08)); border-radius: var(--cb-r-sm, 6px); }
    .grid b { font-size: 13px; font-variant-numeric: tabular-nums; }
    .row { display: flex; align-items: center; gap: 10px; }
    .row button { padding: 6px 12px; border: 1px solid var(--cb-line-strong, rgba(0,0,0,.15)); border-radius: var(--cb-r-sm, 6px); background: var(--cb-glass-2, rgba(255,255,255,.6)); cursor: pointer; }
    .row button:hover { border-color: var(--cb-accent, #3b82f6); }
    .err { color: var(--cb-bad, #ef4444); font-size: 11px; }
  </style>
  <div class="sub">
    <div class="sub-head">
      <strong id="label">订阅</strong>
      <span id="status" class="muted">准备中…</span>
    </div>
    <div class="bar"><span id="bar"></span></div>
    <div class="grid">
      <div><span class="muted">已用</span><b id="used">--</b></div>
      <div><span class="muted">剩余</span><b id="left">--</b></div>
      <div><span class="muted">到期</span><b id="expire">--</b></div>
    </div>
    <div class="row">
      <button id="refresh" type="button">立即刷新</button>
      <span id="error" class="err"></span>
    </div>
  </div>
  <script>
  (function () {
    var config = ${serialized}
    var els = {
      label: document.getElementById('label'),
      status: document.getElementById('status'),
      bar: document.getElementById('bar'),
      used: document.getElementById('used'),
      left: document.getElementById('left'),
      expire: document.getElementById('expire'),
      error: document.getElementById('error')
    }
    var USER_AGENTS = { clash: 'clash-verge/v2.0.0', v2rayn: 'v2rayN/6.0', ccorebox: 'CcoreBox-PluginHost/1' }
    function ua(name) { return USER_AGENTS[name] || USER_AGENTS.clash }
    function fmtBytes(value) {
      var number = Number(value)
      if (!isFinite(number) || number <= 0) return '0 B'
      var units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
      var size = number
      var index = 0
      while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1 }
      return (size >= 100 || index === 0 ? size.toFixed(0) : size.toFixed(1)) + ' ' + units[index]
    }
    function parseUserinfo(raw) {
      if (!raw || typeof raw !== 'string') return null
      var usage = { upload: 0, download: 0, total: 0, expire: 0 }
      var seen = false
      raw.split(';').forEach(function (part) {
        var index = part.indexOf('=')
        if (index < 0) return
        var key = part.slice(0, index).trim().toLowerCase()
        var value = Number(part.slice(index + 1).trim())
        if (!isFinite(value)) return
        if (key === 'upload') { usage.upload = value; seen = true }
        else if (key === 'download') { usage.download = value; seen = true }
        else if (key === 'total') { usage.total = value; seen = true }
        else if (key === 'expire') { usage.expire = value; seen = true }
      })
      return seen ? usage : null
    }
    function daysUntil(expire) {
      var seconds = Number(expire)
      if (!isFinite(seconds) || seconds <= 0) return null
      return Math.ceil((seconds * 1000 - Date.now()) / 86400000)
    }
    function summarize(usage) {
      var used = Number(usage.upload || 0) + Number(usage.download || 0)
      var total = Number(usage.total || 0)
      return {
        used: used,
        percent: total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0,
        remaining: total > 0 ? Math.max(0, total - used) : null,
        days: daysUntil(usage.expire)
      }
    }
    function render(snapshot) {
      els.label.textContent = snapshot && snapshot.label ? snapshot.label : config.label
      if (!snapshot) {
        els.status.textContent = '暂无记录'
        ccorebox.setHeight(300)
        return
      }
      var summary = summarize(snapshot.usage || {})
      els.used.textContent = fmtBytes(summary.used)
      els.left.textContent = summary.remaining === null ? '未知' : fmtBytes(summary.remaining)
      els.expire.textContent = summary.days === null ? '未知' : (summary.days <= 0 ? '已到期' : summary.days + ' 天')
      els.bar.style.width = Math.max(0, Math.min(100, summary.percent)) + '%'
      els.bar.classList.toggle('danger', summary.percent >= 90 || (summary.days !== null && summary.days <= 3))
      els.status.textContent = '更新于 ' + new Date(snapshot.checkedAt).toLocaleString()
      ccorebox.setHeight(320)
    }
    async function loadCached() {
      try {
        var raw = await ccorebox.fs.read('last.json')
        render(JSON.parse(raw))
      } catch (error) {
        render(null)
      }
    }
    async function refresh() {
      if (!config.url) {
        els.error.textContent = '未配置订阅地址'
        return
      }
      els.status.textContent = '刷新中…'
      els.error.textContent = ''
      try {
        var response = await ccorebox.http.request({
          method: 'GET',
          url: config.url,
          headers: { 'User-Agent': ua(config.userAgent) }
        })
        if (!response || response.status < 200 || response.status >= 300) {
          throw new Error('HTTP ' + (response ? response.status : '?'))
        }
        var raw = response.headers ? response.headers['subscription-userinfo'] : ''
        var usage = parseUserinfo(raw)
        if (!usage) throw new Error('服务端未返回用量信息')
        var snapshot = { label: config.label, checkedAt: new Date().toISOString(), usage: usage }
        await ccorebox.fs.write('last.json', JSON.stringify(snapshot, null, 2))
        render(snapshot)
        var summary = summarize(usage)
        var warnDays = Number(config.warnDays) || 7
        if (summary.days !== null && summary.days <= warnDays) {
          ccorebox.notify('订阅提醒', summary.days <= 0 ? '订阅已到期' : '订阅将在 ' + summary.days + ' 天后到期')
        } else if (summary.percent >= 90) {
          ccorebox.notify('订阅提醒', '流量已用 ' + summary.percent.toFixed(0) + '%')
        }
      } catch (error) {
        els.error.textContent = error && error.message ? error.message : String(error)
        els.status.textContent = '刷新失败'
      }
    }
    document.getElementById('refresh').onclick = refresh
    loadCached().then(function () {
      if (config.autoRefresh && config.url) return refresh()
    })
    if (config.autoRefresh && config.url) setInterval(refresh, ${REFRESH_MS})
  })()
  </script>`
}
