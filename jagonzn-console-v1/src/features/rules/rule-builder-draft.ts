import {ruleTagsValue,type RuleTagDraft} from './rule-tag-draft'
/** 创建控件的本地域草稿；不是手写HTTP DTO或正式生成paths的替代。 */
export const ruleKinds=['ATTRS_RPT_PREPROC','ATTRS_RPT','ATTRS_PUSH_PREPROC','ATTRS_PUSH','EVENT_RPT','DATA_RPT'] as const
export type RuleKind=typeof ruleKinds[number]
export type PreprocessKind='ATTRS_RPT_PREPROC'|'ATTRS_PUSH_PREPROC'
export const ruleKindLabels:Record<RuleKind,{label:string;description:string}>={
 ATTRS_RPT_PREPROC:{label:'属性上报预处理',description:'在设备属性上报时执行预处理操作。'},
 ATTRS_RPT:{label:'属性上报',description:'在设备属性上报完成后执行操作。'},
 ATTRS_PUSH_PREPROC:{label:'属性下发预处理',description:'在设备属性下发时执行预处理操作。'},
 ATTRS_PUSH:{label:'属性下发',description:'在设备属性下发完成后执行操作。'},
 EVENT_RPT:{label:'事件上报',description:'在设备事件上报完成后执行操作。'},
 DATA_RPT:{label:'自定义上报',description:'在设备自定义数据上报完成后执行操作。'}
}
export const conditionOperators=['EQ','NE','GT','GTE','LT','LTE','EXISTS','IN_RANGE','OUT_RANGE','CONTAINS','NOT_CONTAINS','KEY_EXISTS','KEY_ABSENT'] as const
export type ConditionOperator=typeof conditionOperators[number]
export const conditionLabels:Record<ConditionOperator,string>={EQ:'等于',NE:'不等于',GT:'大于',GTE:'大于或等于',LT:'小于',LTE:'小于或等于',EXISTS:'属性存在',IN_RANGE:'区间内（含边界）',OUT_RANGE:'区间外',CONTAINS:'列表包含',NOT_CONTAINS:'列表不包含',KEY_EXISTS:'包含对象键',KEY_ABSENT:'不包含对象键'}
export type ConditionDraft={id:string;path:string;operator:ConditionOperator;valueType:'number'|'string'|'boolean'|'null';text:string;lower:string;upper:string;booleanValue:boolean}
export type ConditionGroupDraft={id:string;operator:'ALL'|'ANY';conditions:ConditionDraft[];groups:ConditionGroupDraft[]}
export type ConditionValue={pointer:string;operator:ConditionOperator;value?:string|number|boolean|null|[number,number]}
export type ConditionGroupValue={operator:'ALL'|'ANY';conditions:ConditionValue[];groups:ConditionGroupValue[]}
export type FunctionFormat='COMMON_JS'|'FUNCTION_EXPRESSION'
export type FunctionDraft={id:string;format:FunctionFormat;source:string}
export type PreprocessDraft={tags:Record<string,string>;name:string;description?:string;kind:PreprocessKind;filter:ConditionGroupValue;functions:{format:FunctionFormat;source:string}[]}
let sequence=0
const id=()=>`rule-draft-${++sequence}`
export const newCondition=():ConditionDraft=>({id:id(),path:'',operator:'EQ',valueType:'number',text:'',lower:'',upper:'',booleanValue:true})
export const newConditionGroup=():ConditionGroupDraft=>({id:id(),operator:'ALL',conditions:[],groups:[]})
export const dataReportFunctionSource="module.exports = function(identifier, data) {\n  var attributes = {};\n  return attributes;\n};"
export const newFunction=():FunctionDraft=>({id:id(),format:'COMMON_JS',source:''})
export function groupSize(value:ConditionGroupDraft):{leaves:number;groups:number;depth:number}{
 const child=value.groups.map(groupSize)
 return {leaves:value.conditions.length+child.reduce((sum,item)=>sum+item.leaves,0),groups:1+child.reduce((sum,item)=>sum+item.groups,0),depth:1+Math.max(0,...child.map(item=>item.depth))}
}
export function cloneGroup(value:ConditionGroupDraft):ConditionGroupDraft{return {...value,conditions:value.conditions.map(item=>({...item})),groups:value.groups.map(cloneGroup)}}
/** 十进制文本规范化仅比较精确数值，不做巨大指数展开或Double中间舍入。 */
function decimalIdentity(raw:string):string{
 const match=/^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw)
 if(!match)throw new Error('请输入有效数值')
 let digits=(match[2]!+(match[3]||'')).replace(/^0+/,'')
 if(!digits)return '0'
 const trailing=digits.length-digits.replace(/0+$/,'').length;digits=digits.slice(0,digits.length-trailing)
 return match[1]+digits+'e'+(BigInt(match[4]||'0')-BigInt((match[3]||'').length)+BigInt(trailing))
}
export function preciseNumber(input:string):number{
 const raw=input.trim()
 if(!raw||raw.length>128)throw new Error('请输入有效数值')
 const exact=decimalIdentity(raw),value=Number(raw)
 if(!Number.isFinite(value)||Number.isInteger(value)&&!Number.isSafeInteger(value)||exact!==decimalIdentity(String(value)))throw new Error('数值超出当前可精确提交范围')
 return value
}
export function conditionValue(value:ConditionDraft):ConditionValue{
 if(!value.path.startsWith('/')||value.path.length>256||/~(?![01])/.test(value.path)||!conditionOperators.includes(value.operator))throw new Error('请输入有效属性路径，如 /temperature')
 const base={pointer:value.path,operator:value.operator}
 if(value.operator==='EXISTS')return base
 if(value.operator==='IN_RANGE'||value.operator==='OUT_RANGE'){
  const lower=preciseNumber(value.lower),upper=preciseNumber(value.upper)
  if(lower>upper)throw new Error('区间下限不能大于上限')
  return {...base,value:[lower,upper]}
 }
 if(['CONTAINS','NOT_CONTAINS','KEY_EXISTS','KEY_ABSENT'].includes(value.operator)){
  if(!value.text)throw new Error('请输入非空文本')
  return {...base,value:value.text}
 }
 if(['GT','GTE','LT','LTE'].includes(value.operator))return {...base,value:preciseNumber(value.text)}
 if(value.valueType==='null')return {...base,value:null}
 if(value.valueType==='boolean')return {...base,value:value.booleanValue}
 if(value.valueType==='string')return {...base,value:value.text}
 return {...base,value:preciseNumber(value.text)}
}
/** PostgreSQL jsonb文本会展开十进制指数并加入分隔空格，按该表示核条件预算。 */
function jsonbText(value:unknown):string{
 if(typeof value==='number'){
  const exact=decimalIdentity(String(value))
  if(exact==='0')return '0'
  const match=/^(-?)(\d+)e(-?\d+)$/.exec(exact)!,digits=match[2]!,point=digits.length+Number(match[3])
  return match[1]+(point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point))
 }
 if(Array.isArray(value))return '['+value.map(jsonbText).join(', ')+']'
 if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,item])=>item!==undefined).map(([key,item])=>JSON.stringify(key)+': '+jsonbText(item)).join(', ')+'}'
 return JSON.stringify(value)
}
export function conditionGroupValue(value:ConditionGroupDraft,nested=false):ConditionGroupValue{
 const size=groupSize(value)
 if(size.leaves>32||size.groups>64||size.depth>4||value.groups.length>32)throw new Error('条件最多32项、64组和4层')
 if(nested&&!size.leaves)throw new Error('请补全条件分组')
 if(value.operator!=='ALL'&&value.operator!=='ANY'||value.operator==='ANY'&&!value.conditions.length&&!value.groups.length||!size.leaves&&value.groups.length)throw new Error('请补全条件分组')
 const result={operator:value.operator,conditions:value.conditions.map(conditionValue),groups:value.groups.map(child=>conditionGroupValue(child,true))}
 if(new TextEncoder().encode(jsonbText(result)).length>65536)throw new Error('条件总内容超过65536个UTF8字节')
 return result
}
export function preprocessDraft(input:{name:string;description:string;kind:PreprocessKind|undefined;filter:ConditionGroupDraft;functions:FunctionDraft[];tags?:RuleTagDraft[]}):PreprocessDraft{
 const name=input.name.trim(),description=input.description.trim()
 if(!name||name.length>128)throw new Error('请输入规则名称（最多128字）')
 if(description.length>512)throw new Error('规则描述最多512字')
 if(input.kind!=='ATTRS_RPT_PREPROC'&&input.kind!=='ATTRS_PUSH_PREPROC')throw new Error('请选择属性预处理类型')
 if(!input.functions.length||input.functions.length>32)throw new Error('请添加1至32项预处理操作')
 let bytes=0
 const functions=input.functions.map(value=>{
  if(!['COMMON_JS','FUNCTION_EXPRESSION'].includes(value.format)||!value.source.trim())throw new Error('请补全每项操作的函数与格式')
  bytes+=new TextEncoder().encode(value.source).length
  return {format:value.format,source:value.source}
 })
 if(bytes>65536)throw new Error('全部函数合计最多65536个UTF8字节')
 return {tags:ruleTagsValue(input.tags??[]),name,description:description||undefined,kind:input.kind,filter:input.kind==='ATTRS_RPT_PREPROC'?conditionGroupValue(input.filter):{operator:'ALL',conditions:[],groups:[]},functions}
}
