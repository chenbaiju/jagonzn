<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { login } from '@/core/session'
import { resendVerification } from '@/core/auth'
import { ApiError, errorMessage } from '@/core/http'
import AuthPage from './AuthPage.vue'

const router = useRouter()
const route = useRoute()
const form = reactive({ email: '', password: '' })
const loading = ref(false)
const error = ref('')
const verificationEmail = ref('')
const resending = ref(false)
const resendCooldown = ref(0)
let cooldownTimer: number | null = null

/** 只接受站内绝对路径；反斜线与控制字符会被浏览器规范化，必须一并排除。 */
function loginDestination(value: unknown): string {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !/[\\\u0000-\u001f\u007f]/.test(value)
    ? value
    : '/projects'
}

/** 后端 EMAIL_NOT_VERIFIED；错误码不在 OpenAPI schema 中，按接口文档稳定值判断。 */
const EMAIL_NOT_VERIFIED_CODE = 20022

async function submit() {
  if (loading.value) return
  error.value = ''
  verificationEmail.value = ''
  if (!form.email.trim() || !form.password) {
    error.value = '请填写完整'
    return
  }
  loading.value = true
  try {
    await login(form.email.trim(), form.password)
    await router.replace(loginDestination(route.query.redirect))
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === EMAIL_NOT_VERIFIED_CODE) {
      verificationEmail.value = form.email.trim()
    } else {
      error.value = errorMessage(cause)
    }
  } finally {
    loading.value = false
  }
}

function stopCooldown() {
  if (cooldownTimer !== null) {
    window.clearInterval(cooldownTimer)
    cooldownTimer = null
  }
}

function startCooldown(seconds: number) {
  stopCooldown()
  resendCooldown.value = seconds
  cooldownTimer = window.setInterval(() => {
    resendCooldown.value -= 1
    if (resendCooldown.value <= 0) stopCooldown()
  }, 1000)
}

async function resend() {
  if (resending.value || resendCooldown.value > 0) return
  resending.value = true
  try {
    await resendVerification(verificationEmail.value)
    ElMessage.success('验证邮件已重新发送，请查收')
    startCooldown(60)
  } catch (cause) {
    ElMessage.error(errorMessage(cause))
  } finally {
    resending.value = false
  }
}

function backToForm() {
  verificationEmail.value = ''
  error.value = ''
}

function wechatSignin() {
  ElMessage.info('微信快捷登录功能尚未实现')
}

onBeforeUnmount(stopCooldown)
</script>

<template>
  <AuthPage title="登录" image="/auth/signin-1.jpg">
    <template v-if="verificationEmail">
      <div class="lsucc">
        该邮箱尚未完成注册验证。请前往邮箱点击验证链接，或重新发送验证邮件。
      </div>
      <div class="auth-signin-button">
        <el-button
          type="primary"
          :loading="resending"
          :disabled="resending || resendCooldown > 0"
          @click="resend"
        >
          {{ resendCooldown > 0 ? `重新发送（${resendCooldown} 秒）` : '重新发送验证邮件' }}
        </el-button>
      </div>
      <div class="lform">
        <el-button plain style="width: 100%" @click="backToForm">返回登录</el-button>
      </div>
    </template>

    <template v-else>
      <el-button class="lwxsignin" type="success" @click="wechatSignin">
        <svg class="auth-wechat-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M9.1 4.1C5.2 4.1 2 6.7 2 9.9c0 1.8 1 3.4 2.6 4.5l-.7 2.1 2.4-1.2c.8.2 1.6.4 2.5.4h.4a5.6 5.6 0 0 1-.2-1.5c0-3.3 3.1-5.9 6.9-5.9h.3c-.8-2.5-3.7-4.2-7.1-4.2Zm-2.4 3.4a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm4.8 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z"
          />
          <path
            d="M22 14.2c0-2.8-2.7-5-6-5s-6 2.2-6 5 2.7 5 6 5c.7 0 1.4-.1 2.1-.3l1.9 1-.6-1.7c1.6-.9 2.6-2.4 2.6-4Zm-8-1.5a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Zm4.1 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Z"
          />
        </svg>
        微信快捷登录
      </el-button>
      <div class="auth-divider-wrap">
        <el-divider><span>或</span></el-divider>
      </div>
      <div class="lform">
        <el-form :model="form" label-position="top" @submit.prevent="submit">
          <el-form-item label="邮箱">
            <el-input
              v-model.trim="form.email"
              type="email"
              autocomplete="username"
              aria-label="邮箱"
            />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              aria-label="密码"
              show-password
            />
          </el-form-item>
          <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
          <div class="auth-actions">
            <el-button type="primary" native-type="submit" :loading="loading" :disabled="loading">
              登录
            </el-button>
            <div class="text-sm"><router-link to="/forgot-password">找回密码？</router-link></div>
          </div>
        </el-form>
      </div>
    </template>

    <div class="lbottom">
      <div class="ltext">
        没有账号？ <router-link to="/register">立即免费注册</router-link>
      </div>
    </div>
  </AuthPage>
</template>
