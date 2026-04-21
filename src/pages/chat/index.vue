<template>
  <view class="chat-page" :class="chatType">
    <!-- Background Image for Group Chat -->
    <view v-if="chatType === 'group'" class="group-bg"></view>
    
    <!-- Header -->
    <chat-header 
      :title="title" 
      :count="memberCount" 
      :type="chatType"
      @back="handleBack"
    ></chat-header>
    
    <!-- Message List Area -->
    <scroll-view 
      scroll-y 
      class="chat-content" 
      :scroll-into-view="scrollIntoViewId"
      :scroll-with-animation="scrollAnimation"
      :show-scrollbar="false"
      :style="{ paddingBottom: `calc(${chatInputHeight}px + ${keyboardOffset}px)` }"
      @scroll="handleScroll"
      @scrolltoupper="loadMoreMessages"
      :upper-threshold="50"
    >
      <view class="padding-top"></view>
      
      <view v-if="loading && !messages.length" class="empty-state">
        <text class="empty-text">加载中...</text>
      </view>
      <view v-else-if="!messages || messages.length === 0" class="empty-state">
        <text class="empty-text">暂无消息</text>
      </view>
      <template v-else>
        <view v-if="loadingMore" class="loading-more">
          <u-loading-icon mode="circle" size="20" color="#999"></u-loading-icon>
          <text class="loading-text">加载更多...</text>
        </view>
        <template v-for="(item, index) in messages" :key="getMessageRenderKey(item)">
          <date-separator 
            v-if="shouldShowTimeSeparator(item, index)" 
            :date="getTimeSeparatorLabel(item, index)"
          ></date-separator>
          
          <view :id="getMessageRenderKey(item)" class="message-row">
            <message-bubble 
              :message="item" 
              :is-own="item.sender === 'self' || (item.sender && String(item.sender.id) === String(currentUserId))"
              :show-avatar="true"
              :show-name="chatType === 'group'"
              @longpress="openMessageMenu"
            ></message-bubble>
          </view>
        </template>
      </template>
      
      <view id="scroll-bottom-anchor" class="padding-bottom"></view>
    </scroll-view>

    <view v-if="scrollBarVisible" class="chat-scrollbar" :style="scrollBarTrackStyle">
      <view class="chat-scrollbar-thumb" :style="scrollBarThumbStyle"></view>
    </view>

    <view v-if="showScrollDown" class="scroll-down" :style="scrollDownStyle" @click="handleScrollDownClick">
      <u-icon name="arrow-down" size="20" color="#3C4A80"></u-icon>
    </view>
    
    <!-- Input Area -->
    <chat-input
      :reply="replyDraft"
      :bottom-offset="keyboardOffset"
      @clear-reply="clearReplyDraft"
      @send="handleSendMessage"
      @height-change="handleChatInputHeightChange"
    ></chat-input>

    <view v-if="menuVisible" class="menu-mask" @touchstart="closeMenu">
      <view class="message-menu" :style="menuStyle" @touchstart.stop>
        <view v-for="item in menuItems" :key="item.key" class="menu-item" @click="handleMenuAction(item.key)">
          <text class="menu-text">{{ item.label }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, getCurrentInstance, nextTick } from 'vue'
import { onLoad, onUnload ,onShow, onHide} from '@dcloudio/uni-app'
import ChatHeader from '@/components/ChatHeader.vue'
import ChatInput from '@/components/ChatInput.vue'
import MessageBubble from '@/components/MessageBubble.vue'
import DateSeparator from '@/components/DateSeparator.vue'
import dayjs from 'dayjs'
import request from '@/utils/request'
import imSocket from '@/utils/imSocket'
import CONFIG from '@/config.js'

const chatType = ref('single') // single or group
const title = ref('')
const memberCount = ref('')
const messages = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(true)
const scrollAnimation = ref(false) // Disable animation for initial load to prevent jump glitches
const scrollTop = ref(0)
const scrollIntoViewId = ref('')
const currentUserId = ref(null)
const roomId = ref(null)
const receiverId = ref(null)
let msgSeq = 0
let removeWsListener = null
const messageIdSet = new Set()
const replyDraft = ref(null)
const showScrollDown = ref(false)
const isAwayFromBottom = ref(false)
const hasNewMessageWhileAway = ref(false)
const containerHeight = ref(0)
const bottomThresholdPx = ref(320)
const instance = getCurrentInstance()
const hiddenMessageIdSet = new Set()
const chatInputHeight = ref(80)
const keyboardOffset = ref(0)
const baselineWindowHeight = ref(0)
const statusBarHeight = ref(0)
const safeAreaBottom = ref(0)
let removeKeyboardListener = null
let removeVisualViewportListener = null

const menuVisible = ref(false)
const menuStyle = ref({})
const menuItems = ref([])
const activeMenuMessage = ref(null)

const scrollBarVisible = ref(false)
const scrollBarOpacity = ref(0)
const scrollBarThumbHeight = ref(24)
const scrollBarThumbTop = ref(0)
let scrollBarHideTimer = null

const getHiddenStorageKey = () => {
  const uid = currentUserId.value != null ? String(currentUserId.value) : '0'
  const rid = roomId.value != null ? String(roomId.value) : '0'
  return `chat_hidden_msg_ids_${uid}_${rid}`
}

