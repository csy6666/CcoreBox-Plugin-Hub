const TIMELINE_FILE = 'timeline.jsonl'

async function readEntries() {
  let raw = ''
  try {
    raw = String(await ccorebox.fs.read(TIMELINE_FILE))
  } catch (error) {
    return []
  }
  const entries = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line)
      if (entry && typeof entry.at === 'string') entries.push(entry)
    } catch (error) {
      // ignore a malformed line instead of dropping the whole timeline
    }
  }
  return entries
}

function describeEvent(event) {
  if (event === 'onCoreStarted') return { label: '核心启动', level: 'ok' }
  if (event === 'onCoreStopped') return { label: '核心停止', level: 'bad' }
  if (event === 'onStartup') return { label: '应用启动', level: 'info' }
  return { label: String(event), level: 'info' }
}

async function append(context, event) {
  const settings = context.settings || {}
  const entries = await readEntries()
  entries.push({ at: new Date().toISOString(), event: event })
  const limit = Math.max(10, Math.min(500, Number(settings.limit) || 200))
  const kept = entries.slice(-limit)
  await ccorebox.fs.write(TIMELINE_FILE, kept.map((entry) => JSON.stringify(entry)).join('\n') + '\n')
  if (settings.notify) {
    await ccorebox.notify('核心事件', describeEvent(event).label + ' · ' + new Date().toLocaleString())
  }
}

export async function onStartup(context) {
  await append(context, 'onStartup')
}

export async function onCoreStarted(context) {
  await append(context, 'onCoreStarted')
}

export async function onCoreStopped(context) {
  await append(context, 'onCoreStopped')
}

export function ui(context) {
  const settings = context.settings || {}
  const config = { limit: String(settings.limit || '200') }
  const serialized = JSON.stringify(config).replace(/</g, '\\u003c')
  return `
  <style>
    .timeline { display: grid; gap: 10px; padding: 14px; }
    .row { display: flex; align-items: center; gap: 8px; }
    .row .muted { margin-right: auto; }
    .muted { color: var(--cb-text-3, #6b7280); font-size: 11px; }
    .row button { padding: 5px 10px; border: 1px solid var(--cb-line-strong, rgba(0,0,0,.15)); border-radius: var(--cb-r-sm, 6px); background: var(--cb-glass-2, rgba(255,255,255,.6)); cursor: pointer; }
    .row button:hover { border-color: var(--cb-accent, #3b82f6); }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    li { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 1px solid var(--cb-line, rgba(0,0,0,.08)); border-radius: var(--cb-r-sm, 6px); font-size: 12px; }
    li.empty { justify-content: center; color: var(--cb-text-3, #6b7280); border-style: dashed; }
    time { margin-left: auto; color: var(--cb-text-2, #4b5563); font-variant-numeric: tabular-nums; }
    .badge { padding: 2px 8px; border-radius: 999px; font-size: 11px; background: var(--cb-info-dim, rgba(59,130,246,.12)); color: var(--cb-info, #3b82f6); }
    .badge.ok { background: var(--cb-ok-dim, rgba(34,197,94,.12)); color: var(--cb-ok, #22c55e); }
    .badge.bad { background: var(--cb-bad-dim, rgba(239,68,68,.12)); color: var(--cb-bad, #ef4444); }
  </style>
  <div class="timeline">
    <div class="row">
      <span id="count" class="muted">最近 0 条</span>
      <button id="refresh" type="button">刷新</button>
      <button id="clear" type="button">清空</button>
    </div>
    <ul id="list"><li class="empty">暂无记录</li></ul>
  </div>
  <script>
  (function () {
    var list = document.getElementById('list')
    var count = document.getElementById('count')
    function describe(event) {
      if (event === 'onCoreStarted') return { label: '核心启动', level: 'ok' }
      if (event === 'onCoreStopped') return { label: '核心停止', level: 'bad' }
      if (event === 'onStartup') return { label: '应用启动', level: 'info' }
      return { label: String(event), level: 'info' }
    }
    function render(entries) {
      count.textContent = '最近 ' + entries.length + ' 条'
      if (!entries.length) {
        list.innerHTML = '<li class="empty">暂无记录</li>'
        ccorebox.setHeight(220)
        return
      }
      list.innerHTML = ''
      entries.slice().reverse().forEach(function (entry) {
        var item = document.createElement('li')
        var badge = document.createElement('span')
        var info = describe(entry.event)
        badge.className = 'badge ' + info.level
        badge.textContent = info.label
        var time = document.createElement('time')
        var date = new Date(entry.at)
        time.textContent = isNaN(date.getTime()) ? entry.at : date.toLocaleString()
        item.appendChild(badge)
        item.appendChild(time)
        list.appendChild(item)
      })
      ccorebox.setHeight(Math.min(720, Math.max(200, 120 + entries.length * 27)))
    }
    async function load() {
      try {
        var raw = await ccorebox.fs.read('timeline.jsonl')
        var entries = []
        raw.split('\\n').forEach(function (line) {
          if (!line.trim()) return
          try {
            var entry = JSON.parse(line)
            if (entry && entry.at) entries.push(entry)
          } catch (error) {}
        })
        render(entries)
      } catch (error) {
        render([])
      }
    }
    document.getElementById('refresh').onclick = load
    document.getElementById('clear').onclick = async function () {
      try {
        await ccorebox.fs.remove('timeline.jsonl')
      } catch (error) {}
      render([])
    }
    load()
    setInterval(load, 15000)
  })()
  </script>`
}
