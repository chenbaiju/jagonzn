import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
/** 仅引用正式生成物；后端正式生成前本候选不得签类型检查通过。 */
export type DirectoryMapContext=Schema<'DirectoryMapContextResponse'>
export function readDirectoryMapContext(project:string,frameNonce:string,signal:AbortSignal):Promise<DirectoryMapContext>{
 return api<DirectoryMapContext>(`/api/v1/projects/${encodeURIComponent(project)}/directory-map-contexts/${encodeURIComponent(frameNonce)}`,{signal,maxResponseBytes:8192})
}