const loadHiddenMessageIds = () => {
  hiddenMessageIdSet.clear()
  const key = getHiddenStorageKey()
  const raw = uni.getStorageSync(key)
  const arr = (() => {
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string' && raw) {
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
      } catch (e) {
        return []
      }
    }
    return []
  })()
  arr.forEach((id) => {
    if (id == null) return
    const text = String(id)
    if (!text) return
    hiddenMessageIdSet.add(text)
  })
}

const saveHiddenMessageIds = () => {
  const key = getHiddenStorageKey()
  const list = Array.from(hiddenMessageIdSet)
  const trimmed = list.length > 500 ? list.slice(list.length - 500) : list
  uni.setStorageSync(key, trimmed)
}

const hideMessageLocally = (messageId) => {
  if (messageId == null) return
  const idText = String(messageId)
  if (!idText) return
  hiddenMessageIdSet.add(idText)
  saveHiddenMessageIds()
}

const normalizeAvatar = (avatar) => {
  if (avatar == null) return '/static/logo.png'
  const text = String(avatar).trim()
  if (!text || text === 'null' || text === 'undefined') return '/static/logo.png'
  if (text.startsWith('http') || text.startsWith('data:')) return text
  return CONFIG.IMG_BASE_URL + text.replace(/^\/+/, '')
}

const formatSendTime = (sendTime) => {
  if (!sendTime) return ''
  if (typeof sendTime === 'string') return sendTime.replace('T', ' ').slice(0, 16)
  if (Array.isArray(sendTime)) {
    const [y, m, d, hh = 0, mm = 0] = sendTime
    const pad = (n) => String(n).padStart(2, '0')
    return `${y}-${pad(m)}-${pad(d)} ${pad(hh)}:${pad(mm)}`
  }
  return String(sendTime)
}

const toMs = (sendTime) => {
  if (!sendTime) return Date.now()
  if (typeof sendTime === 'number') {
    const n = Number(sendTime)
    if (!Number.isFinite(n)) return Date.now()
    return n < 1000000000000 ? n * 1000 : n
  }
  if (typeof sendTime === 'string') {
    const t = dayjs(sendTime)
    if (t.isValid()) return t.valueOf()
    const t2 = dayjs(sendTime.replace('T', ' '))
    if (t2.isValid()) return t2.valueOf()
    return Date.now()
  }
  if (Array.isArray(sendTime)) {
    const [y, m, d, hh = 0, mm = 0, ss = 0] = sendTime
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)).getTime()
  }
  return Date.now()
}

const toMsStrict = (sendTime) => {
  if (!sendTime) return null
  if (typeof sendTime === 'number') {
    const n = Number(sendTime)
    if (!Number.isFinite(n)) return null
    return n < 1000000000000 ? n * 1000 : n
  }
  if (typeof sendTime === 'string') {
    const t = dayjs(sendTime)
    if (t.isValid()) return t.valueOf()
    const t2 = dayjs(sendTime.replace('T', ' '))
    if (t2.isValid()) return t2.valueOf()
    return null
  }
  if (Array.isArray(sendTime)) {
    const [y, m, d, hh = 0, mm = 0, ss = 0] = sendTime
    const ms = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)).getTime()
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

const mapChatMessageRespToUi = (msg) => {
  if (!msg?.id) return null
  const clientMsgId = msg?.clientSeq != null ? String(msg.clientSeq) : (msg?.clientMsgId != null ? String(msg.clientMsgId) : null)

  const fromUidText = msg.fromUid != null ? String(msg.fromUid) : ''
  const isSelf = fromUidText && String(fromUidText) === String(currentUserId.value)

  // Use the title (friend's name) as the fallback for sender name if it's not self
  const sender = {
    id: fromUidText,
    name: isSelf ? '我' : title.value,
    avatar: normalizeAvatar(null) // Can be extended to use cached avatars later
  }

  let type = 'text'
  if (msg.type === 6 || msg.status === 1) type = 'recall'
  else if (msg.type === 2) type = 'image'
  else if (msg.type === 3) type = 'file'

  const extInfo = msg.extInfo || {}
  const replyMessageId = extInfo.replyMessageId

  const reply = (() => {
    if (!replyMessageId) return null
    const replyIdText = String(replyMessageId)
    if (hiddenMessageIdSet.has(replyIdText)) return { id: replyIdText, username: '', text: '该消息已不存在' }
    return {
      id: replyMessageId,
      username: '', // Would need to fetch from message list if needed
      text: '引用消息'
    }
  })()

  const content = msg.content || ''

  const displayContent = (() => {
    if (type !== 'recall') return content
    if (isSelf) return '我 撤回了一条消息'
    return content || '撤回了一条消息'
  })()

  return {
    id: msg.id,
    type,
    content: displayContent,
    sender,
    timestamp: formatSendTime(msg.createTime || msg.sendTime) || '刚刚',
    tsMs: toMs(msg.createTime || msg.sendTime),
    sendTimeRaw: msg.createTime || msg.sendTime,
    isRead: true,
    reply,
    clientMsgId,
    pending: false
  }
}

const getMessageRenderKey = (m) => {
  if (!m || typeof m !== 'object') return ''
  const c = m.clientMsgId != null ? String(m.clientMsgId) : ''
  if (c) return `c-${c}`
  const id = m.id != null ? String(m.id) : ''
  return id ? `id-${id}` : ''
}

