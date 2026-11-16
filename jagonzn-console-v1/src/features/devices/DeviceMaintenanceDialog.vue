<script setup lang="ts">
import {WarningFilled} from '@element-plus/icons-vue'
import type {DeviceMaintenanceState} from './use-device-maintenance-action'
const props=defineProps<{state:DeviceMaintenanceState}>()
function beforeClose(done:()=>void){if(props.state.writing.value)return;props.state.close();done()}
</script>
<template><el-dialog :model-value="state.shown.value" title="提示" width="min(420px,94vw)" class="device-maintenance-dialog" align-center :close-on-click-modal="false" :close-on-press-escape="!state.writing.value" :show-close="!state.writing.value" :before-close="beforeClose">
 <div class="maintenance-message"><el-icon><WarningFilled/></el-icon><span>{{state.message.value}}</span></div>
 <p v-if="state.kind==='remove'&&!state.review.value">最近24小时内成功上报数据的设备，以及仍有子设备关联的网关，不能移除。设备移除后无法恢复。</p>
 <el-alert v-if="state.error.value" :title="state.error.value" type="error" :closable="false"/>
 <template v-if="state.review.value&&!state.writing.value"><p>操作结果需要核对。读取当前状态不会重新提交，也不能证明原请求的历史结果。</p><el-button size="small" :loading="state.checking.value" @click="state.reread">读取当前状态</el-button><p v-if="state.checked.value">{{state.kind==='remove'?'当前设备仍存在。':state.currentAccess.value?.enabled?'当前状态：正常。':'当前状态：已停用。'}}</p><el-button v-if="state.canContinue.value" size="small" @click="state.continueWithCurrent">按当前状态重新确认</el-button><el-button v-if="state.canFinish.value" size="small" @click="state.finishReview">结束核对</el-button></template>
 <template #footer><el-button size="small" :disabled="state.writing.value" @click="state.close">{{state.review.value?'关闭':'取消'}}</el-button><el-button v-if="!state.review.value||state.writing.value" size="small" type="primary" :loading="state.writing.value" :disabled="!state.allowed.value||state.writing.value||!!state.error.value" @click="state.confirm.value">确定</el-button></template>
</el-dialog></template>
<style>
.device-maintenance-dialog .el-dialog__header{padding:15px 15px 10px;line-height:18px}.device-maintenance-dialog .el-dialog__title{display:block;font-size:18px;line-height:18px;font-weight:400}.device-maintenance-dialog .el-dialog__headerbtn{top:5px;right:5px;width:30px;height:30px}.device-maintenance-dialog .el-dialog__body{padding:10px 15px;font-size:14px;line-height:24px}.device-maintenance-dialog .el-dialog__footer{padding:5px 15px 10px}.device-maintenance-dialog .maintenance-message{display:flex;align-items:center;gap:12px;min-height:24px}.device-maintenance-dialog .maintenance-message .el-icon{font-size:24px;color:#e6a23c;flex-shrink:0}.device-maintenance-dialog p{margin:10px 0}.device-maintenance-dialog .el-alert{margin-top:10px}
</style>
