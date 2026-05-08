<template>
  <view class="container">
    <view class="custom-header">
      <view class="status-bar"></view>
      <view class="main-bar">
        <view class="left" @click="handleBack">
          <u-icon name="arrow-left" size="20" color="#333" bold></u-icon>
        </view>
        <text class="page-title">通知公告</text>
        <view class="right"></view>
      </view>
    </view>

    <view class="tab-bar">
      <view
        v-if="canPublish"
        class="tab-item"
        :class="{ active: activeTab === 'publish' }"
        @click="activeTab = 'publish'"
      >
        发布通知
      </view>
      <view
        class="tab-item"
        :class="{ active: activeTab === 'list' }"
        @click="activeTab = 'list'"
      >
        通知列表
      </view>
    </view>

    <scroll-view scroll-y class="content-scroll" v-if="activeTab === 'list'">
      <view v-if="loading" class="state">
        <text class="state-text">加载中...</text>
      </view>
      <view v-else-if="!notices || notices.length === 0" class="state">
        <text class="state-text">暂无通知</text>
      </view>
      <view class="list" v-else>
        <view
          class="list-item"
          :class="{ read: !item.isNew }"
          v-for="item in notices"
          :key="item.id"
          @click="handleRead(item.id)"
        >
          <view class="item-header">
            <text class="item-title">{{ item.title }}</text>
            <view class="badge unread" v-if="item.isNew">未读</view>
            <view class="badge read" v-else>已读</view>
          </view>
          <view class="item-content">
            <text class="content-text">{{ item.content }}</text>
          </view>
          <view class="item-footer">
            <text class="item-time">{{ formatTime(item.createTime) }}</text>
          </view>
        </view>
        <view class="pager-wrap">
          <u-button
            v-if="noticeHasMore"
            type="primary"
            size="small"
            :loading="noticeLoadingMore"
            text="加载更多"
            @click="loadMoreNotices"
          />
          <text v-else class="pager-end">没有更多了</text>
        </view>
      </view>
    </scroll-view>

    <view v-else class="publish-wrap">
      <view class="publish-card">
        <view class="field-label">标题</view>
        <u-input v-model="publishForm.title" placeholder="请输入通知标题" border="surround" clearable />
        <view class="field-label">内容</view>
        <u-textarea v-model="publishForm.content" placeholder="请输入通知内容" autoHeight border="surround" />
        <view class="field-label">发布范围</view>
        <picker mode="selector" :range="scopeTypeOptions" :value="scopeTypeIndex" @change="handleScopeTypeChange">
          <view class="picker-box">
            {{ scopeTypeOptions[scopeTypeIndex] }}
          </view>
        </picker>
        <view v-if="scopeTypeIndex === 1">
          <view class="field-label">选择班级</view>
          <picker mode="selector" :range="publishClassNameList" :value="publishClassIndex" @change="handlePublishClassChange">
            <view class="picker-box">
              {{ publishClassNameList[publishClassIndex] || '暂无可选班级' }}
            </view>
          </picker>
        </view>
        <u-button
          type="primary"
          text="发布"
          :loading="publishLoading"
          @click="submitPublish"
          :customStyle="{ marginTop: '16px' }"
        />
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import request from '@/utils/request'

const loading = ref(false)
const notices = ref([])
const noticePage = ref(1)
const noticePageSize = 20
const noticeHasMore = ref(true)
const noticeLoadingMore = ref(false)
const readSet = new Set()
const userInfo = ref({})
const activeTab = ref('list')
const publishLoading = ref(false)
const publishForm = ref({
  title: '',
  content: ''
})
const publishClasses = ref([])
const publishClassIndex = ref(0)

let removeNoticePushListener = null
const READ_STORE_KEY = 'notice_read_ids'

const formatTime = (arr) => {
  if (Array.isArray(arr)) {
    const [y, m, d, hh, mm] = arr
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }
  const text = String(arr || '')
  if (!text) return ''
  const t = text.replace('T', ' ').split('.')[0]
  if (t.length >= 16) return t.slice(0, 16)
  return t
}

const normalizeId = (id) => String(id ?? '')

const loadReadSet = () => {
  readSet.clear()
  try {
    const uid = String(userInfo.value?.uid || uni.getStorageSync('uid') || '0')
    const raw = uni.getStorageSync(`${READ_STORE_KEY}_${uid}`)
    const list = Array.isArray(raw) ? raw : []
    list.forEach((id) => {
      const key = normalizeId(id)
      if (key) readSet.add(key)
    })
  } catch (e) {}
}

const saveReadSet = () => {
  try {
    const uid = String(userInfo.value?.uid || uni.getStorageSync('uid') || '0')
    uni.setStorageSync(`${READ_STORE_KEY}_${uid}`, Array.from(readSet))
  } catch (e) {}
}

