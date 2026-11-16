import {api,type RequestOptions} from '@/core/http'
import type {ApiUrl} from '@/core/paths'
import type {Schema} from '@/core/contracts'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonValue,type StrictJsonObject} from '@things-link/client-contracts/dashboard/v1'
import {defaultCampaignPolicy,checkCampaignDraft} from '../../../../../things-link-console/src/features/ota/campaign-model'
import {canonicalPublicJson} from '../../../../../things-link-console/src/features/ota/strict-public-json'
import {JOB_STATUSES} from '../../../../../things-link-console/src/features/ota/job-model'
import {otaReadTransport,type OtaFirmware} from './ota-read-api'
export type OtaCampaignPlan=Readonly<Required<Schema<'OtaCampaignPlanBody'>>>
export type OtaCampaignSummary=Readonly<Required<Schema<'OtaCampaignSummaryResponse'>>>
export type OtaCampaign=Readonly<Omit<Required<Schema<'OtaCampaignResponse'>>,'plan'|'jobs'>&{plan:OtaCampaignPlan;jobs:readonly Required<Schema<'OtaCampaignJobResponse'>>[]}>
export type OtaCampaignExecution=Readonly<Omit<Required<Schema<'OtaCampaignExecutionResponse'>>,'runtimeCancellation'|'batchProgress'>&{runtimeCancellation:Schema<'OtaCampaignRuntimeCancellationResponse'>|null;batchProgress:Required<Schema<'OtaCampaignBatchProgressResponse'>>}>
export type OtaCampaignJob=Readonly<Required<Schema<'OtaDeviceJobSummaryResponse'>>>
export type OtaCampaignJobDetail=Readonly<Required<Schema<'OtaDeviceJobDetailResponse'>>>
export type OtaCampaignPage<T>=Readonly<{items:readonly T[];hasMore:boolean;nextCursor:string|null}>
export type OtaCampaignCreateIntent=Readonly<{project:string;key:string;plan:OtaCampaignPlan;rawBody:string;digest:string}>
export type OtaCampaignAction='schedule'|'start'|'pause'|'resume'|'cancel'|'advance'
export type OtaCampaignControlIntent=Readonly<{project:string;campaign:string;key:string;action:OtaCampaignAction;expectedRevision:string;reason?:string;expectedBatchNumber?:string;planDigest:string}>
export interface OtaCampaignTransport {
 list(project:string,cursor:string|undefined,signal:AbortSignal):Promise<OtaCampaignPage<OtaCampaignSummary>>
 read(project:string,id:string,signal:AbortSignal):Promise<OtaCampaign>
 execution(project:string,id:string,signal:AbortSignal):Promise<OtaCampaignExecution>
 jobs(project:string,id:string,cursor:string|undefined,signal:AbortSignal):Promise<OtaCampaignPage<OtaCampaignJob>>
 job(project:string,id:string,job:string,signal:AbortSignal):Promise<OtaCampaignJobDetail>
 firmware(project:string,id:string,signal:AbortSignal):Promise<OtaFirmware>
 firmwares:typeof otaReadTransport.list
 create(intent:OtaCampaignCreateIntent,signal:AbortSignal):Promise<OtaCampaign>
 control(intent:OtaCampaignControlIntent,signal:AbortSignal):Promise<OtaCampaign|OtaCampaignExecution>
}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,hash=/^[0-9a-f]{64}$/,states=['DRAFT','SCHEDULED','RUNNING','PAUSED','CANCELLING','CANCELLED','COMPLETED'] as const
function invalid():never{throw new Error('OTA活动事实、计划或资源范围不符合合同')}
function isObject(value:StrictJsonValue|undefined):value is StrictJsonObject{return value!==undefined&&value!==null&&typeof value==='object'&&!Array.isArray(value)&&!isStrictJsonNumber(value)}
function object(value:StrictJsonValue|undefined):StrictJsonObject{if(!isObject(value))invalid();return value}
function closed(value:StrictJsonValue|undefined,names:readonly string[]){const raw=object(value);if(Object.keys(raw).length!==names.length||Object.keys(raw).some(key=>!names.includes(key)))invalid();return raw}
function id(value:StrictJsonValue|undefined){if(typeof value!=='string'||!uuid.test(value))invalid();return value}
function text(value:StrictJsonValue|undefined,max=256){if(typeof value!=='string'||!value.trim()||Array.from(value).length>max||/[\u0000-\u001f\u007f-\u009f]|\p{Surrogate}/u.test(value))invalid();return value}
function time(value:StrictJsonValue|undefined){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))invalid();return value}
function nullableTime(value:StrictJsonValue|undefined){return value===null?null:time(value)}
function rev(value:StrictJsonValue|undefined){if(typeof value!=='string'||!/^(0|[1-9]\d{0,18})$/.test(value)||BigInt(value)>9223372036854775807n)invalid();return value}
function num(value:StrictJsonValue|undefined,min=0,max=1000){if(value===undefined||!isStrictJsonNumber(value)||!/^\d+$/.test(value.lexical))invalid();const n=Number(value.lexical);if(!Number.isSafeInteger(n)||n<min||n>max)invalid();return n}
function bool(value:StrictJsonValue|undefined){if(typeof value!=='boolean')invalid();return value}
function choice<T extends string>(value:StrictJsonValue|undefined,choices:readonly T[]):T{const found=choices.find(item=>item===value);if(found===undefined)invalid();return found}
function nullableChoice<T extends string>(value:StrictJsonValue|undefined,choices:readonly T[]):T|null{return value===null?null:choice(value,choices)}
function state(value:StrictJsonValue|undefined){const found=states.find(item=>item===value);if(!found)invalid();return found}
async function sha(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('')}
const stageNames=['DISPATCHED','DOWNLOADING','VERIFYING','INSTALLING','REBOOTING','HEALTH_CHECKING','CONFIRMING','ROLLBACK_PENDING','ROLLING_BACK'] as const
const policyNames=['maxConcurrentDownloads','maxDownloadBytesPerSecond','downloadRetryLimit','retryBackoffSeconds','healthWindowSeconds','pauseMinEvaluated','pauseFailureCount','pauseFailureRateBps','batchMinSuccessRateBps','requireManualBatchApproval','stageTimeoutSeconds'] as const
export function decodeCampaignPlan(value:StrictJsonValue|undefined):OtaCampaignPlan{
 const raw=closed(value,['contractVersion','firmwareId','deviceIds','batchSize','notBefore','executionPolicy']);if(raw.contractVersion!=='tc-ota-campaign-plan/v1'||!Array.isArray(raw.deviceIds)||!raw.deviceIds.length||raw.deviceIds.length>1000)invalid();const devices=raw.deviceIds.map(id);if(new Set(devices).size!==devices.length||devices.some((v,i)=>i>0&&v<=devices[i-1]!))invalid();const batchSize=num(raw.batchSize,1),policy=closed(raw.executionPolicy,policyNames),t=closed(policy.stageTimeoutSeconds,stageNames)
 const stageTimeoutSeconds={DISPATCHED:num(t.DISPATCHED,1,86400),DOWNLOADING:num(t.DOWNLOADING,1,86400),VERIFYING:num(t.VERIFYING,1,86400),INSTALLING:num(t.INSTALLING,1,86400),REBOOTING:num(t.REBOOTING,1,86400),HEALTH_CHECKING:num(t.HEALTH_CHECKING,1,86400),CONFIRMING:num(t.CONFIRMING,1,86400),ROLLBACK_PENDING:num(t.ROLLBACK_PENDING,1,86400),ROLLING_BACK:num(t.ROLLING_BACK,1,86400)}
 const executionPolicy={maxConcurrentDownloads:num(policy.maxConcurrentDownloads,1,batchSize),maxDownloadBytesPerSecond:num(policy.maxDownloadBytesPerSecond,1,1073741824),downloadRetryLimit:num(policy.downloadRetryLimit,0,10),retryBackoffSeconds:num(policy.retryBackoffSeconds,1,3600),healthWindowSeconds:num(policy.healthWindowSeconds,1,86400),pauseMinEvaluated:num(policy.pauseMinEvaluated,1,batchSize),pauseFailureCount:num(policy.pauseFailureCount,1,batchSize),pauseFailureRateBps:num(policy.pauseFailureRateBps,1,10000),batchMinSuccessRateBps:num(policy.batchMinSuccessRateBps,1,10000),requireManualBatchApproval:bool(policy.requireManualBatchApproval),stageTimeoutSeconds}
 if(stageTimeoutSeconds.HEALTH_CHECKING<executionPolicy.healthWindowSeconds)invalid()
 const notBefore=time(raw.notBefore);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(notBefore))invalid()
 return{contractVersion:'tc-ota-campaign-plan/v1',firmwareId:id(raw.firmwareId),deviceIds:devices,batchSize,notBefore,executionPolicy}
}
function summary(raw:StrictJsonObject):OtaCampaignSummary{return{id:id(raw.id),firmwareId:id(raw.firmwareId),status:state(raw.status),stateVersion:rev(raw.stateVersion),targetCount:num(raw.targetCount),batchCount:num(raw.batchCount),createdAt:time(raw.createdAt),updatedAt:time(raw.updatedAt),scheduledAt:nullableTime(raw.scheduledAt),cancelledAt:nullableTime(raw.cancelledAt)}}
const summaryFields=['id','firmwareId','status','stateVersion','targetCount','batchCount','createdAt','updatedAt','scheduledAt','cancelledAt'] as const
export function decodeCampaignSummary(value:StrictJsonValue|undefined){return summary(closed(value,summaryFields))}
function knownJob(value:StrictJsonValue|undefined):Schema<'OtaDeviceJobSummaryResponse'>['status']{if(typeof value!=='string'||!JOB_STATUSES.includes(value))invalid();return value as Schema<'OtaDeviceJobSummaryResponse'>['status']}
export async function decodeCampaign(value:StrictJsonValue|undefined,expectedId?:string):Promise<OtaCampaign>{
 const raw=closed(value,[...summaryFields,'planSha256','plan','jobs']);const base=summary(raw),plan=decodeCampaignPlan(raw.plan);if(expectedId&&base.id!==expectedId||plan.firmwareId!==base.firmwareId||typeof raw.planSha256!=='string'||!hash.test(raw.planSha256)||await sha(canonicalPublicJson(plan))!==raw.planSha256||!Array.isArray(raw.jobs)||raw.jobs.length>1000)invalid()
 const jobs=raw.jobs.map(value=>{const job=closed(value,['id','batchNumber','deviceId','deviceTypeId','thingModelVersionId','credentialVersion','status']);return{id:id(job.id),batchNumber:num(job.batchNumber,1),deviceId:id(job.deviceId),deviceTypeId:id(job.deviceTypeId),thingModelVersionId:job.thingModelVersionId===null?null:id(job.thingModelVersionId),credentialVersion:rev(job.credentialVersion),status:knownJob(job.status)!}})
 if(new Set(jobs.map(j=>j.id)).size!==jobs.length||new Set(jobs.map(j=>j.deviceId)).size!==jobs.length||jobs.some(j=>!plan.deviceIds.includes(j.deviceId))||base.status==='DRAFT'&&(base.targetCount!==0||base.batchCount!==0||jobs.length!==0)||base.status!=='DRAFT'&&base.targetCount!==jobs.length)invalid()
 return{...base,planSha256:raw.planSha256,plan,jobs}
}
export function decodeExecution(value:StrictJsonValue|undefined,expectedId:string):OtaCampaignExecution{
 const raw=closed(value,['id','status','stateVersion','startedAt','currentBatch','pauseKind','pauseReason','pausedAt','pauseActorId','pauseJobId','pendingCount','dispatchedCount','skippedCount','runtimeCancellation','batchProgress']);if(raw.id!==expectedId)invalid()
 const b=closed(raw.batchProgress,['currentBatchStatus','requireManualBatchApproval','awaitingManualApproval','nextBatchNumber','completedAt','outcome','targetCount','succeededCount','rolledBackCount','skippedCount','timedOutCount','cancelledCount'])
 const batchProgress={currentBatchStatus:nullableChoice(b.currentBatchStatus,['PENDING','RUNNING','PAUSED','DRAINING','CANCELLING','SUCCEEDED','FAILED','CANCELLED'] as const),requireManualBatchApproval:bool(b.requireManualBatchApproval),awaitingManualApproval:bool(b.awaitingManualApproval),nextBatchNumber:b.nextBatchNumber===null?null:num(b.nextBatchNumber,1),completedAt:nullableTime(b.completedAt),outcome:nullableChoice(b.outcome,['SUCCESS','PARTIAL_FAILURE','FAILED'] as const),targetCount:num(b.targetCount),succeededCount:num(b.succeededCount),rolledBackCount:num(b.rolledBackCount),skippedCount:num(b.skippedCount),timedOutCount:num(b.timedOutCount),cancelledCount:num(b.cancelledCount)}
 if(batchProgress.succeededCount+batchProgress.rolledBackCount+batchProgress.skippedCount+batchProgress.timedOutCount+batchProgress.cancelledCount>batchProgress.targetCount)invalid()
 let runtimeCancellation:OtaCampaignExecution['runtimeCancellation']=null
 if(raw.runtimeCancellation!==null){const c=closed(raw.runtimeCancellation,['requestedRevision','requestedFromStatus','requestedAt','requestedBy','reason','cancelledPendingCount','unresolvedCount','completedAt']);if(c.requestedFromStatus!=='RUNNING'&&c.requestedFromStatus!=='PAUSED')invalid();runtimeCancellation={requestedRevision:rev(c.requestedRevision),requestedFromStatus:c.requestedFromStatus,requestedAt:time(c.requestedAt),requestedBy:id(c.requestedBy),reason:text(c.reason),cancelledPendingCount:num(c.cancelledPendingCount),unresolvedCount:num(c.unresolvedCount),completedAt:nullableTime(c.completedAt)}}
 return{id:expectedId,status:state(raw.status),stateVersion:rev(raw.stateVersion),startedAt:nullableTime(raw.startedAt),currentBatch:raw.currentBatch===null?null:num(raw.currentBatch,1),pauseKind:nullableChoice(raw.pauseKind,['MANUAL','AUTO','SECURITY'] as const),pauseReason:raw.pauseReason===null?null:text(raw.pauseReason),pausedAt:nullableTime(raw.pausedAt),pauseActorId:raw.pauseActorId===null?null:id(raw.pauseActorId),pauseJobId:raw.pauseJobId===null?null:id(raw.pauseJobId),pendingCount:num(raw.pendingCount),dispatchedCount:num(raw.dispatchedCount),skippedCount:num(raw.skippedCount),runtimeCancellation,batchProgress}
}
const jobFields=['id','batchNumber','deviceId','deviceTypeId','thingModelVersionId','credentialVersion','status','attemptNo','stateVersion','failureCode','firstDispatchedAt','dispatchedAt','deadlineAt','nextAttemptAt'] as const
function job(value:StrictJsonValue|undefined):OtaCampaignJob{const r=closed(value,jobFields);return{id:id(r.id),batchNumber:num(r.batchNumber,1),deviceId:id(r.deviceId),deviceTypeId:id(r.deviceTypeId),thingModelVersionId:r.thingModelVersionId===null?null:id(r.thingModelVersionId),credentialVersion:rev(r.credentialVersion),status:knownJob(r.status)!,attemptNo:num(r.attemptNo,0,2147483647),stateVersion:rev(r.stateVersion),failureCode:r.failureCode===null?null:text(r.failureCode,128),firstDispatchedAt:nullableTime(r.firstDispatchedAt),dispatchedAt:nullableTime(r.dispatchedAt),deadlineAt:nullableTime(r.deadlineAt),nextAttemptAt:nullableTime(r.nextAttemptAt)}}
export function decodeJobDetail(value:StrictJsonValue|undefined,expected:string):OtaCampaignJobDetail{const raw=closed(value,[...jobFields,'transitions']);const copy=Object.fromEntries(jobFields.map(k=>[k,raw[k]!])) as StrictJsonObject,base=job(copy);if(base.id!==expected||!Array.isArray(raw.transitions)||raw.transitions.length>200)invalid();const transitions=raw.transitions.map((value):Required<Schema<'OtaDeviceJobTransitionResponse'>>=>{const t=closed(value,['fromStatus','toStatus','fromRevision','toRevision','actorKind','actorId','occurredAt','reason']);if(t.actorKind!=='SYSTEM'&&t.actorKind!=='MANAGEMENT')invalid();const fromRevision=rev(t.fromRevision),toRevision=rev(t.toRevision);if(BigInt(toRevision)!==BigInt(fromRevision)+1n)invalid();return{fromStatus:knownJob(t.fromStatus)!,toStatus:knownJob(t.toStatus)!,fromRevision,toRevision,actorKind:t.actorKind,actorId:t.actorId===null?null:id(t.actorId),occurredAt:time(t.occurredAt),reason:t.reason===null?null:text(t.reason)}});return{...base,transitions}}
function page<T extends {id:string}>(bytes:Uint8Array,decode:(value:StrictJsonValue)=>T,limit:number):OtaCampaignPage<T>{const r=closed(parseDashboardRuntimeResponse(bytes),['items','nextCursor','hasMore']);if(!Array.isArray(r.items)||r.items.length>limit||typeof r.hasMore!=='boolean'||(r.hasMore?typeof r.nextCursor!=='string'||!r.nextCursor||r.nextCursor.length>4096||!r.items.length:r.nextCursor!==null))invalid();const items=r.items.map(decode);if(new Set(items.map(row=>row.id)).size!==items.length)invalid();return{items,hasMore:r.hasMore,nextCursor:r.nextCursor as string|null}}
export async function prepareOtaCampaign(project:string,firmware:OtaFirmware,deviceIds:readonly string[],batchSize:number,notBefore:string,policy=defaultCampaignPolicy()):Promise<OtaCampaignCreateIntent>{
 if(!uuid.test(project)||firmware.projectId!==project||firmware.status!=='READY'||deviceIds.some(v=>!uuid.test(v)))throw new Error('活动只能使用当前项目已就绪的发布固件和明确设备')
 const devices=deviceIds.map(v=>v.toLowerCase()).sort(),check=checkCampaignDraft({firmwareId:firmware.id,deviceIds:devices,batchSize,notBefore});if(!check.ok)throw new Error(check.reason)
 if(!Number.isFinite(Date.parse(notBefore))||new Date(notBefore).toISOString().replace('.000Z','Z')!==notBefore||Date.parse(notBefore)>Date.now()+30*86400000)throw new Error('最早启动时间须为有效UTC秒级时间，最多提前30天')
 const plan=decodeCampaignPlan(parseDashboardRuntimeResponse(new TextEncoder().encode(JSON.stringify({contractVersion:'tc-ota-campaign-plan/v1',firmwareId:firmware.id,deviceIds:devices,batchSize,notBefore,executionPolicy:policy}))))
 const rawBody=canonicalPublicJson(plan);return Object.freeze({project,key:crypto.randomUUID(),plan,rawBody,digest:await sha(rawBody)})
}
export function campaignCreateMatches(row:OtaCampaign,intent:OtaCampaignCreateIntent){return row.firmwareId===intent.plan.firmwareId&&row.planSha256===intent.digest&&canonicalPublicJson(row.plan)===intent.rawBody}
export function prepareOtaCampaignControl(project:string,campaign:OtaCampaign,execution:OtaCampaignExecution|undefined,action:OtaCampaignAction,reason:string):OtaCampaignControlIntent{
 if(!uuid.test(project)||!uuid.test(campaign.id))invalid();const current=execution&&execution.id===campaign.id&&execution.stateVersion===campaign.stateVersion?execution:undefined
 const allowed=action==='schedule'?campaign.status==='DRAFT':action==='start'?campaign.status==='SCHEDULED'&&Date.parse(campaign.plan.notBefore)<=Date.now():action==='pause'?campaign.status==='RUNNING':action==='resume'?campaign.status==='PAUSED':action==='cancel'?['DRAFT','SCHEDULED','RUNNING','PAUSED'].includes(campaign.status):campaign.status==='RUNNING'&&!!current?.batchProgress.awaitingManualApproval&&current.currentBatch!==null&&current.batchProgress.currentBatchStatus==='SUCCEEDED'
 if(!allowed)throw new Error('当前活动状态或批次事实不接受此操作，请刷新')
 if(!['schedule','start'].includes(action)&&(!reason.trim()||Array.from(reason).length>256||/[\u0000-\u001f\u007f-\u009f]|\p{Surrogate}/u.test(reason)))throw new Error('请填写1至256字符的操作原因')
 if(BigInt(campaign.stateVersion)>=9223372036854775807n)throw new Error('活动修订已达到上限')
 return Object.freeze({project,campaign:campaign.id,key:crypto.randomUUID(),action,expectedRevision:campaign.stateVersion,planDigest:campaign.planSha256,...(!['schedule','start'].includes(action)?{reason}:{}),...(action==='advance'?{expectedBatchNumber:String(current!.currentBatch)}:{})})
}
function base(project:string){if(!uuid.test(project))invalid();return `/api/v1/projects/${project}/ota/campaigns` as const}
async function readBytes(path:ApiUrl<'get'>,signal:AbortSignal,query?:RequestOptions['query']){return api<Uint8Array>(path,{signal,query,responseType:'bytes',maxResponseBytes:4*1024*1024})}
const suffix={schedule:'scheduling',start:'starting',pause:'pauses',resume:'resumptions',cancel:'cancellation',advance:'batch-advancements'} as const
export const otaCampaignTransport:OtaCampaignTransport={
 async list(project,cursor,signal){return page(await readBytes(base(project),signal,{limit:20,cursor}),decodeCampaignSummary,20)},
 async read(project,campaign,signal){if(!uuid.test(campaign))invalid();return decodeCampaign(parseDashboardRuntimeResponse(await readBytes(`${base(project)}/${campaign}`,signal)),campaign)},
 async execution(project,campaign,signal){return decodeExecution(parseDashboardRuntimeResponse(await readBytes(`${base(project)}/${campaign}/execution`,signal)),campaign)},
 async jobs(project,campaign,cursor,signal){return page(await readBytes(`${base(project)}/${campaign}/jobs`,signal,{limit:100,cursor}),job,100)},
 async job(project,campaign,jobId,signal){return decodeJobDetail(parseDashboardRuntimeResponse(await readBytes(`${base(project)}/${campaign}/jobs/${jobId}`,signal)),jobId)},
 firmware:otaReadTransport.firmware,firmwares:otaReadTransport.list,
 async create(intent,signal){return decodeCampaign(parseDashboardRuntimeResponse(await api<Uint8Array>(base(intent.project),{method:'post',rawBody:intent.rawBody,headers:{'Content-Type':'application/json','Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:4*1024*1024})))},
 async control(intent,signal){const bytes=await api<Uint8Array>(`${base(intent.project)}/${intent.campaign}/${suffix[intent.action]}`,{method:'post',headers:{'Idempotency-Key':intent.key},body:{expectedRevision:intent.expectedRevision,...(intent.reason?{reason:intent.reason}:{}),...(intent.expectedBatchNumber?{expectedBatchNumber:intent.expectedBatchNumber}:{})},signal,responseType:'bytes',maxResponseBytes:4*1024*1024});return intent.action==='schedule'||intent.action==='cancel'?decodeCampaign(parseDashboardRuntimeResponse(bytes),intent.campaign):decodeExecution(parseDashboardRuntimeResponse(bytes),intent.campaign)}
}
