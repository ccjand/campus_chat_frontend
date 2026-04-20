<template>
  <view class="message-item" @click="handleClick">
    <view class="avatar-container">
      <view class="custom-avatar" :style="{ backgroundColor: avatarBgColor }">
        <text class="avatar-text">{{ avatarText }}</text>
      </view>
      <view v-if="message.unreadCount > 0" class="badge">
        <text class="badge-text">{{ message.unreadCount }}</text>
      </view>
    </view>
    
    <view class="content-container">
      <view class="header">
        <text class="name">{{ message.name }}</text>
        <text class="time">{{ message.timestamp }}</text>
      </view>
      <view class="footer">
        <text class="summary u-line-1">{{ message.summary }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  message: {
    type: Object,
    required: true
  }
})

// Extract the first character of the name or role for the avatar
const avatarText = computed(() => {
  const name = props.message.name || ''
  if (name.includes('辅导员') || name.includes('老师')) return '师'
  if (name.includes('教授')) return '授'
  if (name.includes('班')) return '班'
  if (name.includes('同学') || name.includes('学生')) return '学'
  return name.charAt(0) || 'U'
})

// Generate a background color based on the text
const avatarBgColor = computed(() => {
  const text = avatarText.value
  if (text === '学' || text === '师') return '#F56C6C' // Red-ish
  if (text === '班' || text === '授') return '#8B5CF6' // Purple-ish
  if (text === '群') return '#3B82F6' // Blue-ish
  
  // Default random-ish colors based on char code
  const colors = ['#F56C6C', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#F97316']
  const code = text.charCodeAt(0) || 0
  return colors[code % colors.length]
})

const handleClick = () => {
  const rid = props.message.roomId ?? props.message.id
  if (rid == null) return
  // Optimistically clear unread count locally
  if (props.message) {
    props.message.unreadCount = 0
  }
  const type = props.message.messageType || 'single'
  const title = props.message.name ? encodeURIComponent(String(props.message.name)) : ''
  uni.navigateTo({
    url: `/pages/chat/index?roomId=${encodeURIComponent(String(rid))}&type=${encodeURIComponent(String(type))}&title=${title}`
  })
}
</script>

<style lang="scss" scoped>
.message-item {
  display: flex;
  padding: 16px 20px;
  background-color: #fff;
  border-bottom: 1px solid #f0f0f0;
  
  &:active {
    background-color: #f9f9f9;
  }
  
  .avatar-container {
    position: relative;
    margin-right: 16px;
    width: 50px;
    height: 50px;
    
    .custom-avatar {
      width: 50px;
      height: 50px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      
      .avatar-text {
        color: #fff;
        font-size: 20px;
        font-weight: 500;
      }
    }
    
    .badge {
      position: absolute;
      top: -6px;
      right: -6px;
      background-color: #F56C6C;
      border-radius: 10px;
      min-width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 5px;
      z-index: 1;
      border: 2px solid #fff;
      
      .badge-text {
        color: #fff;
        font-size: 11px;
        font-weight: bold;
        line-height: 1;
      }
    }
  }
  
  .content-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      
      .name {
        font-size: 16px;
        font-weight: bold;
        color: #333;
      }
      
      .time {
        font-size: 13px;
        color: #b0b0b0;
      }
    }
    
    .footer {
      display: flex;
      
      .summary {
        font-size: 14px;
        color: #888;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        flex: 1;
        width: 0;
      }
    }
  }
}
</style>
