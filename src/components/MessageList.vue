<template>
  <view class="message-list">
    <message-item 
      v-for="msg in messages" 
      :key="msg.id" 
      :message="msg"
      @clear-unread="(roomId) => emit('clear-unread', roomId)"
    ></message-item>
  </view>
</template>

<script setup>
import MessageItem from './MessageItem.vue'

const props = defineProps({
  messages: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['clear-unread'])
</script>

<style lang="scss" scoped>
.message-list {
  background-color: #fff;
  padding-bottom: 60px;
}
</style>