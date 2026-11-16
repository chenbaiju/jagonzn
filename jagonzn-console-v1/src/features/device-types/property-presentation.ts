import {decodeDefinitionRasterIcon,sameDefinitionRasterIcon,type DefinitionRasterIcon} from './definition-raster-icon'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
type Contract=Schema<'DevicePropertyPresentationDto'>
export type PropertyPresentation=Readonly<Required<Omit<Contract,'enumDescriptions'|'objectFields'|'iconRaster'>>&{iconRaster?:DefinitionRasterIcon;enumDescriptions:Readonly<NonNullable<Contract['enumDescriptions']>>;objectFields:Readonly<Record<string,Readonly<Required<Schema<'DevicePropertyObjectFieldDto'>>>>>}>
export const propertyIcons=[['temperature','温度'],['humidity','湿度'],['power','电力'],['location','位置'],['switch','开关'],['text','文本'],['number','数值'],['time','时间'],['battery','电量'],['signal','信号'],['alarm','告警'],['device','设备']] as const
/** 原十二项保持供其它领域复用；两项MDI仅属于属性。 */
export const propertyStyleIcons:readonly (readonly [string,string])[]=Object.freeze([...propertyIcons,['mdi-opacity','湿度（水滴）'] as const,['mdi-thermometer','温度（温度计）'] as const])
export const propertyStyleIconAllowed=(id:unknown):id is string=>typeof id==='string'&&propertyStyleIcons.some(([key])=>key===id)
function invalid():never{throw new Error('属性展示配置不完整、超出范围或存在未支持字段')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as StrictJsonValue)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();return value as Record<string,unknown>}
/** 未发送由调用者保留；显式空对象规范为null，后端仍独立核实际属性类型与字段。 */
export function normalizePropertyPresentation(value:unknown):PropertyPresentation|null{
 if(value===null)return null
 const raw=object(value)
 if(Object.keys(raw).some(key=>!['iconId','color','enumDescriptions','objectFields','iconRaster'].includes(key)))invalid()
 const iconId=raw.iconId??null,color=raw.color??null,iconRaster=decodeDefinitionRasterIcon(raw.iconRaster)
 if(iconRaster&&(iconId!==null||color!==null))invalid()
 if(iconId!==null&&!propertyStyleIconAllowed(iconId)||color!==null&&(typeof color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(color)))invalid()
 const enums=object(raw.enumDescriptions??{}),fields=object(raw.objectFields??{})
 if(Object.keys(enums).length>100||Object.keys(fields).length>64)invalid()
 const enumDescriptions=Object.fromEntries(Object.entries(enums).map(([key,value])=>{if(!key||key.length>64||typeof value!=='string'||value.trim().length>512)invalid();return[key,value.trim()]}).filter(([,value])=>value))
 const objectFields=Object.fromEntries(Object.entries(fields).map(([key,value])=>{const row=object(value);if(!/^[A-Za-z0-9_-]{1,64}$/.test(key)||Object.keys(row).some(name=>!['name','description'].includes(name))||typeof row.name!=='string'||!row.name.trim()||row.name.trim().length>64||!(row.description==null||typeof row.description==='string'&&row.description.trim().length<=512))invalid();return[key,Object.freeze({name:row.name.trim(),description:typeof row.description==='string'?row.description.trim()||null:null})]}))
 const result=Object.freeze({iconId:iconId as PropertyPresentation['iconId'],color:typeof color==='string'?color.toLowerCase():null,enumDescriptions:Object.freeze(enumDescriptions),objectFields:Object.freeze(objectFields),...(iconRaster?{iconRaster}:{})})
 if(new TextEncoder().encode(JSON.stringify(result)).length>65536)throw new Error('属性展示配置合计不能超过64KiB，请精简说明')
 return result.iconId===null&&result.color===null&&!iconRaster&&!Object.keys(enumDescriptions).length&&!Object.keys(objectFields).length?null:result
}
export function decodePropertyPresentation(value:unknown):PropertyPresentation|null|undefined{
 if(value===undefined)return undefined
 if(value!==null){const raw=object(value);if(Object.keys(raw).length!==(Object.hasOwn(raw,'iconRaster')?5:4)||!['iconId','color','enumDescriptions','objectFields'].every(key=>Object.hasOwn(raw,key))||raw.iconId===undefined||raw.color===undefined)invalid();object(raw.enumDescriptions);object(raw.objectFields)}
 return normalizePropertyPresentation(value)
}
export function samePropertyPresentation(first:PropertyPresentation|null|undefined,second:PropertyPresentation|null|undefined){
 const a=first??null,b=second??null;if(a===null||b===null)return a===b
 return a.iconId===b.iconId&&a.color===b.color&&sameDefinitionRasterIcon(a.iconRaster,b.iconRaster)&&JSON.stringify(Object.entries(a.enumDescriptions).sort())===JSON.stringify(Object.entries(b.enumDescriptions).sort())&&JSON.stringify(Object.entries(a.objectFields).sort())===JSON.stringify(Object.entries(b.objectFields).sort())
}
