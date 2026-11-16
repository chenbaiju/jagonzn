<script setup lang="ts">
import {computed} from 'vue'
import {definitionTypeCaption} from './definition-presentation'
import {definitionDataTypePaths,definitionTextPaths} from '@/assets/icons/definition-data-types'
const props=defineProps<{type:string;label:string}>()
const normalized=computed(()=>props.type.toUpperCase())
const path=computed(()=>{
 const type=props.type.toUpperCase(),key=type==='STRING'?'TEXT':type==='BOOLEAN'?'SWITCH':type==='ARRAY'?'LIST':type==='INTEGER'?'NUMBER':type.startsWith('DAILY_TIMER_INTERVAL')?'DAILY_TIMER_INTERVAL':type.startsWith('DAILY_TIMER_RANGE')||type.startsWith('DAILY_TIMER_DURATION')?'DAILY_TIMER_RANGE':type.startsWith('DAILY_TIMER')?'DAILY_TIMER':type
 return definitionDataTypePaths[key as keyof typeof definitionDataTypePaths]
})
const caption=computed(()=>definitionTypeCaption(props.label))
</script>
<template><span class="definition-type-label"><svg v-if="path" :viewBox="normalized==='TEXT'||normalized==='STRING'?'0 0 512 512':normalized==='ENUM'?'0 0 16 16':'0 0 24 24'" width="20" height="20" fill="currentColor" aria-hidden="true"><template v-if="normalized==='TEXT'||normalized==='STRING'"><path v-for="(part,index) in definitionTextPaths" :key="index" :d="part"/></template><path v-else :d="path" :fill-rule="normalized==='ENUM'?'evenodd':'nonzero'"/></svg>{{caption}}</span></template>
<style scoped>.definition-type-label{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;vertical-align:middle}.definition-type-label>svg{flex-shrink:0}</style>
