/** 设备批量关联到用户后的一次性返回快照；仅保存当前账号/项目/路径的选择，不跨身份复用。 */
type StoredBatchReturn={accountId:string;projectId:string;path:string;deviceIds:string[];at:number}
const KEY='thingslink:device-batch-return:v1'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_AGE_MS=30*60*1000
function storage():Storage|undefined{
 try{return typeof window==='undefined'?undefined:window.sessionStorage}catch{return undefined}
}
/** 记录从设备列表进入用户目录前的实际选择；无有效身份或选择时不写。 */
export function rememberBatchReturn(accountId:string,projectId:string,path:string,deviceIds:readonly string[],target:Storage|undefined=storage()){
 const ids=[...new Set(deviceIds.filter(id=>UUID.test(id)))].slice(0,96)
 if(!accountId||!UUID.test(projectId)||!path||!ids.length||!target)return
 try{target.setItem(KEY,JSON.stringify({accountId,projectId,path,deviceIds:ids,at:Date.now()} satisfies StoredBatchReturn))}catch{}
}
/** 只消费一次同账号/项目/路径且未过期的快照；任何坏数据删除后返回空。 */
export function takeBatchReturn(accountId:string,projectId:string,path:string,now=Date.now(),target:Storage|undefined=storage()):string[]{
 if(!target)return []
 let raw:string|null=null
 try{raw=target.getItem(KEY)}catch{return []}
 if(!raw)return []
 try{
  const value=JSON.parse(raw) as Partial<StoredBatchReturn>
  const valid=value.accountId===accountId&&value.projectId===projectId&&value.path===path
   &&typeof value.at==='number'&&value.at<=now&&now-value.at<=MAX_AGE_MS
   &&Array.isArray(value.deviceIds)&&value.deviceIds.length>0&&value.deviceIds.length<=96
   &&value.deviceIds.every(id=>typeof id==='string'&&UUID.test(id))
  target.removeItem(KEY)
  return valid?[...new Set(value.deviceIds)]:[]
 }catch{try{target.removeItem(KEY)}catch{};return []}
}