const appendMessageIfNeeded = (uiMessage) => {
  if (!uiMessage?.id) return
  const idText = String(uiMessage.id)
  if (hiddenMessageIdSet.has(idText)) return
  
  // We should auto-scroll if the user is already at the bottom, OR if this message was just sent by the user
  const isOwnMessage = uiMessage.sender === 'self' || (uiMessage.sender && String(uiMessage.sender.id) === String(currentUserId.value))
  const shouldAutoScroll = !isAwayFromBottom.value || isOwnMessage

  if (messageIdSet.has(idText)) {
    console.log('appendMessageIfNeeded: message already exists, updating it', idText)
    const idx = messages.value.findIndex(m => String(m.id) === idText)
    if (idx >= 0) {
      messages.value.splice(idx, 1, uiMessage)
    }
    // Sort messages by timestamp after updating to ensure order is maintained
    messages.value.sort((a, b) => (a.tsMs || 0) - (b.tsMs || 0))
    // 即便是已存在的消息，如果是刚刚收到的，也尝试滚动到底部
    nextTick(() => {
      measureBottomThreshold()
      if (shouldAutoScroll) {
        setTimeout(() => {
          scrollToBottom()
          showScrollDown.value = false
          hasNewMessageWhileAway.value = false
        }, 100) // 增加延时确保DOM渲染完毕
      }
    })
    return
  }

  messageIdSet.add(idText)
  messages.value.push(uiMessage)
  // Sort messages by timestamp after appending to ensure order is maintained
  messages.value.sort((a, b) => (a.tsMs || 0) - (b.tsMs || 0))
  console.log('appendMessageIfNeeded: Successfully added message to list. Total messages:', messages.value.length)
  nextTick(() => {
    measureBottomThreshold()
    if (!shouldAutoScroll) {
      console.log('appendMessageIfNeeded: User is scrolled up, showing scroll-down button instead of auto-scrolling')
      hasNewMessageWhileAway.value = true
      showScrollDown.value = true
      return
    }
    setTimeout(() => {
      scrollToBottom()
      showScrollDown.value = false
      hasNewMessageWhileAway.value = false
    }, 100) // 增加延时确保DOM渲染完毕
  })
}

const appendLocalOutgoingMessage = (uiMessage) => {
  if (!uiMessage?.id) return
  // Always scroll to bottom when sending a local message
  const shouldAutoScroll = true
  messages.value.push(uiMessage)
  console.log('appendLocalOutgoingMessage: Added local pending message. Total messages:', messages.value.length)
  nextTick(() => {
    measureBottomThreshold()
    if (!shouldAutoScroll) {
      hasNewMessageWhileAway.value = true
      showScrollDown.value = true
      return
    }
    setTimeout(() => {
      scrollToBottom()
      showScrollDown.value = false
      hasNewMessageWhileAway.value = false
    }, 100) // 增加延时确保DOM渲染完毕
  })
}

const applyIncomingChatMessage = (ui, raw) => {
  if (!ui?.id) return
  const idText = String(ui.id)
  if (hiddenMessageIdSet.has(idText)) return

  const clientMsgId = ui?.clientMsgId != null ? String(ui.clientMsgId) : null
  const fromUidText = raw?.fromUid != null ? String(raw.fromUid) : ''
  const isSelf = fromUidText && String(fromUidText) === String(currentUserId.value)
  
  console.log(`applyIncomingChatMessage: isSelf=${isSelf}, fromUid=${fromUidText}, currentUserId=${currentUserId.value}`)

  if (isSelf) {
    let idx = -1
    if (clientMsgId) {
      idx = messages.value.findIndex((m) => m?.pending && String(m.clientMsgId) === clientMsgId)
    }
    if (idx < 0) {
      // Fallback: use fromUid to deduplicate by finding the first pending message
      idx = messages.value.findIndex((m) => m?.pending)
    }
    if (idx >= 0) {
      console.log('applyIncomingChatMessage: Found local pending message at index', idx, 'Replacing it for deduplication.')
      // Always scroll to bottom for your own messages
      const shouldAutoScroll = true
      // Use splice to guarantee Vue 3 array reactivity
      messages.value.splice(idx, 1, { ...ui, pending: false })
      messageIdSet.add(idText)
      nextTick(() => {
        measureBottomThreshold()
        if (!shouldAutoScroll) {
          hasNewMessageWhileAway.value = true
          showScrollDown.value = true
          return
        }
        setTimeout(() => {
          scrollToBottom()
          showScrollDown.value = false
          hasNewMessageWhileAway.value = false
        }, 100) // 增加延时确保DOM渲染完毕
      })
      return
    } else {
      console.log('applyIncomingChatMessage: isSelf is true, but no pending message found. Will append as new.')
    }
  }

  appendMessageIfNeeded({ ...ui, pending: false })
}

const createClientMsgId = () => {
  const uid = currentUserId.value != null ? String(currentUserId.value) : '0'
  const rand = Math.random().toString(16).slice(2)
  return `${Date.now()}-${uid}-${rand}`
}

