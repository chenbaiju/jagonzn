/** 规则定义标签的本域草稿；与设备标签端口分离，正式HTTP仍消费唯一生成物。 */
export type RuleTagDraft={id:string;key:string;value:string;placeholder?:boolean}
let sequence=0
export const newRuleTag=():RuleTagDraft=>({id:`rule-tag-${++sequence}`,key:'',value:''})
const control=/[\u0000-\u001f\u007f-\u009f]/u
// 与Java Character.isWhitespace一致；不把NBSP等原文悄悄trim。
const boundary=/^[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]|[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]$/u
function wellFormed(value:string):boolean{
 for(let index=0;index<value.length;index++){
  const unit=value.charCodeAt(index)
  if(unit>=0xd800&&unit<=0xdbff){const next=value.charCodeAt(++index);if(!(next>=0xdc00&&next<=0xdfff))return false}
  else if(unit>=0xdc00&&unit<=0xdfff)return false
 }
 return true
}
export function ruleTagsValue(rows:readonly RuleTagDraft[]):Record<string,string>{
 if(rows.length>32)throw new Error('规则标签最多32项')
 const keys=new Set<string>(),entries:[string,string][]=[]
 for(const row of rows){
  // Only a newly-created UI placeholder can be omitted; persisted rows never carry this marker.
  if(row.placeholder&&row.key===''&&row.value==='')continue
  if(!row.key||boundary.test(row.key)||control.test(row.key)||!wellFormed(row.key)||Array.from(row.key).length>64)throw new Error('标签名称须为1至64个字，不能含控制符或首尾空白')
  if(control.test(row.value)||!wellFormed(row.value)||Array.from(row.value).length>256)throw new Error('标签值最多256个字，不能含控制符')
  if(keys.has(row.key))throw new Error('标签名称不能重复')
  keys.add(row.key);entries.push([row.key,row.value])
 }
 // fromEntries建立普通自有数据属性，__proto__/constructor不会修改原型。
 return Object.fromEntries(entries)
}

/** 显式Source输入模式；不改变规则/任务默认的严格校验。 */
export type SourceRuleTagDraft=RuleTagDraft&{originalEmptyKey?:string}
/** 新空名称/值省略，同名最后有效行覆盖；只有原持久空值行可保留空值。 */
export function sourceRuleTagInputValue(rows:readonly RuleTagDraft[],preserveExisting=false):Record<string,string>{
 const entries=new Map<string,string>()
 for(const row of rows)if(row.key&&row.value)entries.set(row.key,row.value)
 if(preserveExisting)for(const item of rows){const row=item as SourceRuleTagDraft;if(row.originalEmptyKey!==undefined&&row.key===row.originalEmptyKey&&row.value===''&&!entries.has(row.key))entries.set(row.key,'')}
 return ruleTagsValue([...entries].map(([key,value])=>({...newRuleTag(),key,value})))
}
/** 读取已持久Map时原样保留自有键与空值，不把损坏资料降为空Map。 */
export function sourceRuleTagRows(value:unknown):SourceRuleTagDraft[]{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error('标签读取不完整，请重新读取')
 const rows=Object.entries(value).map(([key,text])=>{if(typeof text!=='string')throw new Error('标签值必须是文本');return {...newRuleTag(),key,value:text,...(text===''?{originalEmptyKey:key}:{})}})
 ruleTagsValue(rows);return rows
}
