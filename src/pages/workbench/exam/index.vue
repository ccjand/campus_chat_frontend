<template>
  <view class="exam-page">
    <top-nav title="考试安排" :show-avatar="false" :show-back="true" :show-default-icons="false"></top-nav>

    <view class="tab-bar">
      <view
        v-if="canPublish"
        class="tab-item"
        :class="{ active: activeTab === 'publish' }"
        @click="activeTab = 'publish'"
      >
        发布考试
      </view>
      <view
        class="tab-item"
        :class="{ active: activeTab === 'list' }"
        @click="activeTab = 'list'"
      >
        考试列表
      </view>
    </view>

    <view class="content" v-if="activeTab === 'list'">
      <view class="state" v-if="loading">
        <text class="state-text">加载中...</text>
      </view>
      <view class="state" v-else-if="examList.length === 0">
        <text class="state-text">暂无考试安排</text>
      </view>
      <view class="exam-list" v-else>
        <view class="exam-item" v-for="(exam, index) in examList" :key="exam.id || index">
          <view class="exam-header">
            <text class="course-name">{{ exam.name || exam.course || '未命名考试' }}</text>
          </view>

          <view class="exam-info">
            <view class="info-row">
              <u-icon name="clock" size="16" color="#666"></u-icon>
              <text class="info-text">{{ formatExamTime(exam) }}</text>
            </view>
            <view class="info-row">
              <u-icon name="map" size="16" color="#666"></u-icon>
              <text class="info-text">{{ exam.location || '-' }}</text>
            </view>
            <view class="info-row">
              <u-icon name="calendar" size="16" color="#666"></u-icon>
              <text class="info-text">时长：{{ exam.durationMinutes || '-' }} 分钟</text>
            </view>
          </view>
        </view>
        <view class="pager-wrap">
          <u-button
            v-if="examHasMore"
            type="primary"
            size="small"
            :loading="examLoadingMore"
            text="加载更多"
            @click="loadMoreExams"
          />
          <text v-else class="pager-end">没有更多了</text>
        </view>
      </view>
    </view>

    <view class="content" v-else>
      <view class="publish-card">
        <view class="field-label">考试名称</view>
        <u-input v-model="publishForm.name" placeholder="请输入考试名称" border="surround" clearable />
        <view class="field-label">选择班级</view>
        <picker mode="selector" :range="publishClassNameList" :value="publishClassIndex" @change="handlePublishClassChange">
          <view class="picker-box">
            {{ publishClassNameList[publishClassIndex] || '暂无可选班级' }}
          </view>
        </picker>
        <view class="field-label">考试时间</view>
        <view class="form-row" @click="openDatePicker">
          <view class="value-container picker-box" style="display: flex; justify-content: space-between; align-items: center;">
            <text class="value" :style="{ color: publishForm.examTime ? '#333' : '#999' }">
              {{ publishForm.examTime || '请选择考试时间' }}
            </text>
            <u-icon name="arrow-right" size="16" color="#999"></u-icon>
          </view>
        </view>
        <u-datetime-picker
          :show="showDatePicker"
          v-model="pickerValue"
          mode="datetime"
          @confirm="confirmDate"
          @cancel="showDatePicker = false"
        ></u-datetime-picker>
        <view class="field-label">考试地点</view>
        <u-input v-model="publishForm.location" placeholder="请输入考试地点" border="surround" clearable />
        <view class="field-label">时长(分钟)</view>
        <u-input v-model="publishForm.durationMinutes" type="number" placeholder="例如：120" border="surround" clearable />
        <u-button type="primary" text="发布" :loading="publishLoading" @click="submitPublish" />
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import TopNav from '@/components/TopNav.vue'
import request from '@/utils/request'

const loading = ref(false)
const publishLoading = ref(false)
const examList = ref([])
const examPage = ref(1)
const examPageSize = 20
const examHasMore = ref(true)
const examLoadingMore = ref(false)
const userInfo = ref({})
const activeTab = ref('list')
const publishForm = ref({
  name: '',
  examTime: '',
  location: '',
  durationMinutes: ''
})
const publishClasses = ref([])
const publishClassIndex = ref(0)
let removeExamPushListener = null

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

const showDatePicker = ref(false)
const pickerValue = ref(Number(new Date()))

const openDatePicker = () => {
  if (publishForm.value.examTime) {
    pickerValue.value = new Date(publishForm.value.examTime.replace(/-/g, '/')).getTime()
  } else {
    pickerValue.value = Number(new Date())
  }
  showDatePicker.value = true
}

const confirmDate = (e) => {
  const d = new Date(e.value)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const sec = String(d.getSeconds()).padStart(2, '0')
  publishForm.value.examTime = `${y}-${m}-${day} ${h}:${min}:${sec}`
  showDatePicker.value = false
}

const pad2 = (n) => String(n).padStart(2, '0')

const formatDateTime = (raw) => {
  if (!raw) return '-'
  if (Array.isArray(raw)) {
    const [y, m, d, hh = 0, mm = 0] = raw
    return `${y}-${pad2(m)}-${pad2(d)} ${pad2(hh)}:${pad2(mm)}`
  }
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

const formatExamTime = (exam) => {
  if (exam?.time) return exam.time
  return formatDateTime(exam?.examTime)
}

const mergeExamList = (list, reset) => {
  if (reset) {
    examList.value = list
    return list.length
  }
  const seen = new Set(examList.value.map((x) => x.id))
  let added = 0
  list.forEach((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      examList.value.push(item)
      added += 1
    }
  })
  return added
}

