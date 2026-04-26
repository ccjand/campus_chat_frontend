<template>
  <view class="history-page">
    <top-nav title="请假历史" :show-avatar="false" :show-back="true" :show-default-icons="false"></top-nav>

    <scroll-view
      class="content"
      scroll-y
      refresher-enabled
      :refresher-triggered="refreshing"
      @refresherrefresh="handleRefresh"
    >
      <view class="list" v-if="items.length > 0">
        <view class="card" v-for="item in items" :key="item.id">
          <view class="row row-top">
            <text class="type">{{ leaveTypeText(item.type) }}</text>
            <text class="status" :class="statusClass(item.status)">{{ statusText(item.status) }}</text>
          </view>

          <view class="row">
            <text class="label">时间</text>
            <text class="value value-time">{{ formatRange(item.startTime, item.endTime) }}</text>
          </view>

          <view class="row">
            <text class="label">天数</text>
            <text class="value">{{ getDurationDays(item) + '天' }}</text>
          </view>

          <view class="row" v-if="item.approverName">
            <text class="label">审批人</text>
            <text class="value">{{ item.approverName }}</text>
          </view>

          <view class="row" v-if="item.reason">
            <text class="label">原因</text>
            <text class="value reason">{{ item.reason }}</text>
          </view>

          <view class="row" v-if="getApproveReason(item)">
            <text class="label">审批理由</text>
            <text class="value reason">{{ getApproveReason(item) }}</text>
          </view>

          <view class="row row-action" v-if="canRevoke(item)">
            <u-button
              size="mini"
              type="error"
              plain
              text="撤销申请"
              :loading="revokingId === item.id"
              @click="handleRevoke(item)"
            />
          </view>

        </view>
      </view>

      <view class="empty" v-else>
        <text class="empty-text">{{ loading ? '加载中...' : '暂无请假记录' }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import TopNav from '@/components/TopNav.vue'
import request from '@/utils/request'

const items = ref([])
const loading = ref(false)
const refreshing = ref(false)
const revokingId = ref(null)

const fetchHistory = async () => {
  loading.value = true
  try {
    const data = await request({
      url: '/capi/leave/mine',
      method: 'GET'
    })
    items.value = Array.isArray(data) ? data : []
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const handleRefresh = async () => {
  refreshing.value = true
  await fetchHistory()
}

onShow(() => {
  fetchHistory()
})

const leaveTypeText = (type) => {
  const num = typeof type === 'number' ? type : Number(type)
  if (num === 1) return '病假'
  if (num === 2) return '事假'
  if (num === 3) return '其他'
  return '请假'
}

const statusText = (status) => {
  const num = typeof status === 'number' ? status : Number(status)
  if (num === 0) return '待审批'
  if (num === 1) return '已通过'
  if (num === 2) return '已驳回'
  if (num === 3) return '已撤销'
  return '未知状态'
}

const statusClass = (status) => {
  const num = typeof status === 'number' ? status : Number(status)
  if (num === 1) return 'pass'
  if (num === 2) return 'reject'
  if (num === 3) return 'cancel'
  return 'pending'
}

const pad2 = (n) => String(n).padStart(2, '0')

const parseDate = (raw) => {
  if (raw == null || raw === '') return null
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
  if (typeof raw === 'number') {
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const text = String(raw).trim()
  if (!text) return null
  const d = new Date(text)
  if (!Number.isNaN(d.getTime())) return d
  const d2 = new Date(text.replace(/-/g, '/'))
  return Number.isNaN(d2.getTime()) ? null : d2
}

const formatTime = (raw) => {
  const d = parseDate(raw)
  if (!d) return ''
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const mm = pad2(d.getMinutes())
  return `${y}-${m}-${day} ${hh}:${mm}`
}

const formatRange = (startMs, endMs) => {
  const s = formatTime(startMs)
  const e = formatTime(endMs)
  if (!s && !e) return '-'
  if (!e) return s
  if (!s) return e
  return `${s} ~ ${e}`
}

const getDurationDays = (item) => {
  if (!item) return 0
  const start = parseDate(item.startTime)
  const end = parseDate(item.endTime)
  if (!start || !end) return 0
  const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
  if (!Number.isFinite(diffHours) || diffHours <= 0) return 0
  return Math.max(1, Math.ceil(diffHours / 24))
}

const getApproveReason = (item) => {
  if (!item) return ''
  const text = item.approveNote ?? item.approve_note ?? item.approverComment ?? item.note ?? ''
  return String(text).trim()
}

const canRevoke = (item) => {
  const num = typeof item?.status === 'number' ? item.status : Number(item?.status)
  return num === 0
}

const handleRevoke = (item) => {
  if (!item?.id || revokingId.value != null) return
  uni.showModal({
    title: '撤销请假',
    content: '确认撤销该请假申请吗？',
    success: async (res) => {
      if (!res.confirm) return
      try {
        revokingId.value = item.id
        uni.showLoading({ title: '撤销中...' })
        await request({
          url: `/capi/leave/revoke?leaveId=${item.id}`,
          method: 'POST'
        })
        uni.showToast({ title: '已撤销', icon: 'success' })
        await fetchHistory()
      } catch (e) {
        // request.js 已统一处理提示
      } finally {
        uni.hideLoading()
        revokingId.value = null
      }
    }
  })
}
</script>

<style lang="scss" scoped>
.history-page {
  min-height: 100vh;
  background-color: #F3F3F3;
}

.content {
  height: calc(100vh - 44px - var(--status-bar-height));
  padding: 12px 15px 20px;
  box-sizing: border-box;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card {
  background-color: #fff;
  border-radius: 16px;
  padding: 14px 14px 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 6px 0;
}

.row-action {
  justify-content: flex-end;
  padding-top: 8px;
}

.row-top {
  padding-top: 0;
  align-items: center;
}

.type {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background-color: #f5f5f5;
  color: #666;
}

.status.pass {
  background-color: rgba(76, 175, 80, 0.12);
  color: #2e7d32;
}

.status.reject {
  background-color: rgba(244, 67, 54, 0.12);
  color: #c62828;
}

.status.cancel {
  background-color: rgba(158, 158, 158, 0.14);
  color: #616161;
}

.status.pending {
  background-color: rgba(255, 152, 0, 0.14);
  color: #ef6c00;
}

.label {
  font-size: 13px;
  color: #999;
  width: 80px;
  flex-shrink: 0;
}

.value {
  font-size: 13px;
  color: #333;
  flex: 1;
  text-align: right;
  line-height: 1.4;
}

.value-time {
  font-size: 12px;
  color: #666;
}

.value.reason {
  white-space: pre-wrap;
}

.empty {
  padding-top: 40px;
  display: flex;
  justify-content: center;
}

.empty-text {
  font-size: 14px;
  color: #999;
}
</style>
