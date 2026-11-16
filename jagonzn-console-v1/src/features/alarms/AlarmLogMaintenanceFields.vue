<script setup lang="ts">
import {Edit} from '@element-plus/icons-vue'
import type {AlarmLogMaintenanceDraft} from './alarm-log-maintenance-draft'
/** 注释正文展示模型；详情或同快照事件页负责取得真实内容，不在每张卡内发请求。 */
defineProps<{content:(Pick<AlarmLogMaintenanceDraft,'alarmReason'|'solution'|'remark'> & {updatedBy?:string|null})|null;detail?:boolean;normal?:boolean;canEdit?:boolean}>()
defineEmits<{edit:[]}>()
</script>
<template><div v-if="detail" class="alarm-maintenance-detail">
 <section><div class="maintenance-title"><span>告警原因</span><el-button v-if="canEdit" link type="primary" :icon="Edit" size="small" aria-label="编辑告警原因" @click="$emit('edit')">编辑</el-button></div><p :class="{empty:!content?.alarmReason}">{{ content?.alarmReason||'无' }}</p></section>
 <section v-if="normal"><div class="maintenance-title"><span>解决方案</span><el-button v-if="canEdit" link type="primary" :icon="Edit" size="small" aria-label="编辑解决方案" @click="$emit('edit')">编辑</el-button></div><p :class="{empty:!content?.solution}">{{ content?.solution||'无' }}</p></section>
 <section><div class="maintenance-title"><span>其它备注</span><el-button v-if="canEdit" link type="primary" :icon="Edit" size="small" aria-label="编辑其它备注" @click="$emit('edit')">编辑</el-button></div><p :class="{empty:!content?.remark}">{{ content?.remark||'无' }}</p></section>
 <section v-if="content?.updatedBy"><div class="maintenance-title"><span>操作者</span></div><p class="maintenance-operator">{{ content.updatedBy }}</p></section>
</div><div v-else-if="content&&(content.alarmReason||content.solution||content.remark)" class="alarm-maintain"><p v-if="content.alarmReason">告警原因：{{ content.alarmReason }}</p><p v-if="content.solution">解决方案：{{ content.solution }}</p><p v-if="content.remark">其它备注：{{ content.remark }}</p></div></template>
<style scoped>.alarm-maintain{white-space:pre-wrap;overflow-wrap:anywhere}.alarm-maintain p{margin:8px 0;line-height:22px}.alarm-maintenance-detail section{margin-top:20px}.maintenance-title{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px;font-weight:600;color:#303133}.alarm-maintenance-detail p{margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:22px}.alarm-maintenance-detail .empty{color:#c0c4cc}</style>
