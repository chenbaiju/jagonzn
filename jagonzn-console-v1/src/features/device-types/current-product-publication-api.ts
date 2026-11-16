import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {typeDeviceUuid} from './type-devices-api'
import {referenceVersion} from '../devices/reference-profile'
import {checkTemplatePackage} from './private-template-api'
import {decodeSharedProduct,productTransport,type OwnedProduct,type OwnedProducts,type SharedTypeProduct} from './public-product-api'
import {readProductDefinitionPackageDetails} from './product-definition-import-api'
export type CurrentProductCapture=Readonly<Required<Schema<'DeviceTypeCurrentProductCaptureResponse'>>>
export type CurrentProductPublication=Readonly<Omit<Required<Schema<'DeviceTypeCurrentProductPublicationResponse'>>,'product'>&{product:SharedTypeProduct}>
export type CurrentProductCaptureIntent=Readonly<{project:string;typeId:string;key:string;body:Readonly<Required<Schema<'DeviceTypeCurrentProductCaptureRequest'>>>}>
export type CurrentProductPublishIntent=Readonly<{project:string;typeId:string;key:string;capture:CurrentProductCapture;previous:OwnedProduct|null;body:Readonly<Required<Schema<'PublishDeviceTypeCurrentProductRequest'>>>}>
export type CurrentProductPublicationTransport={owned:(project:string,signal:AbortSignal)=>Promise<OwnedProducts>;capture:(intent:CurrentProductCaptureIntent,signal:AbortSignal)=>Promise<CurrentProductCapture>;captured:(intent:CurrentProductCaptureIntent,signal:AbortSignal)=>Promise<CurrentProductCapture>;publish:(intent:CurrentProductPublishIntent,signal:AbortSignal)=>Promise<CurrentProductPublication>;published:(intent:CurrentProductPublishIntent,signal:AbortSignal)=>Promise<CurrentProductPublication>}
const scopes=(extensions=false,data=false,thingsX=false,tasks=false,rules=false)=>Object.freeze({functions:true,extensions,rules,tasks,data,thingsX})
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=(v:unknown):v is string=>typeof v==='string'&&typeDeviceUuid.test(v)
function invalid():never{throw new Error('当前类型固定预览或产品发布回执不符合原意图')}
function closed(v:unknown,keys:readonly string[]):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))invalid();const row=v as Record<string,unknown>;if(Object.keys(row).length!==keys.length||keys.some(k=>!Object.hasOwn(row,k)))invalid();return row}
function time(v:unknown):v is string{return typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(v)&&Number.isFinite(Date.parse(v))}
function base(project:string,type:string){if(!uuid(project)||!uuid(type))invalid();return `/api/v1/projects/${project}/device-types/${type}` as const}
export function prepareCurrentProductCapture(project:string,typeId:string,extensions=false,data=false,thingsX=false,tasks=false,rules=false):CurrentProductCaptureIntent{base(project,typeId);if(typeof extensions!=='boolean'||typeof data!=='boolean'||typeof thingsX!=='boolean'||typeof tasks!=='boolean'||typeof rules!=='boolean')invalid();return Object.freeze({project,typeId,key:crypto.randomUUID(),body:Object.freeze({scopes:scopes(extensions,data,thingsX,tasks,rules)})})}
export function decodeCurrentProductCapture(value:unknown,intent:Pick<CurrentProductCaptureIntent,'typeId'>&Partial<Pick<CurrentProductCaptureIntent,'body'>>):CurrentProductCapture{
 const row=closed(value,['captureId','sourceDeviceTypeId','packageJson','packageDigest','modelDigest','scopes','capturedAt','expiresAt']),selected=closed(row.scopes,Object.keys(scopes())),expected=intent.body?.scopes??scopes()
 if(!uuid(row.captureId)||row.sourceDeviceTypeId!==intent.typeId||!hash(row.packageDigest)||!hash(row.modelDigest)||!time(row.capturedAt)||!time(row.expiresAt)||Date.parse(row.expiresAt)<=Date.parse(row.capturedAt)||Object.entries(scopes(!!expected.extensions,!!expected.data,!!expected.thingsX,!!expected.tasks,!!expected.rules)).some(([k,v])=>selected[k]!==v||expected[k as keyof typeof expected]!==v))invalid()
 const text=checkTemplatePackage(row.packageJson),details=readProductDefinitionPackageDetails(text,'CURRENT_TYPE_CAPTURE');if(!!details.extensions!==expected.extensions||!!details.data!==expected.data||!!details.thingsX!==expected.thingsX||!!details.tasks!==expected.tasks||!!details.rules!==expected.rules)invalid();return Object.freeze({...row,scopes:Object.freeze({...selected})}) as CurrentProductCapture
}
export function sameCurrentProductCapture(a:CurrentProductCapture,b:CurrentProductCapture){return ['captureId','sourceDeviceTypeId','packageJson','packageDigest','modelDigest','capturedAt','expiresAt'].every(k=>a[k as keyof CurrentProductCapture]===b[k as keyof CurrentProductCapture])}
export function prepareCurrentProductPublish(project:string,typeId:string,capture:CurrentProductCapture,previous:OwnedProduct|null,label:string):CurrentProductPublishIntent{
 base(project,typeId);decodeCurrentProductCapture(capture,{typeId,body:{scopes:capture.scopes}});const publisherLabel=label.trim()
 if(!publisherLabel||publisherLabel.length>80||/[\u0000-\u001f\u007f]|\p{Surrogate}/u.test(publisherLabel))throw new Error('请填写1至80个字符的分享署名')
 if(Date.parse(capture.expiresAt)<=Date.now())throw new Error('固定预览已过期，请关闭后重新生成预览')
 if(previous&&(previous.sourceDeviceTypeId!==typeId||!uuid(previous.product.productId)||!referenceVersion(previous.product.revision)||BigInt(previous.product.revision)<1n||previous.product.sequence>=20))throw new Error('原产品身份、版本或发布上限已变化，请重新读取')
 return Object.freeze({project,typeId,key:crypto.randomUUID(),capture,previous,body:Object.freeze({captureId:capture.captureId,expectedPackageDigest:capture.packageDigest,productId:previous?.product.productId??null,revision:previous?.product.revision??null,publisherLabel})})
}
export function decodeCurrentProductPublication(value:unknown,intent:CurrentProductPublishIntent):CurrentProductPublication{
 const row=closed(value,['product','sourceKind','sourceCaptureId']),p=row.product as SharedTypeProduct
 if(row.sourceKind!=='CURRENT_TYPE_CAPTURE'||row.sourceCaptureId!==intent.capture.captureId||!p||!uuid(p.productId))invalid();decodeSharedProduct(p,p.productId)
 if(p.sourceMode!=='CURRENT_TYPE_CAPTURE'||p.packageJson!==intent.capture.packageJson||p.packageDigest!==intent.capture.packageDigest||p.modelDigest!==intent.capture.modelDigest||p.publisherLabel!==intent.body.publisherLabel||p.sequence!==(intent.previous?intent.previous.product.sequence+1:1)||intent.previous&&p.productId!==intent.previous.product.productId)invalid()
 return Object.freeze({...row,product:Object.freeze({...p})}) as CurrentProductPublication
}
export function sameCurrentProductPublication(a:CurrentProductPublication,b:CurrentProductPublication){return a.sourceCaptureId===b.sourceCaptureId&&a.product.productId===b.product.productId&&a.product.versionId===b.product.versionId&&a.product.packageJson===b.product.packageJson&&a.product.publisherLabel===b.product.publisherLabel}
async function checked<T>(read:()=>Promise<T>,write=false){try{return await read()}catch(error){if(write&&!(error instanceof ApiError))throw new ApiError('发布回执无法核对，结果尚未确认',200,undefined,undefined,true);throw error}}
export const currentProductPublicationTransport:CurrentProductPublicationTransport={
 owned:productTransport.owned,
 async capture(intent,signal){return checked(async()=>decodeCurrentProductCapture(await api<Schema<'DeviceTypeCurrentProductCaptureResponse'>>(`${base(intent.project,intent.typeId)}/product-publication-previews`,{method:'post',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,maxResponseBytes:4*1024*1024}),intent),true)},
 async captured(intent,signal){return decodeCurrentProductCapture(await api<Schema<'DeviceTypeCurrentProductCaptureResponse'>>(`${base(intent.project,intent.typeId)}/product-publication-previews/by-key`,{headers:{'Original-Request-Key':intent.key},signal,maxResponseBytes:4*1024*1024}),intent)},
 async publish(intent,signal){return checked(async()=>decodeCurrentProductPublication(await api<Schema<'DeviceTypeCurrentProductPublicationResponse'>>(`${base(intent.project,intent.typeId)}/current-product-publications`,{method:'post',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,maxResponseBytes:4*1024*1024}),intent),true)},
 async published(intent,signal){return decodeCurrentProductPublication(await api<Schema<'DeviceTypeCurrentProductPublicationResponse'>>(`${base(intent.project,intent.typeId)}/current-product-publications/by-key`,{headers:{'Original-Request-Key':intent.key},signal,maxResponseBytes:4*1024*1024}),intent)}
}
