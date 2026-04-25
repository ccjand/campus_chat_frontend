<template>
  <view class="container">
    <view class="custom-header">
      <view class="status-bar"></view>
      <view class="main-bar">
        <text class="page-title">我的</text>
      </view>
    </view>
    
    <!-- Header Section -->
    <view class="header-section">
      <view class="user-info">
        <view class="avatar-wrapper">
          <u-avatar :src="realAvatar" size="60"></u-avatar>
        </view>
        <view class="info-content">
          <view class="name-row">
            <!-- For real name, we use the 'name' field from backend -->
            <text class="name">{{ userInfo.name || '暂无姓名' }}</text>
            <text class="role-badge">{{ getRoleText(userInfo.role) }}</text>
          </view>
          
          <view class="detail-row">
            <text class="detail-label">{{ getRoleText(userInfo.role).includes('学生') ? '学号：' : '工号：' }}</text>
            <text class="detail-value">{{ userInfo.accountNumber || userInfo.userNo || '暂无' }}</text>
          </view>
          
          <view class="detail-row" v-if="userInfo.role !== '管理员' && (userInfo.departmentName || userInfo.department)">
            <text class="detail-label">学院：</text>
            <text class="detail-value">{{ userInfo.departmentName || userInfo.department }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- Menu List -->
    <view class="menu-list">
      <!-- Group 1: Settings -->
      <view class="menu-group">
        <view class="menu-item" @click="handleNavigate('info')">
          <view class="item-left">
            <u-icon name="account-fill" color="#5A88A1" size="22"></u-icon>
            <text class="item-title">个人信息</text>
          </view>
          <u-icon name="arrow-right" color="#ccc" size="14"></u-icon>
        </view>

        <view class="menu-item" @click="handleNavigate('password')">
          <view class="item-left">
            <u-icon name="lock-fill" color="#A99564" size="22"></u-icon>
            <text class="item-title">账号与安全</text>
          </view>
          <u-icon name="arrow-right" color="#ccc" size="14"></u-icon>
        </view>

        <view class="menu-item" @click="handleNavigate('blacklist')">
          <view class="item-left">
            <u-icon name="minus-circle-fill" color="#E75D5D" size="22"></u-icon>
            <text class="item-title">黑名单管理</text>
          </view>
          <u-icon name="arrow-right" color="#ccc" size="14"></u-icon>
        </view>

        <view class="menu-item" @click="handleNavigate('notification')">
          <view class="item-left">
            <u-icon name="bell-fill" color="#A98A3C" size="22"></u-icon>
            <text class="item-title">通知设置</text>
          </view>
          <u-icon name="arrow-right" color="#ccc" size="14"></u-icon>
        </view>
      </view>

      <!-- Logout Button -->
      <view class="logout-btn" @click="handleLogout">
        <text>退出登录</text>
      </view>
    </view>

    <bottom-nav ref="bottomNavRef" current="my"></bottom-nav>
  </view>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import uIcon from 'uview-plus/components/u-icon/u-icon.vue'
import uAvatar from 'uview-plus/components/u-avatar/u-avatar.vue'
import BottomNav from '@/components/BottomNav.vue'
import request from '@/utils/request'
import imSocket from '@/utils/imSocket'
import { getAvatarUrl } from '@/utils/avatar'

const bottomNavRef = ref(null)
const userInfo = ref({})

const realAvatar = computed(() => getAvatarUrl(userInfo.value?.avatar))

const avatarText = computed(() => {
  const name = userInfo.value.name || ''
  if (!name) return 'U'
  // If the name is exactly 2 characters, display both.
  // If it's longer, display the last 2 characters (common in Chinese naming conventions for avatars)
  return name.length <= 2 ? name : name.slice(-2)
})

const getRoleText = (role) => {
  if (typeof role === 'string') return role
  if (role === 1) return '学生'
  if (role === 2) return '教师'
  if (role === 3) return '辅导员'
  return '未知角色'
}

onShow(() => {
  const info = uni.getStorageSync('userInfo')
  console.log('--- [DEBUG] userInfo in my/index.vue ---', info)
  if (info) {
    userInfo.value = info
  }
  nextTick(() => {
    if (bottomNavRef.value?.loadBadgeInfo) {
      bottomNavRef.value.loadBadgeInfo()
    }
  })
})

const handleNavigate = (path) => {
  if (path === 'info') {
    uni.navigateTo({ url: '/pages/my/info/index' })
  } else if (path === 'password') {
    uni.navigateTo({ url: '/pages/my/password/index' })
  } else if (path === 'blacklist') {
    uni.navigateTo({ url: '/pages/my/blacklist/index' })
  } else if (path === 'notification') {
    uni.navigateTo({ url: '/pages/my/notification/index' })
  }
}

const showToast = (title) => {
  uni.showToast({ title, icon: 'none' })
}

const handleLogout = () => {
  uni.showModal({
    title: '提示',
    content: '确定要退出登录吗？',
    success: async function (res) {
      if (res.confirm) {
        const cache = uni.getStorageSync('userInfo')
        const uid = cache?.uid ?? userInfo.value?.uid
        const header = {
          ...(uid != null ? { uid: String(uid) } : {})
        }

        try {
          await request({
            url: '/capi/auth/logout',
            method: 'POST',
            header
          })
        } catch (e) {
          console.warn('Logout api failed:', e)
        }

        imSocket.disconnect()

        // 清除本地缓存
        uni.removeStorageSync('token')
        uni.removeStorageSync('uid')
        uni.removeStorageSync('userInfo')
        
        // 跳转回登录页
        uni.reLaunch({ url: '/pages/login/index' })
      }
    }
  })
}
</script>
<style lang="scss" scoped>
.container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #F8F9FA;
  padding-bottom: 80px; // Space for bottom nav
}

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

