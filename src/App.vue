<script>
import imSocket from '@/utils/imSocket'
import CONFIG from '@/config.js'
import request from '@/utils/request'

export default {
  data() {
    return {
      removeGlobalWsListener: null,
      removeBadgeWsListener: null,
      removeStatusListener: null
    }
  },
  onLaunch() {
    console.log('App Launch')
    this.bindGlobalWsEvents()
    this.bootWs()
    uni.onNetworkStatusChange((res) => {
      if (res.isConnected) {
        if (imSocket.isConnected()) {
          imSocket.revalidate()
        } else {
          this.bootWs()
        }
      }
    })
  },
  onShow() {
    console.log('App Show')
    const token = uni.getStorageSync('token')
    if (!token) return
    if (imSocket.isConnected()) {
      imSocket.revalidate()
    } else {
      this.bootWs()
    }
    // 回前台 2 秒后兜底刷新 badge 和会话列表
    setTimeout(() => {
      this.refreshGlobalBadge()
      uni.$emit('chat:refresh_recent')
    }, 2000)
  },
  onHide() {
    console.log('App Hide')
  },
  methods: {
    bindGlobalWsEvents() {
      if (typeof this.removeGlobalWsListener === 'function') return

      // 监听业务消息（通知、考试、请假）
      this.removeGlobalWsListener = imSocket.onMessage((payload) => {
        if (!payload || typeof payload !== 'object') return
        if (payload.event === 'notice') {
          uni.$emit('event:notice-pushed', payload)
          var noticeTitle = payload.title ? ('\u65b0\u901a\u77e5\uff1a' + payload.title) : '\u6536\u5230\u65b0\u901a\u77e5'
          uni.showToast({ title: noticeTitle, icon: 'none' })
          this.refreshGlobalBadge()
          return
        }
        if (payload.event === 'exam') {
          uni.$emit('event:exam-pushed', payload)
          var examTitle = payload.name ? ('\u65b0\u8003\u8bd5\uff1a' + payload.name) : '\u6536\u5230\u65b0\u8003\u8bd5\u5b89\u6392'
          uni.showToast({ title: examTitle, icon: 'none' })
          return
        }
        if (payload.event === 'leave_pending') {
          uni.showToast({ title: '\u6536\u5230\u65b0\u7684\u8bf7\u5047\u7533\u8bf7', icon: 'none' })
          this.refreshGlobalBadge()
          return
        }
      })

      // 监听 badge 红点推送
      this.removeBadgeWsListener = imSocket.onBadge((badge) => {
        if (!badge) return
        var oldUnread = 0
        try {
          oldUnread = JSON.parse(uni.getStorageSync('globalBadgeInfo') || '{}').unreadMsgCount || 0
        } catch(e) {}
        var updated = Object.assign({}, badge, { unreadMsgCount: badge.unreadMsgCount || oldUnread })
        uni.setStorageSync('globalBadgeInfo', JSON.stringify(updated))
        uni.$emit('badge:updated', updated)
      })

      // 监听 WebSocket 连接状态，连接成功后拉取离线消息
      this.removeStatusListener = imSocket.onStatusChange((status) => {
        if (status === 'connected') {
          this.pullOfflineMessages()
        }
      })
    },
    bootWs() {
      var token = uni.getStorageSync('token')
      if (!token) return
      if (imSocket.isConnected()) return
      imSocket.connect({ token: token, terminalType: CONFIG.TERMINAL_TYPE }).catch(function(e) {
        console.warn('WS \u81ea\u52a8\u8fde\u63a5\u5931\u8d25\uff1a', e && e.message ? e.message : e)
      })
    },
    async pullOfflineMessages() {
      try {
        var list = await request({
          url: '/capi/message/offline',
          method: 'GET',
          hideErrorToast: true
        })
        if (!Array.isArray(list) || list.length === 0) return
        console.log('\u79bb\u7ebf\u6d88\u606f\u8865\u63a8\uff1a\u6536\u5230 ' + list.length + ' \u6761')
        list.forEach(function(msg) {
          uni.$emit('ws:offlineMessage', msg)
        })
        uni.$emit('chat:refresh_recent')
      } catch (e) {
        console.warn('\u62c9\u53d6\u79bb\u7ebf\u6d88\u606f\u5931\u8d25\uff1a', e && e.message ? e.message : e)
      }
    },
    async refreshGlobalBadge() {
      try {
        var res = await request({ url: '/capi/badge', method: 'GET' })
        if (res) {
          var oldUnread = 0
          try {
            oldUnread = JSON.parse(uni.getStorageSync('globalBadgeInfo') || '{}').unreadMsgCount || 0
          } catch(e) {}
          var updated = Object.assign({}, res, { unreadMsgCount: res.unreadMsgCount || oldUnread })
          uni.setStorageSync('globalBadgeInfo', JSON.stringify(updated))
          uni.$emit('badge:updated', updated)
        }
      } catch(e) {}
    }
  }
}
</script>

<style lang="scss">
@font-face {
  font-family: 'uicon-iconfont';
  src: url('/static/uview-plus.woff?v=1') format('woff'),
       url('/static/uview-plus.ttf?v=1') format('truetype');
}
.u-icon__icon, .u-iconfont {
  font-family: 'uicon-iconfont' !important;
}
@import 'uview-plus/index.scss';
</style>