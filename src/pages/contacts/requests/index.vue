<template>
  <view class="container">
    <view class="custom-header">
      <view class="status-bar"></view>
      <view class="main-bar">
        <view class="left" @click="handleBack">
          <u-icon name="arrow-left" size="20" color="#333" bold></u-icon>
        </view>
        <view class="tabs">
          <view class="tab-item" :class="{ active: currentTab === 0 }" @click="switchTab(0)">
            <text>收到申请</text>
            <view v-if="currentTab === 0" class="indicator"></view>
          </view>
          <view class="tab-item" :class="{ active: currentTab === 1 }" @click="switchTab(1)">
            <text>发出申请</text>
            <view v-if="currentTab === 1" class="indicator"></view>
          </view>
        </view>
        <view class="right"></view>
      </view>
    </view>

    <scroll-view scroll-y class="content-scroll">
      <view v-if="loading" class="state">
        <text class="state-text">加载中...</text>
      </view>
      <view v-else-if="!currentList || currentList.length === 0" class="state">
        <text class="state-text">暂无数据</text>
      </view>
      <view class="list" v-else>
        <view class="list-item" v-for="item in currentList" :key="item.requestId">
          <view class="item-left">
            <view class="custom-avatar" :style="{ backgroundColor: getAvatarBgColor(item.targetName) }">
              <text class="avatar-text">{{ getAvatarText(item.targetName) }}</text>
            </view>
            <view class="item-info">
              <text class="item-name">{{ item.targetName || '未知用户' }}</text>
              <text class="item-desc">留言: {{ item.reason || '请求添加好友' }}</text>
            </view>
          </view>
          
          <view class="item-right">
            <!-- 0: 待处理, 1: 已同意, 2: 已拒绝 -->
            <template v-if="currentTab === 0 && item.status === 0">
              <view class="action-btn accept" @click="handleAccept(item)">
                <text>同意</text>
              </view>
              <view class="action-btn reject" @click="handleReject(item)">
                <text>拒绝</text>
              </view>
            </template>
            <template v-else-if="item.status === 0">
              <text class="status-text">等待验证</text>
            </template>
            <template v-else-if="item.status === 1">
              <text class="status-text">已同意</text>
            </template>
            <template v-else-if="item.status === 2">
              <text class="status-text">已拒绝</text>
            </template>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import request from '@/utils/request'

const loading = ref(false)
const currentTab = ref(0)
const receivedRequests = ref([])
const sentRequests = ref([])

const currentList = computed(() => {
  return currentTab.value === 0 ? receivedRequests.value : sentRequests.value
})

const switchTab = (tab) => {
  currentTab.value = tab
  if (tab === 0) loadReceivedRequests()
  else loadSentRequests()
}

const getAvatarText = (name) => {
  const text = name || ''
  if (text.includes('辅导员') || text.includes('老师')) return '师'
  if (text.includes('教授')) return '授'
  if (text.includes('同学') || text.includes('学生')) return '学'
  return text.charAt(0) || 'U'
}

const getAvatarBgColor = (name) => {
  const text = getAvatarText(name)
  if (text === '学' || text === '师') return '#F56C6C'
  if (text === '授') return '#F59E0B'
  const colors = ['#F56C6C', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#F97316']
  const code = text.charCodeAt(0) || 0
  return colors[code % colors.length]
}

const loadReceivedRequests = async () => {
  loading.value = true
  try {
    const res = await request({
      url: '/capi/friend/request/received',
      method: 'GET'
    })
    receivedRequests.value = Array.isArray(res) ? res : []
  } catch (e) {
    receivedRequests.value = []
  } finally {
    loading.value = false
  }
}

const loadSentRequests = async () => {
  loading.value = true
  try {
    const res = await request({
      url: '/capi/friend/request/sent',
      method: 'GET'
    })
    sentRequests.value = Array.isArray(res) ? res : []
  } catch (e) {
    sentRequests.value = []
  } finally {
    loading.value = false
  }
}

const handleAccept = async (item) => {
  try {
    await request({
      url: '/capi/friend/request/accept',
      method: 'POST',
      data: { requestId: item.requestId }
    })
    uni.showToast({ title: '已同意', icon: 'success' })
    item.status = 1
  } catch (e) {}
}

const handleReject = async (item) => {
  try {
    await request({
      url: '/capi/friend/request/reject',
      method: 'POST',
      data: { requestId: item.requestId }
    })
    uni.showToast({ title: '已拒绝', icon: 'none' })
    item.status = 2
  } catch (e) {}
}

const handleBack = () => {
  uni.navigateBack()
}

onShow(() => {
  if (currentTab.value === 0) {
    loadReceivedRequests()
  } else {
    loadSentRequests()
  }
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

    .tabs {
      flex: 1;
      display: flex;
      justify-content: center;
      height: 100%;
      
      .tab-item {
        position: relative;
        padding: 0 15px;
        display: flex;
        align-items: center;
        font-size: 16px;
        color: #666;
        
        &.active {
          font-weight: bold;
          color: #333;
        }
        
        .indicator {
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 24px;
          height: 3px;
          background-color: #4C8DFF;
          border-radius: 2px;
        }
      }
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
  padding: 16px 15px;
  border-bottom: 1px solid #f9f9f9;
  
  .item-left {
    display: flex;
    align-items: center;
    flex: 1;
    overflow: hidden;
    
    .custom-avatar {
      width: 46px;
      height: 46px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
      flex-shrink: 0;
      
      .avatar-text {
        color: #fff;
        font-size: 18px;
        font-weight: 500;
      }
    }

    .item-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
      
      .item-name {
        font-size: 16px;
        color: #333;
        font-weight: bold;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .item-desc {
        font-size: 13px;
        color: #888;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  }

  .item-right {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: 12px;
    
    .action-btn {
      padding: 6px 14px;
      border-radius: 16px;
      
      text {
        font-size: 13px;
        font-weight: 500;
      }
      
      &.accept {
        background-color: #4C8DFF;
        text { color: #fff; }
      }
      
      &.reject {
        background-color: #F5F6FA;
        text { color: #666; }
      }
      
      &:active {
        opacity: 0.8;
      }
    }
    
    .status-text {
      font-size: 13px;
      color: #999;
      padding: 6px 4px;
    }
  }
}
</style>