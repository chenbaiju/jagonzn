import {validUnicode} from './preprocess-exact-json'

/** 固定数据按原文保存；这里只验证本用途的格式，不把数值经过 JavaScript Number。 */
function dataJson(source:string,pretty=false):string {
 let index=0
 const invalid=()=>new Error('下发消息 JSON 无效、字段重复或超出格式限制。')
 const space=()=>{while(/[ \t\r\n]/.test(source[index]||'\0'))index++}
 function string():{token:string;value:string}{
  const match=/^"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/.exec(source.slice(index))
  if(!match)throw invalid()
  const token=match[0],value:unknown=JSON.parse(token)
  if(typeof value!=='string'||!validUnicode(value))throw invalid()
  index+=token.length;return {token,value}
 }
 function value(depth:number):string{
  space();const char=source[index]
  if(char==='"')return string().token
  if(char==='{'||char==='['){
   if(depth>=32)throw invalid()
   const object=char==='{',end=object?'}':']',parts:string[]=[],keys=new Set<string>()
   index++;space();if(source[index]===end){index++;return char+end}
   while(true){
    let key=''
    if(object){space();const entry=string();if(keys.has(entry.value))throw invalid();keys.add(entry.value);space();if(source[index++]!==':')throw invalid();key=entry.token+(pretty?': ':':')}
    parts.push(key+value(depth+1));space()
    if(source[index]===end){index++;break}
    if(source[index++]!==',')throw invalid()
   }
   return pretty?char+'\n'+'  '.repeat(depth+1)+parts.join(',\n'+'  '.repeat(depth+1))+'\n'+'  '.repeat(depth)+end:char+parts.join(',')+end
  }
  for(const word of ['true','false','null'])if(source.startsWith(word,index)){index+=word.length;return word}
  const number=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index))
  if(!number||number[0].length>1000)throw invalid()
  index+=number[0].length;return number[0]
 }
 const output=value(0);space();if(index!==source.length)throw invalid();return output
}

/** input 是正式任务请求内既有 JSON 对象，闭集验证后原字符串逐字返回。 */
export function taskDataValue(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('自定义数据配置不完整，请重新读取。')
 const fields=value as Record<string,unknown>
 if(Object.keys(fields).sort().join(',')!=='format,message,protocol,streamIdentifier')throw new Error('自定义数据配置字段不完整或未知。')
 const {protocol,streamIdentifier,format,message}=fields
 if(protocol!=='MQTT'&&protocol!=='TCP')throw new Error('请选择有效的推送方式。')
 if(typeof streamIdentifier!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(streamIdentifier))throw new Error('自定义数据流标识符须为1至64位字母、数字、下划线或短横线。')
 if(format!=='HEX'&&format!=='TEXT'&&format!=='JSON')throw new Error('请选择有效的消息格式。')
 if(typeof message!=='string'||!validUnicode(message)||message.includes('\u0000'))throw new Error('下发消息包含无效的 Unicode 字符。')
 if(format==='HEX'){
  if(!/^(?:[0-9A-Fa-f]{2})+$/.test(message)||message.length/2>65504)throw new Error('HEX 消息须为完整偶数位十六进制，不含空白，且不超过65504字节。')
 }else{
  const bytes=new TextEncoder().encode(message).length
  if(bytes<1||bytes>65504)throw new Error('下发消息须为1至65504个UTF8字节。')
  if(format==='JSON')dataJson(message)
 }
 return {protocol,streamIdentifier,format,message}
}
/** 整理仅响应明确按钮操作，保留原数字和字符串 token；保存从不调用此方法。 */
export function formatTaskDataJson(message:string):string{
 if(typeof message!=='string'||!validUnicode(message)||new TextEncoder().encode(message).length>65504)throw new Error('下发消息超出编辑预算或包含无效字符。')
 const output=dataJson(message,true)
 if(new TextEncoder().encode(output).length>65504)throw new Error('整理后的下发消息超过65504字节，原文已保留。')
 return output
}
