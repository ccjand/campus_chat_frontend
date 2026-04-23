<template>
  <view class="supplement-approve-page">
    <top-nav title="补签审批" :show-avatar="false" :show-back="true" :show-default-icons="false"></top-nav>
    
    <u-tabs
      :list="tabs"
      :current="currentTab"
      @change="onTabChange"
      lineWidth="40"
      lineColor="#007aff"
      :activeStyle="{ color: '#007aff', fontWeight: 'bold' }"
    ></u-tabs>

    <view class="content">
      <scroll-view scroll-y class="record-scroll" v-if="recordList.length > 0">
        <view class="record-card" v-for="(item, index) in recordList" :key="index">
          <view class="record-header">
            <view class="title-group">
              <text class="student-name">{{ item.studentName }}</text>
              <text class="student-no">({{ item.studentNo }})</text>
            </view>
            <text class="status-tag" :class="getStatusClass(item.status)">{{ getStatusText(item.status) }}</text>
          </view>
          
          <view class="record-body">
            <view class="info-row">
              <text class="info-label">签到任务：</text>
              <text class="info-value">{{ item.sessionTitle || '签到#' + item.sessionId }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">申请理由：</text>
              <text class="info-value reason-text">{{ item.reason || '无' }}</text>
            </view>
            <view class="info-row">
              <text class="info-time">{{ formatTime(item.createTime) }}</text>
            </view>
            
            <view class="info-row" v-if="item.status !== 0">
              <text class="info-label">审批意见：</text>
              <text class="info-value">{{ item.approveNote || '无' }}</text>
            </view>
          </view>
          
          <view class="action-footer" v-if="item.status === 0">
            <u-button size="small" type="error" text="拒绝" customStyle="margin-right: 10px; width: 80px" @click="openApproveModal(item, false)"></u-button>
            <u-button size="small" type="success" text="通过" customStyle="width: 80px" @click="openApproveModal(item, true)"></u-button>
          </view>
        </view>
      </scroll-view>
      
      <view class="empty-state" v-else>
        <u-empty mode="list" text="暂无补签申请"></u-empty>
      </view>
    </view>

    <!-- 审批弹窗 -->
    <u-modal 
      :show="showApproveModal" 
      :title="isApproving ? '通过申请' : '拒绝申请'" 
      showCancelButton 
      @confirm="submitApprove" 
      @cancel="closeApproveModal"
    >
      <view class="modal-content">
        <textarea 
          class="approve-input" 
          placeholder="请输入审批意见(可选)" 
          v-model="approveNote"
        ></textarea>
      </view>
    </u-modal>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import TopNav from '@/components/TopNav.vue'
import request from '@/utils/request'
import dayjs from 'dayjs'

const tabs = ref([{ name: '待审批' }, { name: '已处理' }])
const currentTab = ref(0)
const recordList = ref([])

const showApproveModal = ref(false)
const currentRecord = ref(null)
const isApproving = ref(false)
const approveNote = ref('')

const onTabChange = (index) => {
  currentTab.value = index.index
  loadRecords()
}

const loadRecords = async () => {
  try {
    uni.showLoading({ title: '加载中...' })
    // all=false 表示只看待处理的，all=true 表示看所有的（我们再自己在前端按状态过滤）
    const isAll = currentTab.value === 1
    const list = await request({ url: `/capi/checkin/teacher/supplements?all=${isAll}`, method: 'GET' })
    const rawList = Array.isArray(list) ? list : []
    
    if (currentTab.value === 0) {
      // 待审批
      recordList.value = rawList.filter(item => item.status === 0)
    } else {
      // 已处理 (通过 或 拒绝)
      recordList.value = rawList.filter(item => item.status === 1 || item.status === 2)
    }
  } catch (e) {
    console.error('Failed to load records', e)
  } finally {
    uni.hideLoading()
  }
}

const openApproveModal = (record, approve) => {
  currentRecord.value = record
  isApproving.value = approve
  approveNote.value = ''
  showApproveModal.value = true
}

const closeApproveModal = () => {
  showApproveModal.value = false
  currentRecord.value = null
  approveNote.value = ''
}

const submitApprove = async () => {
  if (!currentRecord.value) return
  
  try {
    uni.showLoading({ title: '提交中...' })
    await request({
      url: `/capi/checkin/teacher/supplement/${currentRecord.value.id}/approve`,
      method: 'POST',
      data: {
        approved: isApproving.value,
        note: approveNote.value
      }
    })
    uni.hideLoading()
    uni.showToast({ title: '审批成功', icon: 'success' })
    closeApproveModal()
    loadRecords() // 刷新列表
  } catch (e) {
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

onShow(() => {
  loadRecords()
})
</script>

<style lang="scss" scoped>
.supplement-approve-page {
  min-height: 100vh;
  background-color: #F3F3F3;
  
  .content {
    padding: 10px;
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
        
        .title-group {
          display: flex;
          align-items: baseline;
          
          .student-name {
            font-size: 16px;
            font-weight: 500;
            color: #333;
          }
          
          .student-no {
            font-size: 13px;
            color: #666;
            margin-left: 6px;
          }
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
            
            &.reason-text {
              color: #ff5722;
            }
          }
          
          .info-time {
            color: #999;
            font-size: 12px;
            margin-top: 4px;
          }
        }
      }
      
      .action-footer {
        display: flex;
        justify-content: flex-end;
        margin-top: 15px;
        padding-top: 10px;
        border-top: 1px dashed #eee;
      }
    }
    
    .empty-state {
      margin-top: 50px;
    }
  }
  
  .modal-content {
    width: 100%;
    
    .approve-input {
      width: 100%;
      height: 80px;
      background-color: #f8f8f8;
      padding: 10px;
      border-radius: 4px;
      font-size: 14px;
      box-sizing: border-box;
    }
  }
}
</style>