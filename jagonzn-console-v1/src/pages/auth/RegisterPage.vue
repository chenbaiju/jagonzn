<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { register } from '@/core/auth'
import { errorMessage } from '@/core/http'
import AuthPage from './AuthPage.vue'

const router = useRouter()
const form = reactive({ email: '', password: '', confirmPassword: '', agreement: false })
const fieldErrors = reactive({ email: '', password: '', confirmPassword: '', agreement: '' })
const loading = ref(false)
const error = ref('')
const submitted = ref(false)
const submittedEmail = ref('')

/** 与后端 RegisterRequest 的 @Size(min = 10, max = 128) 保持一致。 */
const PASSWORD_MIN_LENGTH = 10

function validateForm() {
  fieldErrors.email = ''
  fieldErrors.password = ''
  fieldErrors.confirmPassword = ''
  fieldErrors.agreement = ''
  const email = form.email.trim()
  if (!email) fieldErrors.email = '请填写邮箱'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = '邮箱格式不正确'
  if (!form.password) fieldErrors.password = '请填写密码'
  else if (form.password.length < PASSWORD_MIN_LENGTH || form.password.length > 128)
    fieldErrors.password = `密码长度需在 ${PASSWORD_MIN_LENGTH} 到 128 个字符之间`
  if (!form.confirmPassword) fieldErrors.confirmPassword = '请再次填写密码'
  else if (form.confirmPassword !== form.password)
    fieldErrors.confirmPassword = '两次输入的密码不一致'
  if (!form.agreement) fieldErrors.agreement = '请阅读并同意相关协议'
  return !Object.values(fieldErrors).some(Boolean)
}

async function submit() {
  if (loading.value || !validateForm()) return
  loading.value = true
  error.value = ''
  try {
    await register({ email: form.email.trim(), password: form.password })
    submittedEmail.value = form.email.trim()
    submitted.value = true
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}

function toLogin() {
  void router.push('/login')
}
</script>

<template>
  <AuthPage title="免费注册" image="/auth/signin-3.jpg">
    <template v-if="submitted">
      <div class="lsucc">
        注册成功！验证邮件已发送至 <b>{{ submittedEmail }}</b
        >，请查收并点击邮件中的链接完成验证。
      </div>
      <div class="auth-signin-button">
        <el-button type="primary" @click="toLogin">立即登录</el-button>
      </div>
    </template>

    <template v-else>
      <div class="lform">
        <el-form :model="form" label-position="top" @submit.prevent="submit">
          <el-form-item label="邮箱" :error="fieldErrors.email">
            <el-input
              v-model.trim="form.email"
              type="email"
              autocomplete="username"
              aria-label="邮箱"
              @input="fieldErrors.email = ''"
            />
          </el-form-item>
          <el-form-item label="密码" :error="fieldErrors.password">
            <el-input
              v-model="form.password"
              type="password"
              autocomplete="new-password"
              show-password
              aria-label="密码"
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
          <el-form-item class="auth-agreement" :error="fieldErrors.agreement">
            <el-checkbox v-model="form.agreement" @change="fieldErrors.agreement = ''">
              我已阅读并同意
              <a
                href="https://www.thingscloud.xyz/docs/guide/policies-regulations/service-agreement.html"
                target="_blank"
                rel="noopener"
                >服务协议</a
              >、
              <a
                href="https://www.thingscloud.xyz/docs/guide/policies-regulations/privacy-policy.html"
                target="_blank"
                rel="noopener"
                >隐私声明</a
              >和
              <a
                href="https://www.thingscloud.xyz/docs/guide/policies-regulations/account-agreement.html"
                target="_blank"
                rel="noopener"
                >账号协议</a
              >
            </el-checkbox>
          </el-form-item>
          <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
          <el-form-item style="margin-top: 30px; margin-bottom: 0">
            <el-button type="primary" native-type="submit" :loading="loading" :disabled="loading">
              注册
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
