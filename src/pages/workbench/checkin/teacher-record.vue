<template>
  <view class="teacher-record-container">
    <view class="header">
      <view class="back-btn" @click="goBack">
        <u-icon name="arrow-left" size="20" color="#333"></u-icon>
      </view>
      <text class="title">签到名单</text>
      <view class="right-placeholder"></view>
    </view>

    <view class="stats-row" v-if="students.length > 0">
      <view class="stat-item">
        <text class="num total">{{ students.length }}</text>
        <text class="label">总人数</text>
      </view>
      <view class="stat-item">
        <text class="num present">{{ stats.present }}</text>
        <text class="label">已签到</text>
      </view>
      <view class="stat-item">
        <text class="num leave">{{ stats.leave }}</text>
        <text class="label">已请假</text>
      </view>
      <view class="stat-item">
        <text class="num absent">{{ stats.absent }}</text>
        <text class="label">未签到</text>
      </view>
    </view>

    <scroll-view scroll-y class="list-container">
      <view class="student-item" v-for="s in students" :key="s.studentId">
        <view class="info">
          <text class="name">{{ s.studentName || '未知姓名' }}</text>
          <text class="no">{{ s.studentNo || '无学号' }}</text>
        </view>
        <view class="status-box">
          <text class="status-text present" v-if="s.status === 1">已签到</text>
          <text class="status-text leave" v-else-if="s.status === 2">已请假</text>
          <text class="status-text absent" v-else>未签到</text>
        </view>
      </view>
      <view class="empty" v-if="students.length === 0 && !loading">
        <u-empty mode="data" text="暂无学生名单数据"></u-empty>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import request from '@/utils/request'

const sessionId = ref('')
const students = ref([])
const loading = ref(true)

const stats = computed(() => {
  let present = 0
  let leave = 0
  let absent = 0
  students.value.forEach(s => {
    if (s.status === 1) present++
    else if (s.status === 2) leave++
    else absent++
  })
  return { present, leave, absent }
})

const loadData = async () => {
  if (!sessionId.value) return
  loading.value = true
  try {
    uni.showLoading({ title: '加载中...' })
    const res = await request({
      url: `/capi/checkin/teacher/session/${sessionId.value}/students`,
      method: 'GET'
    })
    students.value = Array.isArray(res) ? res : []
  } catch (e) {
    console.error('Failed to load students', e)
  } finally {
    loading.value = false
    uni.hideLoading()
  }
}

onLoad((options) => {
  if (options.sessionId) {
    sessionId.value = options.sessionId
    loadData()
  }
})

const goBack = () => {
  uni.navigateBack()
}
</script>

<style lang="scss" scoped>
.teacher-record-container {
  min-height: 100vh;
  background-color: #F5F6FA;
  display: flex;
  flex-direction: column;
}

.header {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 15px;
  background: #fff;
  padding-top: var(--status-bar-height, 44px);
  
  .back-btn { padding: 10px; margin-left: -10px; }
  .title { font-size: 16px; font-weight: 500; color: #333; }
  .right-placeholder { width: 40px; }
}

.stats-row {
  display: flex;
  background: #fff;
  padding: 15px 0;
  margin-bottom: 10px;
  
  .stat-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    border-right: 1px solid #f0f0f0;
    
    &:last-child { border-right: none; }
    
    .num { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
    .num.total { color: #333; }
    .num.present { color: #52C41A; }
    .num.leave { color: #FAAD14; }
    .num.absent { color: #FF4D4F; }
    
    .label { font-size: 12px; color: #666; }
  }
}

.list-container {
  flex: 1;
  padding: 15px;
}

.student-item {
  background: #fff;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
  
  .info {
    display: flex;
    flex-direction: column;
    
    .name { font-size: 15px; color: #333; font-weight: 500; margin-bottom: 4px; }
    .no { font-size: 12px; color: #999; }
  }
  
  .status-box {
    .status-text {
      font-size: 14px;
      font-weight: 500;
      
      &.present { color: #52C41A; } // 绿色
      &.leave { color: #FAAD14; }   // 橙色
      &.absent { 
        color: #FF4D4F;            // 红色，更显眼
        font-weight: bold;
      }
    }
  }
}

.empty {
  padding-top: 50px;
}
</style>