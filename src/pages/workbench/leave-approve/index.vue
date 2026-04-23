<template>
  <view class="leave-approve-page">
    <top-nav title="请假审批" />
    
    <view class="content">
      <scroll-view scroll-y class="record-scroll" v-if="recordList.length > 0">
        <view class="record-card" v-for="(item, index) in recordList" :key="index">
          <view class="record-header">
            <view class="title-group">
              <text class="student-name">{{ item.applicantName || '学生' }}</text>
            </view>
            <text class="status-tag" :class="getStatusClass(item.status)">{{ getStatusText(item.status) }}</text>
          </view>
          
          <view class="record-body">
            <view class="info-row">
              <text class="info-label">请假类型:</text>
              <text class="info-value">{{ getTypeString(item.type) }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">开始时间:</text>
              <text class="info-value">{{ formatTime(item.startTime) }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">结束时间:</text>
              <text class="info-value">{{ formatTime(item.endTime) }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">请假事由:</text>
              <text class="info-value reason-text">{{ item.reason }}</text>
            </view>
          </view>
          
          <view class="action-footer" v-if="item.status === 0">
            <u-button text="拒绝" type="error" size="small" plain @click="openApproveModal(item, false)" customStyle="margin-right: 10px; width: 80px;"></u-button>
            <u-button text="同意" type="primary" size="small" @click="openApproveModal(item, true)" customStyle="margin-left: 0; width: 80px;"></u-button>
          </view>
        </view>
      </scroll-view>
      
      <view class="empty-state" v-else>
        <u-empty mode="data" text="暂无待审批记录" icon="http://cdn.uviewui.com/uview/empty/data.png"></u-empty>
      </view>
    </view>
    
    <u-modal :show="showApproveModal" :title="isApproving ? '同意请假' : '拒绝请假'" :showCancelButton="true" @confirm="submitApprove" @cancel="closeApproveModal">
      <view class="modal-content">
        <textarea v-model="approveNote" class="approve-input" :placeholder="isApproving ? '请输入同意理由（选填）' : '请输入拒绝理由（必填）'"></textarea>
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

const recordList = ref([])
const showApproveModal = ref(false)
const currentRecord = ref(null)
const isApproving = ref(false)
const approveNote = ref('')

const loadRecords = async () => {
  try {
    uni.showLoading({ title: '加载中...' })
    const list = await request({ url: `/capi/leave/pending`, method: 'GET' })
    recordList.value = Array.isArray(list) ? list : []
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
  if (!isApproving.value && !approveNote.value) {
    uni.showToast({ title: '请输入拒绝理由', icon: 'none' })
    return
  }
  
  try {
    uni.showLoading({ title: '提交中...' })
    const url = isApproving.value ? '/capi/leave/approve' : '/capi/leave/reject'
    await request({
      url,
      method: 'POST',
      data: {
        leaveId: currentRecord.value.id,
        note: approveNote.value
      }
    })
    uni.hideLoading()
    uni.showToast({ title: '审批成功', icon: 'success' })
    closeApproveModal()
    loadRecords()
  } catch (e) {
    uni.hideLoading()
  }
}

const getTypeString = (type) => {
  switch (type) {
    case 1: return '病假'
    case 2: return '事假'
    case 3: return '其他'
    default: return '未知'
  }
}

const getStatusText = (status) => {
  switch (status) {
    case 0: return '待审批'
    case 1: return '已通过'
    case 2: return '已拒绝'
    case 3: return '已撤销'
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
  return dayjs(timeStr).format('YYYY-MM-DD HH:mm')
}

onShow(() => {
  loadRecords()
})
</script>

<style lang="scss" scoped>
.leave-approve-page {
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