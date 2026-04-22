import CONFIG from '@/config.js'

const WS_URL = CONFIG.WS_BASE_URL

let socketTask = null
let connectingPromise = null
let connected = false
let currentToken = null
let currentTerminalType = null
let manualDisconnect = false

let reconnectTimer = null
let reconnectAttempts = 0
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000

const messageListeners = new Set()
const statusListeners = new Set()
const activeSubscriptions = new Map()

const safeJsonParse = (t) => { try { return JSON.parse(t) } catch (e) { return null } }

const encodeStompFrame = (command, headers, body) => {
  let frame = command + '\n'
  if (headers) for (const k in headers) frame += k + ':' + headers[k] + '\n'
  frame += '\n'
  if (body) frame += typeof body === 'string' ? body : JSON.stringify(body)
  frame += '\x00'
  return frame
}

const parseStompFrame = (data) => {
  if (data === '\n' || data === '\r\n') return null
  let s = data.replace(/\r\n/g, '\n')
  while (s.startsWith('\n')) s = s.slice(1)
  if (!s) return null
  const parts = s.split('\n\n')
  if (parts.length < 2) return null
  const headerLines = parts[0].split('\n')
  let body = parts.slice(1).join('\n\n')
  if (body.endsWith('\x00')) body = body.slice(0, -1)
  const command = headerLines[0]
  const headers = {}
  for (let i = 1; i < headerLines.length; i++) {
    const line = headerLines[i]
    const idx = line.indexOf(':')
    if (idx > 0) headers[line.slice(0, idx)] = line.slice(idx + 1)
  }
  return { command, headers, body: body ? safeJsonParse(body) : null }
}

const notifyMessageListeners = (p) => messageListeners.forEach((fn) => { try { fn(p) } catch (e) { console.error(e) } })
const notifyStatusListeners = (s) => statusListeners.forEach((fn) => { try { fn(s) } catch (e) {} })

const scheduleReconnect = () => {
  if (manualDisconnect || !currentToken || reconnectTimer) return
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts))
  reconnectAttempts += 1
  console.log(`WS：${delay}ms 后第 ${reconnectAttempts} 次重连`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect({ token: currentToken, terminalType: currentTerminalType }).catch(() => scheduleReconnect())
  }, delay)
}
const clearReconnect = () => { if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null } reconnectAttempts = 0 }

const connect = ({ token, terminalType }) => {
  if (!token) return Promise.reject(new Error('Missing token'))
  if (connected && socketTask) return Promise.resolve(true)
  if (connectingPromise) return connectingPromise

  manualDisconnect = false
  currentToken = token
  currentTerminalType = terminalType

  connectingPromise = new Promise((resolve, reject) => {
    notifyStatusListeners('connecting')
    // 握手阶段同时把 token 放到 URL query，后端 HandshakeInterceptor 兜底能拿到
    const url = WS_URL + (WS_URL.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token)
    console.log('WS：准备连接', url)

    // Using H5 standard WebSocket or standard uni.connectSocket based on environment to ensure ws works
    socketTask = uni.connectSocket({ 
      url, 
      complete: () => {} 
    })
    if (!socketTask) {
      connectingPromise = null
      reject(new Error('connectSocket failed'))
      return
    }

    const handleFail = (err) => {
      console.warn('WS：底层断开/失败', err)
      const wasConnected = connected
      connected = false
      socketTask = null
      connectingPromise = null
      notifyStatusListeners('disconnected')
      if (!wasConnected) reject(new Error(err?.errMsg || 'WS closed'))
      scheduleReconnect()
    }

    socketTask.onOpen((res) => {
      console.log('WS：底层打开，发送 STOMP CONNECT', res)
      if (!socketTask) return
      socketTask.send({
        data: encodeStompFrame('CONNECT', {
          'Authorization': `Bearer ${token}`,
          'accept-version': '1.2,1.1,1.0',
          'heart-beat': '10000,10000'
        })
      })
    })

    socketTask.onError((err) => handleFail(err))
    socketTask.onClose((err) => handleFail(err))

    socketTask.onMessage((evt) => {
      const data = evt?.data
      if (typeof data !== 'string') return
      const frames = data.split('\x00')
      for (let i = 0; i < frames.length; i++) {
        const raw = frames[i]
        if (!raw && i === frames.length - 1) continue
        const frame = parseStompFrame(raw)
        if (!frame) continue

        if (frame.command === 'CONNECTED') {
          console.log('STOMP 已连接')
          connected = true
          clearReconnect()
          notifyStatusListeners('connected')
          
          socketTask.send({ data: encodeStompFrame('SUBSCRIBE', { id: 'sub-user-queue', destination: '/user/queue/messages' }) })
          
          activeSubscriptions.forEach((destination, id) => {
            if (id === 'sub-user-queue') return
            socketTask.send({ data: encodeStompFrame('SUBSCRIBE', { id, destination }) })
          })
          
          connectingPromise = null
          resolve(true)
        } else if (frame.command === 'MESSAGE') {
          console.log('STOMP MESSAGE', frame.headers?.destination, frame.body)
          notifyMessageListeners(frame.body)
        } else if (frame.command === 'ERROR') {
          console.error('STOMP ERROR', frame.headers, frame.body)
          if (!connected) {
            connectingPromise = null
            reject(new Error(frame.headers?.message || 'STOMP Error'))
          }
        }
      }
    })
  })

  return connectingPromise
}

