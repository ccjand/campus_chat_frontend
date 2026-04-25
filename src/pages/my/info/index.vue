<template>
  <view class="container">
    <view class="info-list">
      <view class="list-item clickable" @click="handleUploadAvatar">
        <text class="label">头像</text>
        <view class="value-container avatar-container">
          <u-avatar :src="realAvatar" size="40"></u-avatar>
          <u-icon name="arrow-right" color="#ccc" size="16"></u-icon>
        </view>
      </view>
      <view class="list-item">
        <text class="label">姓名</text>
        <view class="value-container">
          <input class="value-input" v-model="userInfo.name" placeholder="请输入姓名" />
          <u-icon name="edit-pen" color="#ccc" size="16"></u-icon>
        </view>
      </view>
      <view class="list-item disabled">
        <text class="label">{{ getRoleText(userInfo.role).includes('学生') ? '学号' : '工号' }}</text>
        <text class="value">{{ userInfo.accountNumber || userInfo.userNo || userInfo.id || '暂无' }}</text>
      </view>
      <view class="list-item disabled" v-if="getRoleText(userInfo.role) !== '管理员'">
        <text class="label">学院</text>
        <text class="value">{{ userInfo.departmentName || userInfo.department || '暂无' }}</text>
      </view>
      <view class="list-item disabled">
        <text class="label">职责</text>
        <text class="value">{{ getRoleText(userInfo.role) }}</text>
      </view>
    </view>

    <view class="submit-btn-container">
      <u-button type="primary" text="保存修改" color="#007aff" @click="handleSave"></u-button>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import uAvatar from 'uview-plus/components/u-avatar/u-avatar.vue'
import request from '@/utils/request'
import CONFIG from '@/config.js'
import { getAvatarUrl } from '@/utils/avatar'

const BASE_URL = CONFIG.API_BASE_URL

const userInfo = ref({
  uid: '',
  token: '',
  name: '',
  avatar: '',
  role: '',
  department: '',
  id: ''
})

const realAvatar = computed(() => getAvatarUrl(userInfo.value.avatar))

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

const handleUploadAvatar = () => {
  uni.chooseImage({
    count: 1,
    success: (res) => {
      const tempFilePath = res.tempFilePaths[0]
      const token = uni.getStorageSync('token')
      uni.showLoading({ title: '上传中...' })

      uni.uploadFile({
        url: BASE_URL + '/capi/file/upload',
        filePath: tempFilePath,
        name: 'file',
        header: {
          'Authorization': token ? `Bearer ${token}` : '',
          'terminalType': '4'
        },
        success: (uploadRes) => {
          uni.hideLoading()
          try {
            const data = JSON.parse(uploadRes.data)
            if (data.code === 0) {
              userInfo.value.avatar = data.data.filePath || data.data.url
              setTimeout(() => { uni.showToast({ title: '上传成功', icon: 'success' }) }, 50)
            } else {
              setTimeout(() => { uni.showToast({ title: '上传失败: ' + (data.msg || data.errMsg), icon: 'none' }) }, 50)
            }
          } catch (e) {
            setTimeout(() => { uni.showToast({ title: '上传响应解析失败', icon: 'none' }) }, 50)
          }
        },
        fail: () => {
          uni.hideLoading()
          setTimeout(() => { uni.showToast({ title: '上传出错', icon: 'none' }) }, 50)
        }
      })
    }
  })
}

const handleSave = async () => {
  if (!userInfo.value.name || !userInfo.value.name.trim()) {
    uni.showToast({ title: '姓名不能为空', icon: 'none' })
    return
  }

  try {
    uni.showLoading({ title: '保存中...' })
    
    // 乐观更新：先更新本地缓存，保证前端各处能立刻看到最新的头像和名字
    const cache = uni.getStorageSync('userInfo') || {}
    cache.name = userInfo.value.name.trim()
    cache.avatar = userInfo.value.avatar
    uni.setStorageSync('userInfo', cache)

    // 发起网络请求保存数据
    let isSuccess = true
    try {
      await request({
        url: '/capi/user/update', // 确保这个 URL 跟你后端实现的接口一致
        method: 'POST',
        data: {
          name: userInfo.value.name.trim(),
          avatar: userInfo.value.avatar
        },
        hideErrorToast: true // 屏蔽全局的报错提示，因为不需要提示失败
      })
    } catch (apiErr) {
      console.warn('Backend update failed.', apiErr)
      isSuccess = false
    }
    
    uni.hideLoading()
    if (isSuccess) {
      setTimeout(() => {
        uni.showToast({ title: '修改成功', icon: 'success' })
      }, 50)
    }
  } catch (e) {
    uni.hideLoading()
    // 失败不提示
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
    
    &.clickable {
      cursor: pointer;
    }
    
    &.disabled {
      .label, .value {
        color: #999;
      }
    }
    
    .label {
      font-size: 15px;
      color: #333;
      width: 80px;
    }
    
    .value {
      font-size: 15px;
      color: #666;
      flex: 1;
      text-align: right;
    }
    
    .value-container {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex: 1;
      
      .value-input {
        font-size: 15px;
        color: #333;
        text-align: right;
        margin-right: 5px;
        width: 100%;
      }
      
      &.avatar-container {
        :deep(.u-avatar) {
          margin-right: 5px;
        }
      }
    }
  }
}

.submit-btn-container {
  margin-top: 30px;
  padding: 0 15px;
}
</style>
