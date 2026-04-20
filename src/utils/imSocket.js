import CONFIG from '@/config.js'

const WS_URL = CONFIG.WS_BASE_URL

let socketTask = null
let connectingPromise = null
const messageListeners = new Set()
const activeSubscriptions = new Map()
let connected = false
let currentToken = null

const safeJsonParse = (text) => {
  try {
    return JSON.parse(text)
  } catch (e) {
    return null
  }
}

const notifyMessageListeners = (payload) => {
  messageListeners.forEach((listener) => {
    try {
      listener(payload)
    } catch (e) {}
  })
}

// Simple STOMP Frame Encoder
const encodeStompFrame = (command, headers, body) => {
  let frame = command + '\n'
  if (headers) {
    for (const key in headers) {
      frame += key + ':' + headers[key] + '\n'
    }
  }
  frame += '\n'
  if (body) {
    frame += typeof body === 'string' ? body : JSON.stringify(body)
  }
  frame += '\x00'
  return frame
}

// Simple STOMP Frame Decoder
const parseStompFrame = (data) => {
  if (data === '\n' || data === '\r\n') return null // Heartbeat
  let normalizedData = data.replace(/\r\n/g, '\n')
  // Remove leading newlines that might be attached from previous heartbeats
  while (normalizedData.startsWith('\n')) {
    normalizedData = normalizedData.slice(1)
  }
  if (!normalizedData) return null

  const parts = normalizedData.split('\n\n')
  if (parts.length < 2) return null
  const headersPart = parts[0]
  let bodyPart = parts.slice(1).join('\n\n')
  if (bodyPart.endsWith('\x00')) {
    bodyPart = bodyPart.slice(0, -1)
  }
  
  const headerLines = headersPart.split('\n')
  const command = headerLines[0]
  const headers = {}
  for (let i = 1; i < headerLines.length; i++) {
    const line = headerLines[i]
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      headers[line.slice(0, colonIdx)] = line.slice(colonIdx + 1)
    }
  }
  
  return { command, headers, body: bodyPart ? safeJsonParse(bodyPart) : null }
}

const connect = ({ token, terminalType }) => {
  if (!token) return Promise.reject(new Error('Missing token'))
  if (connectingPromise) return connectingPromise

  disconnect()
  currentToken = token

  connectingPromise = new Promise((resolve, reject) => {
    console.log(`WS：准备连接 STOMP（terminalType=${String(terminalType)}）`)

    socketTask = uni.connectSocket({
      url: WS_URL,
      fail: (err) => {
        console.log('WS：连接失败', err)
        socketTask = null
        connectingPromise = null
        reject(err)
      }
    })

    if (!socketTask) {
      console.log('WS：连接失败（未获取到 socketTask）')
      connectingPromise = null
      reject(new Error('connectSocket failed'))
      return
    }

    socketTask.onOpen(() => {
      console.log('WS：底层连接成功，发送 STOMP CONNECT')
      // Send STOMP CONNECT frame
      const connectFrame = encodeStompFrame('CONNECT', {
        'Authorization': `Bearer ${token}`,
        'accept-version': '1.1,1.0',
        'heart-beat': '10000,10000'
      })
      socketTask.send({ data: connectFrame })
    })

    socketTask.onError((err) => {
      console.log('WS：连接异常', err)
      socketTask = null
      connected = false
      connectingPromise = null
      reject(err)
    })

    socketTask.onClose(() => {
      console.log('WS：连接已关闭')
      socketTask = null
      connected = false
      connectingPromise = null
    })

    socketTask.onMessage((evt) => {
      const data = evt?.data
      if (typeof data !== 'string') return
      
      // A single WebSocket message might contain multiple STOMP frames separated by \x00
      const framesData = data.split('\x00')
      for (let i = 0; i < framesData.length; i++) {
        let frameData = framesData[i]
        // The last element might be empty if the string ends with \x00
        if (!frameData && i === framesData.length - 1) continue
        
        const frame = parseStompFrame(frameData)
        if (!frame) continue
        
        if (frame.command === 'CONNECTED') {
          console.log('STOMP 连接成功')
          connected = true
          
          // Subscribe to user queue
          const subFrame = encodeStompFrame('SUBSCRIBE', {
            id: 'sub-0',
            destination: '/user/queue/messages'
          })
          socketTask.send({ data: subFrame })
          
          // Restore active subscriptions
          for (const [id, destination] of activeSubscriptions.entries()) {
            const restoreFrame = encodeStompFrame('SUBSCRIBE', { id, destination })
            socketTask.send({ data: restoreFrame })
          }
          
          connectingPromise = null
          resolve(true)
        } else if (frame.command === 'MESSAGE') {
          console.log('STOMP MESSAGE received:', frame.body)
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

const disconnect = () => {
  try {
    const swallowNotConnected = (err) => {
      const msg = err?.errMsg ?? err?.message ?? String(err ?? '')
      if (String(msg).includes('WebSocket is not connected')) return
      console.log('WS：断开连接失败', err)
    }

    if (socketTask && connected) {
      console.log('WS：主动断开连接')
      const disconnectFrame = encodeStompFrame('DISCONNECT', { 'receipt': 'close-1' })
      socketTask.send({ data: disconnectFrame })
      
      const task = socketTask
      socketTask = null
      connected = false
      setTimeout(() => {
        task.close({
          fail: swallowNotConnected,
          complete: () => {}
        })
      }, 100)
    } else if (socketTask) {
      const task = socketTask
      socketTask = null
      connected = false
      task.close({
        fail: swallowNotConnected,
        complete: () => {}
      })
    }
  } catch (e) {
    console.log('WS：断开连接异常', e)
    socketTask = null
    connected = false
  } finally {
    connectingPromise = null
  }
}

const send = (destination, data) => {
  if (!socketTask || !connected) throw new Error('STOMP not connected')
  const frame = encodeStompFrame('SEND', { destination }, data)
  return socketTask.send({ data: frame })
}

const isConnected = () => connected

const onMessage = (listener) => {
  if (typeof listener !== 'function') return () => {}
  messageListeners.add(listener)
  return () => {
    messageListeners.delete(listener)
  }
}

const subscribe = (destination, id) => {
  console.log('STOMP SUBSCRIBE:', destination, id)
  activeSubscriptions.set(id, destination)
  if (!socketTask || !connected) {
    console.log('STOMP SUBSCRIBE deferred, not connected yet')
    return
  }
  const frame = encodeStompFrame('SUBSCRIBE', { id, destination })
  socketTask.send({ data: frame })
}

const unsubscribe = (id) => {
  activeSubscriptions.delete(id)
  if (!socketTask || !connected) return
  const frame = encodeStompFrame('UNSUBSCRIBE', { id })
  socketTask.send({ data: frame })
}

export default {
  connect,
  disconnect,
  send,
  isConnected,
  onMessage,
  subscribe,
  unsubscribe
}
