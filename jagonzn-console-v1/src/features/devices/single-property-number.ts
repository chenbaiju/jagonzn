import {isStrictJsonNumber,parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'

/** 步进展开的资源预算，不是手填数字或服务端量程限制。 */
const maximumStepDigits=4096
export type NumberDraft=Readonly<{lexical:string;decrease:string|undefined;increase:string|undefined}>
/** 唯一运行解析器校验单数字；原手填正文由调用者保留，不裁剪或重新编码。 */
export function readNumberDraft(raw:string):NumberDraft|undefined{
 try{
  const tree=parseDashboardRuntimeResponse(new TextEncoder().encode(`{"v":${raw}}`)),value=tree.v
  if(Object.keys(tree).length!==1||value===undefined||!isStrictJsonNumber(value))return undefined
  return Object.freeze({lexical:value.lexical,decrease:step(value.lexical,-1n),increase:step(value.lexical,1n)})
 }catch{return undefined}
}
/** 只对已验证词法做十进制整数运算；不把数值转换为浮点。 */
function step(lexical:string,direction:bigint):string|undefined{
 if(lexical.length>maximumStepDigits)return undefined
 const negative=lexical.startsWith('-'),[coefficient,exponent='0']=lexical.replace(/^-/,'').toLowerCase().split('e'),[integer,fraction='']=coefficient!.split('.')
 const digits=(integer!+fraction).replace(/^0+/,'')
 if(!digits)return direction.toString()
 const scale=BigInt(fraction.length)-BigInt(exponent)
 if(scale>BigInt(maximumStepDigits-1)||scale< -BigInt(maximumStepDigits))return undefined
 // 位数已经通过有界整数检查；此转换仅用于字符串索引，不转换属性数值。
 const places=scale>0n?Number(scale):0
 if(Math.max(digits.length+(scale<0n?Number(-scale):0),places+1)>maximumStepDigits)return undefined
 let value=BigInt((negative?'-':'')+digits)
 if(scale<0n)value*=10n**(-scale)
 value+=direction*10n**BigInt(places)
 const sign=value<0n?'-':'',absolute=(value<0n?-value:value).toString()
 if(Math.max(absolute.length,places+1)>maximumStepDigits)return undefined
 if(!places)return sign+absolute
 const padded=absolute.padStart(places+1,'0'),split=padded.length-places,tail=padded.slice(split).replace(/0+$/,'')
 return sign+padded.slice(0,split)+(tail?'.'+tail:'')
}
