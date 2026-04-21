<template>
  <view class="workbench-page">
    <view class="custom-header">
      <view class="status-bar"></view>
      <view class="main-bar">
        <text class="page-title">工作台</text>
      </view>
    </view>
    
    <scroll-view scroll-y class="content-scroll">
      <view class="content">
        <view class="section-title">常用功能</view>
        <view class="grid-container">
          <view class="grid-item" @click="navigateTo('/pages/workbench/checkin/index')">
            <view class="icon-wrapper checkin">
              <u-icon name="map-fill" size="28" color="#fff"></u-icon>
            </view>
            <text class="grid-text">课堂签到</text>
          </view>

          <view class="grid-item" @click="navigateTo('/pages/workbench/leave/index')">
            <view class="icon-wrapper leave">
              <u-icon name="calendar-fill" size="28" color="#fff"></u-icon>
            </view>
            <text class="grid-text">请假申请</text>
          </view>

          <view class="grid-item" @click="navigateTo('/pages/workbench/leave/history')">
            <view class="icon-wrapper history">
              <u-icon name="clock-fill" size="28" color="#fff"></u-icon>
            </view>
            <text class="grid-text">请假记录</text>
          </view>
          
          <view class="grid-item" @click="navigateTo('/pages/workbench/notice/index')">
            <view class="icon-wrapper notice">
              <u-icon name="bell-fill" size="28" color="#fff"></u-icon>
            </view>
            <text class="grid-text">通知公告</text>
          </view>

          <view class="grid-item" @click="navigateTo('/pages/workbench/exam/index')">
            <view class="icon-wrapper exam">
              <u-icon name="edit-pen-fill" size="28" color="#fff"></u-icon>
            </view>
            <text class="grid-text">考试安排</text>
          </view>
        </view>


      </view>
    </scroll-view>
    
    <bottom-nav ref="bottomNavRef" current="workbench" />
  </view>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import BottomNav from '@/components/BottomNav.vue'

const bottomNavRef = ref(null)

const navigateTo = (url) => {
  uni.navigateTo({
    url: url
  })
}

const showToast = (title) => {
  uni.showToast({ title, icon: 'none' })
}

onShow(() => {
  nextTick(() => {
    if (bottomNavRef.value?.loadBadgeInfo) {
      bottomNavRef.value.loadBadgeInfo()
    }
  })
})
</script>

<style lang="scss" scoped>
.workbench-page {
  min-height: 100vh;
  background-color: #F5F6FA;
  display: flex;
  flex-direction: column;
  
  .custom-header {
    background-color: #fff;
    padding-bottom: 0;
    position: relative;

    .status-bar {
      height: var(--status-bar-height);
      background-color: #fff;
    }

    .main-bar {
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #fff;
      
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

  .content {
    padding: 15px;
    padding-bottom: 80px; // Space for bottom nav
    
    .section-title {
      font-size: 14px;
      color: #666;
      margin-bottom: 12px;
      margin-top: 10px;
      padding-left: 4px;
      
      &:first-child {
        margin-top: 5px;
      }
    }
    
    .grid-container {
      display: flex;
      flex-wrap: wrap;
      background-color: #fff;
      border-radius: 12px;
      padding: 20px 10px;
      
      .grid-item {
        width: 33.33%;
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: 24px;
        
        .icon-wrapper {
          width: 54px;
          height: 54px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
          
          &.checkin {
            background: linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%);
          }

          &.leave {
            background: linear-gradient(135deg, #F472B6 0%, #F43F5E 100%);
          }
          
          &.history {
            background: linear-gradient(135deg, #38BDF8 0%, #0EA5E9 100%);
          }
          
          &.notice {
            background: linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%);
          }
          
          &.exam {
            background: linear-gradient(135deg, #C084FC 0%, #D946EF 100%);
          }
        }
        
        .grid-text {
          font-size: 13px;
          color: #333;
        }
      }
    }
    
    .shortcut-list {
      background-color: #fff;
      border-radius: 12px;
      overflow: hidden;
      
      .shortcut-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #f9f9f9;
        
        &:last-child {
          border-bottom: none;
        }
        
        &:active {
          background-color: #f9f9f9;
        }
        
        .item-info {
          display: flex;
          flex-direction: column;
          
          .item-title {
            font-size: 15px;
            color: #333;
            font-weight: 500;
            margin-bottom: 6px;
          }
          
          .item-desc {
            font-size: 12px;
            color: #999;
          }
        }
      }
    }
  }
}
</style>
