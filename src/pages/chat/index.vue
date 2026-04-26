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
      @pick-media="handlePickMedia"
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
import { getAvatarUrl } from '@/utils/avatar'

const BASE_URL = CONFIG.API_BASE_URL

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
const peerName = ref('')
const peerAvatar = ref('')
const currentUserName = ref('')
const currentUserAvatar = ref('')
const userProfileCache = ref({})
let msgSeq = 0
let removeWsListener = null
let removeWsStatusListener = null
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
  return getAvatarUrl(avatar)
}

const upsertUserProfileCache = (uid, name, avatar) => {
  if (uid == null) return
  const key = String(uid)
  if (!key) return
  const next = { ...(userProfileCache.value || {}) }
  const prev = next[key] || {}
  const mergedName = name != null && String(name).trim() ? String(name).trim() : (prev.name || '')
  const mergedAvatar = avatar != null && String(avatar).trim() ? String(avatar).trim() : (prev.avatar || '')
  next[key] = {
    uid: key,
    name: mergedName,
    avatar: mergedAvatar
  }
  userProfileCache.value = next
}

const getCachedUserProfile = (uid) => {
  if (uid == null) return null
  const key = String(uid)
  const hit = userProfileCache.value?.[key]
  return hit || null
}

const refreshGroupSenderProfileFromCache = () => {
  if (chatType.value !== 'group') return
  const selfUid = currentUserId.value != null ? String(currentUserId.value) : ''
  messages.value = (messages.value || []).map((m) => {
    if (!m || m.type === 'recall') return m
    const senderId = m?.sender?.id != null ? String(m.sender.id) : ''
    if (!senderId || senderId === selfUid) return m
    const cached = getCachedUserProfile(senderId)
    if (!cached) return m
    const nameNow = m?.sender?.name != null ? String(m.sender.name) : ''
    const shouldUseCachedName = !nameNow || nameNow === '未知用户' || /^用户\d+$/.test(nameNow)
    const nextName = shouldUseCachedName && cached.name ? cached.name : nameNow
    const nextAvatar = cached.avatar ? normalizeAvatar(cached.avatar) : m?.sender?.avatar
    if (nextName === nameNow && nextAvatar === m?.sender?.avatar) return m
    return {
      ...m,
      sender: {
        ...(m.sender || {}),
        name: nextName || nameNow,
        avatar: nextAvatar
      }
    }
  })
}

const normalizeProfileUser = (u) => {
  if (!u) return null
  const uid = u.uid ?? u.userId ?? u.id
  if (uid == null) return null
  const name = u.name || u.fullName || u.nickName || u.nickname || u.accountNumber || ''
  const avatar = u.avatar || ''
  return { uid: String(uid), name: String(name || ''), avatar: String(avatar || '') }
}

