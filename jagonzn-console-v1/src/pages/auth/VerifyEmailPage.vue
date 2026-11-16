<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { verifyEmail } from '@/core/auth'
import { errorMessage } from '@/core/http'
import AuthPage from './AuthPage.vue'

const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const state = ref<'pending' | 'success' | 'error'>('pending')
const verifiedEmail = ref('')
const error = ref('')

onMounted(async () => {
  if (!token.value) {
    state.value = 'error'
    error.value = '验证链接不完整或已失效，请重新发送验证邮件。'
    return
  }
  try {
    const result = await verifyEmail(token.value)
    verifiedEmail.value = result.email || ''
    state.value = 'success'
  } catch (cause) {
    error.value = errorMessage(cause)
    state.value = 'error'
  }
})
</script>

<template>
  <AuthPage title="邮箱验证" image="/auth/signin-1.jpg">
    <div v-if="state === 'pending'" class="lsucc">正在验证邮箱，请稍候…</div>

    <template v-else-if="state === 'success'">
      <div class="lsucc">
        邮箱<b v-if="verifiedEmail"> {{ verifiedEmail }} </b>已验证，请使用注册时设置的口令登录。
      </div>
      <div class="auth-signin-button">
        <el-button type="primary" @click="$router.push('/login')">去登录</el-button>
      </div>
    </template>

    <template v-else>
      <div class="lsucc">{{ error }}</div>
      <div class="auth-signin-button">
        <el-button type="primary" @click="$router.push('/login')">返回登录</el-button>
      </div>
      <div class="lform">
        <el-button plain style="width: 100%" @click="$router.push('/register')"
          >重新注册</el-button
        >
      </div>
    </template>
  </AuthPage>
</template>
