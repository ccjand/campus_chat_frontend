<template>
  <view class="container">
    <view class="custom-header">
      <view class="status-bar"></view>
      <view class="main-bar">
        <view class="left" @click="handleBack">
          <u-icon name="arrow-left" size="20" color="#333" bold></u-icon>
        </view>
        <text class="page-title">通知公告</text>
        <view class="right"></view>
      </view>
    </view>

    <scroll-view scroll-y class="content-scroll">
      <view v-if="loading" class="state">
        <text class="state-text">加载中...</text>
      </view>
      <view v-else-if="!notices || notices.length === 0" class="state">
        <text class="state-text">暂无通知</text>
      </view>
      <view class="list" v-else>
        <view class="list-item" v-for="item in notices" :key="item.id" @click="handleRead(item.id)">
          <view class="item-header">
            <view class="title-row">
              <text class="item-title">{{ item.title }}</text>
              <view class="badge" v-if="item.isNew">新</view>
            </view>
            <text class="item-time">{{ formatTime(item.createTime) }}</text>
          </view>
          <view class="item-content">
            <text class="content-text">{{ item.content }}</text>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import request from '@/utils/request'

const loading = ref(false)
const notices = ref([])
const readSet = new Set()

const formatTime = (arr) => {
  if (Array.isArray(arr)) {
    const [y, m, d, hh, mm] = arr
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }
  return arr || ''
}

const loadNotices = async () => {
  loading.value = true
  try {
    const res = await request({
      url: '/capi/notice/list',
      method: 'GET'
    })
    const list = Array.isArray(res) ? res : []
    notices.value = list.map(n => ({
      ...n,
      isNew: !readSet.has(n.id)
    }))
  } catch (e) {
    notices.value = []
  } finally {
    loading.value = false
  }
}

const handleRead = async (id) => {
  readSet.add(id)
  const idx = notices.value.findIndex(n => n.id === id)
  if (idx >= 0) notices.value[idx].isNew = false
  try {
    await request({
      url: `/capi/notice/${id}/read`,
      method: 'POST'
    })
  } catch (e) {}
}

const handleBack = () => {
  uni.navigateBack()
}

onShow(() => {
  loadNotices()
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
  padding: 15px;
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

.list-item {
  background-color: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 15px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
  
  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
    
    .title-row {
      display: flex;
      align-items: center;
      
      .item-title {
        font-size: 16px;
        font-weight: bold;
        color: #333;
        margin-right: 8px;
      }
      
      .badge {
        background-color: #F56C6C;
        color: #fff;
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 8px;
      }
    }
    
    .item-time {
      font-size: 12px;
      color: #999;
      flex-shrink: 0;
      margin-top: 2px;
    }
  }
  
  .item-content {
    .content-text {
      font-size: 14px;
      color: #666;
      line-height: 1.6;
    }
  }
}
</style>