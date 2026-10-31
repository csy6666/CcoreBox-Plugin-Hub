export function inspectLink(raw, options) {
  const showSecrets = !!(options && options.showSecrets)
  const text = String(raw == null ? '' : raw).trim()
  if (!text) return { ok: false, protocol: 'unknown', error: '空行' }

  function mask(value) {
    const secret = String(value == null ? '' : value)
    if (!secret) return ''
    if (showSecrets) return secret
    return secret.length <= 8 ? '••••' : secret.slice(0, 8) + '…'
  }

  function decodeBase64(value) {
    let body = String(value == null ? '' : value).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
    if (!body) throw new Error('base64 为空')
    while (body.length % 4 !== 0) body += '='
    const binary = atob(body)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return new TextDecoder('utf-8').decode(bytes)
  }

  function decodeComponent(value) {
    try {
      return decodeURIComponent(value || '')
    } catch (error) {
      return String(value || '')
    }
  }

  function numberPort(value) {
    const port = Number(value)
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : 0
  }

  function splitHostPort(value) {
    const target = String(value || '')
    if (target.startsWith('[')) {
      const end = target.indexOf(']')
      if (end > 0) {
        const portPart = target.slice(end + 1).replace(/^:/, '')
        return { host: target.slice(1, end), port: numberPort(portPart) }
      }
    }
    const index = target.lastIndexOf(':')
    if (index < 0) return { host: target, port: 0 }
    return { host: target.slice(0, index), port: numberPort(target.slice(index + 1)) }
  }

  function result(fields) {
    return {
      ok: true,
      protocol: fields.protocol || 'unknown',
      name: fields.name || '',
      host: fields.host || '',
      port: fields.port || 0,
      transport: fields.transport || 'tcp',
      security: fields.security || 'none',
      serverName: fields.serverName || '',
      credential: mask(fields.credential || ''),
      warnings: fields.warnings || [],
    }
  }

  function failure(protocol, message) {
    return { ok: false, protocol: protocol || 'unknown', error: message }
  }

  const lower = text.toLowerCase()

  if (lower.startsWith('vmess://')) {
    try {
      const config = JSON.parse(decodeBase64(text.slice('vmess://'.length)))
      const host = String(config.add || '').trim()
      const port = numberPort(config.port)
      const network = String(config.net || 'tcp').toLowerCase()
      const tls = String(config.tls || '').toLowerCase()
      const security = tls === 'tls' || tls === 'reality' ? tls : 'none'
      const warnings = []
      if (security === 'none') warnings.push('未启用 TLS')
      if (!host) warnings.push('缺少服务器地址')
      if (!port) warnings.push('端口无效')
      if (network === 'ws' && !String(config.path || '').trim()) warnings.push('WebSocket 未指定路径')
      return result({
        protocol: 'vmess',
        name: String(config.ps || ''),
        host: host,
        port: port,
        transport: network,
        security: security,
        serverName: String(config.sni || config.host || ''),
        credential: String(config.id || ''),
        warnings: warnings,
      })
    } catch (error) {
      return failure('vmess', '链接无法解码：' + error.message)
    }
  }

  if (lower.startsWith('vless://')) {
    try {
      const url = new URL(text)
      const security = (url.searchParams.get('security') || 'none').toLowerCase()
      const warnings = []
      if (security === 'none') warnings.push('未启用 TLS')
      return result({
        protocol: 'vless',
        name: decodeComponent(url.hash ? url.hash.slice(1) : ''),
        host: url.hostname,
        port: numberPort(url.port) || 443,
        transport: (url.searchParams.get('type') || 'tcp').toLowerCase(),
        security: security,
        serverName: url.searchParams.get('sni') || url.searchParams.get('host') || '',
        credential: decodeComponent(url.username),
        warnings: warnings,
      })
    } catch (error) {
      return failure('vless', '链接格式错误：' + error.message)
    }
  }

  if (lower.startsWith('trojan://')) {
    try {
      const url = new URL(text)
      const security = (url.searchParams.get('security') || 'tls').toLowerCase()
      const warnings = []
      if (security === 'none') warnings.push('未启用 TLS')
      return result({
        protocol: 'trojan',
        name: decodeComponent(url.hash ? url.hash.slice(1) : ''),
        host: url.hostname,
        port: numberPort(url.port) || 443,
        transport: (url.searchParams.get('type') || 'tcp').toLowerCase(),
        security: security,
        serverName: url.searchParams.get('sni') || url.searchParams.get('host') || '',
        credential: decodeComponent(url.username) || decodeComponent(url.password),
        warnings: warnings,
      })
    } catch (error) {
      return failure('trojan', '链接格式错误：' + error.message)
    }
  }

  if (lower.startsWith('hysteria2://') || lower.startsWith('hy2://')) {
    try {
      const url = new URL(text)
      const warnings = []
      if (url.searchParams.get('insecure') === '1') warnings.push('跳过证书校验')
      return result({
        protocol: 'hysteria2',
        name: decodeComponent(url.hash ? url.hash.slice(1) : ''),
        host: url.hostname,
        port: numberPort(url.port) || 443,
        transport: 'quic',
        security: 'tls',
        serverName: url.searchParams.get('sni') || '',
        credential: decodeComponent(url.username) || decodeComponent(url.password),
        warnings: warnings,
      })
    } catch (error) {
      return failure('hysteria2', '链接格式错误：' + error.message)
    }
  }

  if (lower.startsWith('tuic://')) {
    try {
      const url = new URL(text)
      const user = decodeComponent(url.username)
      const pass = decodeComponent(url.password)
      return result({
        protocol: 'tuic',
        name: decodeComponent(url.hash ? url.hash.slice(1) : ''),
        host: url.hostname,
        port: numberPort(url.port) || 443,
        transport: 'quic',
        security: 'tls',
        serverName: url.searchParams.get('sni') || '',
        credential: pass ? user + ':' + pass : user,
        warnings: [],
      })
    } catch (error) {
      return failure('tuic', '链接格式错误：' + error.message)
    }
  }

  if (lower.startsWith('ssr://')) {
    try {
      const decoded = decodeBase64(text.slice('ssr://'.length))
      const splitIndex = decoded.lastIndexOf('/?')
      const main = splitIndex >= 0 ? decoded.slice(0, splitIndex) : decoded
      const query = splitIndex >= 0 ? decoded.slice(splitIndex + 2) : ''
      const parts = main.split(':')
      if (parts.length < 6) throw new Error('字段不足')
      const passwordPart = parts.pop()
      const obfs = parts.pop()
      const method = parts.pop()
      const protocol = parts.pop()
      const port = numberPort(parts.pop())
      const host = parts.join(':')
      let name = ''
      query.split('&').forEach(function (pair) {
        const index = pair.indexOf('=')
        if (index < 0) return
        if (pair.slice(0, index) !== 'remarks') return
        try {
          name = decodeBase64(pair.slice(index + 1))
        } catch (error) {
          name = ''
        }
      })
      let password = ''
      try {
        password = decodeBase64(passwordPart)
      } catch (error) {
        password = ''
      }
      return result({
        protocol: 'ssr',
        name: name,
        host: host,
        port: port,
        transport: protocol + '/' + obfs,
        security: method,
        credential: password,
        warnings: ['SSR 为旧协议，建议迁移'],
      })
    } catch (error) {
      return failure('ssr', '链接无法解码：' + error.message)
    }
  }

  if (lower.startsWith('ss://')) {
    try {
      let body = text.slice('ss://'.length)
      let name = ''
      const hashIndex = body.indexOf('#')
      if (hashIndex >= 0) {
        name = decodeComponent(body.slice(hashIndex + 1))
        body = body.slice(0, hashIndex)
      }
      let query = ''
      const queryIndex = body.indexOf('?')
      if (queryIndex >= 0) {
        query = body.slice(queryIndex + 1)
        body = body.slice(0, queryIndex)
      }
      let method = ''
      let password = ''
      let host = ''
      let port = 0
      const at = body.lastIndexOf('@')
      if (at >= 0) {
        const userinfo = decodeComponent(body.slice(0, at))
        let credential = ''
        try {
          credential = decodeBase64(userinfo)
        } catch (error) {
          credential = ''
        }
        if (!credential || credential.indexOf(':') < 0) credential = userinfo
        const sep = credential.indexOf(':')
        if (sep < 0) throw new Error('凭据格式错误')
        method = credential.slice(0, sep)
        password = credential.slice(sep + 1)
        const target = splitHostPort(body.slice(at + 1))
        host = target.host
        port = target.port
      } else {
        const decoded = decodeBase64(body)
        const sep = decoded.lastIndexOf('@')
        if (sep < 0) throw new Error('缺少服务器地址')
        const credential = decoded.slice(0, sep)
        const colon = credential.indexOf(':')
        if (colon < 0) throw new Error('凭据格式错误')
        method = credential.slice(0, colon)
        password = credential.slice(colon + 1)
        const target = splitHostPort(decoded.slice(sep + 1))
        host = target.host
        port = target.port
      }
      const cipher = method.toLowerCase()
      const warnings = []
      if (['rc4', 'rc4-md5', 'table', 'plain', 'none', ''].indexOf(cipher) >= 0) {
        warnings.push('加密方式过弱或未设置')
      }
      return result({
        protocol: 'ss',
        name: name,
        host: host,
        port: port,
        transport: query.indexOf('plugin=') >= 0 ? 'plugin' : 'tcp',
        security: method,
        credential: password,
        warnings: warnings,
      })
    } catch (error) {
      return failure('ss', '链接无法解码：' + error.message)
    }
  }

  return failure('unknown', '无法识别的链接类型')
}

