export const ui = () => `
  <style>
    .subs { display: grid; gap: 10px; padding: 14px; font-size: 12px; }
    .subs-bar { display: flex; align-items: center; gap: 8px; }
    .subs-bar button {
      padding: 6px 12px; border: 1px solid var(--cb-line-strong); border-radius: var(--cb-r-sm);
      background: var(--cb-glass-2); color: var(--cb-text); cursor: pointer;
    }
    .subs-bar button:hover { border-color: var(--cb-accent); }
    .subs-bar span { color: var(--cb-text-weak); }
    .subs-card {
      display: grid; gap: 8px; padding: 10px 12px;
      border: 1px solid var(--cb-line); border-radius: var(--cb-r-sm);
    }
    .subs-head { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .subs-name { font-weight: 600; }
    .subs-host { font-family: var(--cb-font-mono); color: var(--cb-text-weak); }
    .subs-meta { display: flex; gap: 12px; flex-wrap: wrap; color: var(--cb-text-weak); }
    .subs-meta b { color: var(--cb-text); }
    .subs-track { height: 6px; border-radius: 3px; background: var(--cb-line); overflow: hidden; }
    .subs-fill { height: 100%; background: var(--cb-accent); }
    .subs-fill.warn { background: var(--cb-warning, #d9a441); }
    .subs-fill.danger { background: var(--cb-danger, #d9534f); }
    .subs-error { color: var(--cb-danger, #d9534f); word-break: break-all; }
    .subs-empty { padding: 16px; text-align: center; color: var(--cb-text-weak); }
    .subs-tag {
      padding: 1px 6px; border: 1px solid var(--cb-line-strong); border-radius: 999px;
      color: var(--cb-text-weak);
    }
  </style>
  <div class="subs">
    <div class="subs-bar">
      <button id="refresh" type="button">刷新</button>
      <span id="summary">读取中…</span>
    </div>
    <div id="list"></div>
  </div>
  <script>
    (function () {
      var list = document.getElementById('list')
      var summary = document.getElementById('summary')
      var busy = false

      function formatBytes(value) {
        var number = Number(value)
        if (!isFinite(number) || number <= 0) return '0 B'
        var units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
        var size = number
        var index = 0
        while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1 }
        return (size >= 100 || index === 0 ? size.toFixed(0) : size.toFixed(1)) + ' ' + units[index]
      }

      function formatDate(value) {
        if (!value) return ''
        var parsed = new Date(value)
        if (isNaN(parsed.getTime())) return value
        return parsed.toLocaleString()
      }

      function percentOf(usage) {
        if (!usage || !usage.total) return 0
        var used = Number(usage.upload || 0) + Number(usage.download || 0)
        return Math.max(0, Math.min(100, Math.round((used / usage.total) * 100)))
      }

      function field(label, value) {
        var span = document.createElement('span')
        span.textContent = label + ' '
        var strong = document.createElement('b')
        strong.textContent = String(value)
        span.appendChild(strong)
        return span
      }

      function message(value) {
        list.textContent = ''
        var box = document.createElement('div')
        box.className = 'subs-empty'
        box.textContent = value
        list.appendChild(box)
      }

      function render(subscriptions) {
        list.textContent = ''
        summary.textContent = '共 ' + subscriptions.length + ' 条订阅'
        if (!subscriptions.length) {
          message('还没有订阅')
          ccorebox.setHeight(220)
          return
        }
        subscriptions.forEach(function (sub) {
          var card = document.createElement('div')
          card.className = 'subs-card'

          var head = document.createElement('div')
          head.className = 'subs-head'
          var name = document.createElement('span')
          name.className = 'subs-name'
          name.textContent = sub.name || sub.id
          head.appendChild(name)
          if (sub.host) {
            var host = document.createElement('span')
            host.className = 'subs-host'
            host.textContent = sub.host
            head.appendChild(host)
          }
          card.appendChild(head)

          var meta = document.createElement('div')
          meta.className = 'subs-meta'
          meta.appendChild(field('节点', sub.node_count))
          if (sub.duplicate_count) meta.appendChild(field('去重', sub.duplicate_count))
          if (sub.format) meta.appendChild(field('格式', sub.format))
          if (sub.auto_update) meta.appendChild(field('自动更新', (sub.interval_minutes || 0) + ' 分钟'))
          if (sub.update_status) meta.appendChild(field('状态', sub.update_status))
          card.appendChild(meta)

          var usage = sub.usage || {}
          if (usage.total) {
            var track = document.createElement('div')
            track.className = 'subs-track'
            var fill = document.createElement('div')
            var percent = percentOf(usage)
            fill.className = 'subs-fill' + (percent >= 90 ? ' danger' : percent >= 70 ? ' warn' : '')
            fill.style.width = percent + '%'
            track.appendChild(fill)
            card.appendChild(track)

            var used = Number(usage.upload || 0) + Number(usage.download || 0)
            var usageLine = document.createElement('div')
            usageLine.className = 'subs-meta'
            usageLine.appendChild(field('已用', formatBytes(used)))
            usageLine.appendChild(field('剩余', formatBytes(usage.remaining)))
            usageLine.appendChild(field('总量', formatBytes(usage.total)))
            if (usage.expires_at) usageLine.appendChild(field('到期', formatDate(usage.expires_at)))
            card.appendChild(usageLine)
          }

          var times = document.createElement('div')
          times.className = 'subs-meta'
          if (sub.last_success_at) times.appendChild(field('上次成功', formatDate(sub.last_success_at)))
          if (sub.next_update_at) times.appendChild(field('下次更新', formatDate(sub.next_update_at)))
          if (times.childNodes.length) card.appendChild(times)

          if (sub.last_error) {
            var error = document.createElement('div')
            error.className = 'subs-error'
            error.textContent = sub.last_error
            card.appendChild(error)
          }

          list.appendChild(card)
        })
        ccorebox.setHeight(Math.min(720, 240 + subscriptions.length * 110))
      }

      async function load() {
        if (busy) return
        busy = true
        summary.textContent = '读取中…'
        try {
          var subscriptions = await ccorebox.rpc('subscriptions.list', {})
          render(subscriptions || [])
        } catch (error) {
          var detail = error && error.message ? error.message : String(error)
          summary.textContent = ''
          message('读取失败：' + detail)
        } finally {
          busy = false
        }
      }

      document.getElementById('refresh').onclick = load
      ccorebox.setHeight(300)
      load()
    })()
  </script>
`

export function onManual() {
  return 'subscription overview ready'
}
