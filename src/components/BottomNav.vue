<template>
  <view class="bottom-nav">
    <view 
      class="nav-item" 
      :class="{ active: current === 'message' }"
      @click="navigateTo('/pages/index/index')"
    >
      <view class="icon-container">
        <u-icon :name="current === 'message' ? 'chat-fill' : 'chat'" size="24" :color="current === 'message' ? '#4C8DFF' : '#999'"></u-icon>
        <view v-if="badgeText" class="badge">{{ badgeText }}</view>
      </view>
      <text class="label">消息</text>
    </view>
    
    <view 
      class="nav-item" 
      :class="{ active: current === 'contacts' }"
      @click="navigateTo('/pages/contacts/index')"
    >
      <view class="icon-container">
        <u-icon :name="current === 'contacts' ? 'account-fill' : 'account'" size="24" :color="current === 'contacts' ? '#4C8DFF' : '#999'"></u-icon>
        <view v-if="badgeInfo.contactDot" class="red-dot"></view>
      </view>
      <text class="label">通讯录</text>
    </view>
    
    <view 
      class="nav-item" 
      :class="{ active: current === 'workbench' }"
      @click="navigateTo('/pages/workbench/index')"
    >
      <view class="icon-container">
        <u-icon :name="current === 'workbench' ? 'grid-fill' : 'grid'" size="24" :color="current === 'workbench' ? '#4C8DFF' : '#999'"></u-icon>
        <view v-if="badgeInfo.workbenchDot" class="red-dot"></view>
      </view>
      <text class="label">工作台</text>
    </view>
    
    <view 
      class="nav-item" 
      :class="{ active: current === 'my' }"
      @click="navigateTo('/pages/my/index')"
    >
      <view class="icon-container">
        <u-icon :name="current === 'my' ? 'account-fill' : 'account'" size="24" :color="current === 'my' ? '#4C8DFF' : '#999'"></u-icon>
        <view v-if="badgeInfo.mineDot" class="red-dot"></view>
      </view>
      <text class="label">我的</text>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, onMounted, watch, onUnmounted } from 'vue'
import request from '@/utils/request'
import imSocket from '@/utils/imSocket'

const props = defineProps({
  current: {
    type: String,
    default: 'message'
  },
  unreadCount: {
    type: Number,
    default: -1 // -1 means it's not provided by parent, use backend badgeInfo
  }
})

// Extract global state outside the component so it persists across tab switches
// Since uni-app tears down components on page switches if not using tabbar
const getGlobalBadgeInfo = () => {
  const cached = uni.getStorageSync('globalBadgeInfo')
  if (cached) {
    try { return JSON.parse(cached) } catch(e) {}
  }
  return {
    unreadMsgCount: 0,
    contactDot: false,
    workbenchDot: false,
    mineDot: false
  }
}

const badgeInfo = ref(getGlobalBadgeInfo())

const saveGlobalBadgeInfo = (info) => {
  uni.setStorageSync('globalBadgeInfo', JSON.stringify(info))
}

// Safely watch the props to update global cache without triggering Vue computed side-effect warnings
watch(() => props.unreadCount, (newVal) => {
  if (newVal !== -1) {
    badgeInfo.value.unreadMsgCount = Number(newVal)
    saveGlobalBadgeInfo(badgeInfo.value)
  }
}, { immediate: true })

const badgeText = computed(() => {
  let n = 0
  if (props.unreadCount !== -1) {
    n = Number(props.unreadCount)
  } else {
    // If in other tabs, use the fetched badge info
    n = Number(badgeInfo.value.unreadMsgCount || 0)
  }
  
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n > 99) return '99+'
  return String(Math.floor(n))
})

