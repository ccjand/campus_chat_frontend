import CONFIG from '@/config.js'

/**
 * 统一处理文件/头像的 URL，加上前缀
 * @param {String} url 原始的相对路径或绝对路径
 * @returns {String} 完整的可访问 URL
 */
export const getFileUrl = (url) => {
  if (!url) return '/static/logo.png'
  let strUrl = String(url).trim()

  if (strUrl.startsWith('data:image') || strUrl.startsWith('/static/')) {
    return strUrl
  }

  // 如果是完整的 URL，直接返回
  if (strUrl.startsWith('http://') || strUrl.startsWith('https://')) {
    return strUrl
  }

  // 提取有效的文件路径
  if (strUrl.includes('/campus-chat/')) {
    strUrl = strUrl.substring(strUrl.indexOf('/campus-chat/') + '/campus-chat/'.length)
  }

  // 拼接前缀，确保不会出现双斜杠
  const baseUrl = CONFIG.IMG_BASE_URL.endsWith('/') ? CONFIG.IMG_BASE_URL : CONFIG.IMG_BASE_URL + '/'
  const path = strUrl.startsWith('/') ? strUrl.substring(1) : strUrl

  return baseUrl + path
}

/**
 * 处理头像，当头像不存在时返回默认头像
 */
export const getAvatarUrl = (avatar) => {
  return getFileUrl(avatar)
}
