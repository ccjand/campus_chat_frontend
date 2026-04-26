const apiPort = 8080
const imgPort = 19000
const wsPort = 8080
const serverIp = '115.190.249.67'

let apiBaseUrl = `http://${serverIp}:${apiPort}`
let imgBaseUrl = `http://${serverIp}:${imgPort}/campus-chat/`
let wsBaseUrl = `ws://${serverIp}:${wsPort}/capi/ws/chat`

try {
  const isH5 = typeof window !== 'undefined' && typeof document !== 'undefined'
  if (isH5 && window.location) {
    const pageProtocol = window.location.protocol || 'http:'
    const apiProtocol = pageProtocol === 'https:' ? 'https' : 'http'
    const wsProtocol = pageProtocol === 'https:' ? 'wss' : 'ws'
    apiBaseUrl = `${apiProtocol}://${serverIp}:${apiPort}`
    imgBaseUrl = `http://${serverIp}:${imgPort}/campus-chat/`
    wsBaseUrl = `${wsProtocol}://${serverIp}:${wsPort}/capi/ws/chat`
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
