<script setup lang="ts">
import {WarningFilled} from '@element-plus/icons-vue'
import email from './assets/mdi/email.svg?raw'
import webhook from './assets/mdi/webhook.svg?raw'
import app from './assets/mdi/app-notification-outline.svg?raw'
/** 纯展示资料；由宿主从已核验合同映射，不接收接口或原始供应商错误。 */
export interface AlarmLogNotificationDisplay {key:string;kind:'EMAIL'|'WEBHOOK'|'PUSH';recipient:string;failureCode:string|null}
defineProps<{items:readonly AlarmLogNotificationDisplay[];truncated?:boolean;summary?:boolean}>()
defineEmits<{copyError:[code:string];open:[]}>()
const icons={EMAIL:email,WEBHOOK:webhook,PUSH:app}
const labels={EMAIL:'邮件',WEBHOOK:'Webhook',PUSH:'App通知'}
</script>
<template>
 <div v-if="summary&&items.length" class="notification-summary" aria-label="告警通知">
  <el-tooltip v-for="item in items" :key="item.key" :content="labels[item.kind]" placement="top"><button type="button" class="notify-icon-item" :aria-label="`${labels[item.kind]}，查看告警详情`" @click="$emit('open')"><span class="notify-log-icon" :class="{failed:item.failureCode!==null}" aria-hidden="true" v-html="icons[item.kind]" /></button></el-tooltip>
 </div>
 <section v-else-if="items.length" class="notification-detail" aria-label="告警通知">
  <h3>告警通知</h3>
  <div class="notify-logs-list">
   <div v-for="item in items" :key="item.key" class="notify-log-item">
    <div class="notify-log-left">
     <span class="notify-log-icon" :class="{failed:item.failureCode!==null}" aria-hidden="true" v-html="icons[item.kind]" />
     <div class="notify-log-info"><div class="notify-log-type">{{ labels[item.kind] }}</div><div v-if="item.recipient" class="notify-log-recipients"><span>{{ item.recipient }}</span></div></div>
    </div>
    <div v-if="item.failureCode!==null" class="notify-log-right"><el-tooltip :content="item.failureCode" placement="top"><button class="failed-text" type="button" :aria-label="`失败，复制错误信息 ${item.failureCode}`" @click="$emit('copyError',item.failureCode)"><el-icon><WarningFilled /></el-icon><span>失败</span></button></el-tooltip></div>
   </div>
  </div>
  <p v-if="truncated" class="notification-limit" role="status">仅显示前 100 条告警通知</p>
 </section>
</template>
<style scoped>
.notification-detail{margin-top:20px}.notification-detail h3{margin:0 0 10px;font-size:14px;font-weight:600;color:#303133}.notify-log-item{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0}.notify-log-item:last-child{border-bottom:none}.notify-log-left{display:flex;align-items:center;flex:1;min-width:0}.notify-log-icon{display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:12px;color:#409eff}.notify-log-icon.failed{color:#ccc}.notify-log-icon :deep(svg){height:1em;width:1em;fill:currentColor}.notify-log-info{flex:1;min-width:0}.notify-log-type{font-size:14px;font-weight:500;color:#303133}.notify-log-recipients{font-size:12px;color:#909399;display:flex;align-items:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.notify-log-recipients>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.notify-log-right{flex-shrink:0;margin-left:12px}.failed-text{color:#f56c6c;font:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;border:0;background:none;padding:0}.failed-text .el-icon{font-size:16px}.failed-text:focus-visible{outline:2px solid var(--tl-primary);outline-offset:4px}.notification-limit{font-size:12px;color:#909399;margin:10px 0 0}
</style>
<style scoped>
.notification-summary{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex-wrap:wrap;min-width:0}.notify-icon-item{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:0;padding:0;border-radius:4px;background:rgba(64,158,255,.1);cursor:pointer;transition:background-color .2s ease,transform .2s ease}.notify-icon-item:hover{background:rgba(64,158,255,.2);transform:scale(1.1)}.notify-icon-item:focus-visible{outline:2px solid var(--tl-primary);outline-offset:2px}.notify-icon-item .notify-log-icon{margin:0;font-size:14px}@media(prefers-reduced-motion:reduce){.notify-icon-item{transition:none}.notify-icon-item:hover{transform:none}}
</style>
