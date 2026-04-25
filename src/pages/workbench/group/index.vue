<template>
  <view class="container">
    <view class="custom-header">
      <view class="status-bar"></view>
      <view class="main-bar">
        <view class="left" @click="handleBack">
          <u-icon name="arrow-left" size="20" color="#333" bold></u-icon>
        </view>
        <text class="page-title">群组</text>
        <view class="right"></view>
      </view>
    </view>

    <scroll-view scroll-y class="content-scroll">
      <view v-if="loading" class="state">
        <text class="state-text">加载中...</text>
      </view>
      <view v-else-if="!groups || groups.length === 0" class="state">
        <text class="state-text">暂无群组</text>
      </view>
      <view class="list" v-else>
        <view class="list-item" v-for="(item, index) in groups" :key="index" @click="openChat(item)">
            <view class="item-left">
              <u-avatar :src="getAvatarUrl(item.avatar)" size="40" shape="circle" style="margin-right: 12px;"></u-avatar>
              <view class="item-info">
              <text class="item-name">{{ item.name || '未知群组' }}</text>
              <text class="item-desc">群组会话</text>
            </view>
          </view>
          <u-icon name="arrow-right" color="#ccc" size="14"></u-icon>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import request from '@/utils/request'
import uAvatar from 'uview-plus/components/u-avatar/u-avatar.vue'
import { getAvatarUrl } from '@/utils/avatar'

const loading = ref(false)
const groups = ref([])

const loadGroups = async () => {
  loading.value = true
  try {
    const res = await request({
      url: '/capi/contact/list',
      method: 'GET'
    })
    const list = Array.isArray(res) ? res : []
    groups.value = list.filter(c => c.type === 2 || c.messageType === 'group')
  } catch (e) {
    groups.value = []
  } finally {
    loading.value = false
  }
}

const openChat = (contact) => {
  const roomId = contact?.roomId
  if (!roomId) return
  const title = contact?.name ? encodeURIComponent(String(contact.name)) : ''
  uni.navigateTo({
    url: `/pages/chat/index?roomId=${encodeURIComponent(String(roomId))}&type=group&title=${title}`
  })
}

const handleBack = () => {
  uni.navigateBack()
}

onShow(() => {
  loadGroups()
})
</script>

<style lang="scss" scoped>
.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #F8F9FA;
}

.custom-header {
  background-color: #fff;
  position: relative;

  .status-bar {
    height: var(--status-bar-height);
  }

  .main-bar {
    height: 44px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 15px;
    
    .left, .right {
      width: 40px;
      display: flex;
      align-items: center;
    }
    
    .page-title {
      font-size: 18px;
      font-weight: bold;
      color: #333;
    }
  }
}

.content-scroll {
  flex: 1;
  overflow-y: auto;
}

.state {
  padding: 60px 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.state-text {
  font-size: 14px;
  color: #999;
}

.list {
  background-color: #fff;
  margin-top: 10px;
}

.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid #f9f9f9;
  
  .item-left {
    display: flex;
    align-items: center;
    
    .custom-avatar {
      width: 46px;
      height: 46px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
      
      .avatar-text {
        color: #fff;
        font-size: 18px;
        font-weight: 500;
      }
    }

    .item-info {
      display: flex;
      flex-direction: column;
      
      .item-name {
        font-size: 16px;
        color: #333;
        font-weight: bold;
        margin-bottom: 4px;
      }
      
      .item-desc {
        font-size: 12px;
        color: #999;
      }
    }
  }
  
  &:active {
    background-color: #f9f9f9;
  }
}
</style>