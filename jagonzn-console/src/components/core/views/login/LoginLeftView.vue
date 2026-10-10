<!-- 使用用户提供的完整标识与企业照片，登录表单和业务流程不变。 -->
<template>
  <div class="login-left-view">
    <div class="logo"><ArtLogo :size="320" /></div>
    <div class="company-photo"
      ><img src="@imgs/brand/company-building.jpg" alt="简工智能公司建筑与品牌标识"
    /></div>
    <div class="text-wrap">
      <h1>深圳简工智能科技有限公司</h1>
      <p>粤ICP备17016010号</p>
    </div>
  </div>
</template>

<script setup lang="ts">
  defineProps<{ hideContent?: boolean }>()
</script>

<style scoped lang="scss">
  .login-left-view {
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 65vw;
    padding: 36px 28px;
    overflow: hidden;
    isolation: isolate;
    background: #14354d;
    .company-photo {
      position: absolute;
      inset: 0;
      z-index: -2;
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: 28% center;
      }
    }
    // 柔化满幅照片，并给顶部蓝色标识和底部白色文字保留对比度。
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      backdrop-filter: blur(1px);
      background: linear-gradient(
        180deg,
        rgb(255 255 255 / 90%) 0%,
        rgb(255 255 255 / 30%) 18%,
        rgb(8 31 52 / 12%) 48%,
        rgb(8 31 52 / 82%) 100%
      );
    }
    .logo {
      display: flex;
      justify-content: flex-start;
    }
    .text-wrap {
      padding-bottom: 16px;
      text-align: center;
      text-shadow: 0 2px 14px rgb(0 0 0 / 30%);
      h1 {
        font-size: 24px;
        font-weight: 400;
        color: #fff;
      }
      p {
        margin-top: 10px;
        font-size: 14px;
        color: rgb(255 255 255 / 80%);
      }
    }
    @media (width <= 1600px) {
      width: 60vw;
    }
    @media (width <= 1180px) {
      display: none;
    }
  }
</style>