.header-section {
  background-color: #4C8DFF;
  padding: 30px 20px;
  border-bottom-left-radius: 20px;
  border-bottom-right-radius: 20px;
  color: #fff;
  
  .user-info {
    display: flex;
    align-items: center;
    
    .avatar-wrapper {
      position: relative;
      margin-right: 15px;
      
      .custom-avatar-text {
        width: 64px;
        height: 64px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        
        text {
          color: #fff;
          font-size: 24px;
          font-weight: 500;
        }
      }
    }
    
    .info-content {
      flex: 1;
      
      .name-row {
        display: flex;
        align-items: center;
        margin-bottom: 12px;
        
        .name {
          font-size: 22px;
          font-weight: 600;
          margin-right: 10px;
        }

        .role-badge {
          background-color: rgba(255, 255, 255, 0.2);
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }
      }
      
      .detail-row {
        font-size: 13px;
        opacity: 0.9;
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        
        .detail-label {
          opacity: 0.8;
          white-space: nowrap;
        }
        
        .detail-value {
          flex: 1;
          word-break: break-all;
        }
      }
    }
  }
}

.menu-list {
  padding: 15px;
  
  .menu-group {
    background-color: #fff;
    border-radius: 12px;
    margin-bottom: 15px;
    padding: 0 15px;
    
    .menu-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
      border-bottom: 1px solid #f9f9f9;
      
      &:last-child {
        border-bottom: none;
      }
      
      &:active {
        background-color: #f9f9f9;
      }
      
      .item-left {
        display: flex;
        align-items: center;
        
        .item-title {
          font-size: 15px;
          color: #333;
          margin-left: 12px;
        }
      }
    }
  }
  
  .logout-btn {
    background-color: #fff;
    border-radius: 12px;
    padding: 16px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 20px;
    
    &:active {
      background-color: #f9f9f9;
    }
    
    text {
      color: #E75D5D;
      font-size: 16px;
      font-weight: 500;
    }
  }
}
</style>
