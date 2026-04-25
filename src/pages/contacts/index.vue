<template>
  <view class="container">
    <view class="custom-header">
      <view class="status-bar"></view>
      <view class="main-bar">
        <text class="page-title">通讯录</text>
      </view>
    </view>
    
    <!-- Search Bar -->
    <view class="search-container">
      <view class="search-box" @click="goToSearch">
        <u-icon name="search" color="#999" size="18"></u-icon>
        <text class="search-placeholder">搜索用户</text>
      </view>
    </view>

    <!-- Content List -->
    <scroll-view scroll-y class="content-scroll">
      <view class="action-list">
        <view class="action-item" @click="goToRequests">
          <view class="item-left">
            <view class="icon-wrapper bg-orange">
              <u-icon name="account-fill" color="#fff" size="24"></u-icon>
            </view>
            <text class="item-text">新朋友</text>
          </view>
          <view class="item-right">
            <view class="badge" v-if="unreadRequestCount > 0">{{ unreadRequestCount }}</view>
            <u-icon name="arrow-right" color="#ccc" size="14"></u-icon>
          </view>
        </view>
        
        <view class="action-item" @click="goToGroup">
          <view class="item-left">
            <view class="icon-wrapper bg-green">
              <u-icon name="chat-fill" color="#fff" size="24"></u-icon>
            </view>
            <text class="item-text">群组</text>
          </view>
          <u-icon name="arrow-right" color="#ccc" size="14"></u-icon>
        </view>
      </view>

      <!-- Contacts -->
      <view class="contact-list">
        <view class="list-title" v-if="flatContacts && flatContacts.length > 0">好友列表</view>
        
        <view v-if="loading && (!flatContacts || flatContacts.length === 0)" class="state">
          <text class="state-text">加载中...</text>
        </view>
        <view v-else-if="!flatContacts || flatContacts.length === 0" class="state">
          <text class="state-text">暂无联系人</text>
        </view>
        <view v-else>
          <!-- 直接渲染扁平化的联系人列表，不再进行双层 v-for 循环嵌套 -->
          <view class="list-item" v-for="(contact, contactIndex) in flatContacts" :key="'friend_' + contactIndex" @click="openFriendCard(contact)">
            <view class="item-left">
              <u-avatar :src="contact.avatar" size="40" style="margin-right: 12px;"></u-avatar>
              <view class="item-info">
                <text class="item-name">{{ contact.name }}</text>
                <text class="item-desc" v-if="contact.desc">{{ contact.desc }}</text>
              </view>
            </view>
            <u-icon name="arrow-right" color="#ccc" size="14"></u-icon>
          </view>
        </view>
      </view>

      <!-- Footer -->
      <view class="list-footer" v-if="totalContacts > 0">
        <text>共{{ totalContacts }}人</text>
      </view>
    </scroll-view>
    
    <bottom-nav ref="bottomNavRef" current="contacts"></bottom-nav>

    <!-- Friend Detail Card -->
    <u-popup :show="showFriendCard" mode="center" round="16" :customStyle="{ width: '80%' }" @close="closeFriendCard">
      <view class="friend-card" v-if="selectedFriend">
        <view class="card-header">
          <u-avatar :src="selectedFriend.avatar" size="60"></u-avatar>
          <view class="card-info">
            <text class="card-name">{{ selectedFriend.name }}</text>
            <text class="card-account">账号：{{ selectedFriend.accountNumber || selectedFriend.name }}</text>
            <text class="card-dept">{{ selectedFriend.department || selectedFriend.desc || '未知部门' }}</text>
          </view>
        </view>
        
        <view class="card-actions">
          <view class="action-btn primary" @click="handleSendMessage">
            <text>发消息</text>
          </view>
          <view class="action-btn danger" @click="handleUnblockFriend" v-if="selectedFriend.isBlocked">
            <text>取消拉黑</text>
          </view>
          <view class="action-btn danger" @click="handleBlockFriend" v-else>
            <text>拉黑好友</text>
          </view>
          <view class="action-btn danger" @click="handleDeleteFriend">
            <text>删除好友</text>
          </view>
        </view>
      </view>
    </u-popup>
  </view>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import uPopup from 'uview-plus/components/u-popup/u-popup.vue'
import uSearch from 'uview-plus/components/u-search/u-search.vue'
import uAvatar from 'uview-plus/components/u-avatar/u-avatar.vue'
import BottomNav from '@/components/BottomNav.vue'
import request from '@/utils/request'
import CONFIG from '@/config.js'
import { getAvatarUrl } from '@/utils/avatar'

const bottomNavRef = ref(null)
const loading = ref(false)
const friendItems = ref([])
const unreadRequestCount = ref(0)

