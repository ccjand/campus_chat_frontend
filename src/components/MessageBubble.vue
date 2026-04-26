<template>
  <view class="message-row" :class="{ 'is-own': isOwn, 'is-recall': message.type === 'recall' }">
    <template v-if="message.type !== 'recall'">
      <view class="avatar-wrapper" v-if="!isOwn && showAvatar">
        <u-avatar :src="getAvatarUrl(message.sender?.avatar)" size="40" shape="circle"></u-avatar>
      </view>
      <view class="avatar-placeholder" v-else-if="!isOwn"></view>
      
      <view class="content-wrapper">
        <text v-if="!isOwn && showName" class="sender-name">{{ message.sender.name }}</text>
        
        <view class="bubble-container">
          <view v-if="message.type === 'text'" class="text-bubble" :class="{ 'own-bubble': isOwn }">
            <view v-if="message.reply && message.reply.text" class="reply-snippet" :class="{ 'own-reply': isOwn }">
              <text class="reply-user">{{ message.reply.username || '回复' }}</text>
              <text class="reply-text">{{ message.reply.text }}</text>
            </view>
            <text class="message-text" :class="{ 'own-text': isOwn }">{{ message.content }}</text>
          </view>
          
          <view v-else-if="message.type === 'card' || message.type === 'image' || message.type === 'file'" class="card-bubble">
            <attachment-card 
              :type="message.attachment.type" 
              :data="message.attachment"
            ></attachment-card>
          </view>

          <view v-else-if="message.type === 'video'" class="video-bubble" @click="handleVideoClick">
            <view
              v-if="!videoPlayingMap[message.id]"
              class="video-poster-wrap"
              @click="playVideo(message.id)"
            >
              <image
                v-if="videoPosterUrl(message)"
                class="video-poster"
                :src="videoPosterUrl(message)"
                mode="aspectFill"
                @error="onPosterError(message.id)"
              ></image>
              <view class="play-btn">
                <u-icon name="play-right-fill" size="40" color="#fff"></u-icon>
              </view>
            </view>
            <video
              v-if="videoPlayingMap[message.id]"
              class="video-player"
              :src="getFileUrl(message.attachment?.url)"
              controls
              object-fit="cover"
              :autoplay="true"
              :loop="false"
              :muted="false"
            ></video>
          </view>
        </view>
      </view>
      
      <view class="avatar-wrapper" v-if="isOwn">
        <u-avatar :src="myAvatarUrl" size="40" shape="circle"></u-avatar>
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
import { computed, reactive } from 'vue'
import uAvatar from 'uview-plus/components/u-avatar/u-avatar.vue'
import AttachmentCard from './AttachmentCard.vue'
import { getAvatarUrl, getFileUrl } from '@/utils/avatar'

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

const myAvatarUrl = computed(() => {
  try {
    const cache = uni.getStorageSync('userInfo') || {}
    return getAvatarUrl(cache.avatar)
  } catch (e) {
    return getAvatarUrl(null)
  }
})

const videoPlayingMap = reactive({})

const videoPosterUrl = (message) => {
  const poster = message.attachment?.poster
  if (poster) {
    return getFileUrl(poster)
  }
  // 没有封面时返回空字符串，让 image 组件显示失败，配合 @error 显示黑色背景
  return ''
}

const posterErrorMap = reactive({})

const onPosterError = (messageId) => {
  posterErrorMap[messageId] = true
}

const playVideo = (messageId) => {
  videoPlayingMap[messageId] = true
}

const handleVideoClick = () => {
  // 阻止冒泡，避免触发其他点击事件
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
    
    .default-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      
      .default-avatar-text {
        color: #fff;
        font-size: 16px;
        font-weight: 500;
      }
    }
    
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
      max-width: 100%;
    }

    .video-bubble {
      width: 210px;
      max-width: 100%;
      border-radius: 10px;
      overflow: hidden;
      background-color: #000;
      position: relative;

      .video-poster-wrap {
        width: 210px;
        height: 280px;
        background-color: #000;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .video-poster {
        width: 210px;
        height: 280px;
        display: block;
        object-fit: cover;
      }

      .play-btn {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
      }

      .video-player {
        width: 210px;
        height: 280px;
        display: block;
        background-color: #000;
      }
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
