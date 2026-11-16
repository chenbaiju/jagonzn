/** 前处理编辑的有界领域JSON，不读取HTTP路径/响应或替代正式生成DTO。 */
export type ExactJson=null|boolean|string|ExactDecimal|ExactJson[]|{[key:string]:ExactJson}
export function validUnicode(value:string):boolean{
 for(let i=0;i<value.length;i++){
  const ch=value.charCodeAt(i)
  if(ch>=0xd800&&ch<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false}
  else if(ch>=0xdc00&&ch<=0xdfff)return false
 }
 return true
}
export class ExactDecimal{
 readonly digits:string
 readonly exponent:bigint
 readonly negative:boolean
 constructor(readonly literal:string){
  const match=/^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(literal)
  if(!match||literal.length>1024)throw new Error('条件数值格式或长度无效')
  let digits=(match[2]!+(match[3]||'')).replace(/^0+/,'')
  const zeros=digits.length-digits.replace(/0+$/,'').length
  digits=digits.slice(0,digits.length-zeros)
  this.digits=digits||'0';this.negative=!!match[1]&&!!digits
  this.exponent=digits?BigInt(match[4]||'0')-BigInt((match[3]||'').length)+BigInt(zeros):0n
  if(this.exponent< -16383n||BigInt(this.digits.length)+this.exponent>131072n)throw new Error('条件数值超出持久化范围')
  Object.freeze(this)
 }
 canonical():string{return this.digits==='0'?'0':(this.negative?'-':'')+this.digits+(this.exponent===0n?'':'e'+this.exponent)}
 expanded():string{
  if(this.digits==='0')return '0'
  const point=BigInt(this.digits.length)+this.exponent
  const length=point<=0n?2n-point+BigInt(this.digits.length):point>BigInt(this.digits.length)?point:BigInt(this.digits.length)+1n
  if(length>65536n)throw new Error('条件总内容超过65536个UTF8字节')
  const n=Number(point),digits=this.digits
  return (this.negative?'-':'')+(n<=0?'0.'+'0'.repeat(-n)+digits:n>=digits.length?digits+'0'.repeat(n-digits.length):digits.slice(0,n)+'.'+digits.slice(n))
 }
}
export function compareDecimal(left:ExactDecimal,right:ExactDecimal):number{
 if(left.digits==='0'&&right.digits==='0')return 0
 if(left.negative!==right.negative)return left.negative?-1:1
 let result:number
 if(left.digits==='0'||right.digits==='0')result=left.digits==='0'?-1:1
 else{
  const a=BigInt(left.digits.length)+left.exponent,b=BigInt(right.digits.length)+right.exponent
  if(a!==b)result=a<b?-1:1
  else{const size=Math.max(left.digits.length,right.digits.length),x=left.digits.padEnd(size,'0'),y=right.digits.padEnd(size,'0');result=x===y?0:x<y?-1:1}
 }
 return left.negative?-result:result
}
export function parsePreprocessJson(source:string,maxNodes=4096):ExactJson{
 if(!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>32768)throw new Error('完整版本JSON节点预算无效')
 if(typeof source!=='string'||new TextEncoder().encode(source).length>524288)throw new Error('完整版本内容超出编辑预算')
 let index=0,nodes=0
 const invalid=()=>new Error('完整版本JSON无效或字段重复')
 const space=()=>{while(/[ \t\r\n]/.test(source[index]||'\0'))index++}
 function string():string{
  const start=index++
  while(index<source.length){
   const ch=source[index++]
   if(ch==='\\'){index++;continue}
   if(ch==='"'){
    let value:string
    try{value=JSON.parse(source.slice(start,index)) as string}catch{throw invalid()}
    if(!validUnicode(value))throw invalid()
    return value
   }
  }
  throw invalid()
 }
 function value(depth:number):ExactJson{
  if(depth>12||++nodes>maxNodes)throw invalid()
  space();const ch=source[index]
  if(ch==='"')return string()
  if(ch==='{'||ch==='['){
   index++;space()
   if(ch==='['){
    const result:ExactJson[]=[]
    if(source[index]===']'){index++;return result}
    while(true){result.push(value(depth+1));space();if(source[index]===']'){index++;return result}if(source[index++]!==',')throw invalid()}
   }
   const result:{[key:string]:ExactJson}=Object.create(null)
   if(source[index]==='}'){index++;return result}
   while(true){
    space();if(source[index]!=='"')throw invalid()
    const key=string();space();if(Object.hasOwn(result,key)||source[index++]!==':')throw invalid()
    result[key]=value(depth+1);space()
    if(source[index]==='}'){index++;return result}if(source[index++]!==',')throw invalid()
   }
  }
  for(const [token,result] of [['true',true],['false',false],['null',null]] as const)if(source.startsWith(token,index)){index+=token.length;return result}
  const number=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index))
  if(!number)throw invalid();index+=number[0].length;return new ExactDecimal(number[0])
 }
 const result=value(0);space();if(index!==source.length)throw invalid();return result
}
/** 数值仍输出JSON数值token；不会把精确十进制伪装为文本值。 */
export function writePreprocessJson(value:ExactJson,expanded=false,plainNumbers=false):string{
 if(value instanceof ExactDecimal)return plainNumbers||expanded?value.expanded():value.canonical()
 const separator=expanded?', ':','
 if(Array.isArray(value))return '['+value.map(child=>writePreprocessJson(child,expanded,plainNumbers)).join(separator)+']'
 if(value&&typeof value==='object')return '{'+Object.entries(value).map(([key,child])=>JSON.stringify(key)+(expanded?': ':':')+writePreprocessJson(child,expanded,plainNumbers)).join(separator)+'}'
 return JSON.stringify(value)
}