const buildLocalPendingTextMessage = ({ content, reply, clientMsgId }) => {
  const now = Date.now()
  return {
    id: `local-${clientMsgId}`,
    type: 'text',
    content: String(content ?? ''),
    sender: { id: currentUserId.value != null ? String(currentUserId.value) : '', name: '我', avatar: null },
    timestamp: dayjs(now).format('YYYY-MM-DD HH:mm'),
    tsMs: now,
    sendTimeRaw: now,
    isRead: true,
    reply: reply
      ? {
          id: reply.id,
          username: reply.username,
          text: reply.text
        }
      : null,
    clientMsgId: String(clientMsgId),
    pending: true
  }
}

const ACTIVE_ROOM_KEY = 'activeChatRoomId'
let readReportTimer = null
let lastReadReportAt = 0

const reportRead = async () => {
  const rid = roomId.value
  if (!rid) return
  try {
    await request({
      url: '/capi/contact/room/read',
      method: 'POST',
      data: { roomId: Number(rid) }
    })
  } catch (e) {}
}

const scheduleReportRead = (delayMs = 200) => {
  if (readReportTimer) return
  readReportTimer = setTimeout(async () => {
    readReportTimer = null
    const now = Date.now()
    if (now - lastReadReportAt < 800) {
      scheduleReportRead(800 - (now - lastReadReportAt))
      return
    }
    lastReadReportAt = now
    await reportRead()
  }, Math.max(0, Number(delayMs) || 0))
}

const handleWsPayload = (payload) => {
  console.log('handleWsPayload ->', payload)
  if (!payload || typeof payload !== 'object') return

  // Error handling
  if (payload.type === -1 && payload.data) {
    const text = payload.data != null ? String(payload.data) : '发送失败'
    uni.showToast({ title: text, icon: 'none' })
    return
  }

  // Is it a recall event?
  if (payload.event === 'recall' || payload.type === 9) {
    const rId = payload.roomId || (payload.data && payload.data.roomId)
    if (String(rId) !== String(roomId.value)) return
    const targetId = payload.msgId || (payload.data && payload.data.messageId)
    if (targetId == null) return
    const targetIdStr = String(targetId)
    if (hiddenMessageIdSet.has(targetIdStr)) return
    const idx = messages.value.findIndex((m) => String(m.id) === targetIdStr)
    if (idx < 0) return
    const isSelf = payload.operatorUid != null && String(payload.operatorUid) === String(currentUserId.value)
    const text = isSelf ? '我 撤回了一条消息' : '撤回了一条消息'
    messages.value[idx] = { ...messages.value[idx], type: 'recall', content: text }
    return
  }

  // Is it a message? (Backend pushes ChatMessageDTO directly)
  if (payload.roomId != null && payload.id != null) {
    console.log('Received raw message:', payload)
    const ui = mapChatMessageRespToUi(payload)
    console.log('Mapped to UI:', ui)
    if (ui && String(payload.roomId) === String(roomId.value)) {
      applyIncomingChatMessage(ui, payload)
      scheduleReportRead()
    } else {
      console.log('Mismatch roomId or null ui', payload.roomId, roomId.value, ui)
    }
    return
  }

  // Fallback for wrapped messages (old format or other wrappers)
  if (payload.type === 4 || (payload.data && payload.data.roomId)) {
    let dataObj = payload.data || payload
    if (dataObj && typeof dataObj === 'object' && dataObj.message && typeof dataObj.message === 'object') {
      dataObj = { ...dataObj, ...dataObj.message }
    }
    const ui = mapChatMessageRespToUi(dataObj)
    if (ui && String(dataObj?.roomId) === String(roomId.value)) {
      applyIncomingChatMessage(ui, dataObj)
      scheduleReportRead()
    }
    return
  }
}

const loadInitialMessages = async () => {
  const rid = roomId.value
  if (!rid) return
  loading.value = true
  hasMore.value = true
  try {
    const page = await request({
      url: '/capi/message/history',
      method: 'GET',
      data: {
        roomId: Number(rid),
        size: 15,
        cursor: ''
      }
    })
    const list = Array.isArray(page) ? page : []
    if (list.length < 15) {
      hasMore.value = false
    }
    
    // The backend returns messages in descending order (newest first).
    // We need to reverse it so the oldest is at the top and newest at the bottom.
    list.reverse()
    
    // Prepare the new array first to avoid multiple reactive updates
    const newMessages = []
    messageIdSet.clear()
    
    list.forEach((item) => {
      const ui = mapChatMessageRespToUi(item)
      if (!ui) return
      if (hiddenMessageIdSet.has(String(ui.id))) return
      messageIdSet.add(String(ui.id))
      newMessages.push(ui)
    })
    
    // Sort BEFORE assigning to the reactive variable
    newMessages.sort((a, b) => (a.tsMs || 0) - (b.tsMs || 0))
    
    // Assign the fully prepared and sorted array all at once
    messages.value = newMessages

    nextTick(() => {
      // For initial load, give the UI slightly more time to layout all the items
      setTimeout(() => {
        // Scroll into view without animation for instant snap
        scrollToBottom()
        showScrollDown.value = false
        isAwayFromBottom.value = false
        hasNewMessageWhileAway.value = false
        measureContainerHeight()
        measureBottomThreshold()
        
        // Re-enable smooth scrolling for subsequent user interactions and new messages
        setTimeout(() => {
          scrollAnimation.value = true
        }, 100)
      }, 300)
    })
  } finally {
    loading.value = false
  }
}

