<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {Plus,Delete,Refresh} from '@element-plus/icons-vue'
import {api,ApiError,errorMessage,identityEpoch,onIdentityChange} from '../../core/http'
import {can,currentProject,projectId} from '../../core/session'
import type {Schema} from '../../core/contracts'
import {propertyTransport} from './property-definition-api'
import {dataStreamTransport} from './data-stream-publication-api'

type Draft={conversionEnabled:boolean;streamIdentifier:string|null;transport:'MQTT'|'TCP'|null;options:{singleSwitch:boolean;multipleSwitches:boolean;singleNumber:boolean}}
type Row={propertyKey:string;slaveAddress:number|null;address:number;kind:'IO'|'DATA';access:'READ_ONLY'|'READ_WRITE';valueType:'BIT'|'INT16'|'UINT16'|'INT32'|'UINT32'|'FLOAT32';byteOrder:'AB'|'BA'|'ABCD'|'BADC'|'CDAB'|'DCBA'|null;coefficient:number|null;offset:number|null}
const props=defineProps<{typeId:string;deviceKind:'DIRECT'|'GATEWAY'|'SUB_DEVICE';disabled?:boolean}>()
const emit=defineEmits<{locked:[value:boolean]}>()
const revision=ref('0'),token=ref(''),loading=ref(false),busy=ref(false),error=ref(''),notice=ref(''),runtimeAvailable=ref(false)
const rows=shallowRef<Row[]>([]),streams=shallowRef<{identifier:string;format:string;disabled?:boolean}[]>([]),properties=shallowRef<{propertyKey:string;dataType:string;accessType:string}[]>([])
const draft=ref<Draft>({conversionEnabled:false,streamIdentifier:null,transport:null,options:{singleSwitch:true,multipleSwitches:true,singleNumber:true}})
const readable=computed(()=>can('device:read')&&!!projectId.value&&!!currentProject.value)
const writable=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&!props.disabled)
const propertyOptions=computed(()=>properties.value.filter(p=>['REPORT','SHARED','DOWNLINK'].includes(p.accessType)).map(p=>p.propertyKey))
const streamOptions=computed(()=>streams.value.filter(s=>!s.disabled).map(s=>s.identifier))
let generation=0,controller:AbortController|undefined
function base(){return `/api/v1/projects/${projectId.value}/device-types/${props.typeId}/modbus-register-draft` as const}
function apply(value:Schema<'DeviceTypeModbusRegisterDraftResponse'>){
  revision.value=value.revision;token.value=value.definitionToken;runtimeAvailable.value=value.runtimeAvailable==='false'
  const d=value.draft
  if(!d){draft.value={conversionEnabled:false,streamIdentifier:null,transport:null,options:{singleSwitch:true,multipleSwitches:true,singleNumber:true}};rows.value=[];return}
  draft.value={conversionEnabled:!!d.conversionEnabled,streamIdentifier:d.streamIdentifier??null,transport:(d.transport as 'MQTT'|'TCP'|undefined)??null,
    options:{singleSwitch:d.options?.singleSwitch!==false,multipleSwitches:d.options?.multipleSwitches!==false,singleNumber:d.options?.singleNumber!==false}}
  rows.value=(d.registers??[]).map(row=>({propertyKey:row.propertyKey??'',slaveAddress:row.slaveAddress??null,address:row.address??0,kind:(row.kind as 'IO'|'DATA')??'IO',access:(row.access as 'READ_ONLY'|'READ_WRITE')??'READ_ONLY',valueType:(row.valueType as Row['valueType'])??'BIT',byteOrder:(row.byteOrder as Row['byteOrder'])??null,coefficient:row.coefficient??null,offset:row.offset??null}))
}
async function load(){
  if(!readable.value)return;const token0=++generation,project=projectId.value;controller?.abort();controller=new AbortController();loading.value=true;error.value=''
  try{const value=await api<Schema<'DeviceTypeModbusRegisterDraftResponse'>>(base(),{signal:controller.signal});if(token0!==generation||project!==projectId.value)return;apply(value)}
  catch(cause){if(token0===generation)error.value=errorMessage(cause)}
  finally{if(token0===generation)loading.value=false}
}
async function loadChoices(){
  const project=projectId.value;try{const [defs,data]=await Promise.all([propertyTransport.list(project,props.typeId,controller!.signal),dataStreamTransport.read(project,props.typeId,controller!.signal)]);properties.value=(defs??[]).map(d=>({propertyKey:d.propertyKey,dataType:d.dataType,accessType:d.accessType}));streams.value=(data.publication?.definition.streams??[]).map(stream=>({identifier:stream.identifier,format:stream.format,disabled:stream.disabled}))}catch{properties.value=[];streams.value=[]}
}
function addRow(){if(!writable.value||rows.value.length>=256)return;rows.value=[...rows.value,{propertyKey:'',slaveAddress:props.deviceKind==='SUB_DEVICE'?null:1,address:0,kind:'IO',access:'READ_ONLY',valueType:'BIT',byteOrder:null,coefficient:null,offset:null}]}
function removeRow(index:number){if(writable.value)rows.value=rows.value.filter((_,i)=>i!==index)}
function kindChanged(row:Row){if(row.kind==='IO'){row.valueType='BIT';row.byteOrder=null;row.coefficient=null;row.offset=null}else{row.valueType='UINT16';row.byteOrder='AB';row.coefficient=1;row.offset=0}}
function number(value:unknown){return typeof value==='number'&&Number.isSafeInteger(value)?value:null}
async function save(){
  if(!writable.value||busy.value)return;busy.value=true;emit('locked',true);error.value='';notice.value=''
  try{
    const body={expectedRevision:revision.value,definitionToken:token.value,draft:{conversionEnabled:draft.value.conversionEnabled,streamIdentifier:draft.value.streamIdentifier||null,transport:draft.value.streamIdentifier?draft.value.transport:null,options:draft.value.options,registers:rows.value.map(row=>({propertyKey:row.propertyKey,slaveAddress:row.slaveAddress??null,address:number(row.address)??0,kind:row.kind,access:row.access,valueType:row.valueType,byteOrder:row.kind==='IO'?null:row.byteOrder,coefficient:row.kind==='IO'?null:row.coefficient,offset:row.kind==='IO'?null:row.offset}))}}
    const value=await api<Schema<'DeviceTypeModbusRegisterDraftResponse'>>(base(),{method:'put',body:body as never})
    apply(value);notice.value='寄存器草稿已保存；未启用自动转换'
  }catch(cause){error.value=cause instanceof ApiError&&cause.status===409?'寄存器草稿或类型定义已变化，请重新读取后再编辑':errorMessage(cause)}
  finally{busy.value=false;emit('locked',false)}
}
watch([projectId,()=>props.typeId,()=>props.disabled],()=>{if(!readable.value)return;void load().then(()=>loadChoices())},{immediate:true,flush:'post'})
const dispose=onIdentityChange(()=>{generation++;controller?.abort()});onScopeDispose(()=>{generation++;controller?.abort();dispose();emit('locked',false)})
</script>