const showFriendCard = ref(false)
const selectedFriend = ref(null)

const normalizeAvatar = (avatar) => {
  return getAvatarUrl(avatar)
}

const normalizeRoleText = (role) => {
  const num = typeof role === 'number' ? role : Number(role)
  if (!Number.isNaN(num)) {
    if (num === 0) return '管理员'
    if (num === 2) return '教师'
    if (num === 3) return '辅导员'
    return '学生'
  }
  return role == null ? '' : String(role)
}

const resolveLetter = (name) => {
  const text = String(name || '').trim()
  if (!text) return '#'
  const ch = text[0]
  return /[A-Za-z]/.test(ch) ? ch.toUpperCase() : '#'
}

const mapFriendToUi = (item) => {
  if (!item) return null
  const name = item.fullName || item.accountNumber || ''
  
  // Fake desc for UI
  let desc = '学生'
  if (name.includes('辅导员')) desc = '学生工作处 · 辅导员'
  else if (name.includes('教授')) desc = '计算机学院 · 教师'
  else if (name.includes('同学')) desc = '计算机学院 · 软件工程'
  else desc = item.department || '学院 · 专业'

  return {
    uid: item.uid,
    roomId: item.roomId,
    name,
    desc,
    avatar: normalizeAvatar(item.avatar),
    role: normalizeRoleText(item.role),
    isBlocked: !!item.isBlocked
  }
}

const flatContacts = computed(() => {
  const rawList = friendItems.value || []
  const list = rawList.map(mapFriendToUi).filter(Boolean)
  list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'))
  return list
})

const contacts = computed(() => {
  const list = flatContacts.value

  const groupMap = {}
  list.forEach((c) => {
    const letter = resolveLetter(c.name)
    if (!groupMap[letter]) {
      groupMap[letter] = []
    }
    groupMap[letter].push(c)
  })

  const letters = Object.keys(groupMap)
  letters.sort((a, b) => {
    if (a === '#') return 1
    if (b === '#') return -1
    return a.localeCompare(b)
  })

  const result = letters.map((letter) => ({
    letter,
    list: groupMap[letter]
  }))
  
  return result
})

const totalContacts = computed(() => {
  return flatContacts.value.length
})

const goToSearch = () => {
  uni.navigateTo({
    url: '/pages/contacts/search/index'
  })
}

const goToRequests = () => {
  uni.navigateTo({
    url: '/pages/contacts/requests/index'
  })
}

const goToGroup = () => {
  uni.navigateTo({
    url: '/pages/workbench/group/index'
  })
}

const loadUnreadRequests = async () => {
  try {
    const res = await request({
      url: '/capi/friend/request/received',
      method: 'GET'
    })
    if (Array.isArray(res)) {
      // status: 0=待处理
      unreadRequestCount.value = res.filter(r => r.status === 0).length
    }
  } catch (e) {}
}

const loadAllFriends = async () => {
  loading.value = true
  try {
    const page = await request({
      url: '/capi/friend/list',
      method: 'GET'
    })
    friendItems.value = Array.isArray(page) ? page : []
  } catch (e) {
    friendItems.value = []
  } finally {
    loading.value = false
  }
}

const openFriendCard = (contact) => {
  selectedFriend.value = contact
  showFriendCard.value = true
}

const closeFriendCard = () => {
  showFriendCard.value = false
  selectedFriend.value = null
}

const handleSendMessage = () => {
  if (selectedFriend.value) {
    const contact = selectedFriend.value
    closeFriendCard()
    openChat(contact)
  }
}

const handleBlockFriend = () => {
  if (!selectedFriend.value) return
  const targetId = selectedFriend.value.uid
  uni.showModal({
    title: '提示',
    content: '确定要将该好友加入黑名单吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          await request({
            url: '/capi/friend/block',
            method: 'POST',
            data: { targetId }
          })
          uni.showToast({ title: '已拉黑', icon: 'success' })
          closeFriendCard()
          loadAllFriends()
        } catch (e) {
          uni.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    }
  })
}

const handleUnblockFriend = () => {
  if (!selectedFriend.value) return
  const targetId = selectedFriend.value.uid
  uni.showModal({
    title: '提示',
    content: '确定要将该好友移出黑名单吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          await request({
            url: '/capi/friend/unblock',
            method: 'POST',
            data: { targetId }
          })
          uni.showToast({ title: '已取消拉黑', icon: 'success' })
          closeFriendCard()
          loadAllFriends()
        } catch (e) {
          uni.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    }
  })
}

