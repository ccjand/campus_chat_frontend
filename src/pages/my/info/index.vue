<template>
  <view class="container">
    <view class="info-list">
      <view class="list-item">
        <text class="label">头像</text>
        <u-avatar :src="userInfo.avatar" size="40"></u-avatar>
      </view>
      <view class="list-item">
        <text class="label">姓名</text>
        <text class="value">{{ userInfo.name }}</text>
      </view>
      <view class="list-item">
        <text class="label">{{ getRoleText(userInfo.role).includes('学生') ? '学号' : '工号' }}</text>
        <text class="value">{{ userInfo.accountNumber || userInfo.userNo || userInfo.id || '暂无' }}</text>
      </view>
      <view class="list-item" v-if="getRoleText(userInfo.role) !== '管理员'">
        <text class="label">学院</text>
        <text class="value">{{ userInfo.departmentName || userInfo.department || '暂无' }}</text>
      </view>
      <view class="list-item">
        <text class="label">职责</text>
        <text class="value">{{ getRoleText(userInfo.role) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'

const userInfo = ref({
  uid: '',
  token: '',
  name: '',
  avatar: '',
  role: '',
  department: '',
  id: ''
})

const getRoleText = (role) => {
  if (typeof role === 'string') return role
  if (role === 1) return '学生'
  if (role === 2) return '教师'
  if (role === 3) return '辅导员'
  return '未知角色'
}

onShow(() => {
  loadUserInfoFromCache()
})

const loadUserInfoFromCache = () => {
  const cache = uni.getStorageSync('userInfo') || {}
  userInfo.value = {
    ...userInfo.value,
    ...cache,
    uid: cache?.uid ?? uni.getStorageSync('uid') ?? userInfo.value.uid,
    token: cache?.token ?? uni.getStorageSync('token') ?? userInfo.value.token
  }
}
</script>

<style lang="scss" scoped>
.container {
  min-height: 100vh;
  background-color: #F5F6FA;
  padding-top: 10px;
}

.info-list {
  background-color: #fff;
  padding: 0 15px;
  
  .list-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 0;
    border-bottom: 1px solid #f5f5f5;
    
    &:last-child {
      border-bottom: none;
    }
    
    .label {
      font-size: 15px;
      color: #333;
    }
    
    .value {
      font-size: 15px;
      color: #666;
    }
  }
}
</style>
