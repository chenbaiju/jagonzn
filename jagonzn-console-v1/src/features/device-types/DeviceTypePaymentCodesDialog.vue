<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {readTypeDevices,typeDeviceUuid} from './type-devices-api'

const props=defineProps<{typeId:string;disabled?:boolean}>()
const emit=defineEmits<{locked:[boolean]}>()
const shown=ref(false),details=ref(false),page=ref(1),limit=24
const roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&can('device:read')
 &&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)
 &&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||'')
 &&['ACTIVE','ARCHIVED'].includes(currentProject.value?.status||''))
const resource=useResource(signal=>readTypeDevices(projectId.value,props.typeId,{page:page.value,limit},signal))

function load(){
 if(shown.value&&readable.value)void resource.reload()
}
function open(){
 if(!readable.value||props.disabled)return
 shown.value=true
 load()
}
function close(){
 details.value=false
 shown.value=false
 page.value=1
 resource.clear()
}
function changePage(value:number){
 if(!shown.value||!readable.value||details.value||resource.loading.value||!Number.isSafeInteger(value)||value<1||value>10000)return
 page.value=value
 resource.clear()
 load()
}
watch([projectId,()=>props.typeId,()=>session.user?.accountId,readable],close,{flush:'sync'})
watch(shown,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(close)
onScopeDispose(()=>{dispose();emit('locked',false)})
</script>

<template>
 <el-button :disabled="disabled||!readable||shown" @click="open">查看</el-button>
 <el-dialog :model-value="shown&&readable" title="查看设备付款码" class="type-payment-codes-dialog" width="min(800px,94vw)" @close="close">
  <AsyncState :loading="resource.loading.value" :error="resource.error.value" @retry="load">
   <el-table v-if="resource.data.value" :data="resource.data.value.items" row-key="id" empty-text="暂无数据">
    <el-table-column label="设备名称" min-width="180">
     <template #default="{row}"><RouterLink :to="'/devices/'+row.id" target="_blank" rel="noopener">{{row.name}}</RouterLink></template>
    </el-table-column>
    <el-table-column label="设备ID" prop="id" min-width="180" class-name="payment-device-id"/>
    <el-table-column label="付款码" width="80" align="center">
     <template #default="{row}"><el-button link type="primary" :aria-label="'查看 '+row.name+' 的付款码'" @click="details=true">查看</el-button></template>
    </el-table-column>
   </el-table>
   <CursorPager v-if="resource.data.value?.items.length||page>1" :page="page" :limit="limit" :total="resource.data.value?.total" :show-sizes="false" :loading="resource.loading.value" @update:page="changePage"/>
  </AsyncState>
  <el-dialog v-model="details" append-to-body title="查看设备付款码" class="type-payment-detail-dialog" width="min(500px,94vw)">
   <el-alert title="当前项目尚未接入 ThingsPay 付款服务。" type="warning" show-icon :closable="false"/>
   <div class="tl-learning-resource"><ReferenceIcon glyph="󰋽"/><a href="https://www.thingscloud.xyz/docs/guide/device-type/pay-page-editor.html" target="_blank" rel="noopener noreferrer">如何生成设备付款页面和付款码？ <ReferenceIcon glyph="󰏌"/></a></div>
   <section class="payment-detail-field"><h4>设备付款码</h4><p>配置付款页面和付款应用后，可通过扫码打开设备付款页面。</p><span>暂不可获取</span></section>
   <section class="payment-detail-field"><h4>设备付款页面 URL</h4><p>付款页面 URL 可用于生成设备屏幕上展示的二维码。</p><span>暂不可获取</span></section>
  </el-dialog>
 </el-dialog>
</template>

<style scoped>
.el-table :deep(th.el-table__cell) { height: 49px; color: #303133; }
.el-table :deep(.payment-device-id) { overflow-wrap: anywhere; }
.el-table :deep(.el-table__empty-text) { line-height: 60px; }
.payment-detail-field+.payment-detail-field { margin-top: 28px; }
.payment-detail-field h4 { margin: 0 0 4px; font-weight: 500; }
.payment-detail-field p { margin: 0 0 10px; color: #999; }
:global(.type-payment-codes-dialog .el-dialog__body) { padding: 30px 20px; }
:global(.type-payment-detail-dialog .el-dialog__body) { padding: 30px 20px 52px; }
</style>
