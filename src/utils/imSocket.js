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

// ===== 新增：接收缓冲区 + 心跳 =====
let rxBuffer = ''
let lastPongAt = 0
let heartbeatTimer = null
// 心跳 10s 发一次；25s 没收到任何数据就判死
const HEARTBEAT_INTERVAL_MS = 10000
const HEARTBEAT_TIMEOUT_MS = 25000

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
  if (data === '' || data === '\n' || data === '\r\n') return null
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

// ===== 新增：心跳 =====
const startHeartbeat = () => {
  stopHeartbeat()
  lastPongAt = Date.now()
  heartbeatTimer = setInterval(() => {
    // 超过阈值没收到任何服务端数据，判定连接已死
    if (Date.now() - lastPongAt > HEARTBEAT_TIMEOUT_MS) {
      console.warn('WS：心跳超时，主动触发重连')
      const dying = socketTask
      socketTask = null
      connected = false
      stopHeartbeat()
      try { dying && dying.close && dying.close({}) } catch (e) {}
      notifyStatusListeners('disconnected')
      scheduleReconnect()
      return
    }
    // 客户端心跳：STOMP 里心跳就是一个单独的 \n
    try {
      if (socketTask && connected) socketTask.send({ data: '\n' })
    } catch (e) {
      console.warn('WS：心跳发送失败', e)
    }
  }, HEARTBEAT_INTERVAL_MS)
}
const stopHeartbeat = () => {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
}

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

  // 新建连接前重置接收缓冲区，避免上次残留污染
  rxBuffer = ''

  connectingPromise = new Promise((resolve, reject) => {
    notifyStatusListeners('connecting')
    // 握手阶段同时把 token 放到 URL query，后端 HandshakeInterceptor 兜底能拿到
    const url = WS_URL + (WS_URL.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token)
    console.log('WS：准备连接', url)

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
      stopHeartbeat()
      rxBuffer = ''
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

      // 任何数据到达都刷新"存活时间戳"
      lastPongAt = Date.now()

      // 把本次收到的数据拼到缓冲区，然后按 \x00 逐帧切出完整帧
      rxBuffer += data
      // 先消费掉前导的心跳 \n
      while (rxBuffer.length && rxBuffer[0] === '\n') rxBuffer = rxBuffer.slice(1)

      let idx
      while ((idx = rxBuffer.indexOf('\x00')) !== -1) {
        const raw = rxBuffer.slice(0, idx)
        rxBuffer = rxBuffer.slice(idx + 1)
        // 帧间的心跳 \n 也消费掉
        while (rxBuffer.length && rxBuffer[0] === '\n') rxBuffer = rxBuffer.slice(1)

        const frame = parseStompFrame(raw)
        if (!frame) continue

        if (frame.command === 'CONNECTED') {
          console.log('STOMP 已连接')
          connected = true
          clearReconnect()
          startHeartbeat()
          notifyStatusListeners('connected')

          try {
            socketTask.send({ data: encodeStompFrame('SUBSCRIBE', { id: 'sub-user-queue', destination: '/user/queue/messages' }) })

            activeSubscriptions.forEach((destination, subId) => {
              if (subId === 'sub-user-queue') return
              socketTask.send({ data: encodeStompFrame('SUBSCRIBE', { id: subId, destination }) })
            })
          } catch (e) {
            console.error('WS：恢复订阅失败', e)
          }

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
      // 剩下的 rxBuffer 里是"没收完的半个帧"，等下一个 onMessage 事件来继续拼
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
  stopHeartbeat()
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
  rxBuffer = ''
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
  // 二次兜底：awaitConnected 可能因 timeout 直接返回而 socketTask 仍是 null
  if (!socketTask || !connected) {
    console.warn('WS：subscribe 时连接尚未建立，将在重连后由 activeSubscriptions 自动恢复', destination)
    return
  }
  try {
    socketTask.send({
      data: encodeStompFrame('SUBSCRIBE', { id, destination }),
      fail: (err) => console.error('STOMP SUBSCRIBE send fail', id, destination, err)
    })
    console.log('STOMP SUBSCRIBE →', destination)
  } catch (e) {
    console.error('STOMP SUBSCRIBE exception', e)
  }
}

const unsubscribe = (id) => {
  activeSubscriptions.delete(id)
  if (!socketTask || !connected) return
  try {
    socketTask.send({ data: encodeStompFrame('UNSUBSCRIBE', { id }) })
    console.log('STOMP UNSUBSCRIBE →', id)
  } catch (e) {}
}

/**
 * 从后台回到前台时调用：主动探测连接是否还活着。
 *   - 如果标志位是 disconnected，直接走 connect
 *   - 如果标志位是 connected，发一个心跳探测，3 秒内没收到任何数据就强制重连
 * 这是用来兜底 iOS/Android 后台把 socket 悄悄杀掉但 onClose 没触发的情况。
 */
const revalidate = () => {
  if (manualDisconnect) return
  if (!currentToken) {
    const token = uni.getStorageSync('token')
    if (!token) return
    currentToken = token
  }
  if (!connected || !socketTask) {
    // 没连上就直接连
    connect({ token: currentToken, terminalType: currentTerminalType }).catch((e) => {
      console.warn('WS revalidate connect fail', e?.message || e)
    })
    return
  }
  // 连着的情况：发一个心跳探测
  const probeAt = Date.now()
  try { socketTask.send({ data: '\n' }) } catch (e) {}
  setTimeout(() => {
    // 3 秒内没有任何数据到达 → 认为连接已死
    if (lastPongAt < probeAt) {
      console.warn('WS：revalidate 探测失败，强制重连')
      const dying = socketTask
      socketTask = null
      connected = false
      stopHeartbeat()
      try { dying && dying.close && dying.close({}) } catch (e) {}
      notifyStatusListeners('disconnected')
      scheduleReconnect()
    }
  }, 3000)
}

const onMessage = (fn) => { if (typeof fn !== 'function') return () => {}; messageListeners.add(fn); return () => messageListeners.delete(fn) }
const onStatusChange = (fn) => { if (typeof fn !== 'function') return () => {}; statusListeners.add(fn); return () => statusListeners.delete(fn) }
const isConnected = () => connected

export default {
  connect, disconnect, send, isConnected, onMessage, onStatusChange,
  subscribe, unsubscribe, awaitConnected, revalidate
}