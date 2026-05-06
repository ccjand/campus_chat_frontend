<template>
  <view class="message-item" @click="handleClick">
    <view class="avatar-container">
      <u-avatar :src="getAvatarUrl(message.avatar)" size="50" shape="circle"></u-avatar>
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
import uAvatar from 'uview-plus/components/u-avatar/u-avatar.vue'
import { getAvatarUrl } from '@/utils/avatar'

const props = defineProps({
  message: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['clear-unread'])

const handleClick = () => {
  const rid = props.message.roomId ?? props.message.id
  if (rid == null) return
  // Optimistically clear unread count locally
  emit('clear-unread', rid)
  const type = props.message.messageType || 'single'
  const title = props.message.name ? encodeURIComponent(String(props.message.name)) : ''
  const avatar = props.message.avatar ? encodeURIComponent(String(props.message.avatar)) : ''
  const receiverId = props.message.receiverId ?? props.message.uid ?? props.message.targetUid
  uni.navigateTo({
    url: `/pages/chat/index?roomId=${encodeURIComponent(String(rid))}&type=${encodeURIComponent(String(type))}&title=${title}&avatar=${avatar}${receiverId != null ? `&receiverId=${encodeURIComponent(String(receiverId))}` : ''}`
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