const extractExamList = (res) => {
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

const loadExamList = async ({ reset = true } = {}) => {
  if (reset) {
    examPage.value = 1
    examHasMore.value = true
    loading.value = true
  } else {
    if (!examHasMore.value || examLoadingMore.value) return
    examLoadingMore.value = true
  }
  try {
    const endpoint = canPublish.value ? '/capi/exam/list' : '/capi/exam/mine'
    const data = await request({
      url: endpoint,
      method: 'GET',
      data: {
        page: examPage.value,
        size: examPageSize
      },
      hideErrorToast: canPublish.value
    })
    const list = extractExamList(data)
    const added = mergeExamList(list, reset)
    if (list.length < examPageSize || (!reset && added === 0)) {
      examHasMore.value = false
    } else {
      examPage.value += 1
    }
  } catch (e) {
    if (!reset) return
    if (canPublish.value) {
      const cache = uni.getStorageSync('admin_exam_list_cache')
      examList.value = Array.isArray(cache) ? cache : []
    } else {
      examList.value = []
    }
  } finally {
    if (reset) loading.value = false
    else examLoadingMore.value = false
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
    publishClasses.value = classes
      .map((c) => ({
        classId: c?.classId ?? c?.id,
        className: c?.className || c?.name || '未命名班级',
        users: Array.isArray(c?.users) ? c.users : []
      }))
      .filter((c) => c.classId != null)
    if (publishClassIndex.value >= publishClasses.value.length) publishClassIndex.value = 0
  } catch (e) {
    publishClasses.value = []
  }
}

const handlePublishClassChange = (e) => {
  const idx = Number(e?.detail?.value ?? 0)
  publishClassIndex.value = Number.isNaN(idx) ? 0 : idx
}

const isStudentRole = (role) => {
  const num = typeof role === 'number' ? role : Number(role)
  if (!Number.isNaN(num)) return num === 1
  return String(role || '').includes('学生')
}

const getUserId = (u) => {
  const raw = u?.uid ?? u?.userId ?? u?.id
  const n = Number(raw)
  return Number.isNaN(n) ? null : n
}

const submitPublish = async () => {
  const name = String(publishForm.value.name || '').trim()
  const examTimeStr = String(publishForm.value.examTime || '').trim()
  const examTime = examTimeStr.replace(' ', 'T')
  const location = String(publishForm.value.location || '').trim()
  const durationMinutes = Number(publishForm.value.durationMinutes)
  const selectedClass = publishClasses.value[publishClassIndex.value]
  if (!name || !examTime || !location || !durationMinutes) {
    uni.showToast({ title: '请完整填写考试信息', icon: 'none' })
    return
  }
  if (!selectedClass?.classId) {
    uni.showToast({ title: '请选择班级', icon: 'none' })
    return
  }
  publishLoading.value = true
  try {
    const created = await request({
      url: '/capi/exam/create',
      method: 'POST',
      data: {
        name,
        examTime,
        location,
        durationMinutes,
        classId: selectedClass.classId
      }
    })
    uni.showToast({ title: '发布成功', icon: 'success' })
    const nextList = [created, ...examList.value].filter(Boolean)
    examList.value = nextList
    uni.setStorageSync('admin_exam_list_cache', nextList)
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

const loadMoreExams = () => {
  loadExamList({ reset: false })
}

onShow(() => {
  const info = uni.getStorageSync('userInfo')
  userInfo.value = info && typeof info === 'object' ? info : {}
  if (!canPublish.value) activeTab.value = 'list'
  if (typeof removeExamPushListener !== 'function') {
    const handler = () => { loadExamList({ reset: true }) }
    uni.$on('event:exam-pushed', handler)
    removeExamPushListener = () => uni.$off('event:exam-pushed', handler)
  }
  loadPublishClasses()
  loadExamList({ reset: true })
})

onHide(() => {
  if (typeof removeExamPushListener === 'function') {
    removeExamPushListener()
    removeExamPushListener = null
  }
})

onUnload(() => {
  if (typeof removeExamPushListener === 'function') {
    removeExamPushListener()
    removeExamPushListener = null
  }
})
</script>

<style lang="scss" scoped>
.exam-page {
  min-height: 100vh;
  background-color: #F3F3F3;
  display: flex;
  flex-direction: column;

  .tab-bar {
    display: flex;
    gap: 10px;
    padding: 10px 15px 0;
  }

  .tab-item {
    padding: 6px 14px;
    border-radius: 14px;
    background: #e9edf3;
    color: #666;
    font-size: 13px;
  }

  .tab-item.active {
    background: #3c9cff;
    color: #fff;
  }

  .content {
    flex: 1;
    padding: 15px;
    box-sizing: border-box;

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

    .exam-item {
      background-color: #fff;
      border-radius: 12px;
      padding: 15px;
      margin-bottom: 15px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
      box-sizing: border-box;
      
      .exam-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #f5f5f5;
        
        .course-name {
          font-size: 18px;
          font-weight: bold;
          color: #333;
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-right: 10px;
        }
        
        .status-tag {
          background-color: #E3F2FD;
          color: #2196F3;
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 4px;
        }
      }
      
      .exam-info {
        .info-row {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
          
          &:last-child {
            margin-bottom: 0;
          }
          
          .info-text {
            font-size: 14px;
            color: #666;
            margin-left: 8px;
          }
        }
      }
    }
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

  .pager-wrap {
    padding: 6px 0 14px;
    display: flex;
    justify-content: center;
  }

  .pager-end {
    font-size: 12px;
    color: #999;
  }
}
</style>
