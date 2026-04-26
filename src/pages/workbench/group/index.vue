<template>
  <view class="container">
    <view class="custom-header">
      <view class="status-bar"></view>
      <view class="main-bar">
        <view class="left" @click="handleBack">
          <u-icon name="arrow-left" size="20" color="#333" bold></u-icon>
        </view>
        <text class="page-title">群组</text>
        <view class="right" @click="openCreatePopup">
          <u-icon name="plus" size="20" color="#333" bold></u-icon>
        </view>
      </view>
    </view>

    <scroll-view scroll-y class="content-scroll">
      <view v-if="loading" class="state">
        <text class="state-text">加载中...</text>
      </view>
      <view v-else-if="!groups || groups.length === 0" class="state">
        <text class="state-text">暂无群组</text>
      </view>
      <view class="list" v-else>
        <view class="list-item" v-for="(item, index) in groups" :key="index" @click="openChat(item)">
            <view class="item-left">
              <u-avatar :src="getAvatarUrl(item.avatar)" size="40" shape="circle" style="margin-right: 12px;"></u-avatar>
              <view class="item-info">
              <text class="item-name">{{ item.name || '未知群组' }}</text>
              <text class="item-desc">群组会话</text>
            </view>
          </view>
          <u-icon name="arrow-right" color="#ccc" size="14"></u-icon>
        </view>
      </view>
    </scroll-view>

    <u-popup :show="showCreatePopup" mode="bottom" round="12" @close="closeCreatePopup">
      <view class="create-popup">
        <view class="popup-title">创建群组</view>

        <view class="form-item">
          <text class="label">群名称</text>
          <input v-model.trim="createForm.name" class="input" placeholder="请输入群组名称" maxlength="30" />
        </view>

        <view class="form-item" v-if="createMode === 'class' && classCandidates.length > 0">
          <text class="label">选择班级</text>
          <picker mode="selector" :range="classNameOptions" :value="selectedClassIndex" @change="handleClassChange">
            <view class="picker-value">
              {{ selectedClassName || '请选择班级' }}
            </view>
          </picker>
        </view>

        <view class="form-item">
          <text class="label">{{ createMode === 'class' ? '班级成员' : '好友' }}</text>
          <scroll-view scroll-y class="candidate-scroll">
            <view v-if="candidateUsers.length === 0" class="state-mini">
              <text class="state-mini-text">暂无可选成员</text>
            </view>
            <view class="candidate-item" v-for="item in candidateUsers" :key="String(item.uid)" @click="toggleMember(item.uid)">
              <u-icon :name="selectedMemberMap[String(item.uid)] ? 'checkbox-mark' : 'checkbox-mark'" :color="selectedMemberMap[String(item.uid)] ? '#2F80ED' : '#C8CDD4'" size="18"></u-icon>
              <u-avatar :src="getAvatarUrl(item.avatar)" size="32" style="margin: 0 10px;"></u-avatar>
              <view class="candidate-info">
                <text class="candidate-name">{{ item.name }}</text>
                <text class="candidate-desc">{{ item.accountNumber || '' }}</text>
              </view>
            </view>
          </scroll-view>
        </view>

        <view class="popup-actions">
          <view class="btn cancel" @click="closeCreatePopup">取消</view>
          <view class="btn confirm" @click="submitCreateGroup">创建</view>
        </view>
      </view>
    </u-popup>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import request from '@/utils/request'
import uAvatar from 'uview-plus/components/u-avatar/u-avatar.vue'
import uPopup from 'uview-plus/components/u-popup/u-popup.vue'
import { getAvatarUrl } from '@/utils/avatar'

const EVENT_REFRESH_RECENT = 'chat:refresh_recent'

const loading = ref(false)
const groups = ref([])
const showCreatePopup = ref(false)
const createMode = ref('friend')
const classCandidates = ref([])
const friendCandidates = ref([])
const selectedClassId = ref(null)
const selectedMemberMap = ref({})
const createForm = ref({
  name: ''
})

const selectedClass = computed(() => {
  const classId = selectedClassId.value
  if (classId == null) return null
  return classCandidates.value.find((c) => String(c.classId) === String(classId)) || null
})

const candidateUsers = computed(() => {
  if (createMode.value === 'class') {
    return Array.isArray(selectedClass.value?.users) ? selectedClass.value.users : []
  }
  return friendCandidates.value
})

const classNameOptions = computed(() => classCandidates.value.map((c) => c.className || '未命名班级'))
const selectedClassIndex = computed(() => {
  if (selectedClassId.value == null) return 0
  const idx = classCandidates.value.findIndex((c) => String(c.classId) === String(selectedClassId.value))
  return idx >= 0 ? idx : 0
})
const selectedClassName = computed(() => selectedClass.value?.className || '')

const loadGroups = async () => {
  loading.value = true
  try {
    const res = await request({
      url: '/capi/contact/list',
      method: 'GET'
    })
    const list = Array.isArray(res) ? res : []
    groups.value = list.filter(c => c.type === 2 || c.messageType === 'group')
  } catch (e) {
    groups.value = []
  } finally {
    loading.value = false
  }
}

const normalizeCandidateUser = (u) => {
  if (!u) return null
  return {
    uid: u.uid ?? u.id,
    name: u.name || u.fullName || u.accountNumber || '未知用户',
    avatar: u.avatar || '',
    accountNumber: u.accountNumber || ''
  }
}

