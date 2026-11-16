import {isStrictJsonNumber,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {decodeModelVersion,type ModelSnapshot} from './model-version-api'

export type ModelDocumentField=Readonly<{label:string;value:string;missing?:true}>
export type ModelDocumentItem=Readonly<{key:string;fields:readonly ModelDocumentField[];parameters:readonly ModelDocumentItem[];parametersNote?:string}>
export type ModelDocumentSection=Readonly<{title:string;items:readonly ModelDocumentItem[]}>
export type ModelDocumentation=Readonly<{typeId:string;versionId:string;versionNumber:string;facts:readonly ModelDocumentField[];sections:readonly ModelDocumentSection[];markdown:string;html:string}>
const absent='此版本未保存',empty='未声明'
export const modelDocumentationTitle='ThingsLink 物模型开发文档'
export const modelDocumentationNotice='本文只描述所选已发布版本的冻结定义。默认值是模型声明，不代表设备当前值、上报或历史记录。历史快照缺少的名称、说明等字段不使用当前草稿补齐。'
const directions:Record<string,string>={UNDEFINED:'未限制',REPORT:'设备上报',DOWNLINK:'云端下发',SHARED:'共享',CLOUD_PRIVATE:'云端私有'}

/** 只排版已解析的严格数值词法，不经Number或JSON.stringify转换数值节点。 */
function json(value:StrictJsonValue,depth=0):string{
 if(isStrictJsonNumber(value))return value.lexical
 if(value===null||typeof value!=='object')return JSON.stringify(value)
 const indent='  '.repeat(depth),child=indent+'  '
 if(Array.isArray(value))return value.length?'[\n'+value.map(item=>child+json(item,depth+1)).join(',\n')+'\n'+indent+']':'[]'
 const entries=Object.entries(value)
 return entries.length?'{\n'+entries.map(([key,item])=>child+JSON.stringify(key)+': '+json(item,depth+1)).join(',\n')+'\n'+indent+'}':'{}'
}
function object(value:StrictJsonValue|undefined):StrictJsonObject|undefined{return value!==null&&typeof value==='object'&&!Array.isArray(value)&&!isStrictJsonNumber(value)?value as StrictJsonObject:undefined}
function missingField(label:string):ModelDocumentField{return Object.freeze({label,value:absent,missing:true})}
function field(source:StrictJsonObject,key:string,label:string,literal=false):ModelDocumentField{
 if(!Object.hasOwn(source,key))return missingField(label)
 const item=source[key]!
 const value=item===null?empty:typeof item==='string'&&!literal?item:json(item)
 return Object.freeze({label,value})
}
/** 展示资料逐字段投影，动态说明键只能来自同一冻结定义的枚举和直接子字段。 */
function presentationFields(definition:StrictJsonObject):ModelDocumentField[]{
 if(!Object.hasOwn(definition,'presentation'))return[missingField('展示配置')]
 if(definition.presentation===null)return[{label:'展示配置',value:empty}]
 const presentation=object(definition.presentation)
 if(!presentation)return[{label:'展示配置',value:'此版本字段格式异常'}]
 const textField=(source:StrictJsonObject,key:string,label:string):ModelDocumentField=>{
  if(!Object.hasOwn(source,key))return missingField(label)
  const item=source[key]
  return {label,value:item===null?empty:typeof item==='string'?item:'此版本字段格式异常'}
 }
 const rows=[textField(presentation,'iconId','图标标识'),textField(presentation,'color','颜色')]
 const enums=object(presentation.enumDescriptions),options=definition.enum
 if(enums&&Array.isArray(options))for(const key of options)if(typeof key==='string'&&Object.hasOwn(enums,key))rows.push(textField(enums,key,`枚举说明 · ${key}`))
 const children=object(presentation.objectFields),schema=object(definition.schema),properties=object(schema?.properties)
 if(children&&properties)for(const key of Object.keys(properties)){
  if(!Object.hasOwn(children,key))continue
  const child=object(children[key]);if(!child)continue
  rows.push(textField(child,'name',`子字段 ${key} 名称`),textField(child,'description',`子字段 ${key} 说明`))
 }
 return rows.map(row=>Object.freeze(row))
}
function item(key:string,source:StrictJsonValue,fields:readonly [string,string,boolean?][],parameters=false):ModelDocumentItem{
 const definition=object(source)
 if(!definition)return Object.freeze({key,fields:Object.freeze([{label:'冻结定义',value:'此版本字段格式异常'}]),parameters:Object.freeze([])})
 const rows=fields.map(([name,label,literal])=>field(definition,name,label,literal))
 if(fields.some(([name])=>name==='accessType'))rows.push(...presentationFields(definition))
 const direction=rows.find(row=>row.label==='流向'),access=definition.accessType
 if(direction&&typeof access==='string'&&Object.hasOwn(directions,access))rows[rows.indexOf(direction)]=Object.freeze({label:direction.label,value:`${access}（${directions[access]}）`})
 const children=parameters?object(definition.parameters):undefined
 const parametersNote=!parameters?undefined:!Object.hasOwn(definition,'parameters')?'此版本未保存事件参数。':!children?'此版本事件参数格式异常。':!Object.keys(children).length?'此版本未定义事件参数。':undefined
 return Object.freeze({key,fields:Object.freeze(rows),parameters:Object.freeze(Object.entries(children||{}).map(([name,entry])=>item(name,entry,[['name','参数名称'],['dataType','数据类型'],['required','必填'],['description','说明'],['enum','枚举值',true],['schema','Schema',true]]))),parametersNote})
}
/** 所有动态内容只作为文本，HTML导出不执行快照内脚本、链接或Schema引用。 */
export function escapeModelDocumentHtml(text:string):string{return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function markdown(text:string):string{return escapeModelDocumentHtml(text).replace(/([\\`*_{}\[\]()#|])/g,'\\$1').replace(/\r\n|\r|\n/g,'<br>')}
function markdownFields(fields:readonly ModelDocumentField[]):string{return '| 字段 | 冻结值 |\n| --- | --- |\n'+fields.map(row=>`| ${markdown(row.label)} | ${markdown(row.value)} |`).join('\n')+'\n'}
function htmlFields(fields:readonly ModelDocumentField[]):string{return '<dl>'+fields.map(row=>'<dt>'+escapeModelDocumentHtml(row.label)+'</dt><dd><pre>'+escapeModelDocumentHtml(row.value)+'</pre></dd>').join('')+'</dl>'}

/** 仅白名单投影冻结定义；不读取当前类型资料、设备状态、凭据或额外接口。 */
export function createModelDocumentation(snapshot:ModelSnapshot,typeId:string):ModelDocumentation{
 const version=decodeModelVersion(snapshot.version,typeId,snapshot.version.id),model=snapshot.modelSnapshot
 const facts=Object.freeze([{label:'类型ID',value:version.deviceTypeId},{label:'版本号',value:version.versionNumber},{label:'版本ID',value:version.id},{label:'变化级别',value:version.changeLevel},{label:'发布时间',value:version.publishedAt},{label:'服务端快照摘要',value:version.schemaDigest},{label:'摘要算法',value:version.digestAlgorithm}])
 const definitions:readonly [string,string,readonly [string,string,boolean?][],boolean?][]=[
  ['properties','属性',[['name','属性名称'],['accessType','流向'],['dataType','数据类型'],['description','说明'],['unit','单位'],['decimalPlaces','小数位数'],['numericStep','数值步进',true],['minimum','下限'],['maximum','上限'],['defaultValue','数值默认声明',true],['textDefaultValue','文本默认声明',true],['enum','枚举值',true],['onLabel','开启文字'],['offLabel','关闭文字'],['schema','复合Schema',true]]],
  ['events','事件',[['name','事件名称'],['level','事件级别'],['description','说明']],true],
  ['commands','命令',[['name','命令名称'],['description','说明'],['inputSchema','输入Schema',true],['outputSchema','输出Schema',true]]],
 ]
 const sections=Object.freeze(definitions.map(([key,title,fields,parameters])=>{
  const source=object(model[key]);if(!source)throw new Error('冻结模型缺少完整功能定义，无法生成文档')
  return Object.freeze({title,items:Object.freeze(Object.entries(source).map(([name,entry])=>item(name,entry,fields,parameters)))})
 }))
 let md='# '+modelDocumentationTitle+'\n\n'+modelDocumentationNotice+'\n\n'+markdownFields(facts)
 let body='<h1>'+modelDocumentationTitle+'</h1><p class="notice">'+escapeModelDocumentHtml(modelDocumentationNotice)+'</p>'+htmlFields(facts)
 for(const section of sections){
  md+=`\n## ${section.title}（${section.items.length} 项）\n\n`;body+='<section><h2>'+section.title+'（'+section.items.length+' 项）</h2>'
  if(!section.items.length){md+='此版本未定义'+section.title+'。\n';body+='<p>此版本未定义'+section.title+'。</p>'}
  for(const entry of section.items){
   md+='\n### '+markdown(entry.key)+'\n\n'+markdownFields(entry.fields);body+='<article><h3>'+escapeModelDocumentHtml(entry.key)+'</h3>'+htmlFields(entry.fields)
   if(section.title==='事件'){
    md+='\n'+(entry.parametersNote?entry.parametersNote+'\n':'事件参数：\n');body+=entry.parametersNote?'<p>'+entry.parametersNote+'</p>':'<h4>事件参数</h4>'
    for(const parameter of entry.parameters){md+='\n#### '+markdown(parameter.key)+'\n\n'+markdownFields(parameter.fields);body+='<h4>'+escapeModelDocumentHtml(parameter.key)+'</h4>'+htmlFields(parameter.fields)}
   }
   body+='</article>'
  }
  body+='</section>'
 }
 const html='<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>ThingsLink 物模型 '+escapeModelDocumentHtml(version.versionNumber)+'</title><style>body{font:14px/1.7 system-ui,sans-serif;max-width:1000px;margin:32px auto;padding:0 20px;color:#223048}h1{font-size:26px}h2{margin-top:32px}h3{overflow-wrap:anywhere}article{border-top:1px solid #dce3eb;padding:12px 0}dl{display:grid;grid-template-columns:140px minmax(0,1fr);gap:6px 16px}dt{color:#526477}dd{margin:0}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.notice{padding:12px;background:#f1f5f9}@media(max-width:600px){dl{grid-template-columns:100px minmax(0,1fr)}}</style></head><body>'+body+'</body></html>\n'
 return Object.freeze({typeId:version.deviceTypeId,versionId:version.id,versionNumber:version.versionNumber,facts,sections,markdown:md,html})
}
export function modelDocumentationFile(document:ModelDocumentation,format:'markdown'|'html'){
 return Object.freeze({name:`thingslink-model-${document.typeId}-${document.versionNumber}-${document.versionId}.${format==='markdown'?'md':'html'}`,mime:format==='markdown'?'text/markdown;charset=utf-8':'text/html;charset=utf-8',content:format==='markdown'?document.markdown:document.html})
}
