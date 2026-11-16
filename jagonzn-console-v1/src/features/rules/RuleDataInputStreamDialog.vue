<script setup lang="ts">
import {ref} from 'vue'
import {errorMessage} from '@/core/http'
import type {DataStreamItem} from '../device-types/data-stream-publication-api'
import RuleDataStreamIdentifier from './RuleDataStreamIdentifier.vue'
const props=defineProps<{identifier:string;choices:readonly DataStreamItem[];disabled?:boolean;validationError?:string}>()
const emit=defineEmits<{save:[identifier:string];cancel:[]}>()
const identifier=ref(props.identifier),error=ref('')
function cancel(){if(!props.disabled)emit('cancel')}
function save(){if(props.disabled)return;try{if(!/^[A-Za-z0-9_-]{1,64}$/.test(identifier.value))throw new Error('请填写1～64位字母、数字、下划线或短横线的数据流标识符');error.value='';emit('save',identifier.value)}catch(cause){error.value=errorMessage(cause)}}
</script>
<template><el-dialog :model-value="true" title="设置自定义数据流" class="rule-data-input-stream-dialog" width="500px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!disabled" :show-close="!disabled" :before-close="cancel" append-to-body>
 <el-form label-position="top" :disabled="disabled" @submit.prevent="save"><el-form-item label="自定义数据流标识符" :error="error||validationError"><RuleDataStreamIdentifier v-model="identifier" :choices="choices" :disabled="disabled"/></el-form-item></el-form>
 <template #footer><el-form :disabled="false" class="dialog-actions"><el-button :disabled="disabled" @click="cancel">取消</el-button><el-button type="primary" :disabled="disabled" @click="save">保存</el-button></el-form></template>
</el-dialog></template>
<style>
.rule-data-input-stream-dialog .el-dialog__body{padding:30px 20px}
.rule-data-input-stream-dialog .el-form-item{margin-bottom:22px}
.rule-data-input-stream-dialog .el-form-item__label{display:inline-block;float:none;width:100%;height:auto;line-height:32px;margin-bottom:0;padding:0;font-size:14px;font-weight:700;color:#606266}
.rule-data-input-stream-dialog .dialog-actions{display:flex;justify-content:flex-end;gap:10px}
.rule-data-input-stream-dialog .dialog-actions .el-button+.el-button{margin-left:0}
</style>
