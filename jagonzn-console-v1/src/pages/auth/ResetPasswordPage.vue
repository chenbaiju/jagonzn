<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { resetPassword } from '@/core/auth'
import { errorMessage } from '@/core/http'
import AuthPage from './AuthPage.vue'

const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const form = reactive({ password: '', confirmPassword: '' })
const fieldErrors = reactive({ password: '', confirmPassword: '' })
const loading = ref(false)
const error = ref('')
const submitted = ref(false)

/** 与后端 ResetPasswordRequest 的口令边界一致。 */
const PASSWORD_MIN_LENGTH = 10

function validateForm() {
  fieldErrors.password = ''
  fieldErrors.confirmPassword = ''
  if (!form.password) fieldErrors.password = '请填写新密码'
  else if (form.password.length < PASSWORD_MIN_LENGTH || form.password.length > 128)
    fieldErrors.password = `密码长度需在 ${PASSWORD_MIN_LENGTH} 到 128 个字符之间`
  if (!form.confirmPassword) fieldErrors.confirmPassword = '请再次填写新密码'
  else if (form.confirmPassword !== form.password)
    fieldErrors.confirmPassword = '两次输入的密码不一致'
  return !Object.values(fieldErrors).some(Boolean)
}

async function submit() {
  if (loading.value || !validateForm()) return
  loading.value = true
  error.value = ''
  try {
    await resetPassword(token.value, form.password)
    submitted.value = true
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthPage title="重置密码" image="/auth/signin-4.jpg">
    <template v-if="!token">
      <div class="lsucc">重置链接不完整或已失效，请重新发起找回密码。</div>
      <div class="auth-signin-button">
        <el-button type="primary" @click="$router.push('/forgot-password')">重新找回密码</el-button>
      </div>
    </template>

    <template v-else-if="submitted">
      <div class="lsucc">密码已重置，请使用新密码重新登录。</div>
      <div class="auth-signin-button">
        <el-button type="primary" @click="$router.push('/login')">去登录</el-button>
      </div>
    </template>

    <template v-else>
      <div class="lform">
        <el-form :model="form" label-position="top" @submit.prevent="submit">
          <el-form-item label="新密码" :error="fieldErrors.password">
            <el-input
              v-model="form.password"
              type="password"
              autocomplete="new-password"
              show-password
              aria-label="新密码"
              @input="fieldErrors.password = ''"
            />
          </el-form-item>
          <el-form-item label="重复密码" :error="fieldErrors.confirmPassword">
            <el-input
              v-model="form.confirmPassword"
              type="password"
              autocomplete="new-password"
              show-password
              aria-label="重复密码"
              @input="fieldErrors.confirmPassword = ''"
            />
          </el-form-item>
          <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
          <el-form-item style="margin-top: 30px; margin-bottom: 0">
            <el-button type="primary" native-type="submit" :loading="loading" :disabled="loading">
              重置密码
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </template>

    <div class="lbottom">
      <div class="ltext"> 已经有账号？ <router-link to="/login">直接登录</router-link></div>
    </div>
  </AuthPage>
</template>
