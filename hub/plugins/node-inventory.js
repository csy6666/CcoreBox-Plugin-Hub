const MAX_ROWS = 500

function text(value) {
  return value === undefined || value === null ? '' : String(value)
}

export const ui = () => `
  <style>
    .inv { display: grid; gap: 10px; padding: 14px; font-size: 12px; }
    .inv-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .inv select, .inv input {
      padding: 6px 8px; border: 1px solid var(--cb-line-strong); border-radius: var(--cb-r-sm);
      background: transparent; color: var(--cb-text); font: inherit;
    }
    .inv input { flex: 1 1 140px; min-width: 120px; }
    .inv button {
      padding: 6px 12px; border: 1px solid var(--cb-line-strong); border-radius: var(--cb-r-sm);
      background: var(--cb-glass-2); color: var(--cb-text); cursor: pointer;
    }
    .inv button:hover { border-color: var(--cb-accent); }
    .inv-summary { display: flex; gap: 12px; flex-wrap: wrap; color: var(--cb-text-weak); }
    .inv-summary b { color: var(--cb-text); }
    .inv-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .inv-table th, .inv-table td {
      padding: 5px 6px; border-bottom: 1px solid var(--cb-line); text-align: left;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .inv-table th { color: var(--cb-text-weak); font-weight: 500; }
    .inv-table td.mono { font-family: var(--cb-font-mono); }
    .inv-table td.star { width: 28px; text-align: center; color: var(--cb-accent); }
    .inv-empty { padding: 16px; text-align: center; color: var(--cb-text-weak); }
    .inv-error { color: var(--cb-danger, #d9534f); }
  </style>
  <div class="inv">
    <div class="inv-bar">
      <select id="profile" title="配置"></select>
      <input id="filter" type="text" placeholder="按标签 / 服务器 / 类型过滤" spellcheck="false">
      <button id="refresh" type="button">刷新</button>
    </div>
    <div class="inv-summary" id="summary"></div>
    <div id="list"></div>
  </div>
  <script>
    (function () {
      var profileSelect = document.getElementById('profile')
      var filterInput = document.getElementById('filter')
      var summary = document.getElementById('summary')
      var list = document.getElementById('list')
      var state = null
      var busy = false

      function setSummary(parts) {
        summary.textContent = ''
        parts.forEach(function (part) {
          var span = document.createElement('span')
          span.textContent = part.label + ' '
          var value = document.createElement('b')
          value.textContent = String(part.value)
          span.appendChild(value)
          summary.appendChild(span)
        })
      }

      function message(value, className) {
        list.textContent = ''
        var box = document.createElement('div')
        box.className = className || 'inv-empty'
        box.textContent = value
        list.appendChild(box)
      }

      function matches(node, keyword) {
        if (!keyword) return true
        var haystack = [node.tag, node.label, node.type, node.server, node.server_name]
          .map(function (value) { return String(value || '').toLowerCase() })
          .join(' ')
        return haystack.indexOf(keyword.toLowerCase()) >= 0
      }

      function renderNodes() {
        if (!state) {
          message('尚未载入')
          return
        }
        var keyword = filterInput.value.trim()
        var nodes = (state.nodes || []).filter(function (node) { return matches(node, keyword) })
        var shown = nodes.slice(0, MAX_ROWS)
        setSummary([
          { label: '配置', value: state.profile_id || '无' },
          { label: '节点', value: state.total_nodes },
          { label: '显示', value: shown.length }
        ])
        if (!shown.length) {
          message(keyword ? '没有匹配的节点' : '当前配置没有节点')
          ccorebox.setHeight(320)
          return
        }
        list.textContent = ''
        var table = document.createElement('table')
        table.className = 'inv-table'
        var head = document.createElement('thead')
        var headRow = document.createElement('tr')
        ;['', '标签 / Tag', '类型', '服务器', '端口'].forEach(function (title) {
          var th = document.createElement('th')
          th.textContent = title
          headRow.appendChild(th)
        })
        head.appendChild(headRow)
        table.appendChild(head)
        var body = document.createElement('tbody')
        shown.forEach(function (node) {
          var row = document.createElement('tr')
          var star = document.createElement('td')
          star.className = 'star'
          star.textContent = node.favorite ? '★' : ''
          row.appendChild(star)
          var name = document.createElement('td')
          name.textContent = node.label ? node.label + ' (' + node.tag + ')' : node.tag
          name.title = name.textContent
          row.appendChild(name)
          var type = document.createElement('td')
          type.textContent = text(node.type)
          row.appendChild(type)
          var server = document.createElement('td')
          server.className = 'mono'
          server.textContent = text(node.server)
          server.title = server.textContent
          row.appendChild(server)
          var port = document.createElement('td')
          port.className = 'mono'
          port.textContent = node.port ? String(node.port) : ''
          row.appendChild(port)
          body.appendChild(row)
        })
        table.appendChild(body)
        list.appendChild(table)
        if (nodes.length > shown.length) {
          var note = document.createElement('div')
          note.className = 'inv-empty'
          note.textContent = '仅显示前 ' + shown.length + ' 条，共 ' + nodes.length + ' 条匹配'
          list.appendChild(note)
        }
        ccorebox.setHeight(Math.min(720, Math.max(320, 250 + shown.length * 26)))
      }

      function fillProfiles() {
        profileSelect.textContent = ''
        ;(state.profiles || []).forEach(function (profile) {
          var option = document.createElement('option')
          option.value = profile.id
          option.textContent = profile.name || profile.id
          if (profile.id === state.profile_id) option.selected = true
          profileSelect.appendChild(option)
        })
      }

      async function load(profileId) {
        if (busy) return
        busy = true
        message('读取中…')
        try {
          state = await ccorebox.rpc('profiles.list', { profileId: profileId || '' })
          fillProfiles()
          renderNodes()
        } catch (error) {
          var detail = error && error.message ? error.message : String(error)
          message('读取失败：' + detail, 'inv-error')
        } finally {
          busy = false
        }
      }

      document.getElementById('refresh').onclick = function () { load(profileSelect.value) }
      profileSelect.onchange = function () { load(profileSelect.value) }
      filterInput.oninput = renderNodes
      ccorebox.setHeight(360)
      load('')
    })()
  </script>
`

export function onManual() {
  return 'node inventory ready'
}