const handleDeleteFriend = () => {
  if (!selectedFriend.value) return
  const targetId = selectedFriend.value.uid
  uni.showModal({
    title: '警告',
    content: '确定要删除该好友吗？删除后将同时清空聊天记录。',
    success: async (res) => {
      if (res.confirm) {
        try {
          await request({
            url: '/capi/friend/remove',
            method: 'POST',
            data: { targetId }
          })
          uni.showToast({ title: '已删除', icon: 'success' })
          closeFriendCard()
          loadAllFriends()
        } catch (e) {
          uni.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    }
  })
}

const openChat = (contact) => {
  const roomId = contact?.roomId
  if (!roomId) {
    uni.showToast({ title: '缺少会话信息', icon: 'none' })
    return
  }
  const title = contact?.name ? encodeURIComponent(String(contact.name)) : ''
  uni.navigateTo({
    url: `/pages/chat/index?roomId=${encodeURIComponent(String(roomId))}&type=single&title=${title}&receiverId=${contact.uid}`
  })
}

onShow(() => {
  loadAllFriends()
  loadUnreadRequests()
  nextTick(() => {
    if (bottomNavRef.value?.loadBadgeInfo) {
      bottomNavRef.value.loadBadgeInfo()
    }
  })
})
</script>

<style lang="scss" scoped>
.container {
  display: flex;
  flex-direction: column;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #F8F9FA;
  box-sizing: border-box;
}

.custom-header {
  background-color: #fff;
  padding-bottom: 0;
  position: relative;

  .status-bar {
    height: var(--status-bar-height);
    background-color: #fff;
  }

  .main-bar {
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #fff;
    
    .page-title {
      font-size: 18px;
      font-weight: bold;
      color: #333;
    }
  }
}

.search-container {
  background-color: #fff;
  padding: 10px 15px;
  
  .search-box {
    background-color: #F5F6FA;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    padding: 0 15px;
    
    .search-placeholder {
      font-size: 14px;
      color: #999;
      margin-left: 8px;
    }
  }
}

.action-list {
  background-color: #fff;
  margin-bottom: 10px;
  
  .action-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 15px;
    border-bottom: 1px solid #f9f9f9;
    
    &:last-child {
      border-bottom: none;
    }
    
    &:active {
      background-color: #f9f9f9;
    }
    
    .item-left {
      display: flex;
      align-items: center;
      
      .icon-wrapper {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 12px;
        
        &.bg-orange {
          background-color: #FA8C16;
        }
        
        &.bg-green {
          background-color: #52C41A;
        }
      }
      
      .item-text {
        font-size: 16px;
        color: #333;
        font-weight: 500;
      }
    }
    
    .item-right {
      display: flex;
      align-items: center;
      
      .badge {
        background-color: #F56C6C;
        color: #fff;
        font-size: 12px;
        min-width: 20px;
        height: 20px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 6px;
        margin-right: 8px;
      }
    }
  }
}

.contact-list {
  background-color: #fff;

  .list-title {
    padding: 15px 15px 5px;
    font-size: 13px;
    color: #666;
  }
}

.content-scroll {
  flex: 1;
  height: 0;
  overflow-y: auto;
  padding-bottom: 60px;
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

.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  background-color: #fff;
  border-bottom: 1px solid #f9f9f9;
  
  .item-left {
    display: flex;
    align-items: center;
    flex: 1;
    
    .custom-avatar {
      width: 46px;
      height: 46px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
      flex-shrink: 0;
      
      .avatar-text {
        color: #fff;
        font-size: 18px;
        font-weight: 500;
      }
    }

    .item-info {
      display: flex;
      flex-direction: column;
      justify-content: center;
      
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
}

.list-footer {
  padding: 20px 0;
  text-align: center;
  
  text {
    font-size: 12px;
    color: #999;
  }
}

.friend-card {
  padding: 24px 20px;
  background-color: #fff;
  border-radius: 16px;

  .card-header {
    display: flex;
    align-items: center;
    margin-bottom: 24px;
    
    .card-info {
      margin-left: 16px;
      display: flex;
      flex-direction: column;
      
      .card-name {
        font-size: 20px;
        font-weight: bold;
        color: #333;
        margin-bottom: 6px;
      }
      
      .card-account, .card-dept {
        font-size: 14px;
        color: #666;
        margin-bottom: 4px;
      }
    }
  }

  .card-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .action-btn {
      height: 48px;
      border-radius: 8px;
      background-color: #F5F6FA;
      display: flex;
      align-items: center;
      justify-content: center;
      
      &:active {
        background-color: #E8E9ED;
      }

      text {
        font-size: 16px;
        font-weight: 500;
      }

      &.primary text {
        color: #333;
      }

      &.danger text {
        color: #F56C6C;
      }
    }
  }
}
</style>
