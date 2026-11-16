import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {webcrypto} from 'node:crypto'
import {mount,flushPromises} from '@vue/test-utils'
import {createRouter,createMemoryHistory} from 'vue-router'
import ElementPlus from 'element-plus'
import {session} from '../../src/core/session'
import RuleDetailEntry from '../../src/features/rules/RuleDetailEntry.vue'
import {setAccessToken,changeIdentity} from '../../src/core/http'
import {createPreprocessor,createSourcePreprocessor,createTypePreprocessor,readPreprocessSnapshot,readTypePreprocessor,revisePreprocessor,reviseTypePreprocessor,PreprocessOutcomeUnknown} from '../../src/features/rules/preprocess-control-api'
import {loadPreprocessVersion,makePreprocessCreationDraft,makeRevisionIntent,loadTypePreprocessContent,makeTypePreprocessRevisionIntent,readRuleConditionDraft} from '../../src/features/rules/preprocess-version-editor'
import type {PropertyOperationDraft} from '../../src/features/rules/property-operations-draft'
import {readRawRuleJson} from '../../src/features/rules/raw-rule-json'
const project='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000001',two='20000000-0000-4000-8000-000000000002',type='30000000-0000-4000-8000-000000000001',rule='40000000-0000-4000-8000-000000000001',v1='50000000-0000-4000-8000-000000000001',v2='50000000-0000-4000-8000-000000000002',attempt='60000000-0000-4000-8000-000000000001'
const filter=()=>readRuleConditionDraft('{"operator":"ALL","conditions":[{"pointer":"/x","operator":"GTE","value":2.0000000000000003}],"groups":[]}')
const operation={id:'gps-1',kind:'COORDINATE_TRANSFORM' as const,config:{inputProperty:'location',conversion:'WGS84_TO_BD09' as const,outputProperty:'converted'}}
const draft=(operations:PropertyOperationDraft[]=[operation])=>makePreprocessCreationDraft({name:'原生GPS',description:'完整描述',kind:'ATTRS_RPT_PREPROC',filter:filter(),functions:[],propertyOperations:{profile:'PROPERTY_TRANSFORM_V1',operations},tags:[{id:'tag-1',key:'用途',value:'GPS'}]})
function fixture(mode:'DEVICE'|'DEVICE_SET'|'TYPE',operations?:PropertyOperationDraft[]){
 const source=mode==='TYPE'?{kind:'DEVICE_TYPE' as const,referenceId:type}:mode==='DEVICE_SET'?{kind:'DEVICE' as const,referenceId:null,referenceIds:[device,two]}:{kind:'DEVICE' as const,referenceId:device}
 let content=draft(operations),cas='1',number='1',version=v1,corruptHash=false,readFailure=false,loseReply=false
 const calls:{path:string;method:string;body:string}[]=[]
 const response=(body:string,status=200)=>new Response(body,{status,headers:{'Content-Type':'application/json'}})
 const header=()=>JSON.stringify({id:rule,name:content.name,description:content.description,status:'PAUSED',activeVersionId:v1,version:null}).replace('"version":null','"version":'+cas)
 async function body(){const sha=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(content.preprocessingJson))).toString('hex');return JSON.stringify({id:version,versionNumber:null,source:content.preprocessingJson,sourceSha256:corruptHash?'0'.repeat(64):sha,createdBy:project,createdAt:'2026-11-01T00:00:00Z',deviceSource:source,actions:[],preprocessing:null,sourceFormat:'PROPERTY_TRANSFORM_V1',propertyPreprocessing:null}).replace('"versionNumber":null','"versionNumber":'+number).replace('"propertyPreprocessing":null','"propertyPreprocessing":'+content.preprocessingJson)}
 async function fetcher(input:RequestInfo|URL,options?:RequestInit){
  const url=new URL(String(input),'http://localhost'),path=url.pathname,method=(options?.method??'GET').toUpperCase(),request=String(options?.body??'');calls.push({path,method,body:request})
  if(method==='GET'&&readFailure)return response('{"message":"读取拒绝"}',403)
  if(method==='POST'||method==='PUT'){
   const raw=readRawRuleJson(new TextEncoder().encode(request)),value=path===`/api/v1/projects/${project}/message-rules/preprocessors`?raw.at(['content']):raw
   expect(value.optional(['functions'])).toBeUndefined();expect(value.at(['propertyOperations','profile']).string()).toBe('PROPERTY_TRANSFORM_V1')
   if(path===`/api/v1/projects/${project}/message-rules/preprocessors`)expect(JSON.parse(raw.at(['deviceSource']).raw())).toEqual(source)
   content={...content,name:value.at(['name']).string(),description:value.at(['description']).string()||null,preprocessingJson:'{"trigger":{"kind":"ATTRS_RPT_PREPROC","identifier":null,"filter":'+value.at(['filter']).raw()+'},"profile":"PROPERTY_TRANSFORM_V1","operations":'+value.at(['propertyOperations','operations']).raw()+'}'}
   if(path.endsWith('/preprocessors')){if(loseReply){readFailure=true;throw new TypeError('写响应丢失')}return response(header(),201)}
   expect(value.at(['expectedVersion']).integerText()).toBe(cas);expect(value.at(['baseVersionId']).string()).toBe(version);cas=String(BigInt(cas)+1n);number=String(BigInt(number)+1n);version=v2
   return response('{"definition":'+header()+',"savedVersion":'+await body()+'}',201)
  }
  if(path.endsWith('/version-history'))return response('{"items":['+await body()+'],"nextCursor":null}')
  if(path.includes('/versions/'))return response(await body())
  if(path.endsWith('/tags'))return response('{"ruleId":'+JSON.stringify(rule)+',"version":'+cas+',"tags":'+JSON.stringify(content.tags)+'}')
  if(path.endsWith('/message-rules/'+rule))return response(header())
  throw new Error('不允许未指定请求 '+method+' '+path)
 }
 return {source,calls,fetcher,setLong(){cas='9007199254740993';number='7'},corrupt(value:boolean){corruptHash=value},lose(){loseReply=true},restore(){readFailure=false},get content(){return content}}
}
beforeEach(()=>{changeIdentity();setAccessToken('property-transport-fixture');session.user={accountId:project,currentProjectId:project,permissions:['rule:manage']};session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}];vi.stubGlobal('crypto',webcrypto)})
afterEach(()=>{session.user=null;setAccessToken('');vi.unstubAllGlobals()})
it.each(['DEVICE','DEVICE_SET','TYPE'] as const)('%s新原生profile原子创建/完整回读/精确CAS修订保条件、标签、活动指针和全来源',async mode=>{
 const backend=fixture(mode);vi.stubGlobal('fetch',vi.fn(backend.fetcher));const scope={projectId:project,scopeKey:'native-property',deviceId:mode==='DEVICE_SET'?'':device},typeScope={projectId:project,scopeKey:scope.scopeKey,deviceTypeId:type}
 if(mode==='TYPE')await createTypePreprocessor(typeScope,draft(),attempt,()=>true)
 else if(mode==='DEVICE_SET')await createSourcePreprocessor({projectId:project,scopeKey:scope.scopeKey,source:{kind:'DEVICE',members:[{referenceId:device,name:'设备甲'},{referenceId:two,name:'设备乙'}]}},draft(),attempt,()=>true)
 else await createPreprocessor(scope,draft(),attempt,()=>true)
 backend.setLong()
 if(mode==='TYPE'){const before=await readTypePreprocessor(typeScope,rule,()=>true),loaded=loadTypePreprocessContent({...typeScope,ruleId:rule},before);expect(loaded.draft.propertyOperations?.operations[0]).toEqual(operation);loaded.draft.description='修订描述';const intent=makeTypePreprocessRevisionIntent(loaded,loaded.draft,attempt),after=await reviseTypePreprocessor(typeScope,before,intent,()=>true);expect(after.first.version).toBe('9007199254740994');expect(after.first.activeVersionId).toBe(v1);expect(after.deviceSource).toEqual(backend.source)}
 else{const before=await readPreprocessSnapshot(scope,rule,()=>true),loaded=loadPreprocessVersion(before.seed,before.seed);expect(loaded.draft.propertyOperations?.operations[0]).toEqual(operation);loaded.draft.description='修订描述';const intent=makeRevisionIntent(loaded,loaded.draft,attempt),after=await revisePreprocessor(scope,before,intent,()=>true);expect(after.seed.definitionVersion).toBe('9007199254740994');expect(after.seed.activeVersionId).toBe(v1);expect(after.tags).toEqual({'用途':'GPS'})}
 expect(backend.content.preprocessingJson).toContain('20000000000000003e-16');const writes=backend.calls.filter(value=>value.method!=='GET');expect(writes).toHaveLength(2);expect(writes[1]!.body).toContain('"expectedVersion":9007199254740993');expect(writes[1]!.body).not.toContain('"functions"')
})
it('新profile真实source摘要不符拒绝；原子创建响应丢失保持未知，只读恢复不再POST',async()=>{
 const backend=fixture('DEVICE'),scope={projectId:project,deviceId:device,scopeKey:'native-property'};vi.stubGlobal('fetch',vi.fn(backend.fetcher));backend.corrupt(true);await expect(readPreprocessSnapshot(scope,rule,()=>true)).rejects.toThrow();backend.corrupt(false);backend.lose();await expect(createPreprocessor(scope,draft(),attempt,()=>true)).rejects.toBeInstanceOf(PreprocessOutcomeUnknown);expect(backend.calls.filter(value=>value.method==='POST')).toHaveLength(1);backend.restore();const result=await readPreprocessSnapshot(scope,rule,()=>true);expect(loadPreprocessVersion(result.seed,result.seed).draft.propertyOperations?.operations[0]).toEqual(operation);expect(backend.calls.filter(value=>value.method==='POST')).toHaveLength(1)
})
it('详情入口以真实新profile将单多DEVICE派设备属性页、TYPE派类型属性页，旧DEVICE DATA分派保持',async()=>{
 for(const mode of ['DEVICE','DEVICE_SET','TYPE','DATA'] as const){
  const backend=fixture(mode==='DATA'?'DEVICE':mode);vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,options?:RequestInit)=>{const response=await backend.fetcher(input,options);if(mode!=='DATA'||!new URL(String(input),'http://localhost').pathname.includes('/versions/'))return response;const value=await response.json();value.sourceFormat='DATA_OPERATIONS_V1';delete value.propertyPreprocessing;return Response.json(value)}))
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/rules/messages/:id',component:RuleDetailEntry}]});await router.push('/rules/messages/'+rule);await router.isReady()
  const wrapper=mount(RuleDetailEntry,{global:{plugins:[router,ElementPlus],stubs:{DevicePreprocessDetailPage:{template:'<p class="device-property">设备属性前处理</p>'},TypePreprocessDetailPage:{props:['typeId'],template:'<p class="type-property">{{typeId?"类型属性前处理":"设备DATA"}}</p>'},RuleDetailPage:{template:'<p>旧规则</p>'}}}})
  try{await flushPromises();await vi.waitFor(()=>expect(wrapper.text()).toContain(mode==='TYPE'?'类型属性前处理':mode==='DATA'?'设备DATA':'设备属性前处理'));expect(backend.calls.every(value=>value.method==='GET')).toBe(true)}finally{wrapper.unmount()}
 }
})

