<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import { can, projectId } from '../../core/session'
import { useResource } from '../../core/use-resource'
import { ApiError, assertIdentity, identityEpoch, IdentityChanged, onIdentityChange, errorMessage } from '../../core/http'
import AsyncState from '../../ui/AsyncState.vue'
import { alarmApi } from './api'
import { managedEmailEditRequest } from './model'
const props=defineProps<{groupId:string}>(),emit=defineEmits<{close:[];saved:[]}>()
const resource=useResource(signal=>alarmApi.groupEmailEditOptions(projectId.value,props.groupId,signal))
const text=ref(''),busy=ref(false),error=ref(''),review=ref(false)
let serial=0
function clear(){serial++;text.value='';busy.value=false;error.value='';review.value=false;resource.clear()}
const dispose=onIdentityChange(()=>{clear();emit('close')});onScopeDispose(()=>{serial++;dispose()})
watch(()=>can('alarm:manage'),value=>{if(!value){clear();emit('close')}},{flush:'sync'})
watch(resource.data,value=>{if(value&&!busy.value)text.value=value.filter(row=>row.enabled).map(row=>row.email).join('\n')})
watch(resource.error,value=>{if(value){text.value='';resource.data.value=undefined}})
watch([projectId,()=>props.groupId],async()=>{clear();if(projectId.value&&can('alarm:manage')){await resource.reload();if(resource.data.value)text.value=resource.data.value.filter(row=>row.enabled).map(row=>row.email).join('\n')}},{immediate:true})
async function save(){
 if(!can('alarm:manage')||busy.value||review.value||resource.loading.value||resource.error.value||!resource.data.value)return
 const epoch=identityEpoch(),request=++serial;busy.value=true;error.value=''
 try{const body=managedEmailEditRequest(text.value,resource.data.value);await alarmApi.saveGroupEmailOptions(projectId.value,props.groupId,body);assertIdentity(epoch);if(request!==serial)return;emit('saved');emit('close')}
 catch(cause){if(cause instanceof IdentityChanged||request!==serial)return;error.value=errorMessage(cause);review.value=cause instanceof ApiError&&(cause.outcomeUnknown||cause.status===409)}
 finally{if(request===serial)busy.value=false}
}
</script>
<template><el-dialog :model-value="true" title="修改通知方式" width="min(800px, 94vw)" :show-close="!busy" :close-on-click-modal="!busy" :close-on-press-escape="!busy" @close="emit('close')"><AsyncState :loading="resource.loading.value" :error="resource.error.value" @retry="resource.reload"><el-form label-position="top"><el-form-item><template #label>设置邮箱 <el-tooltip content="多个邮箱请用换行分隔。"><el-icon class="email-help" tabindex="0" aria-label="多个邮箱请用换行分隔。"><QuestionFilled /></el-icon></el-tooltip></template><el-input v-model="text" type="textarea" :rows="3" :disabled="busy" aria-label="设置邮箱" /></el-form-item></el-form></AsyncState><el-alert v-if="error" :title="error+(review?'；请关闭后重新读取核对。':'')" type="error" :closable="false" /><template #footer><el-button :disabled="busy" @click="emit('close')">取消</el-button><el-button type="primary" :loading="busy" :disabled="review||resource.loading.value||!!resource.error.value||!resource.data.value||!can('alarm:manage')" @click="save">保存</el-button></template></el-dialog></template>

<style scoped>.email-help { color:var(--tl-muted); font-size:12px; margin-left:4px; vertical-align:middle; }</style>
