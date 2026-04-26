<template>
  <view class="attachment-container">
    <!-- Approval Card -->
    <view v-if="type === 'approval'" class="attachment-card approval">
      <view class="content">
        <view class="icon-wrapper">
          <u-icon name="file-text" size="24" color="#666"></u-icon>
        </view>
        <view class="text-content">
          <text class="title">{{ data.title }}</text>
        </view>
      </view>
      <view class="footer">
        <u-icon name="desktop" size="14" color="#999"></u-icon>
        <text class="subtitle">{{ data.subtitle }}</text>
      </view>
    </view>
    
    <!-- Image Card -->
    <view v-else-if="type === 'image'" class="attachment-card image" @click="handleImageClick">
      <view class="image-poster">
        <image 
          :src="getFileUrl(data.url)" 
          mode="aspectFill" 
          class="poster-img"
        ></image>
      </view>
    </view>
    
    <!-- File Card -->
    <view v-else-if="type === 'file'" class="attachment-card file" @click="handleFileClick">
      <view class="file-content">
        <view class="file-info">
          <text class="file-name u-line-2">{{ data.title }}</text>
          <text class="file-size">{{ data.fileSize || '未知大小' }}</text>
        </view>
        <view class="file-icon">
          <u-icon name="file-text-fill" size="40" color="#26D06A"></u-icon>
        </view>
      </view>
      <view class="footer link-footer">
        <text class="link-text">点击下载</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { getFileUrl } from '@/utils/avatar'

const props = defineProps({
  type: {
    type: String,
    default: 'approval'
  },
  data: {
    type: Object,
    required: true
  }
})

const handleImageClick = () => {
  // 预览图片
  uni.previewImage({
    urls: [getFileUrl(props.data.url)],
    current: getFileUrl(props.data.url)
  })
}

const handleFileClick = () => {
  // 下载文件
  const fileUrl = getFileUrl(props.data.url)
  const fileName = props.data.title
  
  uni.downloadFile({
    url: fileUrl,
    success: (res) => {
      if (res.statusCode === 200) {
        // 保存文件到本地
        uni.saveFile({
          tempFilePath: res.tempFilePath,
          success: (saveRes) => {
            uni.showToast({ title: '文件下载成功', icon: 'success' })
          },
          fail: (err) => {
            uni.showToast({ title: '文件保存失败', icon: 'none' })
          }
        })
      }
    },
    fail: (err) => {
      uni.showToast({ title: '文件下载失败', icon: 'none' })
    }
  })
}
</script>

<style lang="scss" scoped>
.attachment-card {
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  max-width: 260px;
  
  // Approval Card Styles
  &.approval {
    .approval-content {
      display: flex;
      padding: 15px;
      
      .icon-wrapper {
        margin-right: 12px;
      }
      
      .title {
        font-size: 16px;
        color: #007aff;
        text-decoration: underline;
        font-weight: 500;
      }
    }
    
    .footer {
      display: flex;
      align-items: center;
      padding: 8px 15px;
      border-top: 1px solid #f5f5f5;
      
      .footer-text {
        font-size: 12px;
        color: #999;
        margin-left: 6px;
      }
    }
  }
  
  // Image Card Styles
  &.image {
    background-color: transparent;
    padding: 0;
    width: 180px;
    height: 180px;
    
    .image-poster {
      width: 180px;
      height: 180px;
      overflow: hidden;
      border-radius: 8px;
    }
    
    .poster-img {
      width: 180px;
      height: 180px;
      object-fit: cover;
      border-radius: 8px;
      display: block;
    }
  }
  
  // File Card Styles
  &.file {
    .file-content {
      display: flex;
      justify-content: space-between;
      padding: 15px;
      
      .file-info {
        flex: 1;
        margin-right: 10px;
        
        .file-name {
          font-size: 14px;
          color: #333;
          margin-bottom: 5px;
          line-height: 1.4;
        }
        
        .file-size {
          font-size: 12px;
          color: #999;
        }
      }
    }
    
    .footer.link-footer {
      padding: 10px 15px;
      border-top: 1px solid #f5f5f5;
      
      .link-text {
        color: #007aff;
        font-size: 14px;
      }
    }
  }
}
</style>