const loadCreateCandidates = async () => {
  classCandidates.value = []
  friendCandidates.value = []
  selectedClassId.value = null
  selectedMemberMap.value = {}
  try {
    const data = await request({
      url: '/capi/group/create/candidates',
      method: 'GET'
    })
    createMode.value = data?.mode === 'class' ? 'class' : 'friend'
    const classes = Array.isArray(data?.classes) ? data.classes : []
    classCandidates.value = classes.map((cls) => ({
      classId: cls.classId,
      className: cls.className || '未命名班级',
      users: (Array.isArray(cls.users) ? cls.users : []).map(normalizeCandidateUser).filter(Boolean)
    }))
    if (classCandidates.value.length > 0) {
      selectedClassId.value = classCandidates.value[0].classId
    }
    friendCandidates.value = (Array.isArray(data?.friends) ? data.friends : []).map(normalizeCandidateUser).filter(Boolean)
  } catch (e) {
    const userInfo = uni.getStorageSync('userInfo') || {}
    const roleNum = Number(userInfo?.role)
    if (roleNum === 1) {
      createMode.value = 'friend'
      try {
        const friendList = await request({
          url: '/capi/friend/list',
          method: 'GET'
        })
        friendCandidates.value = (Array.isArray(friendList) ? friendList : []).map(normalizeCandidateUser).filter(Boolean)
      } catch (err) {
        friendCandidates.value = []
      }
    } else {
      uni.showToast({ title: '请先完成后端班级候选接口', icon: 'none' })
    }
  }
}

const openCreatePopup = async () => {
  createForm.value.name = ''
  await loadCreateCandidates()
  showCreatePopup.value = true
}

const closeCreatePopup = () => {
  showCreatePopup.value = false
}

const toggleMember = (uid) => {
  const key = String(uid)
  selectedMemberMap.value = {
    ...selectedMemberMap.value,
    [key]: !selectedMemberMap.value[key]
  }
}

const handleClassChange = (e) => {
  const idx = Number(e?.detail?.value ?? 0)
  const target = classCandidates.value[idx]
  if (target) {
    selectedClassId.value = target.classId
    selectedMemberMap.value = {}
  }
}

const submitCreateGroup = async () => {
  const name = String(createForm.value.name || '').trim()
  if (!name) {
    uni.showToast({ title: '请输入群名称', icon: 'none' })
    return
  }
  const memberIds = Object.keys(selectedMemberMap.value).filter((k) => selectedMemberMap.value[k]).map((k) => Number(k))
  if (memberIds.length === 0) {
    uni.showToast({ title: '请至少选择1名成员', icon: 'none' })
    return
  }
  const payload = {
    name,
    type: createMode.value === 'class' ? 1 : 2,
    classId: createMode.value === 'class' ? selectedClassId.value : null,
    memberIds
  }
  try {
    const created = await request({
      url: '/capi/group/create',
      method: 'POST',
      data: payload
    })
    uni.$emit(EVENT_REFRESH_RECENT, {
      source: 'group_create',
      roomId: created?.roomId ?? created?.id ?? null
    })
    uni.showToast({ title: '创建成功', icon: 'success' })
    closeCreatePopup()
    loadGroups()
  } catch (e) {
    uni.showToast({ title: '创建失败', icon: 'none' })
  }
}

const openChat = (contact) => {
  const roomId = contact?.roomId
  if (!roomId) return
  const title = contact?.name ? encodeURIComponent(String(contact.name)) : ''
  uni.navigateTo({
    url: `/pages/chat/index?roomId=${encodeURIComponent(String(roomId))}&type=group&title=${title}`
  })
}

const handleBack = () => {
  uni.navigateBack()
}

onShow(() => {
  loadGroups()
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
      justify-content: center;
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
}

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

.list {
  background-color: #fff;
  margin-top: 10px;
}

.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid #f9f9f9;
  
  .item-left {
    display: flex;
    align-items: center;
    
    .custom-avatar {
      width: 46px;
      height: 46px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
      
      .avatar-text {
        color: #fff;
        font-size: 18px;
        font-weight: 500;
      }
    }

    .item-info {
      display: flex;
      flex-direction: column;
      
      .item-name {
        font-size: 16px;
        color: #333;
        font-weight: bold;
        margin-bottom: 4px;
      }
      
      .item-desc {
        font-size: 12px;
        color: #999;
      }
    }
  }
  
  &:active {
    background-color: #f9f9f9;
  }
}

.create-popup {
  background-color: #fff;
  padding: 16px;

  .popup-title {
    font-size: 18px;
    font-weight: 600;
    color: #333;
    margin-bottom: 14px;
    text-align: center;
  }

  .form-item {
    margin-bottom: 12px;
  }

  .label {
    display: block;
    font-size: 14px;
    color: #333;
    margin-bottom: 8px;
  }

  .input, .picker-value {
    background-color: #F5F6FA;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 14px;
    color: #333;
  }

  .candidate-scroll {
    max-height: 260px;
    background: #F5F6FA;
    border-radius: 8px;
    padding: 8px;
  }

  .candidate-item {
    display: flex;
    align-items: center;
    padding: 8px 4px;
  }

  .candidate-info {
    display: flex;
    flex-direction: column;
  }

  .candidate-name {
    font-size: 14px;
    color: #333;
  }

  .candidate-desc {
    font-size: 12px;
    color: #999;
  }

  .state-mini {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px 0;
  }

  .state-mini-text {
    font-size: 12px;
    color: #999;
  }

  .popup-actions {
    display: flex;
    gap: 10px;
    margin-top: 14px;
  }

  .btn {
    flex: 1;
    text-align: center;
    padding: 10px 0;
    border-radius: 8px;
    font-size: 14px;
  }

  .cancel {
    background: #F5F6FA;
    color: #666;
  }

  .confirm {
    background: #2F80ED;
    color: #fff;
  }
}
</style>
