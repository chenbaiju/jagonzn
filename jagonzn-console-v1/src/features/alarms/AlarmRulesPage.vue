<script setup lang="ts">
import {ref} from 'vue'
import {useRouter} from 'vue-router'
import {Plus} from '@element-plus/icons-vue'
import {can} from '../../core/session'
import AlarmRuleDirectoryView from './AlarmRuleDirectoryView.vue'
import ManagedAlarmRuleChoicesEditor from './ManagedAlarmRuleChoicesEditor.vue'

const router=useRouter()
const revision=ref(0)
const editor=ref<{ruleId?:string;deviceTypeId?:string}>()
function create(){if(can('alarm:manage'))editor.value={}}
function edit(ruleId:string){if(can('alarm:manage'))editor.value={ruleId}}
function close(){editor.value=undefined}
function changed(){revision.value++;editor.value=undefined}
function history(ruleId:string){void router.push({path:'/alarm-history',query:{ruleId}})}
</script>

<template>
 <div class="alarm-rules-page">
  <AlarmRuleDirectoryView :key="revision" manage-available history-available @edit="edit" @history="history"><template #actions><el-button v-if="can('alarm:manage')" size="small" type="primary" :icon="Plus" @click="create">创建告警规则</el-button></template></AlarmRuleDirectoryView>
  <el-dialog :model-value="!!editor" :title="editor?.ruleId?'编辑告警规则':'创建告警规则'" width="min(900px,96vw)" :close-on-click-modal="false" append-to-body @update:model-value="(value:boolean)=>{if(!value)close()}">
   <ManagedAlarmRuleChoicesEditor v-if="editor" v-bind="editor" @close="close" @saved="changed" @removed="changed"/>
  </el-dialog>
 </div>
</template>
