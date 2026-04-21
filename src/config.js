const ip = '172.20.10.3'
const apiPort = 8080
const imgPort = 19000
const wsPort = 8080

let apiBaseUrl = `http://${ip}:${apiPort}`
let imgBaseUrl = `http://${ip}:${imgPort}/campus-chat/`
let wsBaseUrl = `ws://${ip}:${wsPort}/capi/ws/chat`

try {
  const isH5 = typeof window !== 'undefined' && typeof document !== 'undefined'
  if (isH5 && window.location) {
    const hostname = window.location.hostname || ''
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1'
    const host = ip // 强制使用上方定义的 ip (172.20.10.3)，不回退到 localhost
    const pageProtocol = window.location.protocol || 'http:'
    const apiProtocol = pageProtocol === 'https:' ? 'https' : 'http'
    const wsProtocol = pageProtocol === 'https:' ? 'wss' : 'ws'
    apiBaseUrl = `${apiProtocol}://${host}:${apiPort}`
    wsBaseUrl = `${wsProtocol}://${host}:${wsPort}/capi/ws/chat`
  }
} catch (e) {}

let terminalType = '4'

try {
  const platform = String(uni.getSystemInfoSync()?.platform ?? '')
  if (platform === 'android' || platform === 'ios') terminalType = '1'
  else if (platform === 'windows' || platform === 'mac') terminalType = '2'
  else terminalType = '4'
} catch (e) {}

export default {
  API_BASE_URL: apiBaseUrl,
  IMG_BASE_URL: imgBaseUrl,
  WS_BASE_URL: wsBaseUrl,
  TERMINAL_TYPE: terminalType
}