const loadMoreMessages = async () => {
  if (loading.value || loadingMore.value || !hasMore.value) return
  const rid = roomId.value
  if (!rid) return
  
  loadingMore.value = true
  try {
    // Retrieve the oldest message timestamp as the cursor for the backend
    let cursor = ''
    if (messages.value.length > 0) {
      cursor = messages.value[0].sendTimeRaw || ''
    }
    
    const page = await request({
      url: '/capi/message/history',
      method: 'GET',
      data: {
        roomId: Number(rid),
        size: 15,
        cursor: cursor
      }
    })
    
    const list = Array.isArray(page) ? page : []
    if (list.length < 15) {
      hasMore.value = false
    }
    if (list.length === 0) return
    
    list.reverse()
    
    const newMessages = []
    list.forEach((item) => {
      const ui = mapChatMessageRespToUi(item)
      if (!ui) return
      if (hiddenMessageIdSet.has(String(ui.id))) return
      if (messageIdSet.has(String(ui.id))) return // Deduplicate
      messageIdSet.add(String(ui.id))
      newMessages.push(ui)
    })
    
    if (newMessages.length === 0) return

    // Remember the top message ID before prepending, so we can scroll back to it
    const topMessageId = messages.value.length > 0 ? getMessageRenderKey(messages.value[0]) : ''
    
    // Disable animation temporarily to prevent jumping effects during prepend
    scrollAnimation.value = false
    
    // Prepend to existing messages and sort
    const combined = [...newMessages, ...messages.value]
    combined.sort((a, b) => (a.tsMs || 0) - (b.tsMs || 0))
    messages.value = combined
    
    nextTick(() => {
      if (topMessageId) {
        scrollIntoViewId.value = ''
        nextTick(() => {
          scrollIntoViewId.value = topMessageId
          // Restore animation after a short delay
          setTimeout(() => {
            scrollAnimation.value = true
          }, 100)
        })
      } else {
        scrollAnimation.value = true
      }
    })
  } catch(e) {
    console.error('Failed to load more messages', e)
  } finally {
    loadingMore.value = false
  }
}

onLoad(async (options) => {
  try {
    const sys = uni.getSystemInfoSync()
    statusBarHeight.value = Number(sys?.statusBarHeight) || 0
    safeAreaBottom.value = Number(sys?.safeAreaInsets?.bottom) || 0
  } catch (e) {}

  chatType.value = options.type || 'single'
  roomId.value = options.roomId || options.id || null
  receiverId.value = options.receiverId || null

  try {
    if (roomId.value != null) uni.setStorageSync(ACTIVE_ROOM_KEY, String(roomId.value))
  } catch (e) {}

  const uidFromCache = uni.getStorageSync('uid') ?? uni.getStorageSync('userInfo')?.uid ?? uni.getStorageSync('userInfo')?.id
  currentUserId.value = uidFromCache != null ? String(uidFromCache) : null

  loadHiddenMessageIds()

  const safeDecode = (v) => { if (v == null) return ''; try { return decodeURIComponent(String(v)) } catch (e) { return String(v) } }
  title.value = safeDecode(options.title || options.name || '')
  memberCount.value = options.memberCount || options.count || ''

  // 1) 先注册监听
  removeWsListener = imSocket.onMessage(handleWsPayload)

  // 2) 兜底连接
  try {
    const token = uni.getStorageSync('token')
    if (token && !imSocket.isConnected()) {
      await imSocket.connect({ token, terminalType: CONFIG.TERMINAL_TYPE })
    }
  } catch (e) {
    console.warn('进入聊天页 WS 连接失败：', e?.message || e)
    uni.showToast({ title: '实时消息连接失败', icon: 'none' })
  }

  // 3) 订阅房间 topic（群聊必须；单聊无害）
  if (roomId.value) {
    imSocket.subscribe(`/topic/room/${roomId.value}`, `room-${roomId.value}`)
  }

  initKeyboardAvoiding()
  loadInitialMessages().catch(() => {})
  scheduleReportRead(0)
})

// 从后台恢复时补一次拉取，防止期间丢消息
onShow(() => {
  if (roomId.value) {
    loadInitialMessages().catch(() => {})
    // 重新订阅（幂等）
    imSocket.subscribe(`/topic/room/${roomId.value}`, `room-${roomId.value}`)
  }
})

onUnload(() => {
  if (roomId.value) imSocket.unsubscribe(`room-${roomId.value}`)
  if (readReportTimer) clearTimeout(readReportTimer)
  readReportTimer = null
  try {
    const active = uni.getStorageSync(ACTIVE_ROOM_KEY)
    if (active != null && String(active) === String(roomId.value)) uni.removeStorageSync(ACTIVE_ROOM_KEY)
  } catch (e) {}
  if (typeof removeWsListener === 'function') removeWsListener()
  removeWsListener = null
  if (typeof removeKeyboardListener === 'function') removeKeyboardListener()
  removeKeyboardListener = null
  if (typeof removeVisualViewportListener === 'function') removeVisualViewportListener()
  removeVisualViewportListener = null
  if (scrollBarHideTimer) clearTimeout(scrollBarHideTimer)
  scrollBarHideTimer = null
})

