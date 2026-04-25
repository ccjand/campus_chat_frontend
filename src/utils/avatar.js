import CONFIG from '@/config.js'

/**
 * 统一处理文件/头像的 URL，加上前缀
 * @param {String} url 原始的相对路径或绝对路径
 * @returns {String} 完整的可访问 URL
 */
export const getFileUrl = (url) => {
  if (!url) return '/static/logo.png' // 默认头像或默认图片
  let strUrl = String(url).trim()
  
  if (strUrl.startsWith('data:image') || strUrl.startsWith('/static/')) {
    return strUrl
  }
  
  // 提取有效的文件路径
  // 如果包含了 /campus-chat/，说明是旧的完整路径，我们截取后面的部分
  if (strUrl.includes('/campus-chat/')) {
    strUrl = strUrl.substring(strUrl.indexOf('/campus-chat/') + '/campus-chat/'.length)
  } else if (strUrl.startsWith('http://') || strUrl.startsWith('https://')) {
    try {
      const urlObj = new URL(strUrl)
      strUrl = urlObj.pathname.replace(/^\//, '') // 去除开头的 /
    } catch (e) {
      // ignore
    }
  }

  // 拼接前缀，确保不会出现双斜杠
  const baseUrl = CONFIG.IMG_BASE_URL.endsWith('/') ? CONFIG.IMG_BASE_URL.slice(0, -1) : CONFIG.IMG_BASE_URL
  const path = strUrl.startsWith('/') ? strUrl : '/' + strUrl
  
  return baseUrl + path
}

/**
 * 处理头像，当头像不存在时可以返回默认
 */
export const getAvatarUrl = (avatar) => {
  return getFileUrl(avatar)
}
