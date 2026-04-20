<template>
  <view class="container">
    <view class="custom-header">
      <view class="status-bar"></view>
      <view class="main-bar">
        <view class="left" @click="handleBack">
          <u-icon name="arrow-left" size="20" color="#333" bold></u-icon>
        </view>
        <view class="search-box">
          <u-icon name="search" color="#999" size="16"></u-icon>
          <input 
            class="search-input" 
            v-model="keyword" 
            placeholder="搜索账号或ID" 
            placeholder-style="color:#999;font-size:14px;"
            :focus="true"
            confirm-type="search"
            @confirm="handleSearch"
          />
          <u-icon v-if="keyword" name="close-circle-fill" color="#ccc" size="16" @click="keyword = ''" style="padding: 4px;"></u-icon>
        </view>
        <view class="right" @click="handleSearch">
          <text class="search-btn">搜索</text>
        </view>
      </view>
    </view>

    <view class="content">
      <view v-if="loading" class="state">
        <text class="state-text">搜索中...</text>
      </view>
      <view v-else-if="hasSearched && (!userResults || userResults.length === 0)" class="state">
        <text class="state-text">未找到相关用户</text>
      </view>
      
      <!-- User Detail Card List -->
      <view v-if="userResults && userResults.length > 0" class="user-card" v-for="userResult in userResults" :key="userResult.uid">
        <view class="card-header">
          <view class="avatar-wrapper">
            <view class="custom-avatar-text" :style="{ backgroundColor: getAvatarBgColor(userResult.name) }">
              <text>{{ getAvatarText(userResult.name) }}</text>
            </view>
          </view>
          <view class="info">
            <text class="name">{{ userResult.name || '未知用户' }}</text>
            <text class="desc">账号: {{ userResult.accountNumber || userResult.uid }}</text>
            <text class="desc">{{ userResult.departmentName || '未知学院' }}</text>
          </view>
        </view>

        <view class="card-actions">
          <template v-if="!userResult.isFriend">
            <view class="action-btn primary" @click="handleAddFriend(userResult)">
              <text>添加好友</text>
            </view>
          </template>
          <template v-else>
            <view class="action-btn" @click="handleSendMessage(userResult)">
              <text>发消息</text>
            </view>
            <view class="action-btn danger" @click="handleBlock(userResult)">
              <text>拉黑好友</text>
            </view>
            <view class="action-btn danger" @click="handleRemoveFriend(userResult)">
              <text>删除好友</text>
            </view>
          </template>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import request from '@/utils/request'

const keyword = ref('')
const loading = ref(false)
const hasSearched = ref(false)
const userResults = ref([])

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

const handleSearch = async () => {
  if (!keyword.value.trim()) {
    uni.showToast({ title: '请输入搜索关键字', icon: 'none' })
    return
  }
  loading.value = true
  hasSearched.value = true
  userResults.value = []
  try {
    const res = await request({
      url: '/capi/user/search',
      method: 'GET',
      data: { keyword: keyword.value.trim() }
    })
    if (res && Array.isArray(res)) {
      userResults.value = res
    }
  } catch (e) {
    // 未找到
  } finally {
    loading.value = false
  }
}

const handleAddFriend = (user) => {
  if (!user?.uid) return
  uni.showModal({
    title: '添加好友',
    content: '',
    editable: true,
    placeholderText: '请输入验证信息（选填）',
    success: async (res) => {
      if (res.confirm) {
        try {
          await request({
            url: '/capi/friend/request/send',
            method: 'POST',
            data: { 
              targetId: user.uid,
              reason: res.content || '请求添加你为好友'
            }
          })
          uni.showToast({ title: '好友申请已发送', icon: 'success' })
        } catch (e) {}
      }
    }
  })
}

const handleRemoveFriend = (user) => {
  uni.showModal({
    title: '提示',
    content: '确定要删除该好友吗？',
    success: async (res) => {
      if (res.confirm && user?.uid) {
        try {
          await request({
            url: '/capi/friend/remove',
            method: 'POST',
            data: { targetId: user.uid }
          })
          uni.showToast({ title: '已删除', icon: 'success' })
          user.isFriend = false
        } catch (e) {}
      }
    }
  })
}

const handleBlock = (user) => {
  uni.showModal({
    title: '提示',
    content: '确定要拉黑该好友吗？',
    success: async (res) => {
      if (res.confirm && user?.uid) {
        try {
          await request({
            url: '/capi/friend/block',
            method: 'POST',
            data: { targetId: user.uid }
          })
          uni.showToast({ title: '已拉黑', icon: 'success' })
          // 拉黑后可能不再视为好友，或者状态改变
          user.isFriend = false
        } catch (e) {}
      }
    }
  })
}

const handleSendMessage = async (user) => {
  if (!user?.uid) return
  try {
    // 获取或创建房间
    const room = await request({
      url: '/capi/contact/room/single',
      method: 'POST',
      data: { friendId: user.uid }
    })
    if (room && room.id) {
      const title = user.name ? encodeURIComponent(String(user.name)) : ''
      uni.navigateTo({
        url: `/pages/chat/index?roomId=${encodeURIComponent(String(room.id))}&type=single&title=${title}&receiverId=${user.uid}`
      })
    }
  } catch (e) {}
}

const handleBack = () => {
  uni.navigateBack()
}
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
    
    .left {
      width: 30px;
      display: flex;
      align-items: center;
    }
    
    .search-box {
      flex: 1;
      background-color: #F5F6FA;
      height: 32px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      padding: 0 12px;
      margin: 0 10px;
      
      .search-input {
        flex: 1;
        font-size: 14px;
        color: #333;
        margin-left: 6px;
      }
    }
    
    .right {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      
      .search-btn {
        font-size: 15px;
        color: #4C8DFF;
        font-weight: 500;
      }
    }
  }
}

.content {
  padding: 20px 15px;
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

.user-card {
  background-color: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  
  .card-header {
    display: flex;
    align-items: center;
    margin-bottom: 24px;
    
    .avatar-wrapper {
      margin-right: 16px;
      
      .custom-avatar-text {
        width: 60px;
        height: 60px;
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
    
    .info {
      display: flex;
      flex-direction: column;
      
      .name {
        font-size: 18px;
        font-weight: bold;
        color: #333;
        margin-bottom: 6px;
      }
      
      .desc {
        font-size: 13px;
        color: #888;
        margin-bottom: 2px;
      }
    }
  }
  
  .card-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    
    .action-btn {
      height: 44px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #F5F6FA;
      
      text {
        font-size: 15px;
        color: #333;
        font-weight: 500;
      }
      
      &.primary {
        background-color: #4C8DFF;
        text {
          color: #fff;
        }
      }
      
      &.danger {
        text {
          color: #E75D5D;
        }
      }
      
      &:active {
        opacity: 0.8;
      }
    }
  }
}
</style>