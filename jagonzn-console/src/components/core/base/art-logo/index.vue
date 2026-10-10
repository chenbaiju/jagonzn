<!-- 原图英文与中文横向排版；不改字形、不生成新的标识。 -->
<template>
  <div class="brand-logo" :style="{ width: `${size}px` }" role="img" aria-label="JAGONZN 简工智能">
    <template v-if="Number(size) > 64">
      <span class="brand-logo__part brand-logo__english"
        ><img src="@imgs/brand/jagonzn-original.png" alt=""
      /></span>
      <span class="brand-logo__part brand-logo__chinese"
        ><img src="@imgs/brand/jagonzn-original.png" alt=""
      /></span>
    </template>
    <img v-else class="brand-logo__compact" src="@imgs/brand/jagonzn-original.png" alt="" />
  </div>
</template>
<script setup lang="ts">
  defineOptions({ name: 'ArtLogo' })
  withDefaults(defineProps<{ size?: number | string }>(), { size: 36 })
</script>
<style scoped>
  .brand-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  /* 两个视窗分别展示原图的完整英文行、中文行；原始图片字节保持不变。 */
  .brand-logo__part {
    position: relative;
    flex: 1;
    aspect-ratio: 525 / 94;
    overflow: hidden;
  }
  .brand-logo__part img {
    position: absolute;
    left: 0;
    width: 100%;
    height: auto;
    max-width: none;
  }
  .brand-logo__english img {
    top: 0;
  }
  .brand-logo__chinese img {
    bottom: 0;
  }
  .brand-logo__compact {
    display: block;
    width: 100%;
    height: auto;
    object-fit: contain;
  }
</style>
