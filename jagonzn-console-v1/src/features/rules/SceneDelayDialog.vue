<script setup lang="ts">
import {computed,ref} from 'vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {sceneDelayConfig,sceneDelayNode,sceneDelayPresentation,type SceneNode} from './scene-editor-draft'
const props=defineProps<{value?:SceneNode;disabled?:boolean}>(),emit=defineEmits<{save:[node:SceneNode];cancel:[]}>()
const initial=props.value?sceneDelayConfig(props.value):{durationSeconds:10},seconds=initial?.durationSeconds??10
const unit=ref<'sec'|'min'>(seconds>=60&&seconds%60===0?'min':'sec'),amount=ref<number|undefined>(unit.value==='min'?seconds/60:seconds),error=ref('')
const maximum=computed(()=>unit.value==='min'?1440:86400),unitLabel=computed(()=>unit.value==='min'?'分钟':'秒')
function changeUnit(value:'sec'|'min'){
 if(props.disabled)return
 unit.value=value
 if(typeof amount.value==='number'&&amount.value>maximum.value)amount.value=value==='min'?10:60
 error.value=''
}
function save(){
 if(props.disabled)return
 if(!initial){error.value='原延迟动作配置不完整，请重新读取。';return}
 if(typeof amount.value!=='number'||!Number.isInteger(amount.value)||amount.value<1||amount.value>maximum.value){error.value=`请填写延迟时长（1 至 ${maximum.value} ${unitLabel.value}）`;return}
 emit('save',{nodeType:sceneDelayNode,config:{durationSeconds:amount.value*(unit.value==='min'?60:1)}})
}
</script>
<template><el-dialog :model-value="true" title="配置动作" width="800px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!disabled" :show-close="!disabled" append-to-body @update:model-value="!disabled&&emit('cancel')">
 <div class="scene-delay-type"><span :style="{background:sceneDelayPresentation.background,color:sceneDelayPresentation.color}"><ReferenceIcon :glyph="sceneDelayPresentation.glyph"/></span><div><strong>{{sceneDelayPresentation.label}}</strong><p>{{sceneDelayPresentation.description}}</p></div></div>
 <el-form label-position="top" :disabled="disabled"><el-form-item label="时间单位"><el-radio-group :model-value="unit" aria-label="延迟时间单位" :disabled="disabled" @update:model-value="changeUnit"><el-radio value="sec">秒</el-radio><el-radio value="min">分钟</el-radio></el-radio-group></el-form-item>
 <el-form-item label="延迟时长"><el-input-number v-model="amount" aria-label="延迟时长" :min="1" :max="maximum" :step="1" size="small" controls-position="right" :disabled="disabled"/><span class="scene-delay-unit">{{unitLabel}}</span><div class="form-item-tip">延迟 {{amount||1}} {{unitLabel}} 后执行下一个动作</div></el-form-item></el-form>
 <el-alert v-if="error" :title="error" type="warning" :closable="false"/>
 <template #footer><el-button :disabled="disabled" @click="emit('cancel')">取消</el-button><el-button type="primary" :disabled="disabled" @click="save">确定</el-button></template>
</el-dialog></template>
<style scoped>.scene-delay-type{display:flex;align-items:center;gap:14px;padding:14px 16px;background:#f8f9fa;border-radius:8px;margin-bottom:20px}.scene-delay-type>span{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:10px;flex:none}.scene-delay-type .reference-icon{font-size:22px}.scene-delay-type strong{font-size:15px;font-weight:600;color:#333}.scene-delay-type p{font-size:13px;color:#888;margin:4px 0 0}.scene-delay-unit{margin-left:8px;color:#6b7280}.form-item-tip{flex-basis:100%;font-size:13px;color:#909399;margin-top:8px;line-height:1.4}</style>
