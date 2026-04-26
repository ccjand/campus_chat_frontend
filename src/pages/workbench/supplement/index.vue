<template>
  <view class="supplement-page">
    <top-nav title="补签申请" :show-avatar="false" :show-back="true" :show-default-icons="false"></top-nav>
    
    <u-tabs
      :list="tabs"
      :current="currentTab"
      @change="onTabChange"
      lineWidth="40"
      lineColor="#007aff"
      :activeStyle="{ color: '#007aff', fontWeight: 'bold' }"
    ></u-tabs>

    <!-- Tab 1: 申请补签 -->
    <view class="content" v-if="currentTab === 0">
      <view class="form-card">
        <!-- Class Selection -->
        <view class="form-row" @click="showClassSelect = true">
          <text class="label">补签任务</text>
          <view class="value-container">
            <text class="value" :class="{ placeholder: !selectedClass }">{{ selectedClass || '请选择未签到任务' }}</text>
            <u-icon name="arrow-right" size="16" color="#999"></u-icon>
          </view>
        </view>
      </view>
      
      <view class="divider"></view>
      
      <!-- Reason -->
      <view class="form-card reason-card">
        <text class="label">补签理由</text>
        <textarea 
          class="reason-input" 
          placeholder="请输入" 
          placeholder-style="color: #999"
          v-model="reason"
        ></textarea>
      </view>
      
      <!-- Submit Button -->
      <view class="submit-btn-container">
        <u-button type="primary" text="提交申请" color="#007aff" @click="submit"></u-button>
      </view>
    </view>
    
    <!-- Tab 2: 补签记录 -->
    <view class="content record-content" v-if="currentTab === 1">
      <scroll-view scroll-y class="record-scroll" v-if="recordList.length > 0">
        <view class="record-card" v-for="(item, index) in recordList" :key="index">
          <view class="record-header">
            <text class="session-title">签到任务ID: {{ item.sessionId }}</text>
            <text class="status-tag" :class="getStatusClass(item.status)">{{ getStatusText(item.status) }}</text>
          </view>
          <view class="record-body">
            <view class="info-row">
              <text class="info-label">申请理由：</text>
              <text class="info-value">{{ item.reason || '无' }}</text>
            </view>
            <view class="info-row" v-if="item.status !== 0">
              <text class="info-label">审批意见：</text>
              <text class="info-value">{{ item.approveNote || '无' }}</text>
            </view>
            <view class="info-row">
              <text class="info-time">{{ formatTime(item.createTime) }}</text>
            </view>
          </view>
        </view>
      </scroll-view>
      
      <view class="empty-state" v-else>
        <u-empty mode="list" text="暂无补签记录"></u-empty>
      </view>
    </view>

    <!-- Class Picker -->
    <u-picker 
      :show="showClassSelect" 
      :columns="classColumns" 
      @confirm="confirmClass" 
      @cancel="showClassSelect = false"
    ></u-picker>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import TopNav from '@/components/TopNav.vue'
import request from '@/utils/request'
import dayjs from 'dayjs'

const tabs = ref([{ name: '申请补签' }, { name: '补签记录' }])
const currentTab = ref(0)

const selectedClass = ref('')
const selectedSessionId = ref('')
const reason = ref('')
const showClassSelect = ref(false)

const classColumns = ref([[]])
const sessionList = ref([])

const recordList = ref([])

const onTabChange = (index) => {
  currentTab.value = index.index
  if (currentTab.value === 1) {
    loadRecords()
  }
}

const loadRecords = async () => {
  try {
    uni.showLoading({ title: '加载中...' })
    // 注意：这里需要后端补充一个获取学生补签记录的接口，暂定为 GET /capi/checkin/student/supplements
    const list = await request({ url: '/capi/checkin/student/supplements', method: 'GET' })
    recordList.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('Failed to load records', e)
  } finally {
    uni.hideLoading()
  }
}

const getStatusText = (status) => {
  switch (status) {
    case 0: return '待审批'
    case 1: return '已通过'
    case 2: return '已拒绝'
    default: return '未知状态'
  }
}

const getStatusClass = (status) => {
  switch (status) {
    case 0: return 'status-pending'
    case 1: return 'status-approved'
    case 2: return 'status-rejected'
    default: return ''
  }
}

const formatTime = (timeStr) => {
  if (!timeStr) return ''
  return dayjs(timeStr).format('YYYY-MM-DD HH:mm:ss')
}

