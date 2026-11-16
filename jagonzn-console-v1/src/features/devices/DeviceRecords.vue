<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { api } from '@/core/http'
import type { Schema } from '@/core/contracts'
import { projectId,hasMenu } from '@/core/session'
import { useResource } from '@/core/use-resource'
import { formatTime } from '@/core/time'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import { devicePath } from './api'
import {decodeEventPage} from './event-decoder'
const from=ref(''),to=ref(''),eventKey=ref(''),level=ref('')
const props=defineProps<{deviceId:string;kind:string}>()
const limit=ref(24)
// 设备自动化两个既有读口只接受1..50；共享分页器的其他消费者保留原档位。
const pageSizes=computed(()=>props.kind==='automations'?[24,48]:[24,48,72,96])
const links:Record<string,{path:string;menu:string}>={rules:{path:'/message-rules',menu:'MessageRules'},tasks:{path:'/task-jobs',menu:'TaskJobs'},automations:{path:'/automations',menu:'RuleAutomations'},scenes:{path:'/scenes',menu:'RuleScenes'}}
const mode=ref('definitions'),page=ref(1),cursors=ref<Array<string|undefined>>([undefined]),selected=ref<unknown>()
const resource=useResource(async signal=>{
  const base=devicePath(projectId.value,props.deviceId),query={cursor:cursors.value[page.value-1],limit:limit.value,...(['events','logs'].includes(props.kind)?{from:from.value,to:to.value,level:level.value}:{}),...(props.kind==='events'?{eventKey:eventKey.value}:{})}
  if(mode.value==='history') {
    switch(props.kind){
      case 'rules': return api<Schema<'CursorPageDeviceMessageRuleExecutionResponse'>>(`${base}/message-rule-executions`,{query,signal})
      case 'tasks': return api<Schema<'CursorPageDeviceTaskExecutionResponse'>>(`${base}/task-executions`,{query,signal})
      case 'automations': return api<Schema<'CursorPageDeviceAutomationExecutionResponse'>>(`${base}/automation-executions`,{query,signal})
      case 'scenes': return api<Schema<'CursorPageDeviceSceneExecutionResponse'>>(`${base}/scene-executions`,{query,signal})
    }
  }
  switch(props.kind){
    case 'events': {
      return decodeEventPage(await api<Uint8Array>(`${base}/events`,{query,signal,responseType:'bytes',maxResponseBytes:8388608}),props.deviceId)
    }
    case 'alarms': {
      const binding=await api<Schema<'DeviceThingModelBindingResponse'>|undefined>(`${base}/thing-model-binding`,{signal})
      if(!binding)throw new Error('设备尚未关联物模型')
      if(binding.deviceId!==props.deviceId||!binding.version?.id)throw new Error('设备绑定身份不匹配')
      const body:Schema<'AlarmDeviceQueryRequest'>={devices:[{deviceId:props.deviceId,expectedModelVersionId:binding.version.id}],conditionStates:['PENDING','ACTIVE','CLEARED'],ackStates:['UNACKNOWLEDGED','ACKNOWLEDGED'],severities:['CRITICAL','MAJOR','MINOR','WARNING','INFO'],limit:limit.value,cursor:query.cursor}
      return api<Schema<'AlarmDeviceQueryResponse'>>(`/api/v1/projects/${projectId.value}/alarms/query`,{method:'post',body,signal})
    }
    case 'rules': return api<Schema<'CursorPageDeviceMessageRuleResponse'>>(`${base}/message-rule-candidates`,{query,signal})
    case 'tasks': return api<Schema<'CursorPageDeviceTaskJobResponse'>>(`${base}/task-jobs`,{query,signal})
    case 'automations': return api<Schema<'CursorPageDeviceAutomationResponse'>>(`${base}/automations`,{query,signal})
    case 'scenes': return api<Schema<'CursorPageDeviceSceneResponse'>>(`${base}/scene-candidates`,{query,signal})
    case 'users': return api<Schema<'CursorPageDeviceEndUserResponse'>>(`${base}/end-users`,{query,signal})
    case 'commands': return api<Schema<'CursorPageDeviceCommandHistoryResponse'>>(`${base}/commands`,{query,signal})
    case 'logs': return api<Schema<'DeviceRuntimeLogPage'>>(`${base}/runtime-logs`,{query,signal})
    case 'debug': return api<Schema<'CursorPageMessageLogResponse'>>(`${base}/messages`,{query,signal})
    case 'ota': return api<Schema<'CursorPageOtaDeviceJobSummaryResponse'>>(`/api/v1/projects/${projectId.value}/ota/devices/${props.deviceId}/jobs`,{query,signal})
    case 'topology': return {items:await api<Schema<'DeviceTopologyResponse'>[]>(`/api/v1/projects/${projectId.value}/device-topologies`,{query:{gatewayId:props.deviceId},signal}),hasMore:false}
    case 'modbus': return {items:await api<Schema<'ModbusPointMappingResponse'>[]>(`${base}/modbus-points`,{signal}),hasMore:false}
    case 'diagnostics': return {items:[await api<Schema<'DeviceAccessDiagnosticsResponse'>>(`${base}/access-diagnostics`,{signal})],hasMore:false}
    default: throw new Error('此记录类型尚未接入')
  }
})
watch(resource.data,data=>{if(!data)return;if('windowFrom'in data){from.value=data.windowFrom;to.value=data.windowTo}else if('effectiveFrom'in data){from.value=data.effectiveFrom||'';to.value=data.effectiveTo||''}})
const rows=computed(()=>resource.data.value?.items||[])
const columns=computed(()=>{
  if(mode.value==='history')return [['id','执行ID'],['status','状态'],['createdAt','创建时间']]
  const definitions:Record<string,Array<[string,string]>>={events:[['eventKey','事件标识'],['level','级别'],['occurredAt','发生时间'],['receivedAt','接收时间']],alarms:[['alarmType','告警类型'],['severity','等级'],['conditionState','条件状态'],['ackState','确认状态'],['lastReceivedAt','接收时间']],rules:[['name','名称'],['relationScope','关联范围'],['status','状态']],tasks:[['name','名称'],['status','状态'],['commandKey','命令标识']],automations:[['name','名称'],['status','状态']],scenes:[['name','名称'],['relationScope','关联范围']],users:[['displayName','用户'],['relationRole','角色']],commands:[['commandKey','命令'],['status','状态'],['acceptedAt','受理时间']],logs:[['level','级别'],['message','内容'],['occurredAt','发生时间']],debug:[['messageType','类型'],['direction','方向'],['createdAt','时间']],ota:[['id','作业ID'],['status','状态'],['createdAt','创建时间']],topology:[['gatewayId','网关ID'],['subDeviceId','子设备ID']],modbus:[['propertyKey','属性'],['slaveAddress','从站地址'],['registerAddress','寄存器地址']],diagnostics:[['protocol','协议'],['state','状态'],['lastDisconnectReason','断开原因']]}
  return definitions[props.kind]||[]
})
function cell(row:unknown,key:string){const value=(row as Record<string,unknown>)[key];return key.endsWith('At')?formatTime(value as string):typeof value==='boolean'?(value?'是':'否'):String(value??'—')}
function reset(){if(!pageSizes.value.includes(limit.value))limit.value=24;page.value=1;cursors.value=[undefined];selected.value=undefined;resource.clear();if(projectId.value)void resource.reload()}
function changeLimit(value:number){if(resource.loading.value||!pageSizes.value.includes(value)||value===limit.value)return;limit.value=value;reset()}
function next(){const data=resource.data.value;if(data&&'nextCursor'in data&&data.nextCursor){cursors.value[page.value]=data.nextCursor;page.value++;void resource.reload()}}
watch(()=>[props.kind,props.deviceId,projectId.value,mode.value],reset,{immediate:true})
</script>
<template><section><el-form v-if="['events','logs'].includes(kind)" inline @submit.prevent="reset"><el-form-item label="起始"><el-input v-model="from" placeholder="RFC3339，含时区"/></el-form-item><el-form-item label="结束"><el-input v-model="to" placeholder="RFC3339，含时区"/></el-form-item><el-form-item v-if="kind==='events'" label="事件标识"><el-input v-model="eventKey"/></el-form-item><el-form-item label="级别"><el-select v-model="level" clearable style="width:140px"><el-option v-for="l in (kind==='events'?['INFO','WARNING','ERROR']:['DEBUG','INFO','WARN','ERROR'])" :key="l" :label="l" :value="l"/></el-select></el-form-item><el-button type="primary" native-type="submit">查询</el-button></el-form><div class="tl-toolbar"><el-radio-group v-if="['rules','tasks','automations','scenes'].includes(kind)" v-model="mode"><el-radio-button value="definitions">关联定义</el-radio-button><el-radio-button value="history">执行历史</el-radio-button></el-radio-group><el-button @click="reset">刷新</el-button><router-link v-if="links[kind]&&hasMenu(links[kind].menu)" :to="{path:links[kind].path,query:{deviceId}}">查看全部</router-link></div><AsyncState :loading="resource.loading.value" :error="resource.error.value" :empty="!rows.length" @retry="resource.reload"><el-table :data="rows"><el-table-column v-for="[key,label] in columns" :key="key" :label="label" min-width="160"><template #default="{row}">{{cell(row,key)}}</template></el-table-column><el-table-column label="详情" width="80"><template #default="{row}"><el-button link type="primary" @click="selected=row">查看</el-button></template></el-table-column></el-table></AsyncState><CursorPager :page="page" :has-next="!!(resource.data.value && 'nextCursor' in resource.data.value && resource.data.value.nextCursor)" :loading="resource.loading.value" :limit="limit" :sizes="pageSizes" @update:limit="changeLimit" @next="next" @previous="page--;resource.reload()" /><el-dialog :model-value="!!selected" title="记录详情" width="min(720px,94vw)" destroy-on-close @close="selected=undefined"><pre>{{JSON.stringify(selected,null,2)}}</pre></el-dialog></section></template>
<style scoped>pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:60vh;overflow:auto;font-size:12px;}</style>
