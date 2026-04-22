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
            <text class="item-text">班级群组</text>
          </view>
          <u-icon name="arrow-right" color="#ccc" size="14"></u-icon>
        </view>
      </view>

      <!-- Contacts -->
      <view class="contact-list">
        <view class="list-title" v-if="contacts && contacts.length > 0">好友列表</view>
        
        <view v-if="loading" class="state">
          <text class="state-text">加载中...</text>
        </view>
        <view v-else-if="!contacts || contacts.length === 0" class="state">
          <text class="state-text">暂无联系人</text>
        </view>
        <view v-else v-for="(group, groupIndex) in contacts" :key="groupIndex">
          <!-- Section Header -->
          <view v-if="group.letter !== '#'" class="section-header" style="display:none">{{ group.letter }}</view>
          
          <!-- Contact Rows -->
          <view class="list-item" v-for="(contact, contactIndex) in group.list" :key="contactIndex" @click="openChat(contact)">
            <view class="item-left">
              <view class="custom-avatar" :style="{ backgroundColor: getAvatarBgColor(contact) }">
                <text class="avatar-text">{{ getAvatarText(contact) }}</text>
              </view>
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
  </view>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import uSearch from 'uview-plus/components/u-search/u-search.vue'
import uAvatar from 'uview-plus/components/u-avatar/u-avatar.vue'
import BottomNav from '@/components/BottomNav.vue'
import request from '@/utils/request'
import CONFIG from '@/config.js'

const bottomNavRef = ref(null)
const loading = ref(false)
const friendItems = ref([])
const unreadRequestCount = ref(0)

const normalizeAvatar = (avatar) => {
  if (avatar == null) return '/static/logo.png'
  const text = String(avatar).trim()
  if (!text || text === 'null' || text === 'undefined') return '/static/logo.png'
  if (text.startsWith('http') || text.startsWith('data:')) return text
  return CONFIG.IMG_BASE_URL + text.replace(/^\/+/, '')
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
    role: normalizeRoleText(item.role)
  }
}

const getAvatarText = (contact) => {
  const name = contact.name || ''
  if (name.includes('辅导员') || name.includes('老师')) return '师'
  if (name.includes('教授')) return '授'
  if (name.includes('同学') || name.includes('学生')) return '学'
  return name.charAt(0) || 'U'
}

const getAvatarBgColor = (contact) => {
  const text = getAvatarText(contact)
  if (text === '学' || text === '师') return '#F56C6C' // Red-ish
  if (text === '授') return '#F59E0B' // Orange-ish
  if (text === '群' || text === '班') return '#8B5CF6' // Purple-ish
  
  const colors = ['#F56C6C', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#F97316']
  const code = text.charCodeAt(0) || 0
  return colors[code % colors.length]
}

const contacts = computed(() => {
  const list = (friendItems.value || []).map(mapFriendToUi).filter(Boolean)
  list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'))

  const groupMap = new Map()
  list.forEach((c) => {
    const letter = resolveLetter(c.name)
    const arr = groupMap.get(letter) || []
    arr.push(c)
    groupMap.set(letter, arr)
  })

  const letters = Array.from(groupMap.keys())
  letters.sort((a, b) => {
    if (a === '#') return 1
    if (b === '#') return -1
    return a.localeCompare(b)
  })

  return letters.map((letter) => ({
    letter,
    list: groupMap.get(letter) || []
  }))
})

const totalContacts = computed(() => {
  return contacts.value.reduce((total, group) => total + (group?.list?.length || 0), 0)
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
  height: 100vh;
  background-color: #F8F9FA;
  position: relative;
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
</style>
