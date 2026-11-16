<script setup lang="ts">
import { computed } from 'vue'
import { allPermissions, permissionGroups, permissionKeys, type PermissionKey } from './application-admin-model'

const model = defineModel<Record<PermissionKey, boolean>>({ required: true })
const enabled = computed(() => permissionKeys.filter(key => model.value[key]).length)
const all = computed(() => enabled.value === permissionKeys.length)
const indeterminate = computed(() => enabled.value > 0 && !all.value)
function setAll(value: string | number | boolean) { model.value = allPermissions(value === true) }
</script>

<template>
  <div class="admin-permission-fields">
    <div class="admin-permission-fields__all">
      <el-checkbox :model-value="all" :indeterminate="indeterminate" @update:model-value="setAll">全选</el-checkbox>
      <span class="admin-permission-fields__count">已选 {{ enabled }}/{{ permissionKeys.length }}</span>
    </div>
    <section v-for="group in permissionGroups" :key="group.label" class="admin-permission-group">
      <h3>{{ group.label }}</h3>
      <div class="admin-permission-group__items">
        <el-checkbox v-for="item in group.items" :key="item.key" v-model="model[item.key]">{{ item.label }}</el-checkbox>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-permission-fields{border:1px solid var(--tl-border);border-radius:4px;padding:14px 16px;background:#fff}
.admin-permission-fields__all{display:flex;align-items:center;gap:12px;padding-bottom:10px;border-bottom:1px solid var(--tl-border)}
.admin-permission-fields__count{color:var(--tl-muted);font-size:12px}
.admin-permission-group{display:grid;grid-template-columns:110px minmax(0,1fr);gap:12px;padding-top:12px}
.admin-permission-group h3{margin:0;font-size:14px;font-weight:400;color:var(--tl-muted);line-height:32px}
.admin-permission-group__items{display:flex;flex-wrap:wrap;gap:4px 18px}
.admin-permission-group__items :deep(.el-checkbox){margin-right:0;height:32px}
@media(max-width:760px){.admin-permission-group{grid-template-columns:1fr;gap:2px}.admin-permission-group h3{line-height:24px}}
</style>
