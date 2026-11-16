import {validUnicode} from './preprocess-exact-json'

/** 只验证有界JSON语法并保留原文本区间，不声明任何HTTP响应或业务字段。 */
type RawKind='object'|'array'|'string'|'number'|'boolean'|'null'
type Segment={kind:RawKind;start:number;end:number;text?:string;members?:Map<string,Segment>;items?:Segment[]}
export type RawRuleJsonPath=readonly(string|number)[]
const syntaxChecked=Symbol('syntax-checked-json')
// 内建品牌检查兼容TextEncoder/iframe的跨realm字节，不使用instanceof。
const typedArrayName=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),Symbol.toStringTag)!.get!
const byteLimit=2*1024*1024,nodeLimit=16384,depthLimit=24
const invalid=()=>new Error('规则JSON原始正文无效或超出读取预算')
const wrongType=()=>new Error('规则JSON字段缺失或类型不符')

/** 数值只提供原token；业务解码器须在正式合同上核正数、long范围及精确十进制。 */
export class RawRuleJsonValue{
 readonly #source:string
 readonly #segment:Segment
 constructor(source:string,segment:Segment,seal:typeof syntaxChecked){
  if(seal!==syntaxChecked)throw wrongType()
  this.#source=source;this.#segment=segment;Object.freeze(this)
 }
 get kind():RawKind{return this.#segment.kind}
 raw():string{return this.#source.slice(this.#segment.start,this.#segment.end)}
 string():string{if(this.kind!=='string')throw wrongType();return this.#segment.text!}
 boolean():boolean{if(this.kind!=='boolean')throw wrongType();return this.raw()==='true'}
 numberLiteral():string{if(this.kind!=='number')throw wrongType();return this.raw()}
 integerText():string{const token=this.numberLiteral();if(!/^-?(?:0|[1-9]\d*)$/.test(token))throw wrongType();return token}
 keys():readonly string[]{if(this.kind!=='object')throw wrongType();return [...this.#segment.members!.keys()]}
 arrayLength():number{if(this.kind!=='array')throw wrongType();return this.#segment.items!.length}
 at(path:RawRuleJsonPath):RawRuleJsonValue{const found=this.optional(path);if(!found)throw wrongType();return found}
 optional(path:RawRuleJsonPath):RawRuleJsonValue|undefined{
  if(!Array.isArray(path)||path.length>depthLimit)throw wrongType()
  let current=this.#segment
  for(const key of path){
   if(typeof key==='number'){
    if(!Number.isSafeInteger(key)||key<0||current.kind!=='array')throw wrongType()
    const next=current.items![key];if(!next)return undefined;current=next
   }else{
    if(typeof key!=='string'||current.kind!=='object')throw wrongType()
    const next=current.members!.get(key);if(!next)return undefined;current=next
   }
  }
  return new RawRuleJsonValue(this.#source,current,syntaxChecked)
 }
}

/** 严格UTF8、无BOM、单JSON根、全树重复键拒绝；片段位置是解码文本的UTF16区间。 */
export function readRawRuleJson(bytes:Uint8Array):RawRuleJsonValue{
 if(!ArrayBuffer.isView(bytes)||typedArrayName.call(bytes)!=='Uint8Array'||bytes.byteLength>byteLimit||bytes.byteLength===0)throw invalid()
 let source:string
 try{source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)}catch{throw invalid()}
 let index=0,nodes=0
 const numberPattern=/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y
 const space=()=>{while(/[ \t\r\n]/.test(source[index]||'\0'))index++}
 function string():Segment{
  const start=index++
  while(index<source.length){
   const ch=source[index++]
   if(ch==='\\'){index++;continue}
   if(ch==='"'){
    let text:string
    try{text=JSON.parse(source.slice(start,index)) as string}catch{throw invalid()}
    if(!validUnicode(text))throw invalid()
    return {kind:'string',start,end:index,text}
   }
  }
  throw invalid()
 }
 function value(depth:number):Segment{
  if(depth>depthLimit||++nodes>nodeLimit)throw invalid()
  space();const start=index,ch=source[index]
  if(ch==='"')return string()
  if(ch==='{'||ch==='['){
   index++;space()
   if(ch==='['){
    const items:Segment[]=[]
    if(source[index]===']'){index++;return {kind:'array',start,end:index,items}}
    while(true){
     items.push(value(depth+1));space()
     if(source[index]===']'){index++;return {kind:'array',start,end:index,items}}
     if(source[index++]!==',')throw invalid()
    }
   }
   const members=new Map<string,Segment>()
   if(source[index]==='}'){index++;return {kind:'object',start,end:index,members}}
   while(true){
    space();if(source[index]!=='"')throw invalid()
    const key=string().text!;space()
    if(members.has(key)||source[index++]!==':')throw invalid()
    members.set(key,value(depth+1));space()
    if(source[index]==='}'){index++;return {kind:'object',start,end:index,members}}
    if(source[index++]!==',')throw invalid()
   }
  }
  for(const [token,kind] of [['true','boolean'],['false','boolean'],['null','null']] as const){
   if(source.startsWith(token,index)){index+=token.length;return {kind,start,end:index}}
  }
  numberPattern.lastIndex=index
  const number=numberPattern.exec(source)
  if(!number||number[0].length>1024)throw invalid()
  index+=number[0].length;return {kind:'number',start,end:index}
 }
 const root=value(0);space();if(index!==source.length)throw invalid()
 return new RawRuleJsonValue(source,root,syntaxChecked)
}
