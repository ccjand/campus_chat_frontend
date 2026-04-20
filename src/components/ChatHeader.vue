<template>
  <view class="chat-header">
    <view class="status-bar"></view>
    <view class="content">
      <view class="left" @click="handleBack">
        <u-icon name="arrow-left" size="20" color="#333" bold></u-icon>
      </view>
      <view class="center">
        <text class="title">{{ title }}</text>
        <text v-if="count" class="count">({{ count }})</text>
      </view>
      <view class="right"></view>
    </view>
  </view>
</template>

<script setup>
import uIcon from 'uview-plus/components/u-icon/u-icon.vue'

const props = defineProps({
  title: {
    type: String,
    default: ''
  },
  count: {
    type: [Number, String],
    default: ''
  },
  type: {
    type: String,
    default: 'single' // single or group
  }
})

const emit = defineEmits(['back'])

const handleBack = () => {
  emit('back')
}
</script>

<style lang="scss" scoped>
.chat-header {
  background-color: #fff;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  
  .status-bar {
    height: var(--status-bar-height);
  }
  
  .content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 15px;
    height: 44px;
    
    .left {
      display: flex;
      align-items: center;
      height: 100%;
      width: 40px;
    }
    
    .center {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      
      .title {
        font-size: 16px;
        font-weight: bold;
        color: #000;
      }
      
      .count {
        font-size: 16px;
        font-weight: bold;
        color: #000;
        margin-left: 4px;
      }
    }
    
    .right {
      width: 40px;
    }
  }
}
</style>