const awaitConnected = async (timeoutMs = 8000) => {
  if (connected) return true
  if (!currentToken) {
    const token = uni.getStorageSync('token')
    if (!token) throw new Error('未登录')
    await connect({ token, terminalType: CONFIG.TERMINAL_TYPE })
    return connected
  }
  if (connectingPromise) {
    await Promise.race([
      connectingPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('connect timeout')), timeoutMs))
    ])
    return connected
  }
  await connect({ token: currentToken, terminalType: currentTerminalType })
  return connected
}

const disconnect = () => {
  manualDisconnect = true
  clearReconnect()
  try {
    if (socketTask && connected) {
      socketTask.send({ data: encodeStompFrame('DISCONNECT', { receipt: 'close-1' }) })
    }
    if (socketTask) {
      setTimeout(() => { try { socketTask.close({}) } catch (e) {} }, 50)
    }
  } catch (e) {}
  socketTask = null
  connected = false
  connectingPromise = null
  notifyStatusListeners('disconnected')
}

const send = async (destination, data) => {
  if (!connected) await awaitConnected()
  if (!socketTask || !connected) throw new Error('STOMP not connected')
  return new Promise((resolve, reject) => {
    socketTask.send({
      data: encodeStompFrame('SEND', { destination, 'content-type': 'application/json' }, data),
      success: resolve,
      fail: reject
    })
  })
}

const subscribe = async (destination, id) => {
  activeSubscriptions.set(id, destination)
  try { if (!connected) await awaitConnected() } catch (e) { return }
  socketTask.send({ data: encodeStompFrame('SUBSCRIBE', { id, destination }) })
  console.log('STOMP SUBSCRIBE →', destination)
}

const unsubscribe = (id) => {
  activeSubscriptions.delete(id)
  if (!socketTask || !connected) return
  socketTask.send({ data: encodeStompFrame('UNSUBSCRIBE', { id }) })
  console.log('STOMP UNSUBSCRIBE →', id)
}

const onMessage = (fn) => { if (typeof fn !== 'function') return () => {}; messageListeners.add(fn); return () => messageListeners.delete(fn) }
const onStatusChange = (fn) => { if (typeof fn !== 'function') return () => {}; statusListeners.add(fn); return () => statusListeners.delete(fn) }
const isConnected = () => connected

export default {
  connect, disconnect, send, isConnected, onMessage, onStatusChange,
  subscribe, unsubscribe, awaitConnected
}