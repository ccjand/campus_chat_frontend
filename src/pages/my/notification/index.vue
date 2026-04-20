<template>
  <view class="container">
    <view class="custom-header">
      <view class="status-bar"></view>
      <view class="main-bar">
        <view class="left" @click="handleBack">
          <u-icon name="arrow-left" size="20" color="#333" bold></u-icon>
        </view>
        <text class="page-title">通知设置</text>
        <view class="right"></view>
      </view>
    </view>

    <view class="setting-list">
      <view class="setting-group">
        <view class="setting-item">
          <view class="item-left">
            <text class="item-title">接收新消息通知</text>
          </view>
          <switch :checked="receiveNotice" @change="e => handleChange('receiveNotice', e.detail.value)" color="#4C8DFF" />
        </view>
        <view class="setting-item">
          <view class="item-left">
            <text class="item-title">声音</text>
          </view>
          <switch :checked="sound" @change="e => handleChange('sound', e.detail.value)" color="#4C8DFF" />
        </view>
        <view class="setting-item">
          <view class="item-left">
            <text class="item-title">震动</text>
          </view>
          <switch :checked="vibrate" @change="e => handleChange('vibrate', e.detail.value)" color="#4C8DFF" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'

const receiveNotice = ref(true)
const sound = ref(true)
const vibrate = ref(true)

const loadSettings = () => {
  receiveNotice.value = uni.getStorageSync('setting_receiveNotice') !== false
  sound.value = uni.getStorageSync('setting_sound') !== false
  vibrate.value = uni.getStorageSync('setting_vibrate') !== false
}

const handleChange = (key, value) => {
  uni.setStorageSync(`setting_${key}`, value)
  if (key === 'receiveNotice') receiveNotice.value = value
  if (key === 'sound') sound.value = value
  if (key === 'vibrate') vibrate.value = value
}

const handleBack = () => {
  uni.navigateBack()
}

onShow(() => {
  loadSettings()
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

.setting-list {
  padding: 15px;
  
  .setting-group {
    background-color: #fff;
    border-radius: 12px;
    padding: 0 15px;
    
    .setting-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
      border-bottom: 1px solid #f9f9f9;
      
      &:last-child {
        border-bottom: none;
      }
      
      .item-left {
        .item-title {
          font-size: 16px;
          color: #333;
        }
      }
    }
  }
}
</style>