const hydrateGroupUserProfileCache = async () => {
  if (chatType.value !== 'group') return
  try {
    const [friendList, candidates] = await Promise.all([
      request({
        url: '/capi/friend/list',
        method: 'GET'
      }).catch(() => []),
      request({
        url: '/capi/group/create/candidates',
        method: 'GET'
      }).catch(() => null)
    ])

    ;(Array.isArray(friendList) ? friendList : []).forEach((f) => {
      const p = normalizeProfileUser(f)
      if (!p) return
      upsertUserProfileCache(p.uid, p.name, p.avatar)
    })

    const friends = Array.isArray(candidates?.friends) ? candidates.friends : []
    friends.forEach((u) => {
      const p = normalizeProfileUser(u)
      if (!p) return
      upsertUserProfileCache(p.uid, p.name, p.avatar)
    })

    const classes = Array.isArray(candidates?.classes) ? candidates.classes : []
    classes.forEach((cls) => {
      const users = Array.isArray(cls?.users) ? cls.users : []
      users.forEach((u) => {
        const p = normalizeProfileUser(u)
        if (!p) return
        upsertUserProfileCache(p.uid, p.name, p.avatar)
      })
    })

    refreshGroupSenderProfileFromCache()
  } catch (e) {
    console.warn('hydrateGroupUserProfileCache failed:', e?.message || e)
  }
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

const formatFileSize = (size) => {
  const n = Number(size)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)}GB`
}

const refreshPeerSenderProfile = () => {
  if (chatType.value !== 'single') return
  const uidText = currentUserId.value != null ? String(currentUserId.value) : ''
  const fallbackName = peerName.value || title.value || ''
  const fallbackAvatar = normalizeAvatar(peerAvatar.value)
  messages.value = (messages.value || []).map((m) => {
    if (!m || m.type === 'recall') return m
    const senderId = m?.sender?.id != null ? String(m.sender.id) : ''
    const isSelf = senderId && uidText && senderId === uidText
    if (isSelf) return m
    return {
      ...m,
      sender: {
        ...(m.sender || {}),
        name: fallbackName,
        avatar: fallbackAvatar
      }
    }
  })
}

const hydrateSingleChatProfile = async () => {
  if (chatType.value !== 'single' || !roomId.value) return
  const ridText = String(roomId.value)
  try {
    const friendList = await request({
      url: '/capi/friend/list',
      method: 'GET'
    })
    const list = Array.isArray(friendList) ? friendList : []
    const matched =
      list.find((f) => f?.roomId != null && String(f.roomId) === ridText) ||
      list.find((f) => receiverId.value != null && f?.uid != null && String(f.uid) === String(receiverId.value))
    if (!matched) return
    const realName = matched.fullName || matched.nickName || matched.accountNumber || ''
    if (realName) {
      title.value = String(realName)
      peerName.value = String(realName)
    }
    if (matched.avatar) {
      peerAvatar.value = String(matched.avatar)
    }
    if (!receiverId.value && matched.uid != null) {
      receiverId.value = String(matched.uid)
    }
    refreshPeerSenderProfile()
  } catch (e) {
    console.warn('hydrateSingleChatProfile failed:', e?.message || e)
  }
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

const normalizeExtInfo = (extInfo) => {
  if (!extInfo) return {}
  if (typeof extInfo === 'string') {
    try {
      const parsed = JSON.parse(extInfo)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (e) {
      return {}
    }
  }
  return typeof extInfo === 'object' ? extInfo : {}
}

const pickFirstNonEmpty = (...vals) => {
  for (const v of vals) {
    if (v == null) continue
    const text = String(v).trim()
    if (text) return text
  }
  return ''
}

const extractSenderProfileFromExtInfo = (extInfo) => {
  const senderObj = extInfo?.sender && typeof extInfo.sender === 'object' ? extInfo.sender : {}
  const profileObj = extInfo?.profile && typeof extInfo.profile === 'object' ? extInfo.profile : {}

  const name = pickFirstNonEmpty(
    extInfo?.senderName,
    extInfo?.fromName,
    extInfo?.name,
    extInfo?.nickname,
    extInfo?.nickName,
    extInfo?.sender_name,
    extInfo?.from_name,
    senderObj?.name,
    senderObj?.nickname,
    senderObj?.nickName,
    profileObj?.name,
    profileObj?.nickname
  )

  const avatar = pickFirstNonEmpty(
    extInfo?.senderAvatar,
    extInfo?.fromAvatar,
    extInfo?.avatar,
    extInfo?.sender_avatar,
    extInfo?.from_avatar,
    senderObj?.avatar,
    profileObj?.avatar
  )

  return { name, avatar }
}

const mapChatMessageRespToUi = (msg) => {
  if (!msg?.id) return null
  const clientMsgId = msg?.clientSeq != null ? String(msg.clientSeq) : (msg?.clientMsgId != null ? String(msg.clientMsgId) : null)
  const extInfo = normalizeExtInfo(msg.extInfo)
  const mediaType = extInfo?.mediaType != null ? String(extInfo.mediaType).toLowerCase() : ''

  const fromUidText = msg.fromUid != null ? String(msg.fromUid) : ''
  const isSelf = fromUidText && String(fromUidText) === String(currentUserId.value)

  // Use the title (friend's name) as the fallback for sender name if it's not self
  const extSender = extractSenderProfileFromExtInfo(extInfo)
  const rawSenderName = pickFirstNonEmpty(msg?.fromName, msg?.senderName, extSender.name)
  const rawSenderAvatar = pickFirstNonEmpty(msg?.fromAvatar, msg?.senderAvatar, extSender.avatar)
  const cachedSender = chatType.value === 'group' && fromUidText ? getCachedUserProfile(fromUidText) : null
  const senderName = (() => {
    if (isSelf) return currentUserName.value || '我'
    if (chatType.value === 'single') return peerName.value || title.value || '对方'
    if (rawSenderName) return String(rawSenderName)
    if (cachedSender?.name) return String(cachedSender.name)
    return fromUidText ? `用户${fromUidText}` : '未知用户'
  })()
  const senderAvatar = (() => {
    if (isSelf) return normalizeAvatar(currentUserAvatar.value || null)
    if (chatType.value === 'single') return normalizeAvatar(peerAvatar.value || null)
    if (cachedSender?.avatar) return normalizeAvatar(cachedSender.avatar || null)
    return normalizeAvatar(rawSenderAvatar || null)
  })()
  const sender = {
    id: fromUidText,
    name: senderName,
    avatar: senderAvatar
  }

  let type = 'text'
  if (msg.type === 6 || msg.status === 1) type = 'recall'
  else if (msg.type === 2 || mediaType === 'image') type = 'image'
  else if (msg.type === 3 && mediaType === 'video') type = 'video'
  else if (msg.type === 3) type = 'file'

  // 优先使用 extInfo.url（预签名URL），其次是 msg.content，最后是 filePath
  const mediaUrl = extInfo.url || msg.content || extInfo.fileUrl || extInfo.filePath || ''
  const attachment = (() => {
    if (type === 'image') {
      return {
        type: 'image',
        url: mediaUrl
      }
    }
    if (type === 'video') {
      return {
        type: 'video',
        url: mediaUrl,
        poster: extInfo.poster || extInfo.coverUrl || extInfo.posterUrl || '',
        duration: extInfo.duration != null ? Number(extInfo.duration) : undefined,
        fileSize: formatFileSize(extInfo.fileSize),
        title: extInfo.fileName || '视频'
      }
    }
    if (type === 'file') {
      return {
        type: 'file',
        url: mediaUrl,
        fileSize: formatFileSize(extInfo.fileSize),
        title: extInfo.fileName || '文件'
      }
    }
    return null
  })()

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
    attachment,
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

  console.log(`applyIncomingChatMessage: isSelf=${isSelf}, fromUid=${fromUidText}, currentUserId=${currentUserId.value}, clientMsgId=${clientMsgId}`)

  // 仅当"是自己发的 + 带上了 clientMsgId + 能精确找到对应 pending 消息"时才做替换。
  // 之前的 fallback（随便找一个 pending）在快速连发多条时会错位，已删除。
  if (isSelf && clientMsgId) {
    const idx = messages.value.findIndex((m) => m?.pending && String(m.clientMsgId) === clientMsgId)
    if (idx >= 0) {
      console.log('applyIncomingChatMessage: 精确匹配到 pending 消息 idx=', idx, '替换为服务端版本')
      messages.value.splice(idx, 1, { ...ui, pending: false })
      messageIdSet.add(idText)
      nextTick(() => {
        measureBottomThreshold()
        setTimeout(() => {
          scrollToBottom()
          showScrollDown.value = false
          hasNewMessageWhileAway.value = false
        }, 100)
      })
      return
    }
  }

  // 其它所有情况（别人的消息、自己消息但没对上 pending）都走标准 append。
  // appendMessageIfNeeded 内部已经用 messageIdSet 去重了，不会重复。
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

const buildLocalPendingMediaMessage = ({ mediaKind, localUrl, clientMsgId, reply, fileName, fileSize, duration, width, height }) => {
  const now = Date.now()
  let attachment, messageType, content
  
  if (mediaKind === 'image') {
    attachment = { type: 'image', url: localUrl }
    messageType = 'image'
    content = '[图片]'
  } else if (mediaKind === 'video') {
    attachment = {
      type: 'video',
      url: localUrl,
      poster: localUrl, // 使用视频URL作为临时封面
      title: fileName || '视频',
      fileSize: formatFileSize(fileSize),
      duration: duration != null ? Number(duration) : undefined,
      width: width != null ? Number(width) : undefined,
      height: height != null ? Number(height) : undefined
    }
    messageType = 'video'
    content = '[视频]'
  } else if (mediaKind === 'file') {
    attachment = {
      type: 'file',
      url: localUrl,
      title: fileName || '文件',
      fileSize: formatFileSize(fileSize)
    }
    messageType = 'file'
    content = '[文件]'
  }

  return {
    id: `local-${clientMsgId}`,
    type: messageType,
    content: content,
    attachment,
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

const uploadChatMedia = ({ filePath }) => {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token')
    const tokenStr = token == null ? '' : String(token)
    uni.uploadFile({
      url: `${BASE_URL}/capi/file/upload`,
      filePath: String(filePath),
      name: 'file',
      header: {
        Authorization: tokenStr ? (tokenStr.toLowerCase().startsWith('bearer ') ? tokenStr : `Bearer ${tokenStr}`) : '',
        terminalType: String(CONFIG.TERMINAL_TYPE || 4)
      },
      success: (uploadRes) => {
        try {
          const body = typeof uploadRes?.data === 'string' ? JSON.parse(uploadRes.data) : uploadRes?.data
          if (body?.code !== 0 || !body?.data) {
            reject(new Error(body?.msg || '上传失败'))
            return
          }
          // 优先使用预签名 URL (body.data.url)，如果没有则使用 filePath
          const url = body.data.url || body.data.filePath
          if (!url) {
            reject(new Error('上传成功但未返回文件地址'))
            return
          }
          resolve({
            url: String(url),
            poster: body.data.poster || body.data.cover || null,
            raw: body.data
          })
        } catch (e) {
          reject(new Error('上传响应解析失败'))
        }
      },
      fail: () => reject(new Error('上传失败'))
    })
  })
}

const markPendingFailedByClientMsgId = (clientMsgId) => {
  const idx = messages.value.findIndex((m) => String(m.clientMsgId) === String(clientMsgId))
  if (idx >= 0) messages.value[idx] = { ...messages.value[idx], pending: false, failed: true }
}

const sendMediaMessage = async ({ mediaKind, filePath, fileName, fileSize, duration, width, height }) => {
  if (!roomId.value) return
  const replySnapshot = replyDraft.value ? { ...replyDraft.value } : null
  const replyMessageId = replySnapshot?.id ?? null
  const clientMsgId = createClientMsgId()

  const localPending = buildLocalPendingMediaMessage({
    mediaKind,
    localUrl: String(filePath),
    clientMsgId,
    reply: replySnapshot ? { id: replySnapshot.id, username: replySnapshot.username, text: replySnapshot.text } : null,
    fileName,
    fileSize,
    duration,
    width,
    height
  })
  appendLocalOutgoingMessage(localPending)
  clearReplyDraft()

  uni.showLoading({ title: '上传中...' })
  try {
    const uploaded = await uploadChatMedia({ filePath })
    let messageType = 2 // 默认图片类型
    if (mediaKind === 'video') {
      messageType = 3
    } else if (mediaKind === 'file') {
      messageType = 4 // 文件类型
    }
    const reqData = {
      roomId: Number(roomId.value),
      type: messageType,
      content: uploaded.url,
      clientSeq: clientMsgId,
      extInfo: {
        ...(replyMessageId ? { replyMessageId } : {}),
        mediaType: mediaKind,
        url: uploaded.url,
        poster: uploaded.poster || null,
        fileName: fileName || (mediaKind === 'image' ? 'image.jpg' : mediaKind === 'video' ? 'video.mp4' : 'file'),
        fileSize: Number(fileSize) || undefined,
        duration: Number(duration) || undefined,
        width: Number(width) || undefined,
        height: Number(height) || undefined
      }
    }
    if (receiverId.value) reqData.receiverId = Number(receiverId.value)
    await imSocket.send('/app/chat/send', reqData)
  } catch (e) {
    console.error('发送媒体消息失败', e)
    markPendingFailedByClientMsgId(clientMsgId)
    const msg = e?.message ? String(e.message) : '网络异常'
    uni.showToast({ title: `发送失败：${msg}`, icon: 'none' })
  } finally {
    uni.hideLoading()
  }
}

const handlePickMedia = () => {
  uni.showActionSheet({
    itemList: ['发送图片', '发送视频'],
    success: async (res) => {
      if (res?.tapIndex === 0) {
        uni.chooseImage({
          count: 1,
          sourceType: ['album', 'camera'],
          success: (imgRes) => {
            const path = imgRes?.tempFilePaths?.[0]
            const file = Array.isArray(imgRes?.tempFiles) ? imgRes.tempFiles[0] : null
            if (!path) return
            sendMediaMessage({
              mediaKind: 'image',
              filePath: path,
              fileName: file?.name || 'image.jpg',
              fileSize: file?.size
            })
          }
        })
        return
      }
      if (res?.tapIndex === 1) {
        uni.chooseVideo({
          sourceType: ['album', 'camera'],
          maxDuration: 60,
          compressed: true,
          success: (videoRes) => {
            const path = videoRes?.tempFilePath
            if (!path) return
            sendMediaMessage({
              mediaKind: 'video',
              filePath: path,
              fileName: 'video.mp4',
              fileSize: videoRes?.size,
              duration: videoRes?.duration,
              width: videoRes?.width,
              height: videoRes?.height
            })
          }
        })
        return
      }
    }
  })
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
    // Immediately clear local badge counter globally by requesting badge update
    // or by letting the unread count in index.vue update on next pull
  } catch (e) {
    console.error('Failed to report read', e)
  }
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

const markPendingMessageFailed = (clientMsgId) => {
  if (clientMsgId != null && String(clientMsgId)) {
    const idx = messages.value.findIndex((m) => m?.pending && String(m.clientMsgId) === String(clientMsgId))
    if (idx >= 0) {
      messages.value[idx] = { ...messages.value[idx], pending: false, failed: true }
      return true
    }
  }
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i]?.pending) {
      messages.value[i] = { ...messages.value[i], pending: false, failed: true }
      return true
    }
  }
  return false
}

const handleWsPayload = (payload) => {
  console.log('handleWsPayload ->', payload)
  if (!payload || typeof payload !== 'object') return

  // Error handling
  if (payload.type === -1 && payload.data) {
    const text = payload.data != null ? String(payload.data) : '发送失败'
    const errCode = payload.code != null ? String(payload.code) : ''
    const errClientSeq = payload.clientSeq != null ? String(payload.clientSeq) : (payload.clientMsgId != null ? String(payload.clientMsgId) : '')
    const isNonFriend = errCode === 'NON_FRIEND_RELATION' || /非好友|好友关系|被拉黑|黑名单/.test(text)
    markPendingMessageFailed(errClientSeq || null)
    uni.showToast({ title: isNonFriend ? '非好友关系，无法发送消息' : text, icon: 'none' })
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

/**
 * 断线重连 / 从后台回前台后调用：
 * 基于本地最后一条"真实"消息 id，向后端拉取该 id 之后的所有新消息，
 * 用来补全掉线期间漏收的消息。不会替换已有消息，只会追加。
 *
 * 需要后端新增接口：GET /capi/message/since?roomId=xxx&sinceId=xxx&limit=200
 */
const fetchSinceLastMessage = async () => {
  const rid = roomId.value
  if (!rid) return

  // 找到本地最新的一条"非 pending、非 local-" 的消息作为游标起点
  let sinceId = null
  for (let i = messages.value.length - 1; i >= 0; i -= 1) {
    const m = messages.value[i]
    if (!m) continue
    if (m.pending) continue
    const idStr = m.id != null ? String(m.id) : ''
    if (!idStr || idStr.startsWith('local-')) continue
    sinceId = m.id
    break
  }

  // 本地还没任何真实消息，说明是新进聊天页，走常规初始加载
  if (sinceId == null) {
    return loadInitialMessages(false)
  }

  try {
    const list = await request({
      url: '/capi/message/since',
      method: 'GET',
      data: {
        roomId: Number(rid),
        sinceId: sinceId,
        limit: 200
      }
    })
    const arr = Array.isArray(list) ? list : []
    if (!arr.length) {
      console.log('fetchSinceLastMessage: 没有漏收的消息')
      return
    }
    console.log(`fetchSinceLastMessage: 补回 ${arr.length} 条漏收消息`)

    // 按创建时间升序处理（后端按 id 升序返回即可）
    arr.forEach((item) => {
      const ui = mapChatMessageRespToUi(item)
      if (!ui) return
      if (hiddenMessageIdSet.has(String(ui.id))) return
      // 复用已有的 applyIncomingChatMessage 逻辑，内部会去重
      applyIncomingChatMessage(ui, item)
    })
  } catch (e) {
    console.error('fetchSinceLastMessage 失败', e)
  }
}

const loadInitialMessages = async (isSilentRefresh = false) => {
  const rid = roomId.value
  if (!rid) return
  
  // Don't show full page loader if this is just a background refresh due to WS reconnect
  if (!isSilentRefresh) {
    loading.value = true
    hasMore.value = true
  }
  
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
    if (!isSilentRefresh && list.length < 15) {
      hasMore.value = false
    }
    
    // The backend returns messages in descending order (newest first).
    // We need to reverse it so the oldest is at the top and newest at the bottom.
    list.reverse()
    
    // Prepare the new array first to avoid multiple reactive updates
    const newMessages = []
    
    if (!isSilentRefresh) {
      messageIdSet.clear()
    }
    
    // To support merging during silent refresh instead of full wipe
    const existingIds = new Set(messages.value.map(m => String(m.id)))
    
    list.forEach((item) => {
      const ui = mapChatMessageRespToUi(item)
      if (!ui) return
      if (hiddenMessageIdSet.has(String(ui.id))) return
      
      if (isSilentRefresh) {
        // Only add if it's genuinely a new message we missed while disconnected
        if (!existingIds.has(String(ui.id)) && !messageIdSet.has(String(ui.id))) {
          messageIdSet.add(String(ui.id))
          newMessages.push(ui)
        }
      } else {
        if (messageIdSet.has(String(ui.id))) return
        messageIdSet.add(String(ui.id))
        newMessages.push(ui)
      }
    })
    
    if (isSilentRefresh) {
      if (newMessages.length > 0) {
        // Append new messages missed during offline
        const combined = [...messages.value, ...newMessages]
        combined.sort((a, b) => (a.tsMs || 0) - (b.tsMs || 0))
        messages.value = combined
        console.log(`WS Reconnect recovered ${newMessages.length} missing messages`)
      }
      return
    }
    
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

  const token = uni.getStorageSync('token')
  const uidFromCache = uni.getStorageSync('uid') ?? uni.getStorageSync('userInfo')?.uid ?? uni.getStorageSync('userInfo')?.id
  currentUserId.value = uidFromCache != null ? String(uidFromCache) : null
  const userFromCache = uni.getStorageSync('userInfo') || {}
  currentUserName.value = userFromCache?.name ? String(userFromCache.name) : ''
  currentUserAvatar.value = userFromCache?.avatar ? String(userFromCache.avatar) : ''

  // 检查是否登录
  if (!token || !currentUserId.value) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => {
      uni.navigateTo({ url: '/pages/login/index' })
    }, 1000)
    return
  }

  loadHiddenMessageIds()

  const safeDecode = (v) => { if (v == null) return ''; try { return decodeURIComponent(String(v)) } catch (e) { return String(v) } }
  title.value = safeDecode(options.title || options.name || '')
  peerName.value = title.value
  peerAvatar.value = safeDecode(options.avatar || '')
  memberCount.value = options.memberCount || options.count || ''

  // 1) 先注册监听
  removeWsListener = imSocket.onMessage(handleWsPayload)
  
// 重连事件：基于本地最后一条消息 id 做增量拉取，正确补全 gap，
  removeWsStatusListener = imSocket.onStatusChange((status) => {
    if (status === 'connected') {
      console.log('WS 已(重新)连接，开始增量补拉漏收消息...')
      if (roomId.value) {
        fetchSinceLastMessage().catch(() => {})
        // 房间 topic 订阅在 imSocket 内部会根据 activeSubscriptions 自动恢复，
        // 这里不必重复 subscribe。
      }
    }
  })

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
  await hydrateGroupUserProfileCache()
  await hydrateSingleChatProfile()
  loadInitialMessages().catch(() => {})
  scheduleReportRead(0)
})

// 从后台恢复时：
// 1) 主动让 imSocket 探活（可能底层 socket 已被 OS 杀掉但 onClose 没触发）
// 2) 基于本地最后一条消息 id 做增量补拉，而不是重置整个列表
onShow(() => {
  if (!roomId.value) return
  // 触发活性探测；若已断开会自动走重连流程
  try { imSocket.revalidate() } catch (e) {}
  // 幂等重订阅（即使 imSocket 内部会自动恢复，这里多订阅一次也是无害的）
  imSocket.subscribe(`/topic/room/${roomId.value}`, `room-${roomId.value}`)
  // 增量补拉
  fetchSinceLastMessage().catch(() => {})
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
  if (typeof removeWsStatusListener === 'function') removeWsStatusListener()
  removeWsStatusListener = null
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
    const msg = e?.message ? String(e.message) : '网络异常'
    const isNonFriend = /非好友|好友关系|被拉黑|黑名单/.test(msg)
    uni.showToast({ title: isNonFriend ? '非好友关系，无法发送消息' : ('发送失败：' + msg), icon: 'none' })
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
  const now = dayjs()
  if (index === 0) {
    return t.isSame(now, 'day') ? t.format('HH:mm') : t.format('YYYY-MM-DD HH:mm')
  }
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
