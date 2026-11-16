<script setup lang="ts">
/**
 * 认证页公共骨架。
 *
 * 结构、尺寸与背景图直接来自 ThingsCloud 登录页的静态交付事实：
 * 左侧固定 385px 白色表单区，右侧整幅图片，窄屏隐藏图片。
 */
defineProps<{
  title: string
  image: string
}>()
</script>

<template>
  <div class="signinpage">
    <div class="leftbody">
      <div class="lcontainer">
        <div class="llogo">ThingsLink</div>
        <div class="ltitle">{{ title }}</div>
        <slot />
      </div>
    </div>
    <img class="rightbody" :src="image" alt="" aria-hidden="true" />
  </div>
</template>
