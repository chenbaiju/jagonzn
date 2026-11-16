<script setup lang="ts">
import {computed,provide,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {can,projectId} from '@/core/session'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import RuleDetailPage from './RuleDetailPage.vue'
import TypePreprocessDetailPage from './TypePreprocessDetailPage.vue'
import MessageRuleActionDetailPage from './MessageRuleActionDetailPage.vue'
import DevicePreprocessDetailPage from './DevicePreprocessDetailPage.vue'
import {definitionUuid} from './device-task-definition-port'
import {getRule,getVersion,ruleHistory} from './api'
import {deviceSourceMembers,type RuleDeviceSourceContract} from './rule-source-api'
import {refreshRuleSourceEntry} from './rule-detail-source-refresh'
import {checkedRuleDefinition} from './rule-definition-read'
const route=useRoute(),router=useRouter(),id=computed(()=>String(route.params.id??'')),allowed=computed(()=>!!projectId.value&&can('rule:manage'))
/** 分派只依据真实版本格式；来源query不能把普通规则解释成前处理。 */
const resource=useResource(async signal=>{
 const project=projectId.value,rule=id.value,header=checkedRuleDefinition(await getRule(project,rule,signal),rule)
 const versionId=(await ruleHistory(project,rule,undefined,signal,1)).items?.[0]?.id??header.activeVersionId
 if(!definitionUuid(versionId))return {kind:'legacy' as const,typeId:''}
 const version=await getVersion(project,rule,versionId,signal),source=version.deviceSource
 if(version.id!==versionId)throw new Error('规则内容版本不匹配')
 const members=source?deviceSourceMembers(source):[]
 if(route.query.source==='device-type'&&(source?.kind!=='DEVICE_TYPE'||!members.includes(String(route.query.deviceTypeId).toLowerCase()))||route.query.source==='device'&&(source?.kind!=='DEVICE'||!members.includes(String(route.query.deviceId).toLowerCase())))throw new Error('规则来源与入口不匹配，请从规则目录重新进入')
 if(version.propertyPreprocessing&&version.sourceFormat!=='PROPERTY_TRANSFORM_V1')throw new Error('属性前处理格式与版本不匹配')
 if(version.sourceFormat==='PROPERTY_TRANSFORM_V1'){if(!version.propertyPreprocessing||version.preprocessing)throw new Error('属性前处理定义不完整');if(source?.kind==='DEVICE_TYPE'&&members.length===1)return {kind:'type' as const,typeId:members[0]!};if(source?.kind==='DEVICE'&&members.length)return {kind:'device' as const,typeId:''};throw new Error('属性前处理来源不完整')}
 if(version.sourceFormat==='MESSAGE_ACTIONS_V1')return {kind:'actions' as const,typeId:''}
 if(version.preprocessing||version.sourceFormat){if(source?.kind==='DEVICE_TYPE'&&members.length===1)return {kind:'type' as const,typeId:members[0]!};if(source?.kind==='DEVICE')return {kind:version.sourceFormat||version.preprocessing?.trigger?.kind==='DATA_RPT'?'device-data' as const:'device' as const,typeId:'',deviceSource:source,deviceId:members[0]}}
 return {kind:'legacy' as const,typeId:''}
})
provide(refreshRuleSourceEntry,async(source:RuleDeviceSourceContract)=>{const members=deviceSourceMembers(source),origin=route.query.source,valid=origin==='device'?source.kind==='DEVICE'&&members.includes(String(route.query.deviceId).toLowerCase()):origin==='device-type'?source.kind==='DEVICE_TYPE'&&members.includes(String(route.query.deviceTypeId).toLowerCase()):true;if(!valid){const query:typeof route.query={...route.query,origin:'directory'};delete query.source;delete query.deviceId;delete query.deviceTypeId;const failure=await router.replace({query});if(failure)throw new Error('来源已保存，返回当前范围未完成');return}await resource.reload()})
watch([projectId,id,()=>route.query.source,()=>route.query.deviceId,()=>route.query.deviceTypeId],()=>{resource.clear();if(allowed.value&&!!id.value)void resource.reload()},{immediate:true})
watch(allowed,value=>{if(value&&!resource.data.value&&!!id.value)void resource.reload()})
</script>
<template><AsyncState :forbidden="!allowed&&!resource.data.value" :loading="resource.loading.value" :error="resource.error.value" @retry="resource.reload"><MessageRuleActionDetailPage v-if="resource.data.value?.kind==='actions'"/><TypePreprocessDetailPage v-else-if="resource.data.value?.kind==='type'" :type-id="resource.data.value.typeId"/><TypePreprocessDetailPage v-else-if="resource.data.value?.kind==='device-data'" type-id="" :data-source="resource.data.value.deviceSource"/><DevicePreprocessDetailPage v-else-if="resource.data.value?.kind==='device'" :device-id="resource.data.value.deviceId"/><RuleDetailPage v-else-if="resource.data.value"/></AsyncState></template>
