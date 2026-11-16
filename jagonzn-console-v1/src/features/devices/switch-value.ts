import {isStrictJsonNumber,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import type {Schema} from '@/core/contracts'

export type SwitchEncoding=NonNullable<Schema<'SaveDevicePropertyDefinitionRequest'>['switchEncoding']>
export function switchEncoding(value:unknown):value is SwitchEncoding{return value==='BOOLEAN'||value==='NUMBER'||value==='TEXT'}
/** 不经浮点数比较，避免把1附近的高精度小数误认成开关1。 */
function numericState(lexical:string):boolean|undefined{
 const [coefficient='',exponent='0']=lexical.toLowerCase().split('e'),[whole='',fraction='']=coefficient.replace(/^-/,'').split('.')
 const digits=(whole+fraction).replace(/^0+/,'')
 if(!digits)return false
 if(coefficient.startsWith('-')||!/^10*$/.test(digits))return undefined
 return BigInt(exponent)-BigInt(fraction.length)+BigInt(digits.length-1)===0n?true:undefined
}
/** 只解释展示/选择状态；调用者继续保存、显示和发送原JSON，不替换原值。 */
export function switchState(value:StrictJsonValue|undefined,encoding:SwitchEncoding='BOOLEAN'):boolean|undefined{
 if(encoding==='BOOLEAN')return typeof value==='boolean'?value:undefined
 if(encoding==='TEXT')return value==='ON'?true:value==='OFF'?false:undefined
 if(encoding!=='NUMBER')return undefined
 return value!==undefined&&isStrictJsonNumber(value)?numericState(value.lexical):undefined
}
/** 固定模型缺字段沿旧布尔，显式空值和未知编码拒绝。 */
export function frozenSwitchEncoding(definition:Readonly<Record<string,unknown>>):SwitchEncoding|undefined{
 if(definition.dataType!=='SWITCH'){if(Object.hasOwn(definition,'switchEncoding'))throw new Error('非开关属性携带了无效值类型');return undefined}
 if(!Object.hasOwn(definition,'switchEncoding'))return 'BOOLEAN'
 if(!switchEncoding(definition.switchEncoding))throw new Error('冻结开关值类型不可用')
 return definition.switchEncoding
}
