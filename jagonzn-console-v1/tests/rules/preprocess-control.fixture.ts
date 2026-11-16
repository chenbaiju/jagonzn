/** 封闭HTTP夹具，仅验证Console适配/真实组件，不表示后端或设备权威。 */
export const project='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000001',otherDevice='20000000-0000-4000-8000-000000000002',rule='30000000-0000-4000-8000-000000000001',firstVersion='40000000-0000-4000-8000-000000000001',secondVersion='40000000-0000-4000-8000-000000000002',event='50000000-0000-4000-8000-000000000001'
export const functionSources=[{format:'COMMON_JS' as const,source:'module.exports = input => input;\r\n'},{format:'FUNCTION_EXPRESSION' as const,source:'input => ({...input, stage: 2})'}]
export const definitionJson=(kind='ATTRS_RPT_PREPROC',filter='{"operator":"ALL","conditions":[],"groups":[]}')=>JSON.stringify({trigger:{kind,identifier:null,filter:null},functions:functionSources}).replace('"filter":null','"filter":'+filter)
export function controlFixture(){
 const state={directorySource:{kind:'DEVICE',referenceId:device as string|null},directoryReadOnly:false,directoryCorrupt:'',directoryRows:[{deviceId:device,name:'权威设备',deviceTypeId:null as string|null,allowed:true,version:'1'}],created:false,participationAllowed:true,participationVersion:'1',participationUnknown:false,participationCorrupt:false,participationReadStatus:0,name:'完整规则',description:'完整描述' as string|null,version:'1',versionId:firstVersion,versionNumber:'1',activeVersionId:firstVersion,preprocessing:definitionJson(),tags:{'区域':'机房','empty':''} as Record<string,string>,postError:0,readError:0,corrupt:'',definitionReads:0,calls:[] as {path:string;method:string;body:string;headers:Headers;signal?:AbortSignal}[]}
 const header=()=>JSON.stringify({id:rule,name:state.name,description:state.description,status:'PAUSED',activeVersionId:state.activeVersionId,version:null,createdAt:'2026-10-26T00:00:00Z',updatedAt:'2026-10-26T00:00:00Z'}).replace('"version":null','"version":'+state.version)
 const version=()=>JSON.stringify({id:state.versionId,versionNumber:null,source:(JSON.parse(state.preprocessing)?.functions?.[0]?.source??functionSources[0].source),sourceSha256:'a'.repeat(64),createdBy:project,createdAt:'2026-10-26T00:00:00Z',actions:[],deviceSource:{kind:'DEVICE',referenceId:state.corrupt==='device'?otherDevice:device},preprocessing:null}).replace('"versionNumber":null','"versionNumber":'+state.versionNumber).replace('"preprocessing":null','"preprocessing":'+(state.corrupt==='preprocessing'?definitionJson('ATTRS_PUSH_PREPROC'):state.preprocessing))
 const response=(body:string,status=200)=>new Response(body,{status,headers:{'Content-Type':'application/json'}})
 async function fetcher(input:RequestInfo|URL,init?:RequestInit){
  const url=new URL(String(input)),path=url.pathname,method=(init?.method??'GET').toUpperCase(),body=String(init?.body??'');state.calls.push({path:url.pathname+url.search,method,body,headers:new Headers(init?.headers),signal:init?.signal??undefined})
  if(path===`/api/v1/projects/${project}/message-rules/${rule}`&&method==='DELETE'&&!state.postError){state.created=false;return new Response(null,{status:204})}
  if(path.endsWith('/deletions')&&method==='POST'&&!state.postError){
   const value=JSON.parse(body);state.created=false
   return response(JSON.stringify({projectId:project,ruleId:rule,actorId:'00000000-0000-4000-8000-0000000000aa',expectedDefinitionVersion:String(value.expectedDefinitionVersion),deletedDefinitionVersion:String(BigInt(value.expectedDefinitionVersion)+1n),deletedAt:'2026-10-26T00:00:00Z'}),201)
  }
  if(method!=='GET'&&state.postError)return response(JSON.stringify({message:'明确拒绝',code:40003}),state.postError)
  if(method==='GET'&&state.readError)return response(JSON.stringify({message:'后继读取拒绝'}),state.readError)
  if(path.endsWith('/preprocessors')&&method==='POST'){
   const value=JSON.parse(body);state.created=true;state.name=value.name;state.description=value.description?.trim()||null;state.tags=value.tags;const {readRawRuleJson}=await import('../../src/features/rules/raw-rule-json');const exact=readRawRuleJson(new TextEncoder().encode(body));state.preprocessing='{"trigger":{"kind":'+exact.at(['kind']).raw()+',"identifier":null,"filter":'+exact.at(['filter']).raw()+'},"functions":'+exact.at(['functions']).raw()+'}'
   if(state.corrupt==='postjson')return response('{bad',201)
   return response(header(),201)
  }
  if(path.endsWith('/preprocessing-versions')&&method==='POST'){
   // filter原片段不能先JSON.parse丢失；测试用正式语法投影取出。
   const {readRawRuleJson}=await import('../../src/features/rules/raw-rule-json');const value=readRawRuleJson(new TextEncoder().encode(body));state.name=value.at(['name']).string();state.description=value.at(['description']).string()||null;state.version=String(BigInt(state.version)+1n);state.versionNumber=String(BigInt(state.versionNumber)+1n);state.versionId=secondVersion;state.preprocessing='{"trigger":{"kind":'+value.at(['kind']).raw()+',"identifier":null,"filter":'+value.at(['filter']).raw()+'},"functions":'+value.at(['functions']).raw()+'}'
   return response('{"definition":'+header()+',"savedVersion":'+version()+'}',201)
  }
  if(path.endsWith('/tags')&&method==='PUT'){
   const value=JSON.parse(body),same=JSON.stringify(value.tags)===JSON.stringify(state.tags);state.tags=value.tags;if(!same)state.version=String(BigInt(state.version)+1n)
   return response('{"ruleId":'+JSON.stringify(rule)+',"version":'+state.version+',"tags":'+JSON.stringify(state.tags)+'}')
  }
  if(path.endsWith('/preprocessing-preview')&&method==='POST')return response(JSON.stringify({eventId:event,versionId:state.versionId,matched:true,functionsAttempted:2,functionsSucceeded:2,status:'SUCCESS',resultCode:'OK',outputJson:'{"exact":1.0000000000000002}',guestCpuMillis:null,duration:'PT0.01S',occurredAt:'2026-10-26T00:00:00Z'}))
  if(path===`/api/v1/projects/${project}/devices/search`)return response(JSON.stringify({items:[{id:device,name:'候选旧名称'}],hasMore:false,nextCursor:null}))
  if(path===`/api/v1/projects/${project}/devices/${device}`)return response(JSON.stringify({id:device,name:'权威设备'}))
  if(path===`/api/v1/projects/${project}/devices/${device}/message-rules`)return response(JSON.stringify({items:state.created?[{id:rule,name:state.name,ruleType:JSON.parse(state.preprocessing)?.trigger?.kind??null,status:'PAUSED',activeVersionId:state.activeVersionId,versionNumber:Number(state.versionNumber),definitionVersion:Number(state.version),deviceSource:{kind:'DEVICE',referenceId:device},hasDeviceAction:false,createdAt:'2026-10-26T00:00:00Z'}]:[],hasMore:false,nextCursor:null}))
  if(path===`/api/v1/projects/${project}/message-rules/${rule}/devices`){
   if(state.participationReadStatus)return response('{"message":"参与读取已失权"}',state.participationReadStatus)
   if(url.searchParams.get('expectedDefinitionVersion')!==state.version)return response('{"message":"定义已变化"}',409)
   const limit=Number(url.searchParams.get('limit')??24),cursor=url.searchParams.get('cursor'),offset=cursor?Number(cursor.replace('fixture-directory-','')):0
   const rows=state.directoryRows.slice(offset,offset+limit),next=offset+limit<state.directoryRows.length?'fixture-directory-'+(offset+limit):null
   const items=rows.map(row=>JSON.stringify({...row,deviceId:state.directoryCorrupt==='device'?otherDevice:row.deviceId,allowed:row.deviceId===device?state.participationAllowed:row.allowed,version:null}).replace('"version":null','"version":'+(row.deviceId===device?state.participationVersion:row.version))).join(',')
   let body='{"ruleId":'+JSON.stringify(state.directoryCorrupt==='rule'?device:rule)+',"definitionVersion":'+state.version+',"activeVersionId":'+JSON.stringify(state.directoryCorrupt==='active'?secondVersion:state.activeVersionId)+',"deviceSource":'+JSON.stringify(state.directorySource)+',"readOnly":'+state.directoryReadOnly+',"items":['+items+'],"nextCursor":'+JSON.stringify(state.directoryCorrupt==='cursor'?'cycle':next)+'}'
   if(state.directoryCorrupt==='extra')body=body.slice(0,-1)+',"extra":true}'
   return response(body)
  }
  const participationDevice=path.includes('/device-participation/')?path.split('/').at(-1):undefined
  const participationRow=state.directoryRows.find(row=>row.deviceId===participationDevice)
  if(participationDevice&&participationRow){
   const saved=participationDevice===device?{allowed:state.participationAllowed,version:state.participationVersion}:participationRow
   if(method==='GET'&&state.participationReadStatus)return response('{"message":"参与读取已失权"}',state.participationReadStatus)
   if(method==='PUT'){
    const {readRawRuleJson}=await import('../../src/features/rules/raw-rule-json');const value=readRawRuleJson(new TextEncoder().encode(body))
    if(value.at(['expectedVersion']).integerText()!==saved.version||value.at(['expectedDefinitionVersion']).integerText()!==state.version)return response('{"message":"定义或参与已变化"}',409)
    const wanted=value.at(['allowed']).boolean();if(wanted!==saved.allowed){saved.allowed=wanted;saved.version=String(BigInt(saved.version)+1n)}
    if(participationDevice===device){state.participationAllowed=saved.allowed;state.participationVersion=saved.version}
    if(state.participationUnknown)throw new TypeError('fixture lost post-write response')
   }
   if(method==='GET'&&url.searchParams.get('expectedDefinitionVersion')!==state.version)return response('{"message":"定义已变化"}',409)
   return response('{"deviceId":'+JSON.stringify(state.participationCorrupt?otherDevice:participationDevice)+',"allowed":'+saved.allowed+',"version":'+saved.version+',"definitionVersion":'+state.version+'}')
  }
  if(path.endsWith('/device-source'))return response(JSON.stringify({ruleId:rule,status:'PAUSED',definitionVersion:state.version,readOnly:false,deviceSource:{kind:'DEVICE',referenceId:device},activeVersionId:state.activeVersionId,activeVersionNumber:state.versionNumber,activeSourceSha256:'a'.repeat(64),latestVersionId:state.versionId,latestVersionNumber:state.versionNumber,latestSourceSha256:'a'.repeat(64)}))
  if(path===`/api/v1/projects/${project}/message-rules/${rule}`){state.definitionReads++;if(state.corrupt==='secondheader'&&state.definitionReads%2===0)return response(header().replace('"version":1','"version":2'));return response(header())}
  if(path.endsWith('/version-history'))return response('{"items":['+version()+'],"nextCursor":null}')
  if(path.includes('/versions/'))return response(version())
  if(path.endsWith('/tags'))return response('{"ruleId":'+JSON.stringify(rule)+',"version":'+state.version+',"tags":'+JSON.stringify(state.corrupt==='tags'?{}:state.tags)+'}')
  throw new Error('夹具未允许的请求 '+method+' '+path)
 }
 return {state,fetcher,header,version,response}
}
