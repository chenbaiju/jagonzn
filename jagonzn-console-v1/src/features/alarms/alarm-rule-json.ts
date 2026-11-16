/** 规则配置的有界词法树；数字只保留JSON词法，不将阈值转成JS浮点或补造wire DTO。 */
export class AlarmRuleJsonNumber {
 readonly raw:string
 constructor(raw:string){if(!numberLiteral.test(raw)||raw.length>1000)throw invalid();this.raw=raw;Object.freeze(this)}
}
export type AlarmRuleJson=null|boolean|string|AlarmRuleJsonNumber|AlarmRuleJson[]|AlarmRuleJsonObject
export interface AlarmRuleJsonObject {[key:string]:AlarmRuleJson}
const numberLiteral=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/
const ruleBytes=96*1024,ruleDepth=20,evaluationBytes=5*1024*1024,evaluationDepth=32
const invalid=()=>new Error('规则配置资料不合法')
function text(value:string){if(/[\u0000]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value))throw invalid();return value}
/** 重复键、损坏Unicode、尾随值与非JSON空白拒绝；字符串交给标准JSON解析，数字不经过JSON.parse。 */
function parseExactJson(source:string,maxBytes:number,maxDepth:number):AlarmRuleJson {
 if(typeof source!=='string'||source.length>maxBytes||new TextEncoder().encode(source).byteLength>maxBytes)throw new Error('规则配置内容过多或不完整')
 let at=0
 const numeric=/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y
 const space=()=>{while(at<source.length&&/[ \t\r\n]/.test(source[at]!))at++}
 const string=():string=>{
  if(source[at]!=='"')throw invalid()
  const start=at++
  while(at<source.length){const char=source[at++]!;if(char==='\\'){at++;continue}if(char==='"'){try{return text(JSON.parse(source.slice(start,at)) as string)}catch{throw invalid()}}}
  throw invalid()
 }
 const value=(depth:number):AlarmRuleJson=>{
  space();const char=source[at]
  if(char==='"')return string()
  if(char==='{'||char==='['){
   if(depth>=maxDepth)throw invalid();at++;space()
   if(char==='['){const result:AlarmRuleJson[]=[];if(source[at]===']'){at++;return result}for(;;){result.push(value(depth+1));space();if(source[at]===']'){at++;return result}if(source[at++]!==',')throw invalid()}}
   const result:AlarmRuleJsonObject=Object.create(null),keys=new Set<string>()
   if(source[at]==='}'){at++;return result}
   for(;;){space();const key=string();if(keys.has(key))throw invalid();keys.add(key);space();if(source[at++]!==':')throw invalid();result[key]=value(depth+1);space();if(source[at]==='}'){at++;return result}if(source[at++]!==',')throw invalid()}
  }
  for(const [literal,parsed] of [['true',true],['false',false],['null',null]] as const)if(source.startsWith(literal,at)){at+=literal.length;return parsed}
  numeric.lastIndex=at;const found=numeric.exec(source)
  if(!found)throw invalid();at=numeric.lastIndex;return new AlarmRuleJsonNumber(found[0])
 }
 const result=value(0);space();if(at!==source.length)throw invalid();return result
}
/** 只序列化词法树：普通number、BigInt、getter、异类对象、环和越界均不能静默转换。 */
function stringifyExactJson(root:AlarmRuleJson,maxBytes:number,maxDepth:number):string {
 const chunks:string[]=[],active=new Set<object>();let bytes=0
 const push=(part:string)=>{bytes+=new TextEncoder().encode(part).byteLength;if(bytes>maxBytes)throw new Error('规则配置内容过多');chunks.push(part)}
 const write=(value:AlarmRuleJson,depth:number):void=>{
  if(value===null){push('null');return}
  if(typeof value==='string'){push(JSON.stringify(text(value)));return}
  if(typeof value==='boolean'){push(String(value));return}
  if(value instanceof AlarmRuleJsonNumber){const descriptor=Object.getOwnPropertyDescriptor(value,'raw'),raw=descriptor?.value;if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof raw!=='string'||!numberLiteral.test(raw)||raw.length>1000)throw invalid();push(raw);return}
  if(typeof value!=='object'||depth>=maxDepth||active.has(value))throw invalid()
  if(!Array.isArray(value)&&![null,Object.prototype].includes(Object.getPrototypeOf(value)))throw invalid()
  active.add(value)
  if(Array.isArray(value)){
   if(Reflect.ownKeys(value).length!==value.length+1)throw invalid()
   push('[');for(let i=0;i<value.length;i++){const descriptor=Object.getOwnPropertyDescriptor(value,i);if(!descriptor||!Object.hasOwn(descriptor,'value'))throw invalid();if(i)push(',');write(descriptor.value as AlarmRuleJson,depth+1)}push(']')
  }else{
   const keys=Reflect.ownKeys(value);if(keys.some(key=>typeof key!=='string'))throw invalid()
   push('{');keys.forEach((key,index)=>{const descriptor=Object.getOwnPropertyDescriptor(value,key)!;if(!Object.hasOwn(descriptor,'value'))throw invalid();if(index)push(',');push(JSON.stringify(text(key as string)));push(':');write(descriptor.value as AlarmRuleJson,depth+1)});push('}')
  }
  active.delete(value)
 }
 write(root,0);return chunks.join('')
}

/** 规则编辑继续使用原96KiB/20层预算，事件原件另按已存协议5MiB/32层读取。 */
export const parseAlarmRuleJson=(source:string):AlarmRuleJson=>parseExactJson(source,ruleBytes,ruleDepth)
export const stringifyAlarmRuleJson=(root:AlarmRuleJson):string=>stringifyExactJson(root,ruleBytes,ruleDepth)
/** 精确原件仅读取展示，不恢复历史配置为可执行规则。 */
export const parseAlarmEvaluationJson=(source:string):AlarmRuleJson=>parseExactJson(source,evaluationBytes,evaluationDepth)
export const stringifyAlarmEvaluationJson=(root:AlarmRuleJson):string=>stringifyExactJson(root,evaluationBytes,evaluationDepth)
