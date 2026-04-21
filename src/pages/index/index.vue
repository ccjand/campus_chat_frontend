<template>
  <view class="container">
    <view class="custom-header">
      <view class="status-bar"></view>
      <view class="main-bar">
        <text class="page-title">消息</text>
      </view>
    </view>
    
    <view class="search-container">
      <view class="search-box">
        <u-icon name="search" color="#999" size="18"></u-icon>
        <text class="search-placeholder">搜索</text>
      </view>
    </view>

    <view class="tab-content">
      <scroll-view scroll-y class="content-scroll">
        <view class="message-scroll-body">
          <message-list v-if="messages && messages.length" :messages="messages"></message-list>
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
import { ref, computed, nextTick } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import uIcon from 'uview-plus/components/u-icon/u-icon.vue'
import MessageList from '@/components/MessageList.vue'
import BottomNav from '@/components/BottomNav.vue'
import request from '@/utils/request'
import imSocket from '@/utils/imSocket'
import dayjs from 'dayjs'

const bottomNavRef = ref(null)
const currentMainTab = ref(0)
const messages = ref([])

const platformMessages = ref([])

const showQuickMenu = ref(false)
let removeWsListener = null
let refreshRecentTimer = null

const ACTIVE_ROOM_KEY = 'activeChatRoomId'
const processedMsgIds = new Set()

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
    avatar: item.avatar || '',
    summary: item.summary || '',
    unreadCount: Number(item.unreadCount || 0),
    timestamp: formatSessionTime(item.activeTime || item.timestamp)
  }
}

const loadRecentContacts = async () => {
  try {
    const list = await request({
      url: '/capi/contact/list',
      method: 'GET'
    })
    
    // Fetch friend list to get names and avatars
    let friendMap = {}
    try {
      const friends = await request({ url: '/capi/friend/list', method: 'GET' })
      if (Array.isArray(friends)) {
        friends.forEach(f => {
          if (f.roomId) {
            friendMap[f.roomId] = {
              name: f.fullName || f.name || f.accountNumber || '',
              avatar: f.avatar || ''
            }
          }
        })
      }
    } catch (e) {}

    // Map recent contacts
    let mapped = (Array.isArray(list) ? list : []).map(item => {
      const roomId = item.roomId ?? item.id
      if (roomId == null) return null
      const messageType = item.type === 2 ? 'group' : 'single'
      
      const fInfo = friendMap[roomId] || {}
      return {
        id: roomId,
        roomId,
        messageType,
        name: fInfo.name || item.name || (messageType === 'group' ? '群聊 ' + roomId : '会话 ' + roomId),
        avatar: fInfo.avatar || item.avatar || '',
        summary: item.summary || '',
        unreadCount: Number(item.unreadCount || 0),
        timestamp: formatSessionTime(item.activeTime || item.timestamp)
      }
    }).filter(Boolean)
    
    // Fetch latest message for each room to populate summary
    try {
      const promises = mapped.map(async (m) => {
        if (m.summary) return m // Already has summary
        try {
          const history = await request({
            url: '/capi/message/history',
            method: 'GET',
            data: { roomId: Number(m.roomId), size: 1, cursor: '' }
          })
          if (Array.isArray(history) && history.length > 0) {
            const msg = history[0]
            let content = msg.content || ''
            if (msg.type === 2) content = '[图片]'
            if (msg.type === 3) content = '[文件]'
            m.summary = content
            
            // If timestamp is not set by contact, use message time
            if (!m.timestamp && (msg.createTime || msg.sendTime)) {
              m.timestamp = formatSessionTime(msg.createTime || msg.sendTime)
            }
          }
        } catch (e) {}
        return m
      })
      mapped = await Promise.all(promises)
    } catch (e) {}
    
    messages.value = mapped
  } catch (e) {
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
  const shouldIncUnread = !isSelf && !isActiveRoom

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
  if (typeof removeWsListener !== 'function') {
    removeWsListener = imSocket.onMessage(handleWsPayload)
  }
  nextTick(() => {
    if (bottomNavRef.value?.loadBadgeInfo) {
      bottomNavRef.value.loadBadgeInfo()
    }
  })
})

onHide(() => {
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

  .search-container {
    background-color: #fff;
    padding: 10px 15px;
    
    .search-box {
      background-color: #F5F6FA;
      height: 36px;
      border-radius: 18px;
      display: flex;
      align-items: center;
      padding: 0 15px;
      
      .search-placeholder {
        font-size: 14px;
        color: #999;
        margin-left: 8px;
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
