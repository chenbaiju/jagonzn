<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { bootstrap, needsLogin, session } from './core/session'
import { isPublicAuthPath } from './core/auth-routes'
const route = useRoute(), router = useRouter()
const loadingImage = `${import.meta.env.BASE_URL}thingslink-loading.svg`
const navigationReady = ref(false)
watch(() => [navigationReady.value, session.user, session.ready, session.transitioning], () => {
  if (navigationReady.value && needsLogin() && !isPublicAuthPath(route.path)) void router.replace({ path: '/login', query: { redirect: route.fullPath } })
})
onMounted(async () => {
  // 首次路由提交前的“/”只是启动占位，不能覆盖真实深链及其查询参数。
  await router.isReady()
  navigationReady.value = true
  await bootstrap()
})
</script>
<template><router-view v-if="navigationReady && session.ready" /><div v-else style="height:calc(100vh - 50px);display:flex;justify-content: center; align-items:center;" role="status" aria-label="正在连接控制台"><img :src="loadingImage" width="350" alt=""></div></template>
