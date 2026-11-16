import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'
import {typeDeviceUuid} from './type-devices-api'
// 持久资料只派生正式服务端Schema；生成前不另造一份DTO。
type Complete<T>=T extends readonly (infer V)[]?Complete<V>[]:T extends object?{-readonly [K in keyof T]-?:Complete<T[K]>}:T
export type PanelDraft=Complete<Schema<'DeviceTypePanelDraft'>>
export type PanelComponent=Complete<Schema<'DeviceTypePanelComponent'>>
export type PanelItem=Complete<Schema<'DeviceTypePanelItem'>>
export type PanelStyle=Complete<Schema<'DeviceTypePanelStyle'>>
export type PanelNumberProperty=Complete<Schema<'DeviceTypePanelNumberProperty'>>
export type PanelResponse=Complete<Schema<'DeviceTypePanelDraftResponse'>>
type SaveBody=Complete<Schema<'SaveDeviceTypePanelDraftRequest'>>
export type PanelIntent=Readonly<{project:string;typeId:string;body:SaveBody;raw:string}>
export type PanelTransport={read:(project:string,typeId:string,signal:AbortSignal)=>Promise<PanelResponse>;save:(intent:PanelIntent,signal:AbortSignal)=>Promise<PanelResponse>}
const contract='thingslink.device-type-panel-draft.v1',localKey=/^[A-Za-z0-9_-]{1,64}$/
const colors=['valueColor','nameColor','iconForegroundColor','iconBackgroundColor'] as const
const decimal=(value:unknown)=>typeof value==='string'&&/^(0|[1-9]\d{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n
const token=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value)
function invalid():never{throw new Error('类型面板资料超出当前合同或资源范围，请重新读取')}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as never)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();const row=value as Record<string,unknown>;if(Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key)))invalid();return row}
function integer(value:unknown,min:number,max:number){let result:number;if(isStrictJsonNumber(value as never)){const raw=(value as {lexical:string}).lexical;if(!/^-?(0|[1-9]\d*)$/.test(raw))invalid();result=Number(raw)}else if(typeof value==='number')result=value;else invalid();if(!Number.isSafeInteger(result)||result<min||result>max)invalid();return result}
function name(value:unknown,max=128):value is string{return typeof value==='string'&&value.length<=max&&!!value.replace(/[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]/gu,'')&&!/[\u0000-\u001f\u007f-\u009f]|\p{Surrogate}/u.test(value)}
function color(value:unknown){if(value===null)return null;if(typeof value!=='string'||!/^#[0-9a-fA-F]{6}$/.test(value))invalid();return value.toUpperCase()}
function array(value:unknown,max:number){if(!Array.isArray(value)||value.length>max)invalid();return value}
export function decodePanelDraft(value:unknown):PanelDraft{
 const root=object(value,['contract','components']);if(root.contract!==contract)invalid();const ids=new Set<string>();let total=0
 const components=array(root.components,32).map(value=>{const row=object(value,['id','kind','items','style','marginTop','marginBottom']);if(typeof row.id!=='string'||!localKey.test(row.id)||ids.has(row.id)||row.kind!=='ICON_NUMBER_CARD')invalid();ids.add(row.id);const properties=new Set<string>();const items=array(row.items,100).map(value=>{const item=object(value,['propertyId','propertyKey','displayName','iconId','iconColor']);if(typeof item.propertyId!=='string'||!typeDeviceUuid.test(item.propertyId)||properties.has(item.propertyId)||typeof item.propertyKey!=='string'||!localKey.test(item.propertyKey)||!name(item.displayName)||item.iconId!==null&&item.iconId!=='mdi-thermometer')invalid();properties.add(item.propertyId);return{...item,iconColor:color(item.iconColor)} as PanelItem});total+=items.length;const style=object(row.style,['backgroundCard',...colors]);if(typeof style.backgroundCard!=='boolean')invalid();return{id:row.id,kind:'ICON_NUMBER_CARD',items,style:{backgroundCard:style.backgroundCard,...Object.fromEntries(colors.map(key=>[key,color(style[key])]))} as PanelStyle,marginTop:integer(row.marginTop,-16,300),marginBottom:integer(row.marginBottom,-16,300)} as PanelComponent})
 if(total>256)invalid();return{contract,components}
}
export function decodePanelResponse(value:unknown,typeId:string):PanelResponse{
 const row=object(value,['deviceTypeId','revision','definitionToken','currentNumberProperties','draft','issues']);if(!typeDeviceUuid.test(typeId)||row.deviceTypeId!==typeId||!decimal(row.revision)||!token(row.definitionToken))invalid();const ids=new Set<string>(),keys=new Set<string>()
 const currentNumberProperties=array(row.currentNumberProperties,Number.MAX_SAFE_INTEGER).map(value=>{const p=object(value,['id','propertyKey','name','unit','decimalPlaces']);if(typeof p.id!=='string'||!typeDeviceUuid.test(p.id)||ids.has(p.id)||typeof p.propertyKey!=='string'||!localKey.test(p.propertyKey)||keys.has(p.propertyKey)||typeof p.name!=='string'||!(p.unit===null||typeof p.unit==='string'))invalid();ids.add(p.id);keys.add(p.propertyKey);return{...p,decimalPlaces:p.decimalPlaces===null?null:integer(p.decimalPlaces,0,10)} as PanelNumberProperty})
 const draft=decodePanelDraft(row.draft),issues=array(row.issues,256).map(value=>{const issue=object(value,['componentId','itemIndex','propertyId','propertyKey','code']),index=integer(issue.itemIndex,0,99),component=draft.components.find(c=>c.id===issue.componentId),item=component?.items[index];if(!component||!item||issue.propertyId!==item.propertyId||issue.propertyKey!==item.propertyKey||issue.code!=='PROPERTY_MISSING'&&issue.code!=='PROPERTY_KEY_CHANGED'&&issue.code!=='PROPERTY_NOT_NUMBER')invalid();return{componentId:component.id,itemIndex:index,propertyId:item.propertyId,propertyKey:item.propertyKey,code:issue.code}})
 if(new Set(issues.map(issue=>`${issue.componentId}/${issue.itemIndex}`)).size!==issues.length)invalid()
 return{deviceTypeId:typeId,revision:row.revision,definitionToken:row.definitionToken,currentNumberProperties,draft,issues} as PanelResponse
}
export const emptyPanelStyle=():PanelStyle=>({backgroundCard:false,valueColor:null,nameColor:null,iconForegroundColor:null,iconBackgroundColor:null})
export function preparePanelSave(project:string,typeId:string,snapshot:PanelResponse,draft:PanelDraft):PanelIntent{
 path(project,typeId);const current=decodePanelResponse(snapshot,typeId),complete=decodePanelDraft(draft);if(BigInt(current.revision)>=9223372036854775807n)throw new Error('面板修订已到上限')
 if(complete.components.some(c=>c.items.some(item=>!current.currentNumberProperties.some(p=>p.id===item.propertyId&&p.propertyKey===item.propertyKey))))throw new Error('存在已移除、重建或不再为数值的属性，请明确移除后重新选择')
 const body={expectedRevision:current.revision,definitionToken:current.definitionToken,draft:complete} as SaveBody,raw=JSON.stringify(body);if(new TextEncoder().encode(raw).length>131072)throw new Error('面板保存正文不能超过128KiB');return Object.freeze({project,typeId,body,raw})
}
export function panelReceiptMatches(actual:PanelResponse,intent:PanelIntent){return actual.deviceTypeId===intent.typeId&&actual.revision===String(BigInt(intent.body.expectedRevision)+1n)&&actual.definitionToken===intent.body.definitionToken&&JSON.stringify(actual.draft)===JSON.stringify(intent.body.draft)}
function path(project:string,typeId:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId))invalid();return `/api/v1/projects/${project}/device-types/${typeId}/panel-draft` as const}
export const panelTransport:PanelTransport={
 async read(project,typeId,signal){return decodePanelResponse(parseDashboardRuntimeResponse(await api<Uint8Array>(path(project,typeId),{signal,responseType:'bytes',maxResponseBytes:512*1024})),typeId)},
 async save(intent,signal){return decodePanelResponse(parseDashboardRuntimeResponse(await api<Uint8Array>(path(intent.project,intent.typeId),{method:'put',rawBody:intent.raw,headers:{'Content-Type':'application/json'},signal,responseType:'bytes',maxResponseBytes:512*1024})),intent.typeId)}
}
