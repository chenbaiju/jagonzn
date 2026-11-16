<script setup lang="ts">
import { reactive, ref } from 'vue'
import { forgotPassword } from '@/core/auth'
import { errorMessage } from '@/core/http'
import AuthPage from './AuthPage.vue'

const form = reactive({ email: '' })
const emailError = ref('')
const loading = ref(false)
const error = ref('')
const submitted = ref(false)
const submittedEmail = ref('')

async function submit() {
  if (loading.value) return
  const email = form.email.trim()
  emailError.value = ''
  error.value = ''
  if (!email) emailError.value = '请填写邮箱'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) emailError.value = '邮箱格式不正确'
  if (emailError.value) return
  loading.value = true
  try {
    await forgotPassword(email)
    submittedEmail.value = email
    submitted.value = true
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthPage title="找回密码" image="/auth/signin-4.jpg">
    <div v-if="submitted" class="lsucc">
      已向 {{ submittedEmail }} 发送密码找回邮件，请查收。重置链接 30 分钟内有效。
    </div>

    <div v-else class="lform">
      <el-form :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item label="邮箱" :error="emailError">
          <el-input
            v-model.trim="form.email"
            type="email"
            autocomplete="username"
            aria-label="邮箱"
            @input="emailError = ''"
          />
        </el-form-item>
        <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
        <el-form-item style="margin-top: 30px; margin-bottom: 0">
          <el-button type="primary" native-type="submit" :loading="loading" :disabled="loading">
            找回密码
          </el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="lbottom">
      <div class="ltext"> 已经有账号？ <router-link to="/login">直接登录</router-link></div>
    </div>
  </AuthPage>
</template>
