<script setup lang="ts">
import {computed} from 'vue'
import type {ModelDocumentation,ModelDocumentField} from './model-documentation'
import DeviceTypeModelFieldTable from './DeviceTypeModelFieldTable.vue'

const props=defineProps<{documentation:ModelDocumentation}>()

type DocumentBlock =
 | {tag:'h2'|'h3'|'h4'|'p';text:string}
 | {tag:'table';fields:readonly ModelDocumentField[]}

// 与 Markdown 下载共用冻结字段，按标题、段落和表格展示，字段值只作为文本。
const blocks=computed(()=>{
 const blocks:DocumentBlock[]=[]
 for(const section of props.documentation.sections){
  blocks.push({tag:'h2',text:`${section.title}（${section.items.length} 项）`})
  if(!section.items.length)blocks.push({tag:'p',text:`此版本未定义${section.title}。`})
  for(const entry of section.items){
   blocks.push({tag:'h3',text:entry.key},{tag:'table',fields:entry.fields})
   if(section.title!=='事件')continue
   blocks.push({tag:'p',text:entry.parametersNote??'事件参数：'})
   for(const parameter of entry.parameters){
    blocks.push({tag:'h4',text:parameter.key},{tag:'table',fields:parameter.fields})
   }
  }
 }
 return blocks
})
</script>

<template>
 <article class="model-markdown-preview" tabindex="0" aria-label="Markdown 开发文档">
  <template v-for="(block,index) in blocks" :key="index">
   <DeviceTypeModelFieldTable v-if="block.tag==='table'" class="markdown-field-table" :fields="block.fields"/>
   <component :is="block.tag" v-else>{{block.text}}</component>
  </template>
 </article>
</template>

<style scoped>
.model-markdown-preview{max-height:min(460px,50vh);overflow:auto;overscroll-behavior:contain;padding:16px;border:1px solid var(--tl-border);border-radius:4px;color:var(--tl-text);font-size:16px;line-height:1.5;overflow-wrap:anywhere}
.model-markdown-preview :is(h2,h3,h4){margin:18px 0 8px;color:var(--tl-title);font-weight:600}
.model-markdown-preview h2:first-child{margin-top:0}
.model-markdown-preview h2{padding-bottom:5px;border-bottom:1px solid var(--tl-border);font-size:24px}
.model-markdown-preview h3{font-size:20px}
.model-markdown-preview h4{font-size:16px}
.model-markdown-preview p{margin:8px 0 12px}
.markdown-field-table{margin:8px 0 12px}
.model-markdown-preview:focus-visible{outline:2px solid var(--tl-primary);outline-offset:-2px}
</style>