onShow(async () => {
  try {
    const list = await request({ url: '/capi/checkin/student/history', method: 'GET' })
    const records = []
    if (Array.isArray(list)) {
      list.forEach(course => {
        if (Array.isArray(course.records)) {
          course.records.forEach(r => {
            if (!r.checkedIn) {
              records.push({
                label: `${course.courseName || course.courseId} - ${r.sessionTitle || '签到#' + r.sessionId}`,
                sessionId: r.sessionId
              })
            }
          })
        }
      })
    }
    sessionList.value = records
    if (records.length > 0) {
      classColumns.value = [records.map(r => r.label)]
    } else {
      classColumns.value = [['暂无未签到记录']]
    }
  } catch (e) {
    console.error('Failed to load history', e)
  }
})

const confirmClass = (e) => {
  const label = e.value[0]
  if (label === '暂无未签到记录') {
    showClassSelect.value = false
    return
  }
  const found = sessionList.value.find(r => r.label === label)
  if (found) {
    selectedClass.value = label
    selectedSessionId.value = found.sessionId
  }
  showClassSelect.value = false
}

const submit = async () => {
  if (!selectedSessionId.value) {
    uni.showToast({
      title: '请选择补签的签到任务',
      icon: 'none'
    })
    return
  }
  
  if (!reason.value) {
    uni.showToast({
      title: '请输入补签理由',
      icon: 'none'
    })
    return
  }
  
  try {
    uni.showLoading({ title: '提交中...' })
    await request({
      url: '/capi/checkin/student/supplement',
      method: 'POST',
      data: {
        sessionId: selectedSessionId.value,
        reason: reason.value
      }
    })
    uni.hideLoading()
    uni.showToast({
      title: '提交成功',
      icon: 'success'
    })
    
    // 不再执行 navigateBack，保留页面当前的状态和输入内容
  } catch (e) {
    uni.hideLoading()
  }
}
</script>

<style lang="scss" scoped>
.supplement-page {
  min-height: 100vh;
  background-color: #F3F3F3;
  
  .content {
    padding-top: 10px;
    
    .form-card {
      background-color: #fff;
      padding: 0 15px;
      
      &.reason-card {
        padding: 15px;
        margin-top: 10px;
      }
      
      .form-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px 0;
        
        .label {
          font-size: 16px;
          color: #333;
          font-weight: 500;
        }
        
        .value-container {
          display: flex;
          align-items: center;
          
          .value {
            font-size: 16px;
            color: #333;
            margin-right: 8px;
            
            &.placeholder {
              color: #999;
            }
          }
        }
      }
      
      .label {
        font-size: 16px;
        color: #333;
        font-weight: 500;
        margin-bottom: 10px;
        display: block;
      }
      
      .reason-input {
        width: 100%;
        height: 100px;
        font-size: 16px;
        line-height: 1.5;
      }
    }
    
    .divider {
      height: 10px;
      background-color: #F3F3F3;
    }
    
    .submit-btn-container {
      margin-top: 30px;
      padding: 0 15px;
    }
    
    &.record-content {
      padding: 10px;
      background-color: #F3F3F3;
      min-height: calc(100vh - 100px);
      
      .record-scroll {
        height: 100%;
      }
      
      .record-card {
        background-color: #fff;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 10px;
        
        .record-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          border-bottom: 1px solid #eee;
          padding-bottom: 10px;
          
          .session-title {
            font-size: 16px;
            font-weight: 500;
            color: #333;
          }
          
          .status-tag {
            font-size: 12px;
            padding: 2px 8px;
            border-radius: 4px;
            
            &.status-pending {
              background-color: #FFF3E0;
              color: #FF9800;
            }
            &.status-approved {
              background-color: #E8F5E9;
              color: #4CAF50;
            }
            &.status-rejected {
              background-color: #FFEBEE;
              color: #F44336;
            }
          }
        }
        
        .record-body {
          .info-row {
            margin-bottom: 6px;
            display: flex;
            
            .info-label {
              color: #666;
              font-size: 14px;
              width: 70px;
            }
            
            .info-value {
              color: #333;
              font-size: 14px;
              flex: 1;
            }
            
            .info-time {
              color: #999;
              font-size: 12px;
              margin-top: 4px;
            }
          }
        }
      }
      
      .empty-state {
        margin-top: 50px;
      }
    }
  }
}
</style>