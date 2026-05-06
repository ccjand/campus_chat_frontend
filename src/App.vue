<script>
import imSocket from '@/utils/imSocket'
import CONFIG from '@/config.js'
import request from '@/utils/request'
 
export default {
  data() {
    return {
      removeGlobalWsListener: null,
      removeStatusListener: null
    }
  },
  onLaunch() {
    console.log('App Launch')
    this.bindGlobalWsEvents()
    this.bootWs()
    // 网络状态变化时：恢复网络则尝试一次活性探测/重连
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
    // 关键：从后台回前台时，不能只看 isConnected() 标志位，
    // 因为 iOS/Android 可能已经悄悄杀掉底层 socket 但没触发 onClose。
    // 用 revalidate 主动探测一次。
    const token = uni.getStorageSync('token')
    if (!token) return
    if (imSocket.isConnected()) {
      imSocket.revalidate()
    } else {
      this.bootWs()
    }
  },
  onHide() {
    console.log('App Hide')
  },
  methods: {
    bindGlobalWsEvents() {
      if (typeof this.removeGlobalWsListener === 'function') return
      this.removeGlobalWsListener = imSocket.onMessage((payload) => {
        if (!payload || typeof payload !== 'object') return
        if (payload.event === 'notice') {
          uni.$emit('event:notice-pushed', payload)
          const title = payload.title ? `新通知：${payload.title}` : '收到新通知'
          uni.showToast({ title, icon: 'none' })
          return
        }
        if (payload.event === 'exam') {
          uni.$emit('event:exam-pushed', payload)
          const title = payload.name ? `新考试：${payload.name}` : '收到新考试安排'
          uni.showToast({ title, icon: 'none' })
        }
      })
 
      // 监听 WebSocket 连接状态，连接成功后拉取离线消息
      this.removeStatusListener = imSocket.onStatusChange((status) => {
        if (status === 'connected') {
          this.pullOfflineMessages()
        }
      })
    },
    bootWs() {
      const token = uni.getStorageSync('token')
      if (!token) return
      if (imSocket.isConnected()) return
      imSocket.connect({ token, terminalType: CONFIG.TERMINAL_TYPE }).catch((e) => {
        console.warn('WS 自动连接失败：', e?.message || e)
      })
    },
    /**
     * 拉取离线消息。
     * 对齐论文 5.2：用户上线后，客户端主动调用 GET /message/offline
     * 从 Redis 离线队列中取回掉线期间的消息，并通过全局事件分发给
     * 会话列表和聊天页面。
     */
    async pullOfflineMessages() {
      try {
        const list = await request({
          url: '/capi/message/offline',
          method: 'GET',
          hideErrorToast: true
        })
        if (!Array.isArray(list) || list.length === 0) return
        console.log(`离线消息补推：收到 ${list.length} 条`)
 
        // 逐条通过全局事件分发，聊天页面可监听并追加到消息列表
        list.forEach((msg) => {
          uni.$emit('ws:offlineMessage', msg)
        })
 
        // 通知会话列表刷新未读数和最新摘要
        // index.vue 已监听 chat:refresh_recent，会自动调用 loadRecentContacts()
        uni.$emit('chat:refresh_recent')
      } catch (e) {
        console.warn('拉取离线消息失败：', e?.message || e)
      }
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
