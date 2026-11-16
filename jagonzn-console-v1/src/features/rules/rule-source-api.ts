import type {Schema} from '@/core/contracts'
import {devicesApi} from '@/features/devices/api'
import {api,IdentityChanged} from '@/core/http'
import {readRawRuleJson,type RawRuleJsonValue} from './raw-rule-json'
import {definitionUuid} from './device-task-definition-port'
const exactRevisionCounter=(value:string)=>{if(!/^[1-9][0-9]{0,18}$/.test(value)||BigInt(value)>9223372036854775807n)throw new Error('来源版本无效');return value}
import {sourceIds,type RuleSourceSelection} from './rule-source-selection'
export type RuleDeviceSourceContract=Schema<'RuleDeviceSource'>
export type RuleSourceSnapshot=Required<Schema<'MessageRuleSourceView'>>
const invalid=()=>new Error('设备来源或双版本回读不完整，请重新读取')
const uuid=(value:unknown)=>{if(!definitionUuid(value))throw invalid();return value.toLowerCase()}
const sha=(value:unknown)=>{if(typeof value!=='string'||!/^[0-9a-f]{64}$/.test(value))throw invalid();return value}
/** 正式Schema承接旧单值及新完整集合，绝不选择多设备第一项。 */
export function deviceSourceMembers(value:RuleDeviceSourceContract):string[]{
 if(!value||!['LEGACY_PROJECT','DEVICE','DEVICE_TYPE'].includes(String(value.kind)))throw invalid()
 const array=value.referenceIds
 if(value.kind==='LEGACY_PROJECT'){if(value.referenceId!=null||array!=null)throw invalid();return []}
 if(array!=null){if(value.kind!=='DEVICE'||value.referenceId!=null||!Array.isArray(array)||array.length<2||array.length>64)throw invalid();const ids=array.map(uuid);if(new Set(ids).size!==ids.length||ids.some((id,index)=>index>0&&id<=ids[index-1]!))throw invalid();return ids}
 return [uuid(value.referenceId)]
}
export function decodeDeviceSource(value:RawRuleJsonValue):RuleDeviceSourceContract{
 type T=RuleDeviceSourceContract
 const kind=value.at(['kind' satisfies keyof T]).string(),reference=value.optional(['referenceId' satisfies keyof T]),ids=value.optional(['referenceIds' satisfies keyof T])
 if(value.keys().some(key=>!['kind','referenceId','referenceIds'].includes(key)))throw invalid()
 const result:RuleDeviceSourceContract={kind:kind as T['kind'],referenceId:!reference||reference.kind==='null'?null:uuid(reference.string()),...(ids&&ids.kind!=='null'?{referenceIds:Array.from({length:ids.arrayLength()},(_,i)=>uuid(ids.at([i]).string()))}:{})};deviceSourceMembers(result);return result
}
export function sourceContract(value:RuleSourceSelection):RuleDeviceSourceContract{const ids=sourceIds(value);return ids.length===1?{kind:value.kind,referenceId:ids[0]!}:{kind:'DEVICE',referenceId:null,referenceIds:ids}}
export function sourceSelection(value:RuleDeviceSourceContract,names:ReadonlyMap<string,string>=new Map()):RuleSourceSelection{const ids=deviceSourceMembers(value);if(value.kind!=='DEVICE'&&value.kind!=='DEVICE_TYPE')throw invalid();return{kind:value.kind,members:ids.map(referenceId=>({referenceId,name:names.get(referenceId)??''}))}}
export function sameDeviceSource(left:RuleDeviceSourceContract,right:RuleDeviceSourceContract){return left.kind===right.kind&&JSON.stringify(deviceSourceMembers(left))===JSON.stringify(deviceSourceMembers(right))}
export function decodeRuleSource(bytes:Uint8Array,expectedId:string):RuleSourceSnapshot{
 const raw=readRawRuleJson(bytes),text=(key:keyof RuleSourceSnapshot)=>raw.at([key]).string(),nullable=(key:keyof RuleSourceSnapshot)=>{const value=raw.at([key]);return value.kind==='null'?null:value.string()}
 const status=text('status');if(!['DRAFT','ACTIVE','PAUSED'].includes(status))throw invalid()
 const active=nullable('activeVersionId'),activeNumber=nullable('activeVersionNumber'),activeSha=nullable('activeSourceSha256')
 const result:RuleSourceSnapshot={ruleId:uuid(text('ruleId')),definitionVersion:exactRevisionCounter(text('definitionVersion')),status:status as RuleSourceSnapshot['status'],readOnly:raw.at(['readOnly']).boolean(),deviceSource:decodeDeviceSource(raw.at(['deviceSource'])),activeVersionId:active===null?null:uuid(active),activeVersionNumber:activeNumber===null?null:exactRevisionCounter(activeNumber),activeSourceSha256:activeSha===null?null:sha(activeSha),latestVersionId:uuid(text('latestVersionId')),latestVersionNumber:exactRevisionCounter(text('latestVersionNumber')),latestSourceSha256:sha(text('latestSourceSha256'))}
 if(result.ruleId!==uuid(expectedId)||active===null&&(activeNumber!==null||activeSha!==null)||active!==null&&(activeNumber===null||activeSha===null)||status==='DRAFT'&&active!==null||status!=='DRAFT'&&active===null||activeNumber!==null&&BigInt(activeNumber)>BigInt(result.latestVersionNumber)||active===result.latestVersionId&&(activeNumber!==result.latestVersionNumber||activeSha!==result.latestSourceSha256))throw invalid();return result
}
const root=(project:string,rule:string)=>`/api/v1/projects/${project}/message-rules/${rule}/device-source` as const
export async function readRuleSource(project:string,rule:string,signal?:AbortSignal){return decodeRuleSource(await api<Uint8Array>(root(project,rule),{responseType:'bytes',maxResponseBytes:65536,signal}),rule)}
export function ruleSourceRequest(before:RuleSourceSnapshot,wanted:RuleDeviceSourceContract):Schema<'MessageRuleSourceRequest'>{deviceSourceMembers(wanted);if(before.readOnly||before.deviceSource.kind!==wanted.kind||wanted.kind==='LEGACY_PROJECT')throw invalid();return{deviceSource:wanted,expectedDefinitionVersion:before.definitionVersion,baseLatestVersionId:before.latestVersionId,baseActiveVersionId:before.activeVersionId}}
export async function writeRuleSource(project:string,before:RuleSourceSnapshot,wanted:RuleDeviceSourceContract,current:()=>boolean,signal?:AbortSignal){if(!current())throw new IdentityChanged();const body=ruleSourceRequest(before,wanted),bytes=await api<Uint8Array>(root(project,before.ruleId),{method:'put',body,responseType:'bytes',maxResponseBytes:65536,signal});if(!current())throw new IdentityChanged();return decodeRuleSource(bytes,before.ruleId)}
/** 只核当前有效结果，不把同集合归因为原请求或原actor已执行。 */
export function confirmRuleSource(before:RuleSourceSnapshot,wanted:RuleDeviceSourceContract,after:RuleSourceSnapshot,accepted?:RuleSourceSnapshot){
 const changed=!sameDeviceSource(before.deviceSource,wanted),clones=changed?(before.activeVersionId!==null&&before.activeVersionId!==before.latestVersionId?2n:1n):0n,base=BigInt(before.latestVersionNumber)
 if(after.ruleId!==before.ruleId||after.status!==before.status||after.definitionVersion!==(BigInt(before.definitionVersion)+(changed?1n:0n)).toString()||!sameDeviceSource(after.deviceSource,wanted)||after.latestVersionNumber!==(base+clones).toString()||after.latestSourceSha256!==before.latestSourceSha256||after.activeSourceSha256!==before.activeSourceSha256)throw invalid()
 if(changed){if([before.latestVersionId,before.activeVersionId].includes(after.latestVersionId)||before.activeVersionId===null&&(after.activeVersionId!==null||after.activeVersionNumber!==null)||before.activeVersionId!==null&&(after.activeVersionId===null||[before.activeVersionId,before.latestVersionId].includes(after.activeVersionId)||after.activeVersionNumber!==(base+1n).toString())||clones===1n&&before.activeVersionId!==null&&after.activeVersionId!==after.latestVersionId||clones===2n&&after.activeVersionId===after.latestVersionId)throw invalid()}
 else if(after.activeVersionId!==before.activeVersionId||after.latestVersionId!==before.latestVersionId||after.activeVersionNumber!==before.activeVersionNumber)throw invalid()
 if(accepted&&(after.activeVersionId!==accepted.activeVersionId||after.latestVersionId!==accepted.latestVersionId||after.definitionVersion!==accepted.definitionVersion))throw invalid()
}

/** 名称只取当前项目实际读取结果；多设备核整集合，不用裸UUID当已确权标签。 */
export async function readRuleSourceNames(project:string,source:RuleDeviceSourceContract,signal?:AbortSignal):Promise<Map<string,string>>{const ids=deviceSourceMembers(source),names=new Map<string,string>();let offset=0;await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{while(offset<ids.length){signal?.throwIfAborted();const id=ids[offset++]!,row=await(source.kind==='DEVICE'?devicesApi.read(project,id,signal):devicesApi.type(project,id,signal));if(row.id?.toLowerCase()!==id||'projectId' in row&&row.projectId!==project||typeof row.name!=='string'||!row.name.trim())throw invalid();names.set(id,row.name)}}));return names}
