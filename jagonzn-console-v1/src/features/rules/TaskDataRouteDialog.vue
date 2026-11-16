<script setup lang="ts">
import {ref,watch} from 'vue'
import {errorMessage} from '@/core/http'
import RuleDataStreamIdentifier from './RuleDataStreamIdentifier.vue'
import type {TaskDataRoute} from './task-content-api'
const props=defineProps<{modelValue:boolean;value?:{protocol:string;streamIdentifier:string};busy?:boolean;locked?:boolean;pending?:boolean;error?:string}>()
const emit=defineEmits<{'update:modelValue':[value:boolean];save:[value:TaskDataRoute];verify:[]}>()
const protocol=ref(''),streamIdentifier=ref(''),localError=ref('')
// 仅打开时复制；未知保存后读取的新定义不得覆盖原路由意图。
watch(()=>props.modelValue,()=>{
 protocol.value='';streamIdentifier.value='';localError.value=''
 if(!props.modelValue)return
 if(!props.value){localError.value='自定义下发设置不完整，请重新读取。';return}
 protocol.value=props.value.protocol;streamIdentifier.value=props.value.streamIdentifier
},{immediate:true})
function close(){if(props.busy||props.pending)return;protocol.value='';streamIdentifier.value='';localError.value='';emit('update:modelValue',false)}
function save(){
 if(!props.modelValue||props.busy||props.locked||props.pending)return
 try{
  if(protocol.value!=='MQTT'&&protocol.value!=='TCP')throw new Error('请选择有效的推送方式。')
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(streamIdentifier.value))throw new Error('自定义数据流标识符须为1至64位字母、数字、下划线或短横线。')
  localError.value='';emit('save',{protocol:protocol.value,streamIdentifier:streamIdentifier.value})
 }catch(cause){localError.value=errorMessage(cause)}
}
</script>
<template>
 <el-dialog :model-value="modelValue" class="task-data-route-dialog" title="设置自定义下发" width="500px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!busy&&!pending" :show-close="!busy&&!pending" destroy-on-close append-to-body @update:model-value="close">
  <el-form v-if="modelValue" label-position="top" :disabled="busy||locked||pending" @submit.prevent="save">
   <el-form-item label="推送方式"><el-radio-group v-model="protocol" aria-label="推送方式" :disabled="busy||locked||pending"><el-radio value="MQTT">MQTT</el-radio><el-radio value="TCP">TCP</el-radio></el-radio-group></el-form-item>
   <el-form-item label="自定义数据流标识符"><RuleDataStreamIdentifier v-model="streamIdentifier" :choices="[]" :disabled="busy||locked||pending"/></el-form-item>
  </el-form>
  <el-alert v-if="localError||error" :title="localError||error" type="warning" :closable="false"/>
  <template #footer><el-button :disabled="busy||pending" @click="close">取消</el-button><el-button v-if="pending" :disabled="busy" @click="emit('verify')">重新读取核对</el-button><el-button type="primary" :loading="busy" :disabled="locked||pending||!value" @click="save">保存</el-button></template>
 </el-dialog>
</template>
<style scoped>
.task-data-route-dialog :deep(.el-dialog__title){font-size:18px;font-weight:400}
.task-data-route-dialog :deep(.el-dialog__body){padding:30px 20px}
.task-data-route-dialog :deep(.el-form-item){margin-bottom:22px}
.task-data-route-dialog :deep(.el-form-item__label){padding:0;margin-bottom:0;line-height:32px;color:#606266;font-size:14px;font-weight:700}
.task-data-route-dialog :deep(.el-form-item__content){min-height:40px;line-height:40px}
</style>