<template>
 <section class="type-modbus-registers">
  <header><h2>Modbus 寄存器</h2><el-button :icon="Refresh" :loading="loading" :disabled="busy" @click="load">刷新</el-button></header>
  <el-alert v-if="runtimeAvailable" type="warning" :closable="false" title="当前仅保存类型级寄存器草稿；自动解析、下发转换和设备运行尚未启用。"/>
  <el-alert v-if="error" type="error" :closable="false" :title="error"/>
  <p v-if="notice" role="status">{{notice}}</p>
  <el-form label-position="top" :disabled="!writable||busy" @submit.prevent>
   <div class="row"><el-form-item label="自动转换"><el-switch v-model="draft.conversionEnabled" aria-label="启用自动转换"/></el-form-item>
    <el-form-item label="数据流"><el-select v-model="draft.streamIdentifier" clearable aria-label="寄存器数据流" placeholder="可先留空"><el-option v-for="stream in streamOptions" :key="stream" :label="stream" :value="stream"/></el-select></el-form-item>
    <el-form-item label="传输"><el-select v-model="draft.transport" clearable aria-label="寄存器传输"><el-option label="MQTT" value="MQTT"/><el-option label="TCP" value="TCP"/></el-select></el-form-item></div>
   <div class="row options"><el-checkbox v-model="draft.options.singleSwitch">单开关下发</el-checkbox><el-checkbox v-model="draft.options.multipleSwitches">多开关下发</el-checkbox><el-checkbox v-model="draft.options.singleNumber">单数值下发</el-checkbox></div>
   <div class="register-head"><span>属性</span><span>从站</span><span>地址</span><span>类型</span><span>读写</span><span>值类型</span><span>字节序</span><span>系数</span><span>偏移</span><span/></div>
   <div v-for="(row,index) in rows" :key="index" class="register-row">
    <el-select v-model="row.propertyKey" aria-label="寄存器属性" filterable><el-option v-for="key in propertyOptions" :key="key" :label="key" :value="key"/></el-select>
    <el-input v-model.number="row.slaveAddress" aria-label="从站地址" placeholder="实际子设备"/>
    <el-input v-model.number="row.address" aria-label="寄存器地址"/>
    <el-select v-model="row.kind" aria-label="寄存器类别" @change="kindChanged(row)"><el-option label="IO" value="IO"/><el-option label="DATA" value="DATA"/></el-select>
    <el-select v-model="row.access" aria-label="寄存器读写"><el-option label="只读" value="READ_ONLY"/><el-option label="读写" value="READ_WRITE"/></el-select>
    <el-select v-model="row.valueType" aria-label="寄存器值类型"><el-option v-for="v in ['BIT','INT16','UINT16','INT32','UINT32','FLOAT32']" :key="v" :label="v" :value="v"/></el-select>
    <el-select v-model="row.byteOrder" aria-label="寄存器字节序" :disabled="row.kind==='IO'"><el-option v-for="v in ['AB','BA','ABCD','BADC','CDAB','DCBA']" :key="v" :label="v" :value="v"/></el-select>
    <el-input v-model.number="row.coefficient" aria-label="寄存器系数" :disabled="row.kind==='IO'"/>
    <el-input v-model.number="row.offset" aria-label="寄存器偏移" :disabled="row.kind==='IO'"/>
    <el-button :icon="Delete" aria-label="移除寄存器" :disabled="!writable||busy" @click="removeRow(index)"/>
   </div>
   <div class="actions"><el-button :icon="Plus" :disabled="!writable||busy||rows.length>=256" @click="addRow">添加寄存器</el-button><el-button type="primary" :loading="busy" :disabled="!writable" @click="save">保存草稿</el-button></div>
  </el-form>
 </section>
</template>

<style scoped>
.type-modbus-registers{margin:20px 0}.type-modbus-registers header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.type-modbus-registers h2{font-size:22px;line-height:32px;font-weight:400;color:#002822;margin:0}.type-modbus-registers .row{display:flex;gap:16px;flex-wrap:wrap}.type-modbus-registers .options{gap:24px;margin:8px 0 16px}.register-head,.register-row{display:grid;grid-template-columns:1.4fr .8fr .8fr .8fr .8fr 1fr .8fr .8fr .8fr 36px;gap:8px;align-items:center}.register-head{font-size:12px;color:var(--tl-muted);padding:8px 0;border-bottom:1px solid var(--tl-border)}.register-row{padding:8px 0;border-bottom:1px solid var(--tl-border)}.actions{display:flex;gap:12px;margin-top:16px}@media(max-width:900px){.register-head{display:none}.register-row{grid-template-columns:1fr 1fr}}
</style>
