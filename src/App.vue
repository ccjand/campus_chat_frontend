<script>
import imSocket from '@/utils/imSocket'
import CONFIG from '@/config.js'

export default {
  data() {
    return {
      removeGlobalWsListener: null
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
    },
    bootWs() {
      const token = uni.getStorageSync('token')
      if (!token) return
      if (imSocket.isConnected()) return
      imSocket.connect({ token, terminalType: CONFIG.TERMINAL_TYPE }).catch((e) => {
        console.warn('WS 自动连接失败：', e?.message || e)
      })
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
