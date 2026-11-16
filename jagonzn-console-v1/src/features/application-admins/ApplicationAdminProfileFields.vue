<script setup lang="ts">
import type { AdminDraft } from './application-admin-model'
import ApplicationAdminPermissionFields from './ApplicationAdminPermissionFields.vue'

defineProps<{ mode: 'create' | 'edit'; disabled?: boolean }>()
const draft = defineModel<AdminDraft>({ required: true })

function addTag() { if (draft.value.tags.length < 32) draft.value.tags.push({ name: '', value: '' }) }
function removeTag(index: number) { draft.value.tags.splice(index, 1) }
</script>

<template>
  <el-form label-position="top" class="admin-profile-fields" :disabled="disabled">
    <el-form-item label="名称" required>
      <el-input v-model="draft.name" aria-label="管理员名称" maxlength="64" placeholder="管理员名称" />
    </el-form-item>
    <el-form-item label="登录名" required>
      <el-input v-if="mode === 'create'" v-model="draft.loginName" aria-label="管理员登录名" maxlength="64" placeholder="1至64位字母、数字或 _ . @ + -" />
      <div v-else class="admin-profile-fields__readonly"><span>{{ draft.loginName }}</span><small>登录名创建后不可修改</small></div>
    </el-form-item>
    <el-form-item v-if="mode === 'create'" label="登录密码" required>
      <el-input v-model="draft.password" aria-label="管理员登录密码" type="password" show-password maxlength="128" placeholder="8至128字符" />
      <p class="admin-profile-fields__hint">登录密码不会显示在系统中，请牢记登录密码。如忘记可重置密码。</p>
    </el-form-item>
    <el-form-item label="权限">
      <ApplicationAdminPermissionFields v-model="draft.permissions" />
      <p class="admin-profile-fields__hint">权限位当前只作为账号配置保存和回读；实际设备、任务、告警规则和用户操作准入待登录宿主与权限映射验收。</p>
    </el-form-item>
    <el-form-item label="邮箱">
      <el-input v-model="draft.email" aria-label="管理员邮箱" maxlength="255" placeholder="可选" />
    </el-form-item>
    <el-form-item label="手机号">
      <el-input v-model="draft.phone" aria-label="管理员手机号" maxlength="32" placeholder="可选" />
    </el-form-item>
    <el-form-item label="描述">
      <el-input v-model="draft.description" aria-label="管理员描述" type="textarea" :rows="3" maxlength="500" placeholder="可选" />
    </el-form-item>
    <el-form-item label="标签">
      <div class="admin-tag-editor">
        <div v-for="(tag, index) in draft.tags" :key="index" class="admin-tag-editor__row">
          <el-input v-model="tag.name" :aria-label="`标签名称 ${index + 1}`" maxlength="64" placeholder="标签名称，比如：部门" />
          <el-input v-model="tag.value" :aria-label="`标签值 ${index + 1}`" maxlength="128" placeholder="标签值，比如：品控部" />
          <el-button link type="danger" :disabled="disabled" @click="removeTag(index)">移除</el-button>
        </div>
        <el-button link type="primary" :disabled="disabled || draft.tags.length >= 32" @click="addTag">添加标签</el-button>
      </div>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.admin-profile-fields{max-width:820px}.admin-profile-fields :deep(.el-form-item){margin-bottom:22px}.admin-profile-fields :deep(.el-input),.admin-profile-fields :deep(.el-textarea){max-width:520px}
.admin-profile-fields__readonly{display:flex;flex-direction:column;gap:2px;min-height:40px;justify-content:center;color:var(--tl-title)}.admin-profile-fields__readonly small{color:var(--tl-muted);font-size:12px}
.admin-profile-fields__hint{margin:6px 0 0;color:var(--tl-muted);font-size:12px;line-height:18px}
.admin-tag-editor{display:flex;flex-direction:column;gap:8px;width:100%}.admin-tag-editor__row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:8px;align-items:center}.admin-tag-editor__row :deep(.el-input){max-width:none}.admin-tag-editor>.el-button{align-self:flex-start}
@media(max-width:760px){.admin-tag-editor__row{grid-template-columns:1fr;gap:4px}.admin-tag-editor__row>.el-button{align-self:flex-end}}
</style>