const loadBadgeInfo = async () => {
  try {
    const res = await request({
      url: '/capi/badge',
      method: 'GET'
    })
    // Ensure we handle both potential response structures from the backend
    if (res) {
      // KEEP the local unreadMsgCount because the backend /capi/badge interface
      // relies on a buggy SQL (countTotalUnread) that often returns 0 incorrectly.
      // We rely exclusively on index.vue to calculate and pass the true unreadCount.
      const currentUnread = badgeInfo.value.unreadMsgCount || 0
      badgeInfo.value = {
        ...badgeInfo.value,
        ...res,
        unreadMsgCount: currentUnread
      }
      saveGlobalBadgeInfo(badgeInfo.value)
    }
  } catch (e) {
    // console.warn('Load badge info error', e)
  }
}

// Global WebSocket listener for background tabs
let removeWsListener = null
const processedMsgIds = new Set()

const handleWsPayload = (payload) => {
  // If we are on the message tab, index.vue handles this accurately.
  // We only intercept messages here if we are on OTHER tabs.
  if (props.current === 'message') return

  if (!payload || !payload.id) return
  
  // Deduplicate
  if (processedMsgIds.has(payload.id)) return
  processedMsgIds.add(payload.id)
  if (processedMsgIds.size > 2000) {
    const iterator = processedMsgIds.values()
    for (let i = 0; i < 500; i++) processedMsgIds.delete(iterator.next().value)
  }

const currentUserId = uni.getStorageSync('uid') || uni.getStorageSync('userInfo')?.uid || uni.getStorageSync('userInfo')?.id
  if (String(payload.fromUid) === String(currentUserId)) return

  // 如果消息属于当前正在查看的聊天室，不增加未读计数
  const activeRoom = uni.getStorageSync('activeChatRoomId')
  const msgRoomId = payload.roomId
  if (activeRoom != null && msgRoomId != null && String(activeRoom) === String(msgRoomId)) return

  badgeInfo.value.unreadMsgCount = (Number(badgeInfo.value.unreadMsgCount) || 0) + 1
  saveGlobalBadgeInfo(badgeInfo.value)
}

// Load badge info automatically when the bottom nav component is rendered
onMounted(() => {
  loadBadgeInfo()
  removeWsListener = imSocket.onMessage(handleWsPayload)
  //监听 badge WebSocket 推送
    removeBadgeListener = imSocket.onBadge((badge) => {
        if (badge) {
            const currentUnread = badgeInfo.value.unreadMsgCount || 0
            badgeInfo.value = {
                ...badgeInfo.value,
                ...badge,
                unreadMsgCount: currentUnread  // 保留本地维护的未读数
            }
            saveGlobalBadgeInfo(badgeInfo.value)
        }
    })
})

onUnmounted(() => {
 if (typeof removeWsListener === 'function') removeWsListener()
 if (typeof removeBadgeListener === 'function') removeBadgeListener()
})

defineExpose({ loadBadgeInfo })

const navigateTo = (url) => {
  uni.reLaunch({
    url
  })
}
</script>

<style lang="scss" scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50px;
  background-color: #fff;
  display: flex;
  justify-content: space-around;
  align-items: center;
  border-top: 1px solid #eee;
  padding-bottom: env(safe-area-inset-bottom);
  box-sizing: content-box;
  z-index: 100;
  
  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    height: 100%;
    
    &.active {
      .label {
        color: #4C8DFF;
      }
    }
    
    .label {
      font-size: 10px;
      margin-top: 2px;
      color: #999;
    }
    
    .icon-container {
      position: relative;
      display: flex;
      justify-content: center;
      
      .badge {
        position: absolute;
        top: -2px;
        right: -8px;
        background-color: #ff3b30;
        color: #fff;
        font-size: 9px;
        padding: 0 3px;
        border-radius: 8px;
        min-width: 14px;
        text-align: center;
        line-height: 14px;
      }

      .red-dot {
        position: absolute;
        top: -2px;
        right: -2px;
        background-color: #ff3b30;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        border: 1px solid #fff;
      }
    }
  }
}
</style>
