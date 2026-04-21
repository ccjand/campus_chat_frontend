<script>
import imSocket from '@/utils/imSocket'
import CONFIG from '@/config.js'

export default {
  onLaunch() {
    console.log('App Launch')
    this.bootWs()
    uni.onNetworkStatusChange((res) => {
      if (res.isConnected) this.bootWs()
    })
  },
  onShow() {
    console.log('App Show')
    this.bootWs()
  },
  onHide() {
    console.log('App Hide')
  },
  methods: {
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