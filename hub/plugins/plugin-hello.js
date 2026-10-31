export async function onInstall() {
  await ccorebox.notify('Hello 示例', '插件已安装，可以在插件中心手动运行。')
  return 'installed'
}

export async function onManual() {
  await ccorebox.notify('Hello 示例', '手动运行成功。')
  return 'ok'
}
