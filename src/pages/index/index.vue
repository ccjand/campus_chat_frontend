<template>
  <view class="container">
    <view class="custom-header">
      <view class="status-bar"></view>
      <view class="main-bar">
        <text class="page-title">消息</text>
      </view>
    </view>
    
    <view class="tab-content">
      <scroll-view scroll-y class="content-scroll">
        <view class="message-scroll-body">
          <message-list v-if="messages && messages.length" :messages="messages" @clear-unread="handleClearUnread"></message-list>
          <view v-else class="empty">
            <text class="empty-text">消息为空</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- Bottom Navigation -->
    <bottom-nav ref="bottomNavRef" current="message" :unread-count="totalUnread"></bottom-nav>
  </view>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import uIcon from 'uview-plus/components/u-icon/u-icon.vue'
import MessageList from '@/components/MessageList.vue'
import BottomNav from '@/components/BottomNav.vue'
import request from '@/utils/request'
import imSocket from '@/utils/imSocket'
import dayjs from 'dayjs'
import { getAvatarUrl } from '@/utils/avatar'

const bottomNavRef = ref(null)
const currentMainTab = ref(0)
const messages = ref([])

const platformMessages = ref([])

const showQuickMenu = ref(false)
let removeWsListener = null
let refreshRecentTimer = null

const ACTIVE_ROOM_KEY = 'activeChatRoomId'
const EVENT_REFRESH_RECENT = 'chat:refresh_recent'
const processedMsgIds = new Set()
let removeRecentRefreshListener = null

const totalUnread = computed(() => {
  const list = Array.isArray(messages.value) ? messages.value : []
  return list.reduce((sum, item) => sum + (Number(item?.unreadCount) > 0 ? Number(item.unreadCount) : 0), 0)
})

const toMsFromTimestampValue = (value) => {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return null
    const d1 = dayjs(text)
    if (d1.isValid()) return d1.valueOf()
    const d2 = dayjs(text.replace('T', ' '))
    return d2.isValid() ? d2.valueOf() : null
  }
  if (Array.isArray(value) && value.length >= 3) {
    const [y, m, d, hh = 0, mm = 0, ss = 0, ns = 0] = value
    const ms = Math.floor(Number(ns || 0) / 1e6)
    const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss), ms)
    const out = date.getTime()
    return Number.isFinite(out) ? out : null
  }
  return null
}

const formatSessionTime = (ts) => {
  const ms = toMsFromTimestampValue(ts)
  if (!ms) return ''
  const t = dayjs(ms)
  if (!t.isValid()) return ''
  const now = dayjs()
  if (t.isSame(now, 'day')) return t.format('HH:mm')
  if (t.isSame(now, 'year')) return t.format('MM-DD')
  return t.format('YYYY-MM-DD')
}

const mapRecentContactToUi = (item) => {
  if (!item) return null
  const roomId = item.roomId ?? item.id
  if (roomId == null) return null
  // The backend Contact entity doesn't provide these directly, we may need to adapt
  // based on the actual returned data from /capi/contact/list
  const messageType = item.type === 2 ? 'group' : 'single' 
  return {
    id: roomId,
    roomId,
    messageType,
    name: item.name || '会话 ' + roomId, // Fallback if name is missing in Contact
    avatar: getAvatarUrl(item.avatar),
    summary: item.summary || '',
    unreadCount: Number(item.unreadCount || 0),
    timestamp: formatSessionTime(item.activeTime || item.timestamp)
  }
}

const loadRecentContacts = async () => {
  try {
    const [list, friendList] = await Promise.all([
      request({
        url: '/capi/contact/list',
        method: 'GET'
      }),
      request({
        url: '/capi/friend/list',
        method: 'GET'
      }).catch(() => [])
    ])
    const friendRoomSet = new Set(
      (Array.isArray(friendList) ? friendList : [])
        .map((f) => f?.roomId)
        .filter((id) => id != null)
        .map((id) => String(id))
    )
    
    // The backend now returns a fully populated ContactVO list!
    // No more N+1 requests, no more manual mapping of friends and messages.
    let mapped = (Array.isArray(list) ? list : []).map(item => {
      const roomId = item.roomId ?? item.id
      if (roomId == null) return null
      
      const messageType = item.type === 2 ? 'group' : 'single'
      if (messageType === 'single' && !friendRoomSet.has(String(roomId))) {
        return null
      }
      
      return {
        id: roomId,
        roomId,
        messageType,
        name: item.name || (messageType === 'group' ? '群聊 ' + roomId : '会话 ' + roomId),
        avatar: getAvatarUrl(item.avatar),
        summary: item.summary || '',
        unreadCount: Number(item.unreadCount || 0),
        timestamp: formatSessionTime(item.timestamp || item.activeTime),
        top: !!item.top,
        mute: !!item.mute
      }
    }).filter(Boolean)
    
    messages.value = mapped
  } catch (e) {
    console.error('Failed to load recent contacts:', e)
    messages.value = []
  }
}

const extractSummaryFromWs = (data) => {
  const content = data?.content
  if (typeof content === 'string') return content
  if (content && typeof content === 'object') {
    const text = content.content
    if (typeof text === 'string') return text
  }
  return '新消息'
}

