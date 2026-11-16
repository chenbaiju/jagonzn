<script setup lang="ts">
import {computed} from 'vue'
import {alarmLogTriggerText} from './alarm-log-trigger-text'
import {WarningFilled,SuccessFilled,View,Edit} from '@element-plus/icons-vue'
import type {AlarmLog} from './alarm-transition-log-api'
import type {AlarmLogMaintenanceDraft} from './alarm-log-maintenance-draft'
import AlarmLogMaintenanceFields from './AlarmLogMaintenanceFields.vue'
import AlarmLogNotifications from './AlarmLogNotifications.vue'
import {alarmLogNotificationsDisplay} from './alarm-log-notification-display'
const props=defineProps<{row:AlarmLog;canReadDevice:boolean;canMaintain:boolean;maintenance?:Pick<AlarmLogMaintenanceDraft,'alarmReason'|'solution'|'remark'>|null}>()
defineEmits<{open:[];maintain:[]}>()
const triggerText=computed(()=>alarmLogTriggerText(props.row,'触发值：—'))
function label(){const row=props.row;return row.state==='ok'?'正常':row.state==='pending'?'待定':row.level===1?'普通告警':row.level===2?'重要告警':row.level===3?'紧急告警':'告警'}
function tone(){return props.row.state==='ok'?'ok':props.row.state==='alerting'&&props.row.level===3?'urgent':'warning'}
</script>
<template><article class="history-card" :class="tone()"><div class="alarm-top"><button class="alarm-state" :aria-label="`${label()}，查看日志详情`" @click="$emit('open')"><el-icon><SuccessFilled v-if="row.state==='ok'" /><WarningFilled v-else /></el-icon><span>{{ label() }}</span></button><div class="alarm-type"><span v-if="row.ruleName!==null" title="当前可见规则名称">{{ row.ruleName }}</span><router-link v-if="row.deviceName!==null&&canReadDevice" :to="`/devices/${row.deviceId}`" title="当前可见设备名称">{{ row.deviceName }}</router-link><span v-else-if="row.deviceName!==null" title="当前可见设备名称">{{ row.deviceName }}</span></div></div><div class="alarm-info" role="button" tabindex="0" aria-label="查看告警详情" @click="$emit('open')" @keydown.enter.prevent="$emit('open')" @keydown.space.prevent="$emit('open')"><template v-if="row.clearReason==='MANUAL'">告警已人工解除</template><template v-else>{{ triggerText }}</template><AlarmLogMaintenanceFields :content="maintenance??null" /></div><div class="alarm-bottom"><div class="alarm-actions"><el-button link :icon="View" @click="$emit('open')">查看详情</el-button><el-button v-if="canMaintain" link :icon="Edit" @click="$emit('maintain')">维护</el-button></div><AlarmLogNotifications :items="alarmLogNotificationsDisplay(row)" summary @open="$emit('open')" /></div></article></template>
<style scoped>
.history-card{margin:10px 0;padding:10px;border-radius:4px;background:rgba(230,162,60,.05)}.history-card.ok{background:rgba(103,194,58,.05)}.history-card.urgent{background:rgba(245,108,108,.05)}.alarm-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.alarm-state{display:flex;align-items:center;gap:10px;background:none;border:0;padding:0;color:#e6a23c;font:inherit;font-weight:600;cursor:pointer;line-height:30px;flex-shrink:0}.alarm-state .el-icon{font-size:24px}.ok .alarm-state{color:#67c23a}.urgent .alarm-state{color:#f56c6c}.alarm-type{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:10px;min-width:0;font-size:14px;line-height:30px;overflow-wrap:anywhere}.alarm-info{white-space:pre-wrap;cursor:pointer;margin-top:5px;line-height:22px;overflow-wrap:anywhere}.alarm-info:focus-visible{outline:2px solid var(--tl-primary);outline-offset:2px}.alarm-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:5px;padding:5px 0}.alarm-actions{display:flex;flex-shrink:0}.alarm-bottom .el-button{color:var(--tl-muted)}.alarm-bottom .el-button:hover{color:var(--tl-primary)}@media(max-width:600px){.alarm-top{align-items:flex-start;flex-wrap:wrap}.alarm-type{justify-content:flex-end;text-align:right;width:100%}}
</style>