const clearReplyDraft = () => {
  replyDraft.value = null
}

const handleChatInputHeightChange = (height) => {
  const h = Number(height)
  if (!Number.isFinite(h) || h <= 0) return
  const next = Math.min(Math.max(h, 60), 240)
  if (next !== chatInputHeight.value) chatInputHeight.value = next
}

const scrollDownStyle = computed(() => ({
  bottom: `calc(${70 + keyboardOffset.value}px + env(safe-area-inset-bottom))`
}))

const scrollBarTrackStyle = computed(() => {
  const topPx = 44 + 10 + Number(statusBarHeight.value || 0)
  const bottomPx =
    Number(chatInputHeight.value || 0) + Number(keyboardOffset.value || 0) + Number(safeAreaBottom.value || 0)
  return {
    top: `${Math.max(0, topPx)}px`,
    bottom: `${Math.max(0, bottomPx)}px`,
    opacity: String(scrollBarOpacity.value)
  }
})

const scrollBarThumbStyle = computed(() => ({
  height: `${Math.max(12, Number(scrollBarThumbHeight.value || 0))}px`,
  transform: `translateY(${Math.max(0, Number(scrollBarThumbTop.value || 0))}px)`
}))

const initKeyboardAvoiding = () => {
  const getWindowHeight = () => {
    try {
      const info = uni.getSystemInfoSync()
      const wh = Number(info?.windowHeight)
      return Number.isFinite(wh) && wh > 0 ? wh : 0
    } catch (e) {
      return 0
    }
  }

  if (!baselineWindowHeight.value) {
    baselineWindowHeight.value = getWindowHeight()
  }

  const setOffset = (h) => {
    const next = Number(h)
    keyboardOffset.value = Number.isFinite(next) && next > 0 ? next : 0
    if (!isAwayFromBottom.value) {
      setTimeout(() => {
        scrollToBottom()
      }, 30)
    }
  }

  if (typeof uni?.onKeyboardHeightChange === 'function') {
    const callback = (e) => {
      const h = Number(e?.height)
      if (!Number.isFinite(h) || h <= 0) {
        baselineWindowHeight.value = getWindowHeight() || baselineWindowHeight.value
        setOffset(0)
        return
      }

      const currentWindowHeight = getWindowHeight()
      const base = baselineWindowHeight.value
      const systemShift = base > 0 && currentWindowHeight > 0 ? Math.max(0, base - currentWindowHeight) : 0
      const effective = Math.max(0, h - systemShift)
      setOffset(effective)
    }
    uni.onKeyboardHeightChange(callback)
    removeKeyboardListener = () => {
      if (typeof uni?.offKeyboardHeightChange === 'function') uni.offKeyboardHeightChange(callback)
    }
  }

  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  if (vv && typeof vv.addEventListener === 'function') {
    const updateFromViewport = () => {
      const h = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop))
      setOffset(h)
    }
    vv.addEventListener('resize', updateFromViewport)
    vv.addEventListener('scroll', updateFromViewport)
    updateFromViewport()
    removeVisualViewportListener = () => {
      vv.removeEventListener('resize', updateFromViewport)
      vv.removeEventListener('scroll', updateFromViewport)
    }
  }
}

const handleBack = () => {
  uni.navigateBack()
}

const handleSendMessage = async (content) => {
  if (!roomId.value) return
  const replySnapshot = replyDraft.value ? { ...replyDraft.value } : null
  const replyMessageId = replySnapshot?.id ?? null
  const clientMsgId = createClientMsgId()

  const localPending = buildLocalPendingTextMessage({
    content,
    reply: replySnapshot ? { id: replySnapshot.id, username: replySnapshot.username, text: replySnapshot.text } : null,
    clientMsgId
  })
  appendLocalOutgoingMessage(localPending)
  clearReplyDraft()

  const reqData = {
    roomId: Number(roomId.value),
    type: 1,
    content,
    clientSeq: clientMsgId,
    extInfo: replyMessageId ? { replyMessageId } : {}
  }
  if (receiverId.value) reqData.receiverId = Number(receiverId.value)

  try {
    await imSocket.send('/app/chat/send', reqData)
  } catch (e) {
    console.error('发送失败', e)
    const idx = messages.value.findIndex((m) => String(m.clientMsgId) === String(clientMsgId))
    if (idx >= 0) messages.value[idx] = { ...messages.value[idx], pending: false, failed: true }
    uni.showToast({ title: '发送失败：' + (e?.message || '网络异常'), icon: 'none' })
  }
}

const isRecallable = (msg) => {
  if (msg?.pending) return false
  const raw = msg?.sendTimeRaw
  const ms = raw != null ? toMsStrict(raw) : Number(msg?.tsMs ?? 0)
  if (!Number.isFinite(ms) || ms <= 0) return false
  const diff = Date.now() - ms
  return diff >= 0 && diff <= 2 * 60 * 1000
}