it('围栏配置同profile保封闭circle/polygon原字段，DEVICE整来源与TYPE创建回读修订均保顺序及id',async()=>{
 const operations:PropertyOperationDraft[]=[{id:'circle-1',kind:'POINT_IN_CIRCLE',config:{point:'gps',circle:'circle_fence',result:'in_circle'}},{id:'polygon-1',kind:'POINT_IN_POLYGON',config:{point:'gps',polygon:'polygon_fence',result:'in_polygon'}}]
 for(const mode of ['DEVICE_SET','TYPE'] as const){
  const backend=fixture(mode,operations);vi.stubGlobal('fetch',vi.fn(backend.fetcher));const scope={projectId:project,scopeKey:'native-geofence',deviceId:''},typeScope={projectId:project,scopeKey:scope.scopeKey,deviceTypeId:type}
  if(mode==='TYPE'){await createTypePreprocessor(typeScope,draft(operations),attempt,()=>true);backend.setLong();const before=await readTypePreprocessor(typeScope,rule,()=>true),loaded=loadTypePreprocessContent({...typeScope,ruleId:rule},before);expect(loaded.draft.propertyOperations?.operations).toEqual(operations);loaded.draft.propertyOperations!.operations.reverse();const after=await reviseTypePreprocessor(typeScope,before,makeTypePreprocessRevisionIntent(loaded,loaded.draft,attempt),()=>true);expect(loadTypePreprocessContent({...typeScope,ruleId:rule},after).draft.propertyOperations?.operations.map(row=>row.id)).toEqual(['polygon-1','circle-1']);expect(after.first.activeVersionId).toBe(v1)}
  else{await createSourcePreprocessor({projectId:project,scopeKey:scope.scopeKey,source:{kind:'DEVICE',members:[{referenceId:device,name:'来源甲'},{referenceId:two,name:'来源乙'}]}},draft(operations),attempt,()=>true);backend.setLong();const before=await readPreprocessSnapshot(scope,rule,()=>true),loaded=loadPreprocessVersion(before.seed,before.seed);expect(loaded.draft.propertyOperations?.operations).toEqual(operations);loaded.draft.propertyOperations!.operations.reverse();const after=await revisePreprocessor(scope,before,makeRevisionIntent(loaded,loaded.draft,attempt),()=>true);expect(loadPreprocessVersion(after.seed,after.seed).draft.propertyOperations?.operations.map(row=>row.id)).toEqual(['polygon-1','circle-1']);expect(after.seed.activeVersionId).toBe(v1)}
  const writes=backend.calls.filter(row=>row.method!=='GET');expect(writes).toHaveLength(2);const raw=readRawRuleJson(new TextEncoder().encode(writes[1]!.body));expect(raw.at(['expectedVersion']).integerText()).toBe('9007199254740993');expect(JSON.parse(raw.at(['propertyOperations','operations']).raw())).toEqual([...operations].reverse());expect(writes[1]!.body).not.toContain('"functions"')
 }
})
it('累计三字段正式profile整来源与TYPE保存回读修订保bool和原件，非布尔或未知字段拒绝',async()=>{
 const operations:PropertyOperationDraft[]=[{id:'function-old',kind:'FUNCTION',function:{format:'FUNCTION_EXPRESSION',source:'value => value;\r\n'}},{id:'energy-stable',kind:'PERIOD_USAGE',config:{totalInput:'Ep',usageDay:false,usageMonth:false}}]
 for(const mode of ['DEVICE_SET','TYPE'] as const){const backend=fixture(mode,operations);vi.stubGlobal('fetch',vi.fn(backend.fetcher));const scope={projectId:project,scopeKey:'native-period',deviceId:''},typeScope={projectId:project,scopeKey:scope.scopeKey,deviceTypeId:type}
  if(mode==='TYPE'){await createTypePreprocessor(typeScope,draft(operations),attempt,()=>true);backend.setLong();const before=await readTypePreprocessor(typeScope,rule,()=>true),loaded=loadTypePreprocessContent({...typeScope,ruleId:rule},before);expect(loaded.draft.propertyOperations?.operations).toEqual(operations);const item=loaded.draft.propertyOperations!.operations[1]!;if(item.kind!=='PERIOD_USAGE')throw new Error('真实累计配置丢失');item.config.usageDay=true;const after=await reviseTypePreprocessor(typeScope,before,makeTypePreprocessRevisionIntent(loaded,loaded.draft,attempt),()=>true);expect(loadTypePreprocessContent({...typeScope,ruleId:rule},after).draft.propertyOperations?.operations[1]).toEqual({...operations[1],config:{totalInput:'Ep',usageDay:true,usageMonth:false}});expect(after.first.activeVersionId).toBe(v1)}
  else{await createSourcePreprocessor({projectId:project,scopeKey:scope.scopeKey,source:{kind:'DEVICE',members:[{referenceId:device,name:'甲'},{referenceId:two,name:'乙'}]}},draft(operations),attempt,()=>true);backend.setLong();const before=await readPreprocessSnapshot(scope,rule,()=>true),loaded=loadPreprocessVersion(before.seed,before.seed);expect(loaded.draft.propertyOperations?.operations).toEqual(operations);const item=loaded.draft.propertyOperations!.operations[1]!;if(item.kind!=='PERIOD_USAGE')throw new Error('真实累计配置丢失');item.config.usageDay=true;const after=await revisePreprocessor(scope,before,makeRevisionIntent(loaded,loaded.draft,attempt),()=>true);expect(loadPreprocessVersion(after.seed,after.seed).draft.propertyOperations?.operations[1]).toEqual({...operations[1],config:{totalInput:'Ep',usageDay:true,usageMonth:false}});expect(after.seed.activeVersionId).toBe(v1)}
  const writes=backend.calls.filter(row=>row.method!=='GET');expect(writes).toHaveLength(2);const value=readRawRuleJson(new TextEncoder().encode(writes[1]!.body));expect(value.at(['expectedVersion']).integerText()).toBe('9007199254740993');expect(JSON.parse(value.at(['propertyOperations','operations',0]).raw())).toEqual(operations[0]);expect(value.at(['propertyOperations','operations',1,'config','usageDay']).boolean()).toBe(true);expect(writes[1]!.body).not.toContain('"functions"')
 }
 const {readPropertyOperationsDraft}=await import('../../src/features/rules/property-operations-draft'),{parsePreprocessJson}=await import('../../src/features/rules/preprocess-exact-json');for(const config of ['{"totalInput":"Ep","usageDay":"false","usageMonth":false}','{"totalInput":"Ep","usageDay":false,"usageMonth":null}','{"totalInput":"Ep","usageDay":false,"usageMonth":false,"timezone":"UTC"}'])expect(()=>readPropertyOperationsDraft(parsePreprocessJson('{"profile":"PROPERTY_TRANSFORM_V1","operations":[{"id":"energy","kind":"PERIOD_USAGE","config":'+config+'}]}'))).toThrow()
})
