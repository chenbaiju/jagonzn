import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {decodePropertyPresentation} from './property-presentation'
export const materialNumericFields=['minimumValue','maximumValue','defaultValue','numericStep'] as const
export const materialExtraFields=['unit','decimalPlaces',...materialNumericFields,'enumOptions','onLabel','offLabel','presentation','switchEncoding','textDefaultValue'] as const
export const scalarAccessTypes=['REPORT','DOWNLINK','SHARED','CLOUD_PRIVATE'] as const
export const scalarDataTypes=['NUMBER','TEXT','SWITCH','ENUM'] as const
export function materialText(value:unknown,max:number,nonblank=false):value is string{return typeof value==='string'&&value.length<=max&&!value.includes('\0')&&new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(value))===value&&(!nonblank||!!value.trim())}
/** 只比较数字词法的符号、数量级和有效位；不展开指数或转为浮点。 */
function decimalParts(raw:string){const[coefficient,exponent='0']=raw.replace(/^-/,'').toLowerCase().split('e'),[whole,fraction='']=coefficient!.split('.'),digits=(whole!+fraction).replace(/^0+/,'');return{sign:digits?raw.startsWith('-')?-1:1:0,digits,order:BigInt(digits.length)+BigInt(exponent)-BigInt(fraction.length)}}
export function compareMaterialNumbers(left:string,right:string){const a=decimalParts(left),b=decimalParts(right);if(a.sign!==b.sign)return a.sign<b.sign?-1:1;if(!a.sign)return 0;if(a.order!==b.order)return(a.order<b.order?-1:1)*a.sign;const length=Math.max(a.digits.length,b.digits.length),x=a.digits.padEnd(length,'0'),y=b.digits.padEnd(length,'0');return x===y?0:(x<y?-1:1)*a.sign}
export function sourceMaterialNumber(value:unknown):string|undefined{
 if(typeof value!=='string'||!value||value.trim()!==value)return
 try{const raw=parseDashboardRuntimeResponse(new TextEncoder().encode(`{"n":${value}}`)),number=raw.n;if(Object.keys(raw).length!==1||number===undefined||!isStrictJsonNumber(number))return
  const[coefficient,exponent='0']=number.lexical.toLowerCase().split('e'),power=BigInt(exponent),scale=BigInt(coefficient!.split('.')[1]?.length||0)-power
  if(power>2147483647n||power< -2147483648n||scale>2147483647n||scale< -2147483648n)return
  const parts=decimalParts(number.lexical),effective=parts.digits.replace(/0+$/,'');if(parts.sign&&BigInt(effective.length)-parts.order>16383n||compareMaterialNumbers(number.lexical,'1.7976931348623157e308')>0||compareMaterialNumbers(number.lexical,'-1.7976931348623157e308')<0)return
  return number.lexical
 }catch{return}
}
/** 同一个正式材料字段面用于权威预览与标准目录；显式null只由目录的旧四字段承载。 */
export function scalarMaterialFields(row:StrictJsonObject,catalog=false):Record<string,unknown>{
 const bad=():never=>{throw new Error('标量功能材料字段不完整或类型不符')},type=row.dataType
 if(typeof row.accessType!=='string'||!scalarAccessTypes.includes(row.accessType as typeof scalarAccessTypes[number])||typeof type!=='string'||!scalarDataTypes.includes(type as typeof scalarDataTypes[number]))bad()
 const result:Record<string,unknown>={}
 for(const key of materialExtraFields){
  if(!Object.hasOwn(row,key))continue
  const value=row[key]
  if(value===null){if(catalog&&['unit','decimalPlaces','minimumValue','maximumValue'].includes(key)){result[key]=null;continue}bad()}
  if(materialNumericFields.includes(key as typeof materialNumericFields[number])){
   if(type!=='NUMBER'||!isStrictJsonNumber(value!))bad();const lexical=(value as {lexical:string}).lexical
   if(sourceMaterialNumber(lexical)===undefined||key==='numericStep'&&compareMaterialNumbers(lexical,'0')<=0)bad();result[key]=lexical
  }else if(key==='decimalPlaces'){
   if(type!=='NUMBER'||!isStrictJsonNumber(value!)||!/^([0-9]|10)$/.test((value as {lexical:string}).lexical))bad();result[key]=Number((value as {lexical:string}).lexical)
  }else if(key==='unit'||key==='onLabel'||key==='offLabel'){
   if(type!==(key==='unit'?'NUMBER':'SWITCH')||!materialText(value,32))bad();result[key]=value
  }else if(key==='switchEncoding'){
   if(type!=='SWITCH'||!['BOOLEAN','NUMBER','TEXT'].includes(String(value)))bad();result[key]=value
  }else if(key==='textDefaultValue'){
   if(type!=='TEXT'||!materialText(value,4096))bad();result[key]=value
  }else if(key==='enumOptions'){
   if(type!=='ENUM'||!Array.isArray(value)||!value.length||value.length>100||new Set(value).size!==value.length||value.some(item=>!materialText(item,64,true)||item.trim()!==item))bad();result[key]=Object.freeze([...(value as string[])])
  }else if(key==='presentation'){
   const presentation=decodePropertyPresentation(value)
   if(!presentation||Object.keys(presentation.objectFields).length||Object.keys(presentation.enumDescriptions).length&&(type!=='ENUM'||!Array.isArray(row.enumOptions)||Object.keys(presentation.enumDescriptions).some(key=>!(row.enumOptions as readonly StrictJsonValue[]).includes(key))))bad();result[key]=presentation
  }
 }
 if(type==='SWITCH'&&!Object.hasOwn(result,'switchEncoding')||type==='ENUM'&&!Object.hasOwn(result,'enumOptions'))bad()
 const number=(key:string)=>typeof result[key]==='string'?result[key] as string:undefined,minimum=number('minimumValue'),maximum=number('maximumValue'),fallback=number('defaultValue')
 if(minimum!==undefined&&maximum!==undefined&&compareMaterialNumbers(minimum,maximum)>0||fallback!==undefined&&(minimum!==undefined&&compareMaterialNumbers(fallback,minimum)<0||maximum!==undefined&&compareMaterialNumbers(fallback,maximum)>0))bad()
 return result
}
/** 原件核对只允许数字等价的表示差别，其余完整字段、数组顺序和空值须一致。 */
export function materialPropertiesEqual(left:readonly object[],right:readonly object[]):boolean{
 function value(raw:unknown):string{if(raw===null||typeof raw!=='object')return JSON.stringify(raw);if(Array.isArray(raw))return'['+raw.map(value).join(',')+']';return'{'+Object.entries(raw).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+(materialNumericFields.includes(key as typeof materialNumericFields[number])&&typeof item==='string'?'#'+canonicalNumber(item):value(item))).join(',')+'}'}
 function canonicalNumber(raw:string){const p=decimalParts(raw);return p.sign?`${p.sign}:${p.digits.replace(/0+$/,'')}:${p.order}`:'0'}
 return value(left)===value(right)
}

/** 数值声明只展开有限长度的科学记数，不经浮点转换或舍入。 */
export function plainDeclaredNumber(value:string):string{
 const match=/^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(value);if(!match)return value
 const exponent=Number(match[4]);if(!Number.isSafeInteger(exponent)||Math.abs(exponent)>512)return value
 const digits=match[2]!+(match[3]||''),point=match[2]!.length+exponent
 if(Math.max(digits.length,point,1-point+digits.length)>512)return value
 if(/^0+$/.test(digits))return'0'
 const plain=point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point)
 return match[1]+plain.replace(/^0+(?=\d)/,'')
}