const normalizeRole = (role) => {
  const num = typeof role === 'number' ? role : Number(role)
  if (!Number.isNaN(num)) return num
  const text = String(role || '')
  const upperText = text.toUpperCase()
  if (upperText.includes('ROLE_ADMIN') || upperText === 'ADMIN') return 0
  if (upperText.includes('ROLE_STUDENT') || upperText === 'STUDENT') return 1
  if (upperText.includes('ROLE_TEACHER') || upperText === 'TEACHER') return 2
  if (upperText.includes('ROLE_COUNSELOR') || upperText === 'COUNSELOR') return 3
  if (upperText.includes('ROLE_STAFF') || upperText === 'STAFF') return 4
  if (text.includes('管理员')) return 0
  if (text.includes('学生')) return 1
  if (text.includes('教师')) return 2
  if (text.includes('辅导员')) return 3
  if (text.includes('院长')) return 4
  return 1
}

const canPublish = computed(() => normalizeRole(userInfo.value?.role) === 0)
const publishClassNameList = computed(() => publishClasses.value.map((c) => c.className || '未命名班级'))

const mergeNoticeList = (list, reset) => {
  const mapped = list.map(n => ({
    ...n,
    isNew: !readSet.has(normalizeId(n.id))
  }))
  if (reset) {
    notices.value = mapped
    return mapped.length
  }
  const seen = new Set(notices.value.map((x) => x.id))
  let added = 0
  mapped.forEach((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      notices.value.push(item)
      added += 1
    }
  })
  return added
}

const extractNoticeList = (res) => {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.records)) return res.records
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.rows)) return res.rows
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.content)) return res.content
  if (Array.isArray(res?.page?.records)) return res.page.records
  if (Array.isArray(res?.result?.records)) return res.result.records
  if (Array.isArray(res?.vo?.records)) return res.vo.records
  if (Array.isArray(res?.data)) return res.data
  return []
}

const loadNotices = async ({ reset = true } = {}) => {
  if (reset) {
    noticePage.value = 1
    noticeHasMore.value = true
    loading.value = true
  } else {
    if (!noticeHasMore.value || noticeLoadingMore.value) return
    noticeLoadingMore.value = true
  }
  try {
    const res = await request({
      url: '/capi/notice/list',
      method: 'GET',
      data: {
        page: noticePage.value,
        size: noticePageSize
      }
    })
    const list = extractNoticeList(res)
    const added = mergeNoticeList(list, reset)
    if (list.length < noticePageSize || (!reset && added === 0)) {
      noticeHasMore.value = false
    } else {
      noticePage.value += 1
    }
  } catch (e) {
    if (reset) notices.value = []
  } finally {
    if (reset) loading.value = false
    else noticeLoadingMore.value = false
  }
}

const loadPublishClasses = async () => {
  if (!canPublish.value) return
  try {
    const data = await request({
      url: '/capi/group/create/candidates',
      method: 'GET',
      hideErrorToast: true
    })
    const classes = Array.isArray(data?.classes) ? data.classes : []
    publishClasses.value = classes.map((c) => ({
      classId: c?.classId ?? c?.id,
      className: c?.className || c?.name || '未命名班级'
    })).filter((c) => c.classId != null)
    if (publishClassIndex.value >= publishClasses.value.length) publishClassIndex.value = 0
  } catch (e) {
    publishClasses.value = []
  }
}

const handlePublishClassChange = (e) => {
  const idx = Number(e?.detail?.value ?? 0)
  publishClassIndex.value = Number.isNaN(idx) ? 0 : idx
}

const handleScopeTypeChange = (e) => {
  const idx = Number(e?.detail?.value ?? 0)
  scopeTypeIndex.value = Number.isNaN(idx) ? 0 : idx
}

const scopeTypeIndex = ref(0)
const scopeTypeOptions = ['全量通知', '按班级']

const submitPublish = async () => {
  const title = String(publishForm.value.title || '').trim()
  const content = String(publishForm.value.content || '').trim()
  if (!title || !content) {
    uni.showToast({ title: '请填写标题和内容', icon: 'none' })
    return
  }

  let scopeType = 1
  let scopeData = {}

  if (scopeTypeIndex.value === 1) {
    const selectedClass = publishClasses.value[publishClassIndex.value]
    if (!selectedClass?.classId) {
      uni.showToast({ title: '请选择班级', icon: 'none' })
      return
    }
    scopeType = 3
    scopeData = { classId: selectedClass.classId, classIds: [selectedClass.classId] }
  }

  publishLoading.value = true
  try {
    await request({
      url: '/capi/notice/publish',
      method: 'POST',
      data: { title, content, scopeType, scopeData }
    })
    uni.showToast({ title: '发布成功', icon: 'success' })
    publishForm.value = { title: '', content: '' }
    scopeTypeIndex.value = 0
    await loadNotices({ reset: true })
  } catch (e) {
    const msg = String(e?.message || '')
    if (msg.includes('403')) {
      uni.showToast({ title: '无权限发布（请使用管理员账号）', icon: 'none' })
    } else {
      uni.showToast({ title: '发布失败，请稍后重试', icon: 'none' })
    }
  } finally {
    publishLoading.value = false
  }
}