export function onManual() {
  return '请在插件界面中粘贴分享链接'
}

export function ui(context) {
  const settings = context.settings || {}
  const config = { showSecrets: settings.showSecrets === true }
  const serialized = JSON.stringify(config).replace(/</g, '\\u003c')
  const parser = inspectLink.toString()
  return `
  <style>
    .inspector { display: grid; gap: 10px; padding: 14px; user-select: text; }
    .muted { color: var(--cb-text-3, #6b7280); font-size: 11px; }
    textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 84px; padding: 8px 10px; font: 12px/1.5 var(--cb-font-mono, monospace); border: 1px solid var(--cb-line-strong, rgba(0,0,0,.15)); border-radius: var(--cb-r-sm, 6px); background: transparent; color: inherit; }
    .row { display: flex; align-items: center; gap: 8px; }
    .row button { padding: 6px 12px; border: 1px solid var(--cb-line-strong, rgba(0,0,0,.15)); border-radius: var(--cb-r-sm, 6px); background: var(--cb-glass-2, rgba(255,255,255,.6)); cursor: pointer; }
    .row button:hover { border-color: var(--cb-accent, #3b82f6); }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .item { display: grid; gap: 4px; padding: 9px 11px; border: 1px solid var(--cb-line, rgba(0,0,0,.08)); border-radius: var(--cb-r-sm, 6px); }
    .item.is-error { border-color: var(--cb-bad, #ef4444); }
    .head { display: flex; align-items: center; gap: 8px; }
    .badge { text-transform: uppercase; font-size: 10px; padding: 2px 7px; border-radius: 999px; background: var(--cb-accent-dim, rgba(59,130,246,.12)); color: var(--cb-accent, #3b82f6); letter-spacing: .04em; }
    .meta, .cred, .raw { font-size: 11px; color: var(--cb-text-2, #4b5563); font-family: var(--cb-font-mono, monospace); word-break: break-all; }
    .raw { color: var(--cb-text-3, #6b7280); }
    .warn { font-size: 11px; color: var(--cb-warn, #f59e0b); }
    .empty { padding: 14px; text-align: center; border: 1px dashed var(--cb-line-strong, rgba(0,0,0,.15)); border-radius: var(--cb-r-sm, 6px); color: var(--cb-text-3, #6b7280); font-size: 11px; }
  </style>
  <div class="inspector">
    <label class="field">
      <span class="muted">粘贴分享链接，每行一条</span>
      <textarea id="input" rows="4" spellcheck="false" placeholder="vmess://...&#10;vless://...&#10;ss://..."></textarea>
    </label>
    <div class="row">
      <button id="parse" type="button">解析</button>
      <button id="clear" type="button">清空</button>
      <span id="summary" class="muted">尚未解析</span>
    </div>
    <ul id="results"><li class="empty">结果会显示在这里</li></ul>
  </div>
  <script>
  (function () {
    var inspectLink = ${parser}
    var config = ${serialized}
    var input = document.getElementById('input')
    var results = document.getElementById('results')
    var summary = document.getElementById('summary')
    var timer = 0
    function addEmpty() {
      var item = document.createElement('li')
      item.className = 'empty'
      item.textContent = '结果会显示在这里'
      results.appendChild(item)
    }
    function card(info) {
      var item = document.createElement('li')
      item.className = 'item'
      var head = document.createElement('div')
      head.className = 'head'
      var badge = document.createElement('span')
      badge.className = 'badge'
      badge.textContent = info.protocol
      var name = document.createElement('strong')
      name.textContent = info.name || '未命名'
      head.appendChild(badge)
      head.appendChild(name)
      item.appendChild(head)
      var meta = document.createElement('div')
      meta.className = 'meta'
      meta.textContent = (info.host || '?') + ':' + (info.port || '?') + ' · ' + info.transport + ' · ' + info.security + (info.serverName ? ' · SNI ' + info.serverName : '')
      item.appendChild(meta)
      if (info.credential) {
        var cred = document.createElement('div')
        cred.className = 'cred'
        cred.textContent = '凭据 ' + info.credential
        item.appendChild(cred)
      }
      info.warnings.forEach(function (warning) {
        var line = document.createElement('div')
        line.className = 'warn'
        line.textContent = '注意：' + warning
        item.appendChild(line)
      })
      return item
    }
    function errorCard(line, info) {
      var item = document.createElement('li')
      item.className = 'item is-error'
      var title = document.createElement('div')
      title.className = 'meta'
      title.textContent = info.error || '解析失败'
      var raw = document.createElement('code')
      raw.className = 'raw'
      raw.textContent = line.length > 120 ? line.slice(0, 120) + '…' : line
      item.appendChild(title)
      item.appendChild(raw)
      return item
    }
    function run() {
      var lines = input.value.split('\\n').map(function (line) { return line.trim() }).filter(Boolean)
      results.innerHTML = ''
      if (!lines.length) {
        summary.textContent = '尚未解析'
        addEmpty()
        ccorebox.setHeight(240)
        return
      }
      var passed = 0
      var failed = 0
      lines.forEach(function (line) {
        var info = inspectLink(line, { showSecrets: config.showSecrets })
        if (info.ok) {
          passed += 1
          results.appendChild(card(info))
        } else {
          failed += 1
          results.appendChild(errorCard(line, info))
        }
      })
      summary.textContent = '共 ' + lines.length + ' 条 · 成功 ' + passed + ' · 失败 ' + failed
      ccorebox.setHeight(Math.min(720, Math.max(240, 200 + lines.length * 86)))
    }
    input.addEventListener('input', function () {
      clearTimeout(timer)
      timer = setTimeout(run, 250)
    })
    document.getElementById('parse').onclick = run
    document.getElementById('clear').onclick = function () {
      input.value = ''
      results.innerHTML = ''
      summary.textContent = '尚未解析'
      addEmpty()
      ccorebox.setHeight(240)
      input.focus()
    }
  })()
  </script>`
}
