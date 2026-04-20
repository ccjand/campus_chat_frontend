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
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import request from '@/utils/request'

const props = defineProps({
  current: {
    type: String,
    default: 'message'
  }
})

const badgeInfo = ref({
  unreadMsgCount: 0,
  contactDot: false,
  workbenchDot: false,
  mineDot: false
})

const badgeText = computed(() => {
  const n = Number(badgeInfo.value.unreadMsgCount || 0)
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
    if (res) {
      badgeInfo.value = res
    }
  } catch (e) {
    // console.warn('Load badge info error', e)
  }
}

onShow(() => {
  loadBadgeInfo()
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