const scheduleRefreshRecent = (delayMs = 300) => {
  if (refreshRecentTimer) return
  refreshRecentTimer = setTimeout(async () => {
    refreshRecentTimer = null
    await loadRecentContacts()
  }, Math.max(0, Number(delayMs) || 0))
}
const handleClearUnread = (roomId) => {
  if (roomId == null) return
  const idx = messages.value.findIndex((m) => String(m?.roomId ?? m?.id) === String(roomId))
  if (idx >= 0) {
    messages.value[idx] = { ...messages.value[idx], unreadCount: 0 }
  }
}

const handleWsPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return

  // Error handling
  if (payload.type === -1 && payload.data) {
    return
  }

  // Determine if it's a direct ChatMessageDTO or wrapped message
  let dataObj = payload
  if (payload.roomId != null && payload.id != null) {
    dataObj = payload
  } else if (payload.type === 4 || (payload.data && payload.data.roomId)) {
    dataObj = payload.data || payload
    if (dataObj && typeof dataObj === 'object' && dataObj.message && typeof dataObj.message === 'object') {
      dataObj = { ...dataObj, ...dataObj.message }
    }
  } else {
    // Might be an event like recall/read or unknown type
    if (payload.event === 'recall') {
      scheduleRefreshRecent()
    }
    return
  }
  
  const rid = dataObj?.roomId
  if (rid == null) return
  
  const msgId = dataObj?.id
  if (msgId != null) {
    const idText = String(msgId)
    if (processedMsgIds.has(idText)) {
      return // Deduplicate: already processed this message for unread count
    }
    processedMsgIds.add(idText)
    // Prevent memory leak
    if (processedMsgIds.size > 2000) {
      const first = processedMsgIds.values().next().value
      if (first) processedMsgIds.delete(first)
    }
  }

  const myUid = uni.getStorageSync('uid') ?? uni.getStorageSync('userInfo')?.uid
  const isSelf = myUid != null && dataObj?.fromUid != null && String(myUid) === String(dataObj.fromUid)
  const activeRoom = uni.getStorageSync(ACTIVE_ROOM_KEY)
  const isActiveRoom = activeRoom != null && String(activeRoom) === String(rid)
   const existingSession = messages.value.find((m) => String(m?.roomId ?? m?.id) === String(rid))
  const isMuted = !!existingSession?.mute
  const shouldIncUnread = !isSelf && !isActiveRoom && !isMuted

  const idx = messages.value.findIndex((m) => String(m?.roomId ?? m?.id) === String(rid))
  if (idx < 0) {
    scheduleRefreshRecent()
    return
  }

  const prev = messages.value[idx]
  const nextUnread = shouldIncUnread ? Number(prev?.unreadCount || 0) + 1 : Number(prev?.unreadCount || 0)
  const updated = {
    ...prev,
    summary: extractSummaryFromWs(dataObj),
    timestamp: formatSessionTime(dataObj?.createTime || dataObj?.sendTime),
    unreadCount: Math.max(0, nextUnread)
  }
  messages.value.splice(idx, 1)
  messages.value.unshift(updated)
}

const openQuickMenu = () => {
  showQuickMenu.value = !showQuickMenu.value
}

const closeQuickMenu = () => {
  showQuickMenu.value = false
}

const handleQuickAction = (type) => {
  closeQuickMenu()
  if (type === 'add_friend') {
    uni.showToast({ title: '添加好友', icon: 'none' })
    return
  }
  if (type === 'create_group') {
    uni.showToast({ title: '创建群聊', icon: 'none' })
    return
  }
  if (type === 'join_group') {
    uni.showToast({ title: '加入群聊', icon: 'none' })
  }
}

onShow(() => {
  loadRecentContacts()
  if (typeof removeRecentRefreshListener !== 'function') {
    const handler = () => {
      loadRecentContacts()
    }
    uni.$on(EVENT_REFRESH_RECENT, handler)
    removeRecentRefreshListener = () => uni.$off(EVENT_REFRESH_RECENT, handler)
  }
  // 只在监听器尚未注册时注册，避免重复
  if (typeof removeWsListener !== 'function') {
    removeWsListener = imSocket.onMessage(handleWsPayload)
  }
})

onMounted(() => {
  loadRecentContacts()
})

onHide(() => {
  // 不再移除 WS 监听，让 index.vue 在后台也能实时更新其他房间的未读计数
  // handleWsPayload 中的 isActiveRoom 检查会自动跳过当前聊天室的消息
  if (refreshRecentTimer) clearTimeout(refreshRecentTimer)
  refreshRecentTimer = null
})

onUnload(() => {
  if (typeof removeRecentRefreshListener === 'function') removeRecentRefreshListener()
  removeRecentRefreshListener = null
  if (typeof removeWsListener === 'function') removeWsListener()
  removeWsListener = null
  if (refreshRecentTimer) clearTimeout(refreshRecentTimer)
  refreshRecentTimer = null
})
</script>

<style lang="scss" scoped>
.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #F8F9FA;
  
  .custom-header {
    background-color: #fff;
    padding-bottom: 0;
    position: relative;

    .status-bar {
      height: var(--status-bar-height);
      background-color: #fff;
    }

    .main-bar {
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #fff;
      
      .page-title {
        font-size: 18px;
        font-weight: bold;
        color: #333;
      }
    }
  }
  
  .tab-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: #fff;
  }
  
  .content-scroll {
    flex: 1;
    overflow-y: auto;
  }

  .message-scroll-body {
    min-height: 100%;
    background-color: #fff;
  }

  .empty {
    padding: 60px 0;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .empty-text {
    font-size: 14px;
    color: #999;
  }
}
</style>
