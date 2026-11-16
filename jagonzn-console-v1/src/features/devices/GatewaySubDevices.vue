<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {formatTime} from '@/core/time'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {deviceTopologyAddressMatches,deviceTopologyAddressTransport,prepareDeviceTopologyAddress,type DeviceTopologyBinding,type DeviceTopologyAddressIntent,type DeviceTopologyAddressTransport} from './device-topology-address-api'
const props=withDefaults(defineProps<{gatewayId:string;disabled?:boolean;readBlocked?:boolean;portal?:boolean;target?:HTMLElement;transport?:DeviceTopologyAddressTransport}>(),{disabled:false,transport:()=>deviceTopologyAddressTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>()
const denied=ref(false),scopeReadable=computed(()=>!props.readBlocked&&session.ready&&!session.transitioning&&!!session.user?.accountId&&session.user.currentProjectId===projectId.value&&currentProject.value?.id===projectId.value&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.gatewayId)&&can('device:read')),readable=computed(()=>scopeReadable.value&&!denied.value)
const scopeWritable=computed(()=>scopeReadable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||'')),writable=computed(()=>scopeWritable.value&&!denied.value)
const rows=shallowRef<readonly DeviceTopologyBinding[]>(),snapshot=shallowRef<DeviceTopologyBinding>(),intent=shallowRef<DeviceTopologyAddressIntent>(),observed=shallowRef<readonly DeviceTopologyBinding[]>(),review=ref<'unknown'|'rejected'>(),shown=ref(false),busy=ref(false),address=ref(''),error=ref(''),notice=ref('')
const locked=computed(()=>shown.value||busy.value||!!review.value),observedOriginal=computed(()=>observed.value?.find(row=>row.id===intent.value?.body.bindingId&&row.subDeviceId===intent.value?.subDeviceId))
const observation=computed(()=>!observed.value||!intent.value?'':!observedOriginal.value?'原绑定已不在当前有效列表；新的绑定不能证明原操作成功。':deviceTopologyAddressMatches(observedOriginal.value,intent.value)?'原绑定当前地址及代次与本次意图一致；只读结果不能证明原请求成功。':'原绑定当前地址或代次与本次意图不同；原请求结果仍不能确认。')
let generation=0,alive=true,controller:AbortController|undefined
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,gateway:props.gatewayId,account:session.user?.accountId}}
function scopeCurrent(s:ReturnType<typeof capture>){return alive&&scopeReadable.value&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.gateway===props.gatewayId&&s.account===session.user?.accountId}
function current(s:ReturnType<typeof capture>){return scopeCurrent(s)&&readable.value}
function clear(){generation++;controller?.abort();rows.value=undefined;snapshot.value=undefined;intent.value=undefined;observed.value=undefined;review.value=undefined;shown.value=false;busy.value=false;address.value='';error.value='';notice.value=''}
function deny(){if(review.value){generation++;controller?.abort();rows.value=undefined;observed.value=undefined;shown.value=false;snapshot.value=undefined;address.value='';busy.value=false;error.value=''}else clear();denied.value=true}
async function load(recover=false){
 if(!scopeReadable.value||busy.value||shown.value||review.value&&!recover||!recover&&props.disabled)return
 const s=capture();busy.value=true;error.value='';controller=new AbortController()
 try{const value=await props.transport.list(s.project,s.gateway,controller.signal);if(scopeCurrent(s)){if(recover)observed.value=value;else rows.value=value;denied.value=false}}
 catch(cause){if(scopeCurrent(s)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status))deny();else error.value=errorMessage(cause)}}finally{if(scopeCurrent(s))busy.value=false}
}
function edit(row:DeviceTopologyBinding){if(!writable.value||props.disabled||locked.value||!rows.value?.includes(row))return;snapshot.value=row;address.value=row.subDeviceAddress??'';error.value='';notice.value='';shown.value=true}
function cancel(){if(busy.value)return;shown.value=false;snapshot.value=undefined;address.value='';error.value=''}
async function save(remove=false){
 if(!writable.value||props.disabled||busy.value||review.value||!snapshot.value)return
 let original:DeviceTopologyAddressIntent
 try{original=prepareDeviceTopologyAddress(projectId.value,props.gatewayId,snapshot.value,remove?null:address.value)}catch(cause){error.value=errorMessage(cause);return}
 intent.value=original;review.value='unknown';observed.value=undefined;shown.value=false;snapshot.value=undefined;address.value='';busy.value=true;error.value='';const s=capture();controller=new AbortController();let accepted=false
 try{const returned=await props.transport.change(original,controller.signal);accepted=true;if(!current(s))return;if(!deviceTopologyAddressMatches(returned,original))throw new Error('保存回执与原绑定或地址意图不符，请只读核对');const actual=await props.transport.list(original.project,original.gatewayId,controller.signal);if(!current(s))return;if(!actual.some(row=>deviceTopologyAddressMatches(row,original)))throw new Error('原绑定或地址已发生变化，请只读核对');rows.value=actual;intent.value=undefined;review.value=undefined;notice.value=remove?'子设备地址已清除并回读。':'子设备地址已保存并回读。';emit('changed')}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}const rejected=!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.status>=400&&cause.status<500&&cause.code!==10014;review.value=rejected?'rejected':'unknown';error.value=errorMessage(cause)}}finally{if(current(s))busy.value=false}
}
function finish(){if(!review.value||busy.value||!observed.value)return;const unknown=review.value==='unknown';rows.value=observed.value;observed.value=undefined;review.value=undefined;intent.value=undefined;error.value='';notice.value=unknown?'已采用当前列表；原保存结果仍未确认，没有重新提交。':'已读取当前列表；被拒绝的保存未重试。'}
function reset(){clear();denied.value=false;if(readable.value)void load()}
let previous:readonly [string,string|undefined,string,DeviceTopologyAddressTransport]|undefined
function changedScope(){const same=previous?.[0]===projectId.value&&previous?.[1]===session.user?.accountId&&previous?.[2]===props.gatewayId&&previous?.[3]===props.transport;previous=[projectId.value,session.user?.accountId,props.gatewayId,props.transport];if(same&&review.value){if(!readable.value||!writable.value){generation++;controller?.abort();busy.value=false;shown.value=false;snapshot.value=undefined;address.value='';observed.value=undefined;error.value='';if(!readable.value)rows.value=undefined}return}reset()}
watch([()=>projectId.value,()=>session.user?.accountId,()=>props.gatewayId,()=>props.transport,scopeReadable,scopeWritable],changedScope,{immediate:true,flush:'sync'})
watch(scopeReadable,value=>{if(value)denied.value=false},{flush:'sync'})
watch(writable,value=>{if(!value&&!review.value)cancel()},{flush:'sync'});watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;clear();dispose();emit('locked',false)})
</script>
<template><Teleport :to="target||'body'" :disabled="!target"><section v-if="!portal||target||review" class="gateway-subdevices"><header><h2>子设备</h2><el-button :disabled="!scopeReadable||disabled||locked" :loading="busy&&!review" @click="load()">刷新子设备</el-button></header>
 <p>当前网关已关联的子设备。地址属于这条有效绑定，保留大小写和前导零；解绑或换绑后不沿用。</p>
 <p v-if="!readable" role="status">当前账号没有读取权限。</p><el-alert v-if="error&&!shown" :title="error" type="error" :closable="false"/><el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <el-table v-if="readable" :data="rows??[]" empty-text="当前网关暂无已关联子设备" v-loading="busy&&!review">
  <el-table-column label="子设备 ID" min-width="280"><template #default="{row}"><router-link :to="'/devices/'+row.subDeviceId">{{row.subDeviceId}}</router-link></template></el-table-column>
  <el-table-column label="子设备地址" min-width="150"><template #default="{row}"><code>{{row.subDeviceAddress??'未设置'}}</code></template></el-table-column>
  <el-table-column label="接入状态" width="110"><template #default="{row}">{{row.onlineStatus==='ONLINE'?'在线':row.onlineStatus==='OFFLINE'?'离线':'未知'}}</template></el-table-column>
  <el-table-column label="关联时间" min-width="170"><template #default="{row}">{{formatTime(row.boundAt)}}</template></el-table-column>
  <el-table-column v-if="writable" width="120"><template #default="{row}"><el-button size="small" :disabled="disabled||locked" @click="edit(row)">编辑地址</el-button></template></el-table-column>
 </el-table>
 <p v-if="review&&!readable" role="status">原地址保存仍待核对，恢复读取权限后可读取原绑定；不会再次保存。</p><el-button v-if="review&&denied&&scopeReadable" :loading="busy" @click="load(true)">重新读取原绑定核对</el-button><template v-if="review&&readable"><el-alert :title="review==='unknown'?'原地址保存结果未知，不会自动重发。':'本次地址保存已被拒绝，不会自动重发。'" type="warning" :closable="false"/><p>原请求键：{{intent?.key}} · 原绑定：{{intent?.body.bindingId}} · 原地址代次：{{intent?.body.expectedAddressRevision}} · 本次地址：{{intent?.body.subDeviceAddress??'清除'}}</p><p v-if="observation" role="status">{{observation}}</p><el-button :loading="busy" @click="load(true)">读取原绑定核对</el-button><el-button :disabled="busy||!observed" @click="finish">采用当前列表并结束核对</el-button></template>
 <el-dialog :model-value="shown&&readable&&writable" title="编辑子设备地址" width="min(520px,94vw)" :close-on-click-modal="false" @close="cancel"><el-alert v-if="error" :title="error" type="error" :closable="false"/><p>子设备 {{snapshot?.subDeviceId}}</p><el-form label-position="top" @submit.prevent="save()"><el-form-item label="子设备地址"><el-input v-model="address" aria-label="子设备地址" maxlength="64" :disabled="busy||disabled"/></el-form-item></el-form><p>1至64位字母、数字或 . _ : -；清除地址请明确点击清除。</p><template #footer><el-button :disabled="busy" @click="cancel">取消</el-button><el-button :disabled="disabled||busy||!writable||snapshot?.subDeviceAddress===null" @click="save(true)">清除地址</el-button><el-button type="primary" :disabled="disabled||busy||!writable" @click="save()">保存地址</el-button></template></el-dialog>
</section></Teleport></template>
<style scoped>.gateway-subdevices header{display:flex;align-items:center;justify-content:space-between;gap:12px}.gateway-subdevices h2{font-size:22px;font-weight:400}.gateway-subdevices p{font-size:13px;color:var(--tl-muted);line-height:1.7;overflow-wrap:anywhere}.gateway-subdevices code{white-space:pre-wrap;overflow-wrap:anywhere}</style>
