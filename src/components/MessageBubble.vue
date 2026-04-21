<template>
  <view class="message-row" :class="{ 'is-own': isOwn, 'is-recall': message.type === 'recall' }">
    <template v-if="message.type !== 'recall'">
      <view class="avatar-wrapper" v-if="!isOwn && showAvatar">
        <view class="custom-avatar-text" :style="{ backgroundColor: getAvatarBgColor(message.sender) }">
          <text>{{ getAvatarText(message.sender) }}</text>
        </view>
      </view>
      <view class="avatar-placeholder" v-else-if="!isOwn"></view>
      
      <view class="content-wrapper">
        <text v-if="!isOwn && showName" class="sender-name">{{ message.sender.name }}</text>
        
        <view class="bubble-container">
          <view v-if="message.type === 'text'" class="text-bubble" :class="{ 'own-bubble': isOwn }" @longpress.stop="handleLongPress">
            <view v-if="message.reply && message.reply.text" class="reply-snippet" :class="{ 'own-reply': isOwn }">
              <text class="reply-user">{{ message.reply.username || '回复' }}</text>
              <text class="reply-text">{{ message.reply.text }}</text>
            </view>
            <text class="message-text" :class="{ 'own-text': isOwn }">{{ message.content }}</text>
          </view>
          
          <view v-else-if="message.type === 'card' || message.type === 'image' || message.type === 'file'" class="card-bubble" @longpress.stop="handleLongPress">
            <attachment-card 
              :type="message.attachment.type" 
              :data="message.attachment"
            ></attachment-card>
          </view>
        </view>
      </view>
      
      <view class="avatar-wrapper" v-if="isOwn">
        <view class="custom-avatar-text" :style="{ backgroundColor: myAvatarBgColor }">
          <text>{{ myAvatarText }}</text>
        </view>
      </view>
    </template>

    <template v-else>
      <view class="recall-bubble">
        <text class="recall-text">{{ message.content }}</text>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import AttachmentCard from './AttachmentCard.vue'

const props = defineProps({
  message: {
    type: Object,
    required: true
  },
  isOwn: {
    type: Boolean,
    default: false
  },
  showAvatar: {
    type: Boolean,
    default: true
  },
  showName: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['longpress'])

// Avatar Text logic
const getAvatarText = (user) => {
  const name = user?.name || ''
  if (name.includes('辅导员') || name.includes('老师')) return '师'
  if (name.includes('教授')) return '授'
  if (name.includes('同学') || name.includes('学生')) return '学'
  return name.charAt(0) || 'U'
}

const getAvatarBgColor = (user) => {
  const text = getAvatarText(user)
  if (text === '学' || text === '师') return '#F56C6C'
  if (text === '授') return '#F59E0B'
  if (text === '群' || text === '班') return '#8B5CF6'
  const colors = ['#F56C6C', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#F97316']
  const code = text.charCodeAt(0) || 0
  return colors[code % colors.length]
}

const myAvatarText = computed(() => {
  try {
    const cache = uni.getStorageSync('userInfo') || {}
    return getAvatarText(cache)
  } catch (e) {
    return '我'
  }
})

const myAvatarBgColor = computed(() => {
  try {
    const cache = uni.getStorageSync('userInfo') || {}
    return getAvatarBgColor(cache)
  } catch (e) {
    return '#3B82F6'
  }
})

const handleLongPress = (e) => {
  const touch = Array.isArray(e?.touches) && e.touches.length > 0 ? e.touches[0] : null
  const detail = e?.detail ?? {}
  const x = detail?.x ?? touch?.clientX ?? touch?.pageX ?? 0
  const y = detail?.y ?? touch?.clientY ?? touch?.pageY ?? 0
  emit('longpress', { message: props.message, isOwn: props.isOwn, x, y })
}
</script>

<style lang="scss" scoped>
.message-row {
  display: flex;
  margin-bottom: 20px;
  padding: 0 15px;
  
  &.is-own {
    justify-content: flex-end;
    
    .content-wrapper {
      align-items: flex-end;
      margin-right: 10px;
      margin-left: 0;
      
      .text-bubble {
        background-color: #fff; // Own message also white as per design
        border-top-right-radius: 2px;
        border-top-left-radius: 8px;
      }
    }
  }

  &.is-recall {
    justify-content: center;
    padding: 0 20px;
    margin-bottom: 12px;
  }
  
  .avatar-wrapper {
    flex-shrink: 0;
    
    .custom-avatar-text {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      
      text {
        color: #fff;
        font-size: 16px;
        font-weight: 500;
      }
    }
  }
  
  .avatar-placeholder {
    width: 40px;
    flex-shrink: 0;
  }
  
  .content-wrapper {
    display: flex;
    flex-direction: column;
    margin-left: 10px;
    max-width: 70%;
    min-width: 0;
    
    .sender-name {
      font-size: 12px;
      color: #999;
      margin-bottom: 4px;
    }
    
    .bubble-container {
      min-width: 0;
      max-width: 100%;
    }

    .text-bubble {
      background-color: #fff;
      padding: 10px 14px;
      border-radius: 12px;
      border-top-left-radius: 4px;
      max-width: 100%;
      
      &.own-bubble {
        background-color: #2F80ED; // Updated to blue from design
        border-radius: 12px;
        border-top-right-radius: 4px;
      }

      .reply-snippet {
        display: flex;
        align-items: center;
        padding-left: 10px;
        border-left: 2px solid rgba(60, 74, 128, 0.5);
        margin-bottom: 6px;
        max-width: 100%;
        
        &.own-reply {
          border-left: 2px solid rgba(255, 255, 255, 0.5);
          
          .reply-user {
            color: #EBF3FF;
          }
          
          .reply-text {
            color: #EBF3FF;
          }
        }
      }

      .reply-user {
        font-size: 12px;
        color: #3C4A80;
        margin-right: 6px;
        flex-shrink: 0;
      }

      .reply-text {
        font-size: 12px;
        color: #666;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      
      .message-text {
        font-size: 16px;
        color: #333;
        line-height: 1.5;
        max-width: 100%;
        white-space: pre-wrap;
        word-break: break-all;
        overflow-wrap: anywhere;
        word-wrap: break-word;
        display: block;
        
        &.own-text {
          color: #fff;
        }
      }
    }
    
    .card-bubble {
      // Cards handle their own styling
    }
  }

  .recall-bubble {
    background-color: rgba(0, 0, 0, 0.06);
    border-radius: 10px;
    padding: 6px 10px;
    max-width: 80%;
  }

  .recall-text {
    font-size: 12px;
    color: #666;
    max-width: 100%;
    white-space: pre-wrap;
    word-break: break-all;
    overflow-wrap: anywhere;
    word-wrap: break-word;
    display: block;
  }
}
</style>