const handleRead = async (id) => {
  const idKey = normalizeId(id)
  if (idKey) readSet.add(idKey)
  saveReadSet()
  const idx = notices.value.findIndex(n => n.id === id)
  if (idx >= 0) notices.value[idx].isNew = false
  try {
    await request({
      url: `/capi/notice/${id}/read`,
      method: 'POST'
    })
  } catch (e) {}
}

const loadMoreNotices = () => {
  loadNotices({ reset: false })
}

const handleBack = () => {
  uni.navigateBack()
}

onShow(() => {
  const info = uni.getStorageSync('userInfo')
  userInfo.value = info && typeof info === 'object' ? info : {}
  loadReadSet()
  if (!canPublish.value) activeTab.value = 'list'
  if (typeof removeNoticePushListener !== 'function') {
    const handler = () => { loadNotices({ reset: true }) }
    uni.$on('event:notice-pushed', handler)
    removeNoticePushListener = () => uni.$off('event:notice-pushed', handler)
  }
  loadPublishClasses()
  loadNotices({ reset: true })
})

onHide(() => {
  // ★ 离开通知页面后刷新红点（因为用户可能已经读了通知）
  try {
    request({ url: '/capi/badge', method: 'GET' }).then(badgeRes => {
      if (badgeRes) {
        let old = {}
        try { old = JSON.parse(uni.getStorageSync('globalBadgeInfo')) } catch(e) {}
        const updated = { ...old, ...badgeRes, unreadMsgCount: old.unreadMsgCount || 0 }
        uni.setStorageSync('globalBadgeInfo', JSON.stringify(updated))
        uni.$emit('badge:updated', updated)
      }
    })
  } catch(e) {}
})

onUnload(() => {
  if (typeof removeNoticePushListener === 'function') {
    removeNoticePushListener()
    removeNoticePushListener = null
  }
})
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
    
    .left, .right {
      width: 40px;
      display: flex;
      align-items: center;
    }
    
    .page-title {
      font-size: 18px;
      font-weight: bold;
      color: #333;
    }
  }
}

.content-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  box-sizing: border-box;
}

.tab-bar {
  display: flex;
  gap: 10px;
  padding: 10px 15px 0;
  background: #F8F9FA;
}

.tab-item {
  padding: 6px 14px;
  border-radius: 14px;
  background: #eef1f6;
  color: #666;
  font-size: 13px;
}

.tab-item.active {
  background: #3c9cff;
  color: #fff;
}

.publish-wrap {
  flex: 1;
  padding: 15px;
  box-sizing: border-box;
}

.publish-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-sizing: border-box;
}

.field-label {
  font-size: 13px;
  color: #666;
  margin: 10px 0 8px;
}

.picker-box {
  margin-top: 2px;
  min-height: 40px;
  border-radius: 8px;
  border: 1px solid #e5e5e5;
  padding: 10px 12px;
  font-size: 14px;
  color: #333;
  background: #fff;
}

.state {
  padding: 60px 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.state-text {
  font-size: 14px;
  color: #adb2bd;
}

.list-item {
  background-color: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid #f1f3f6;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  box-sizing: border-box;

  .item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;

    .item-title {
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .badge {
      font-size: 11px;
      line-height: 1;
      padding: 4px 8px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .badge.unread {
      background-color: #ffeded;
      color: #e5484d;
    }

    .badge.read {
      background-color: #f3f4f6;
      color: #9ca3af;
    }
  }

  .item-content {
    margin-bottom: 12px;
    
    .content-text {
      font-size: 14px;
      color: #6b7280;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  }
  
  .item-footer {
    display: flex;
    align-items: center;
    border-top: 1px solid #f9fafb;
    padding-top: 10px;
    
    .item-time {
      font-size: 12px;
      color: #9ca3af;
    }
  }
}

.list-item.read {
  background: #fafbfc;
  border-color: #f1f3f6;
}

.list-item.read .item-title {
  color: #6b7280 !important;
}

.pager-wrap {
  padding: 10px 0 16px;
  display: flex;
  justify-content: center;
}

.pager-end {
  font-size: 12px;
  color: #b2b8c2;
}
</style>