const openMessageMenu = (payload) => {
  const msg = payload?.message
  if (!msg?.id) return
  if (msg?.pending) return
  if (msg.type === 'recall') return

  activeMenuMessage.value = payload
  const isOwn = Boolean(payload?.isOwn)

  const items = []
  if (isOwn && isRecallable(msg)) items.push({ key: 'recall', label: '撤回' })
  if (msg.type === 'text') items.push({ key: 'quote', label: '引用' })
  if (msg.type === 'text') items.push({ key: 'copy', label: '复制' })
  items.push({ key: 'delete', label: '删除' })
  menuItems.value = items

  const sys = uni.getSystemInfoSync()
  const menuWidth = 200
  const menuHeight = items.length * 38 + 12
  const x = Number(payload?.x ?? 0)
  const y = Number(payload?.y ?? 0)
  const safeArea = sys.safeArea ?? { top: 0, bottom: sys.windowHeight }
  const minLeft = 12
  const maxLeft = sys.windowWidth - menuWidth - 12
  const left = Math.min(Math.max(x - menuWidth / 2, minLeft), maxLeft)

  const minTop = Math.max(12, (safeArea?.top ?? 0) + 12)
  const maxTop = Math.min(sys.windowHeight - menuHeight - 12, (safeArea?.bottom ?? sys.windowHeight) - menuHeight - 12)
  const clampTopMax = Number.isFinite(maxTop) ? Math.max(maxTop, minTop) : minTop
  const midY = ((safeArea?.top ?? 0) + (safeArea?.bottom ?? sys.windowHeight)) / 2
  const placeAbove = y > midY
  const rawTop = placeAbove ? y - menuHeight - 18 : y + 18
  const top = Math.min(Math.max(rawTop, minTop), clampTopMax)
  menuStyle.value = { left: `${left}px`, top: `${top}px` }
  menuVisible.value = true
}

const closeMenu = () => {
  menuVisible.value = false
  activeMenuMessage.value = null
}

const handleMenuAction = async (key) => {
  const payload = activeMenuMessage.value
  const msg = payload?.message
  if (!msg?.id) {
    closeMenu()
    return
  }
  if (msg?.pending) {
    closeMenu()
    return
  }

  if (key === 'copy') {
    closeMenu()
    const text = msg?.content != null ? String(msg.content) : ''
    uni.setClipboardData({ data: text })
    return
  }

  if (key === 'quote') {
    closeMenu()
    const text = msg?.content != null ? String(msg.content) : ''
    replyDraft.value = { id: msg.id, text, username: msg?.sender?.name }
    return
  }

  if (key === 'delete') {
    closeMenu()
    hideMessageLocally(msg.id)
    const deletedIdText = String(msg.id)
    for (let i = 0; i < messages.value.length; i += 1) {
      const m = messages.value[i]
      if (!m?.reply?.id) continue
      if (String(m.reply.id) !== deletedIdText) continue
      if (m.reply.text === '该消息已不存在') continue
      messages.value[i] = { ...m, reply: { ...m.reply, text: '该消息已不存在' } }
    }
    const idx = messages.value.findIndex((m) => String(m.id) === String(msg.id))
    if (idx >= 0) messages.value.splice(idx, 1)
    return
  }

  if (key === 'recall') {
    closeMenu()
    try {
      if (imSocket.isConnected()) {
        imSocket.send('/app/chat/recall', Number(msg.id))
      }
    } catch (e) {
      return
    }
    const idx = messages.value.findIndex((m) => String(m.id) === String(msg.id))
    if (idx >= 0) {
      const isSelf = msg?.sender?.id != null && String(msg.sender.id) === String(currentUserId.value)
      const text = isSelf ? '我 撤回了一条消息' : (msg?.sender?.name ? `${String(msg.sender.name)} 撤回了一条消息` : '撤回了一条消息')
      messages.value[idx] = { ...messages.value[idx], type: 'recall', content: text }
    }
  }
}

const scrollToBottom = () => {
  // Clear first to ensure Vue reacts and H5 triggers the scroll
  scrollIntoViewId.value = ''
  nextTick(() => {
    scrollIntoViewId.value = 'scroll-bottom-anchor'
  })
}

const measureContainerHeight = () => {
  const inst = instance?.proxy
  if (!inst) return
  const query = uni.createSelectorQuery().in(inst)
  query.select('.chat-content').boundingClientRect()
  query.exec((res) => {
    const rect = res?.[0]
    if (!rect) return
    const h = Number(rect.height)
    if (Number.isFinite(h) && h > 0) containerHeight.value = h
  })
}

const measureBottomThreshold = () => {
  const inst = instance?.proxy
  if (!inst) return
  const query = uni.createSelectorQuery().in(inst)
  query.selectAll('.message-row').boundingClientRect()
  query.exec((res) => {
    const rows = res?.[0]
    if (!Array.isArray(rows) || rows.length <= 0) return
    const n = 5
    const start = Math.max(0, rows.length - n)
    let sum = 0
    for (let i = start; i < rows.length; i += 1) {
      const h = Number(rows[i]?.height)
      if (Number.isFinite(h) && h > 0) sum += h
    }
    if (sum > 0) bottomThresholdPx.value = sum
  })
}

const handleScroll = (e) => {
  const detail = e?.detail ?? {}
  const st = Number(detail.scrollTop)
  const sh = Number(detail.scrollHeight)
  const ch = Number(containerHeight.value)
  if (!Number.isFinite(ch) || ch <= 0) measureContainerHeight()
  if (!Number.isFinite(st) || !Number.isFinite(sh)) return

  updateScrollBar(st, sh)

  const distance = Math.max(0, sh - st - (Number.isFinite(ch) ? ch : 0))
  const threshold = Number(bottomThresholdPx.value)
  const th = Number.isFinite(threshold) && threshold > 0 ? threshold : 0
  const away = distance > th
  isAwayFromBottom.value = away
  if (!away) {
    hasNewMessageWhileAway.value = false
    showScrollDown.value = false
    return
  }
  showScrollDown.value = hasNewMessageWhileAway.value
}

