/** 仅限定枚举草稿的冻结候选；不修剪、重排或改写历史模型。 */
export function copyEnumOptions(value:unknown):readonly string[]|undefined{
 if(!Array.isArray(value)||value.length<1||value.length>100)return undefined
 const seen=new Set<string>()
 for(const item of value){
  if(typeof item!=='string'||!item.trim()||item.length>64||seen.has(item))return undefined
  for(const character of item){const point=character.codePointAt(0)!;if(point>=0xd800&&point<=0xdfff)return undefined}
  seen.add(item)
 }
 return Object.freeze([...value] as string[])
}
/** 主字段存在但损坏时不回退；只有缺字段才消费旧快照格式。 */
export function frozenEnumOptions(definition:Record<string,unknown>):readonly string[]|undefined{
 return copyEnumOptions(Object.hasOwn(definition,'enum')?definition.enum:definition.enumOptions)
}
/** 只接受候选中的 JSON 字符串，数值与布尔值不能隐式转换为枚举。 */
export function enumDraftValue(input:string,options:readonly string[]|undefined):string|undefined{
 if(!options)return undefined
 try{const value:unknown=JSON.parse(input);return typeof value==='string'&&options.includes(value)?value:undefined}catch{return undefined}
}
