import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
export type DefinitionRasterIcon=Readonly<Required<Schema<'DefinitionRasterIconDto'>>>
function invalid():never{throw new Error('图标须为规范PNG，最多128像素和16KiB，请重新选择图片')}
function integer(value:unknown){if(isStrictJsonNumber(value as StrictJsonValue)){const lexical=(value as {lexical:string}).lexical;if(!/^[1-9][0-9]{0,2}$/.test(lexical))invalid();value=Number(lexical)}if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>128)invalid();return value}
/** 只接受固定PNG资料和规范Base64，资源地址不能由调用方提供。 */
export function decodeDefinitionRasterIcon(value:unknown):DefinitionRasterIcon|null{
 if(value==null)return null
 if(typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as StrictJsonValue))invalid();const raw=value as Record<string,unknown>
 if(Object.keys(raw).length!==5||Object.keys(raw).some(key=>!['mediaType','width','height','sha256','base64'].includes(key))||raw.mediaType!=='image/png'||typeof raw.sha256!=='string'||!/^[0-9a-f]{64}$/.test(raw.sha256)||typeof raw.base64!=='string'||raw.base64.length>21848||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw.base64))invalid()
 const width=integer(raw.width),height=integer(raw.height);let decoded:string;try{decoded=atob(raw.base64)}catch{invalid()}
 if(decoded!.length<33||decoded!.length>16384||btoa(decoded!)!==raw.base64)invalid();const bytes=Uint8Array.from(decoded!,char=>char.charCodeAt(0)),view=new DataView(bytes.buffer)
 if(Array.from(bytes.subarray(0,16)).map(byte=>byte.toString(16).padStart(2,'0')).join('')!=='89504e470d0a1a0a0000000d49484452'||view.getUint32(16)!==width||view.getUint32(20)!==height)invalid()
 return Object.freeze({mediaType:'image/png',width,height,sha256:raw.sha256,base64:raw.base64})
}
export function sameDefinitionRasterIcon(a:DefinitionRasterIcon|null|undefined,b:DefinitionRasterIcon|null|undefined){return a==null||b==null?a==null&&b==null:a.mediaType===b.mediaType&&a.width===b.width&&a.height===b.height&&a.sha256===b.sha256&&a.base64===b.base64}
/** PNG内容已经过闭集解码，不能构造远端URL或SVG资源。 */
export const rasterIconSource=(icon:DefinitionRasterIcon)=>`data:image/png;base64,${icon.base64}`
export type RasterIconPreviewTransport=(project:string,typeId:string,base64:string,signal:AbortSignal)=>Promise<DefinitionRasterIcon>
export const previewDefinitionRasterIcon:RasterIconPreviewTransport=async(project,typeId,base64,signal)=>{
 const raw=await api<Uint8Array>(`/api/v1/projects/${project}/device-types/${typeId}/definition-icon-previews`,{method:'post',body:{base64},signal,responseType:'bytes',maxResponseBytes:32768})
 const icon=decodeDefinitionRasterIcon(parseDashboardRuntimeResponse(raw));if(!icon)invalid()
 const bytes=Uint8Array.from(atob(icon.base64),char=>char.charCodeAt(0)),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');if(digest!==icon.sha256)invalid();return icon
}