const updateScrollBar = (scrollTop, scrollHeight) => {
  const ch = Number(containerHeight.value)
  if (!Number.isFinite(ch) || ch <= 0) return
  const sh = Number(scrollHeight)
  if (!Number.isFinite(sh) || sh <= ch + 1) {
    scrollBarOpacity.value = 0
    scrollBarVisible.value = false
    return
  }

  const topInset = 44 + 10 + Number(statusBarHeight.value || 0)
  const bottomInset =
    Number(chatInputHeight.value || 0) + Number(keyboardOffset.value || 0) + Number(safeAreaBottom.value || 0)
  const trackHeight = Math.max(0, ch - topInset - bottomInset)
  if (trackHeight <= 0) return

  const ratio = trackHeight / sh
  const rawThumb = trackHeight * ratio
  const maxThumb = Math.min(40, Math.floor(trackHeight * 0.35))
  const thumb = Math.max(18, Math.min(rawThumb, maxThumb > 0 ? maxThumb : 40))
  const maxScroll = Math.max(1, sh - ch)
  const progress = Math.max(0, Math.min(1, Number(scrollTop) / maxScroll))
  const top = progress * Math.max(0, trackHeight - thumb)

  scrollBarThumbHeight.value = thumb
  scrollBarThumbTop.value = top
  scrollBarVisible.value = true
  scrollBarOpacity.value = 1

  if (scrollBarHideTimer) clearTimeout(scrollBarHideTimer)
  scrollBarHideTimer = setTimeout(() => {
    scrollBarOpacity.value = 0
    scrollBarHideTimer = setTimeout(() => {
      scrollBarVisible.value = false
    }, 200)
  }, 800)
}

const handleScrollDownClick = () => {
  scrollToBottom()
  showScrollDown.value = false
  isAwayFromBottom.value = false
  hasNewMessageWhileAway.value = false
  nextTick(() => {
    measureBottomThreshold()
  })
}

const shouldShowTimeSeparator = (current, index) => {
  if (index === 0) return true
  const prev = messages.value[index - 1]
  const curMs = Number(current?.tsMs ?? 0)
  const prevMs = Number(prev?.tsMs ?? 0)
  if (!Number.isFinite(curMs) || !Number.isFinite(prevMs) || prevMs <= 0 || curMs <= 0) return false
  return curMs - prevMs > 5 * 60 * 1000
}

const getTimeSeparatorLabel = (current, index) => {
  const ms = Number(current?.tsMs ?? 0)
  const t = dayjs(Number.isFinite(ms) && ms > 0 ? ms : Date.now())
  if (index === 0) return t.format('YYYY-MM-DD HH:mm')
  const prev = messages.value[index - 1]
  const prevMs = Number(prev?.tsMs ?? 0)
  if (Number.isFinite(prevMs) && prevMs > 0 && ms - prevMs > 24 * 60 * 60 * 1000) {
    return t.format('YYYY-MM-DD HH:mm')
  }
  return t.format('HH:mm')
}
</script>

<style lang="scss" scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: relative;
  
  // Private Chat Background
  &.single {
    background-color: #F3F3F3; // Updated to #F3F3F3
    background-image: linear-gradient(to bottom, #F3F3F3 0%, #F3F3F3 100%);
  }
  
  // Group Chat Background
  &.group {
    background-color: #F3F3F3; // Updated to match other pages
    // Removed background image as requested
  }
  
  .chat-content {
    flex: 1;
    overflow-y: auto;
    position: relative;
    z-index: 1;
    padding-bottom: calc(54px + env(safe-area-inset-bottom)); // Ensure content isn't hidden behind input
    
    .padding-top {
      height: calc(44px + var(--status-bar-height) + 10px); // Header height + padding
    }
    
    .padding-bottom {
      height: 20px;
    }

    .empty-state {
      height: 60vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .empty-text {
      font-size: 14px;
      color: #999;
    }
  }
  
  // Ensure components sit above background
  :deep(.chat-header), :deep(.chat-input) {
    z-index: 10;
  }
}

.scroll-down {
  position: fixed;
  right: 12px;
  bottom: calc(70px + env(safe-area-inset-bottom));
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background-color: rgba(255, 255, 255, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  border: 1px solid rgba(60, 74, 128, 0.12);
}

.chat-scrollbar {
  position: fixed;
  right: 4px;
  width: 3px;
  z-index: 60;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.chat-scrollbar-thumb {
  width: 3px;
  border-radius: 2px;
  background-color: rgba(60, 74, 128, 0.35);
}

.menu-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
}

.message-menu {
  position: fixed;
  width: 200px;
  background-color: rgba(0, 0, 0, 0.78);
  border-radius: 10px;
  padding: 6px 0;
}

.menu-item {
  height: 38px;
  padding: 0 14px;
  display: flex;
  align-items: center;
}

.menu-text {
  color: #fff;
  font-size: 14px;
}
</style>
