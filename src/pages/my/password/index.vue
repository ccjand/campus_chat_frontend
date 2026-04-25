<template>
  <view class="container">
    <view class="form-container">
      <view class="form-item" v-if="!isLoggedIn">
        <text class="label">账号</text>
        <u-input type="text" v-model="form.accountNumber" placeholder="请输入账号/学号" border="none"></u-input>
      </view>
      <view class="form-item" v-if="!isLoggedIn">
        <text class="label">原密码</text>
        <u-input type="password" v-model="form.oldPassword" placeholder="请输入原密码" border="none"></u-input>
      </view>
      <view class="form-item">
        <text class="label">新密码</text>
        <u-input type="password" v-model="form.password" placeholder="请输入新密码" border="none"></u-input>
      </view>
      <view class="form-item">
        <text class="label">确认密码</text>
        <u-input type="password" v-model="form.confirmPassword" placeholder="请再次输入新密码" border="none"></u-input>
      </view>
      
      <view class="submit-btn">
        <u-button type="primary" text="确认修改" color="#3C4A80" @click="handleUpdatePassword"></u-button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import request from '@/utils/request'

const form = ref({
  accountNumber: '',
  oldPassword: '',
  password: '',
  confirmPassword: ''
})

const isLoggedIn = ref(false)

const checkLoginStatus = () => {
  const token = uni.getStorageSync('token')
  
  // 仅依赖 token 判断登录状态，如果 token 存在且不为空字符串，则认为是已登录
  if (token && token !== '' && token !== 'undefined' && token !== 'null') {
    isLoggedIn.value = true
  } else {
    isLoggedIn.value = false
    form.value.accountNumber = ''
    form.value.oldPassword = ''
  }
}

onLoad(() => {
  checkLoginStatus()
})

onShow(() => {
  checkLoginStatus()
})

const handleUpdatePassword = async () => {
  if (!isLoggedIn.value) {
    if (!form.value.accountNumber) {
      uni.showToast({ title: '请输入账号', icon: 'none' })
      return
    }
    if (!form.value.oldPassword) {
      uni.showToast({ title: '请输入原密码', icon: 'none' })
      return
    }
  }
  
  if (!form.value.password) {
    uni.showToast({ title: '请输入新密码', icon: 'none' })
    return
  }
  if (form.value.password !== form.value.confirmPassword) {
    uni.showToast({ title: '两次密码不一致', icon: 'none' })
    return
  }

  uni.showLoading({ title: '提交中...' })
  
  try {
    const requestData = {
      password: form.value.password
    }
    
    // 无论是登录还是未登录，只要填写了旧密码和账号，都可以带过去
    // （虽然在已登录状态下前端不显示这两个输入框，但为了稳妥我们只在没登录时带上这些字段）
    if (!isLoggedIn.value) {
      requestData.accountNumber = form.value.accountNumber
      requestData.oldPassword = form.value.oldPassword
    }

    await request({
      url: '/capi/user/updatePassword', // 后端实现这个接口
      method: 'POST',
      data: requestData
    })
    
    uni.hideLoading()
    uni.showToast({ title: '成功修改', icon: 'success' })
    
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
    
  } catch (e) {
    uni.hideLoading()
    // request.js 内部会统一处理错误提示，所以这里不用重复弹失败的 toast
  }
}
</script>

<style lang="scss" scoped>
.container {
  min-height: 100vh;
  background-color: #F5F6FA;
  padding: 15px;
}

.form-container {
  background-color: #fff;
  border-radius: 12px;
  padding: 0 15px;
  
  .form-item {
    display: flex;
    align-items: center;
    padding: 15px 0;
    border-bottom: 1px solid #f5f5f5;
    
    .label {
      width: 80px;
      font-size: 15px;
      color: #333;
    }
    
    &:last-child {
      border-bottom: none;
    }
  }
}

.submit-btn {
  margin-top: 30px;
}
</style>