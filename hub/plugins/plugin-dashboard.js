function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const ui = (context) => {
  const url = escapeHTML(context.settings && context.settings.url ? context.settings.url : '')
  return `
  <style>
    .dash { display: grid; gap: 10px; padding: 14px; }
    .dash label { display: grid; gap: 6px; font-size: 12px; }
    .dash input { padding: 7px 9px; border: 1px solid var(--cb-line-strong); border-radius: var(--cb-r-sm); background: transparent; }
    .dash .row { display: flex; gap: 8px; flex-wrap: wrap; }
    .dash button { padding: 7px 12px; border: 1px solid var(--cb-line-strong); border-radius: var(--cb-r-sm); background: var(--cb-glass-2); cursor: pointer; }
    .dash button:hover { border-color: var(--cb-accent); }
    .dash pre { margin: 0; padding: 10px; min-height: 42px; border: 1px dashed var(--cb-line-strong); border-radius: var(--cb-r-sm); font: 12px/1.5 var(--cb-font-mono); white-space: pre-wrap; }
  </style>
  <div class="dash">
    <label>请求地址 <input id="url" type="text" value="${url}" spellcheck="false"></label>
    <div class="row">
      <button id="run" type="button">请求</button>
      <button id="save" type="button">保存结果</button>
      <button id="notify" type="button">通知我</button>
    </div>
    <pre id="out">就绪</pre>
  </div>
  <script>
    (function () {
      var out = document.getElementById('out')
      var last = ''
      function show(text) { out.textContent = text }
      document.getElementById('run').onclick = async function () {
        var url = document.getElementById('url').value.trim()
        if (!url) { show('请填写地址'); return }
        show('请求中…')
        try {
          var res = await ccorebox.http.request({ method: 'GET', url: url })
          last = res.status + ' ' + url
          show(last)
        } catch (error) {
          show('失败：' + (error && error.message ? error.message : error))
        }
      }
      document.getElementById('save').onclick = async function () {
        if (!last) { show('先请求一次'); return }
        await ccorebox.fs.write('last-result.txt', last)
        show('已保存：' + last)
      }
      document.getElementById('notify').onclick = function () {
        ccorebox.notify('仪表盘示例', last || '还没有结果')
      }
      ccorebox.setHeight(240)
    })()
  </script>`
}

export function onManual() {
  return 'dashboard ready'
}
