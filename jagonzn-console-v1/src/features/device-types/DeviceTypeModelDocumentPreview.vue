<script setup lang="ts">
import {computed} from 'vue'
import {formatTime} from '@/core/time'
import type {ModelDocumentation,ModelDocumentItem} from './model-documentation'

const props=defineProps<{documentation:ModelDocumentation;typeName?:string}>()
const items=(title:string)=>props.documentation.sections.find(section=>section.title===title)?.items??[]
const properties=computed(()=>items('属性'))
const events=computed(()=>items('事件'))
const commands=computed(()=>items('命令'))
const publishedAt=computed(()=>props.documentation.facts.find(fact=>fact.label==='发布时间')?.value)

function field(item:ModelDocumentItem,label:string){
 return item.fields.find(row=>row.label===label)?.value??''
}
function hasValue(value:string){
 return value!==''&&value!=='未声明'&&value!=='此版本未保存'
}
function itemTitle(item:ModelDocumentItem,label:string){
 const name=field(item,label)
 return hasValue(name)?name:item.key
}
function options(item:ModelDocumentItem,columns:readonly string[]){
 return item.fields.filter(row=>!columns.includes(row.label)&&hasValue(row.value))
}

const propertyColumns=['属性名称','流向','数据类型','说明']
const parameterColumns=['参数名称','数据类型','必填','说明']
const propertyTypes=computed(()=>JSON.stringify(Object.fromEntries(properties.value.map(item=>[
 item.key,hasValue(field(item,'数据类型'))?field(item,'数据类型'):null
])),null,4))
</script>

<template>
 <article class="model-document-preview">
  <h1>{{typeName}}功能定义文档</h1>
  <p class="model-document-version"><time :datetime="publishedAt">{{formatTime(publishedAt).slice(0,10)}}</time><span>版本 {{documentation.versionNumber}}</span></p>

  <section>
   <h2>属性</h2>
   <template v-if="properties.length">
    <h3>属性集合</h3>
    <pre aria-label="属性标识符与数据类型">{{propertyTypes}}</pre>
    <h3>属性说明</h3>
    <table>
     <thead><tr><th scope="col">属性标识符</th><th scope="col">属性名称</th><th scope="col">属性类型</th><th scope="col">数据类型</th><th scope="col">选项</th><th scope="col">描述</th></tr></thead>
     <tbody>
      <tr v-for="item in properties" :key="item.key">
       <td>{{item.key}}</td><td>{{field(item,'属性名称')}}</td><td>{{field(item,'流向')}}</td><td class="model-document-type">{{field(item,'数据类型')}}</td>
       <td><div v-for="option in options(item,propertyColumns)" :key="option.label" class="model-document-option"><code>{{option.label}}</code> {{option.value}}</div></td>
       <td>{{field(item,'说明')}}</td>
      </tr>
     </tbody>
    </table>
   </template>
   <p v-else>此版本未定义属性。</p>
  </section>

  <section>
   <h2>事件</h2>
   <p v-if="!events.length">此版本未定义事件。</p>
   <article v-for="item in events" :key="item.key">
    <h3>{{itemTitle(item,'事件名称')}}</h3>
    <p v-if="itemTitle(item,'事件名称')!==item.key||hasValue(field(item,'事件级别'))" class="model-document-entry">
     <code v-if="itemTitle(item,'事件名称')!==item.key">{{item.key}}</code>
     <span v-if="hasValue(field(item,'事件级别'))">{{field(item,'事件级别')}}</span>
    </p>
    <p v-if="hasValue(field(item,'说明'))">{{field(item,'说明')}}</p>
    <h4>事件参数</h4>
    <p v-if="item.parametersNote">{{item.parametersNote}}</p>
    <table v-else>
     <thead><tr><th scope="col">参数标识符</th><th scope="col">参数名称</th><th scope="col">数据类型</th><th scope="col">必填</th><th scope="col">约束</th><th scope="col">描述</th></tr></thead>
     <tbody>
      <tr v-for="parameter in item.parameters" :key="parameter.key">
       <td>{{parameter.key}}</td><td>{{field(parameter,'参数名称')}}</td><td class="model-document-type">{{field(parameter,'数据类型')}}</td><td>{{field(parameter,'必填')}}</td>
       <td><div v-for="option in options(parameter,parameterColumns)" :key="option.label" class="model-document-option"><code>{{option.label}}</code> {{option.value}}</div></td>
       <td>{{field(parameter,'说明')}}</td>
      </tr>
     </tbody>
    </table>
   </article>
  </section>

  <section>
   <h2>命令</h2>
   <p v-if="!commands.length">此版本未定义命令。</p>
   <article v-for="item in commands" :key="item.key">
    <h3>{{itemTitle(item,'命令名称')}}</h3>
    <p v-if="itemTitle(item,'命令名称')!==item.key" class="model-document-entry"><code>{{item.key}}</code></p>
    <p v-if="hasValue(field(item,'说明'))">{{field(item,'说明')}}</p>
    <template v-for="schema in ['输入Schema','输出Schema']" :key="schema">
     <h4>{{schema==='输入Schema'?'命令输入 Schema':'命令回复 Schema'}}</h4>
     <pre v-if="hasValue(field(item,schema))">{{field(item,schema)}}</pre>
     <p v-else>{{field(item,schema)}}</p>
    </template>
   </article>
  </section>
 </article>
</template>

<style scoped>
.model-document-preview{padding:15px;border:1px solid #ebeef5;color:#606266;font-size:16px;line-height:1.5;overflow-wrap:anywhere}
.model-document-preview h1{margin:10px 0 12px;font-size:32px;line-height:1.4;font-weight:600}
.model-document-version{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:0}
.model-document-version span,.model-document-entry{font-size:13px;color:var(--tl-muted)}
.model-document-preview h2{margin:36px 0 24px;font-size:24px;font-weight:600}
.model-document-preview h3{margin:24px 0 6px;font-size:20px;font-weight:600}
.model-document-preview h4{margin:20px 0 6px;font-size:16px;font-weight:600}
.model-document-preview section p{margin:6px 0}
.model-document-entry code+span{margin-left:10px}
.model-document-preview pre{margin:0 0 18px;padding:15px;border-radius:3px;background:#f4f4f4;color:#303133;font:14px/20px Monaco,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
.model-document-preview table{width:100%;border-collapse:collapse;font-size:16px;line-height:24px}
.model-document-preview th,.model-document-preview td{padding:5px;border:1px solid #dcdfe6;text-align:left;vertical-align:top}
.model-document-preview th{color:#303133;font-weight:600}
.model-document-type{min-width:6em}
.model-document-preview code{padding:2px 5px;border-radius:3px;background:#f4f4f4;color:#d44966;font:13px/20px Monaco,Menlo,Consolas,monospace}
.model-document-option{white-space:pre-wrap;font-size:14px}
@media(max-width:600px){.model-document-preview h1{font-size:24px}.model-document-preview table{font-size:13px;line-height:19px}.model-document-preview th,.model-document-preview td{padding:3px}.model-document-type{min-width:0}}
</style>
