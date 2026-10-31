const HISTORY_FILE = 'probe-history.txt'
const HISTORY_LIMIT = 50

async function readHistory() {
  try {
    const text = await ccorebox.fs.read(HISTORY_FILE)
    return String(text).split('\n').filter(Boolean)
  } catch (error) {
    return []
  }
}

async function probe(context) {
  const settings = context.settings || {}
  const url = String(settings.url || '').trim()
  if (!url) throw new Error('未配置探测地址')
  const started = Date.now()
  const response = await ccorebox.http.request({
    method: String(settings.method || 'GET'),
    url,
  })
  const elapsed = Date.now() - started
  const line = `${new Date().toISOString()} ${response.status} ${elapsed}ms ${url}`

  const history = await readHistory()
  history.unshift(line)
  await ccorebox.fs.write(HISTORY_FILE, history.slice(0, HISTORY_LIMIT).join('\n'))

  if (settings.notify) {
    await ccorebox.notify('HTTP 探测', `${response.status} · ${elapsed} ms`)
  }
  return line
}

export async function onManual(context) {
  return await probe(context)
}
