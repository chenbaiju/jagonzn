import {readRawRuleJson} from '../../src/features/rules/raw-rule-json'
import {createHash,webcrypto} from 'node:crypto'
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {setAccessToken,changeIdentity,ApiError} from '../../src/core/http'
import {readPreprocessSnapshot,readRuleDeviceDirectory,readRuleControlDefinition,readRuleParticipation,changeRuleParticipation,createPreprocessor,revisePreprocessor,replacePreprocessorTags,readPreprocessorParticipation,changePreprocessorParticipation,removePreprocessor,previewPreprocessor,PreprocessOutcomeUnknown,LegacyRuleVersion,readTypePreprocessor,reviseTypePreprocessor} from '../../src/features/rules/preprocess-control-api'
import {loadPreprocessVersion,makeRevisionIntent,loadTypePreprocessContent,makeTypePreprocessRevisionIntent,confirmTypePreprocessRevision} from '../../src/features/rules/preprocess-version-editor'
import {controlFixture,project,device,rule,firstVersion,secondVersion,event,functionSources,definitionJson} from './preprocess-control.fixture'
const scope={projectId:project,deviceId:device,scopeKey:'fixture-current'},current=()=>true,attempt='60000000-0000-4000-8000-000000000001'
let fixture:ReturnType<typeof controlFixture>
const draft=()=>({name:'完整规则',description:'完整描述',preprocessingJson:definitionJson(),tags:{区域:'机房',empty:''}})
beforeEach(()=>{fixture=controlFixture();vi.stubGlobal('fetch',vi.fn(fixture.fetcher));setAccessToken('fixture-token')})
afterEach(()=>{vi.unstubAllGlobals();setAccessToken('')})
it('正式568单次原子创建后组合完整读回，标签空文本和有序函数CRLF不丢失',async()=>{
 const saved=await createPreprocessor(scope,draft(),attempt,current);expect(saved.seed.status).toBe('PAUSED');expect(saved.seed.versionNumber).toBe('1');expect(saved.seed.activeVersionId).toBe(firstVersion);expect(saved.tags).toEqual(draft().tags);expect(loadPreprocessVersion(saved.seed,saved.seed).draft.functions.map(x=>x.source)).toEqual(functionSources.map(x=>x.source));expect(fixture.state.calls.filter(x=>x.method!=='GET')).toHaveLength(1);expect(fixture.state.calls[0]!.path).toBe(`/api/v1/projects/${project}/devices/${device}/message-rules/preprocessors`);expect(fixture.state.calls[0]!.headers.get('Idempotency-Key')).toBe(attempt);expect(fixture.state.definitionReads).toBe(2)
})
it.each(['postjson','device','preprocessing','tags','secondheader'])('成功创建后的%s错误保持未知，不能降级旧create或补写标签',async corrupt=>{
 fixture.state.corrupt=corrupt;await expect(createPreprocessor(scope,draft(),attempt,current)).rejects.toBeInstanceOf(PreprocessOutcomeUnknown);expect(fixture.state.calls.filter(x=>x.method!=='GET')).toHaveLength(1);expect(fixture.state.calls.every(x=>!x.path.endsWith('/activate'))).toBe(true)
})
it('明确POST400是已知拒绝；已受理后读取400仍是未知，不依据后继状态解锁',async()=>{
 fixture.state.postError=400;await expect(createPreprocessor(scope,draft(),attempt,current)).rejects.toBeInstanceOf(ApiError);expect(fixture.state.calls).toHaveLength(1);fixture.state.postError=0;fixture.state.readError=400;await expect(createPreprocessor(scope,draft(),attempt,current)).rejects.toBeInstanceOf(PreprocessOutcomeUnknown);expect(fixture.state.calls.filter(x=>x.method==='POST')).toHaveLength(2)
})
it('完整修订正式rawBody保留大CAS及高精度条件，保留标签/旧活动指针并读回新完整版本',async()=>{
 fixture.state.version='9007199254740993';fixture.state.versionNumber='9007199254740993';fixture.state.preprocessing=definitionJson('ATTRS_RPT_PREPROC','{"operator":"ALL","conditions":[{"pointer":"/exact","operator":"EQ","value":1.0000000000000001}],"groups":[]}');const before=await readPreprocessSnapshot(scope,rule,current),loaded=loadPreprocessVersion(before.seed,before.seed);loaded.draft.name='修订后';loaded.draft.filter.conditions[0]!.text='1.0000000000000002';const intent=makeRevisionIntent(loaded,loaded.draft,attempt);const result=await revisePreprocessor(scope,before,intent,current);expect(result.seed.definitionVersion).toBe('9007199254740994');expect(result.seed.versionId).toBe(secondVersion);expect(result.seed.activeVersionId).toBe(firstVersion);expect(result.tags).toEqual(before.tags);const writes=fixture.state.calls.filter(x=>x.method!=='GET');expect(writes).toHaveLength(1);expect(writes[0]!.body).toContain('"expectedVersion":9007199254740993');expect(writes[0]!.body).toContain('10000000000000002e-16');expect(writes[0]!.body).not.toContain('"tags"')
})
it('标签全集正式PUT以同值不增版/变更增版核对，不能追加不可变版本',async()=>{
 const before=await readPreprocessSnapshot(scope,rule,current),same=await replacePreprocessorTags(scope,before,{...before.tags},attempt,current);expect(same.seed.definitionVersion).toBe('1');const next=await replacePreprocessorTags(scope,same,{'新标签':''},'60000000-0000-4000-8000-000000000002',current);expect(next.seed.definitionVersion).toBe('2');expect(next.seed.versionId).toBe(firstVersion);expect(next.tags).toEqual({'新标签':''});expect(fixture.state.calls.filter(x=>x.method==='PUT')).toHaveLength(2);expect(fixture.state.calls.filter(x=>x.method==='POST')).toHaveLength(0)
})
it('完整预览只发送已保存版本和原JSON字符串，忠实呈现CPU未知及精确输出原文',async()=>{
 const saved=await readPreprocessSnapshot(scope,rule,current),sample='{"temperature":12}';const result=await previewPreprocessor(scope,saved,sample,attempt,current);expect(result.eventId).toBe(event);expect(result.guestCpuMillis).toBeNull();expect(result.outputJson).toBe('{"exact":1.0000000000000002}');const post=fixture.state.calls.find(x=>x.method==='POST')!;expect(JSON.parse(post.body)).toEqual({versionId:firstVersion,sampleJson:sample});expect(post.path).toMatch(/preprocessing-preview$/);expect(post.path).not.toMatch(/debug|activate/)
})
it('两次正式读取间失去当前代次会停止后继请求，不用新身份继续组合旧读取',async()=>{
 let available=true;const original=fixture.fetcher;vi.stubGlobal('fetch',vi.fn(async(...args:Parameters<typeof original>)=>{const result=await original(...args);available=false;return result}));await expect(readPreprocessSnapshot(scope,rule,()=>available)).rejects.toThrow('身份');expect(fixture.state.calls).toHaveLength(1)
})
it('只有明确null的旧版本可转旧详情，缺失preprocessing不能降级成旧activate路径',async()=>{
 fixture.state.preprocessing='null';await expect(readPreprocessSnapshot(scope,rule,current)).rejects.toBeInstanceOf(LegacyRuleVersion);const old=fixture.fetcher;vi.stubGlobal('fetch',vi.fn(async(...args:Parameters<typeof old>)=>{const response=await old(...args);return new Response((await response.text()).replace(',"preprocessing":null',''),{status:200})}));await expect(readPreprocessSnapshot(scope,rule,current)).rejects.not.toBeInstanceOf(LegacyRuleVersion)
})

it('跨scope快照不得用于修订/标签/预览或移除；同步移除只发精确CAS一次DELETE',async()=>{
 fixture.state.version='9007199254740993';const saved=await readPreprocessSnapshot(scope,rule,current);await expect(previewPreprocessor({...scope,scopeKey:'different'},saved,'{}',attempt,current)).rejects.toThrow();await expect(replacePreprocessorTags({...scope,scopeKey:'different'},saved,{},attempt,current)).rejects.toThrow();await expect(removePreprocessor({...scope,scopeKey:'different'},saved,attempt,current)).rejects.toThrow();expect(fixture.state.calls.filter(x=>x.method!=='GET')).toHaveLength(0);await removePreprocessor(scope,saved,attempt,current);const write=fixture.state.calls.find(x=>x.method==='DELETE')!;expect(write.path).toContain('expectedVersion=9007199254740993');expect(fixture.state.calls.filter(x=>x.method!=='GET')).toHaveLength(1)
})
it('预览不可能的函数计数不当成功，结果保持未知',async()=>{
 const saved=await readPreprocessSnapshot(scope,rule,current),original=fixture.fetcher;vi.stubGlobal('fetch',vi.fn(async(...args:Parameters<typeof original>)=>{const response=await original(...args);if(String(args[0]).includes('/preprocessing-preview'))return new Response((await response.text()).replace('"functionsAttempted":2','"functionsAttempted":3'));return response}));await expect(previewPreprocessor(scope,saved,'{}',attempt,current)).rejects.toBeInstanceOf(PreprocessOutcomeUnknown);expect(fixture.state.calls.filter(x=>x.method==='POST')).toHaveLength(1)
})

it('修订回执的完整函数或定义头即使后继GET正确，也不能混成一次一致保存',async()=>{
 const before=await readPreprocessSnapshot(scope,rule,current),loaded=loadPreprocessVersion(before.seed,before.seed);loaded.draft.name='回执不一致';const intent=makeRevisionIntent(loaded,loaded.draft,attempt),original=fixture.fetcher;vi.stubGlobal('fetch',vi.fn(async(...args:Parameters<typeof original>)=>{const response=await original(...args);if(String(args[0]).includes('/preprocessing-versions'))return new Response((await response.text()).replace('"status":"PAUSED"','"status":"ACTIVE"'),{status:201});return response}));await expect(revisePreprocessor(scope,before,intent,current)).rejects.toBeInstanceOf(PreprocessOutcomeUnknown);expect(fixture.state.calls.filter(x=>x.method==='POST')).toHaveLength(1)
})

it('正式创建的条件原数值不经Number，包含大整数、精确十进制和区间原语义',async()=>{
 const value=draft();value.preprocessingJson=definitionJson('ATTRS_RPT_PREPROC','{"operator":"ALL","conditions":[{"pointer":"/exact","operator":"EQ","value":1.0000000000000001},{"pointer":"/range","operator":"IN_RANGE","value":[9007199254740993,9007199254740994]}],"groups":[]}');const original=fixture.fetcher;vi.stubGlobal('fetch',vi.fn(async(...args:Parameters<typeof original>)=>{const response=await original(...args);if(String(args[0]).endsWith('/preprocessors'))fixture.state.preprocessing=value.preprocessingJson;return response}));const saved=await createPreprocessor(scope,value,attempt,current);const body=fixture.state.calls.find(x=>x.method==='POST')!.body;expect(body).toContain('1.0000000000000001');expect(body).toContain('9007199254740993');expect(loadPreprocessVersion(saved.seed,saved.seed).draft.filter.conditions[1]!.lower).toBe('9007199254740993')
})

it('省略描述与空标签创建仍按完整null描述/空全集读回，不加补偿PUT',async()=>{
 const value={...draft(),description:null,tags:{}};const result=await createPreprocessor(scope,value,attempt,current);expect(result.seed.description).toBeNull();expect(result.tags).toEqual({});expect(fixture.state.calls.filter(x=>x.method!=='GET')).toHaveLength(1)
})

it('完整详情设备许可沿既有端点保留双longCAS，单PUT后精确GET和定义头保持PAUSED',async()=>{
 fixture.state.version='9007199254740993';fixture.state.participationVersion='9007199254740995';const snapshot=await readPreprocessSnapshot(scope,rule,current),before=await readPreprocessorParticipation(scope,snapshot,current);expect(before.allowed).toBe(true);expect(before.version).toBe('9007199254740995');const result=await changePreprocessorParticipation(scope,snapshot,before,false,attempt,current);expect(result).toEqual({deviceId:device,allowed:false,version:'9007199254740996',definitionVersion:'9007199254740993'});const writes=fixture.state.calls.filter(x=>x.method!=='GET');expect(writes).toHaveLength(1);expect(writes[0]!.method).toBe('PUT');expect(writes[0]!.path).toMatch(/device-participation/);expect(writes[0]!.body).toContain('"expectedVersion":9007199254740995');expect(writes[0]!.body).toContain('"expectedDefinitionVersion":9007199254740993');expect(fixture.state.versionId).toBe(firstVersion);expect(fixture.state.version).toBe('9007199254740993');expect(fixture.state.calls.some(x=>/activate|preprocessing-versions/.test(x.path))).toBe(false)
})
it('设备许可错对象/明确409/写后断连不重放；未知之后只读原状态而不推原请求回执',async()=>{
 for(const mode of ['wrong','conflict','network']){
  fixture=controlFixture();vi.stubGlobal('fetch',vi.fn(fixture.fetcher));const snapshot=await readPreprocessSnapshot(scope,rule,current),before=await readPreprocessorParticipation(scope,snapshot,current)
  if(mode==='wrong')fixture.state.participationCorrupt=true;else if(mode==='conflict')fixture.state.postError=409;else fixture.state.participationUnknown=true
  await expect(changePreprocessorParticipation(scope,snapshot,before,false,attempt,current)).rejects.toBeInstanceOf(mode==='conflict'?ApiError:PreprocessOutcomeUnknown);expect(fixture.state.calls.filter(x=>x.method!=='GET')).toHaveLength(1)
  if(mode==='network'){const actual=await readPreprocessorParticipation(scope,snapshot,current);expect(actual.allowed).toBe(false);expect(actual.version).toBe('2');expect(fixture.state.calls.filter(x=>x.method!=='GET')).toHaveLength(1)}
 }
})


it('旧规则许可复用精确定义头而不伪造前处理快照或读取候选版本',async()=>{
 fixture.state.preprocessing='null';fixture.state.version='9007199254740993';const controlScope={projectId:project,ruleId:rule,scopeKey:scope.scopeKey};const header=await readRuleControlDefinition(controlScope,current);const before=await readRuleParticipation(controlScope,header,device,current);await changeRuleParticipation(controlScope,header,device,before,false,attempt,current);expect(fixture.state.calls.some(x=>/versions|version-history|tags/.test(x.path))).toBe(false);expect(fixture.state.calls.filter(x=>x.method!=='GET')).toHaveLength(1);expect(fixture.state.calls.find(x=>x.method==='PUT')!.body).toContain('"expectedDefinitionVersion":9007199254740993');expect(fixture.state.activeVersionId).toBe(firstVersion)
})


it('正式570真实目录保留双long和来源，只读归档及48页长不经Number',async()=>{
 fixture.state.preprocessing='null';fixture.state.version='9007199254740993';fixture.state.participationVersion='9007199254740995';fixture.state.directoryReadOnly=true;const context={projectId:project,ruleId:rule,scopeKey:scope.scopeKey};const header=await readRuleControlDefinition(context,current);const page=await readRuleDeviceDirectory(context,header,undefined,48,current);expect(page.definitionVersion).toBe('9007199254740993');expect(page.items[0]!.version).toBe('9007199254740995');expect(page.deviceSource).toEqual({kind:'DEVICE',referenceId:device});expect(page.readOnly).toBe(true);expect(page.nextCursor).toBeNull();expect(fixture.state.calls.at(-1)!.path).toContain('expectedDefinitionVersion=9007199254740993');expect(fixture.state.calls.at(-1)!.path).toContain('limit=48');expect(fixture.state.calls.every(x=>x.method==='GET')).toBe(true)
})
it('真实目录错规则活动版本来源或closed额外字段均拒绝，不退回当前设备一行',async()=>{
 const context={projectId:project,ruleId:rule,scopeKey:scope.scopeKey};for(const mode of ['rule','active','device','extra','cursor']){fixture=controlFixture();vi.stubGlobal('fetch',vi.fn(fixture.fetcher));fixture.state.directoryCorrupt=mode;const header=await readRuleControlDefinition(context,current);await expect(readRuleDeviceDirectory(context,header,undefined,24,current)).rejects.toThrow();expect(fixture.state.calls.every(x=>x.method==='GET')).toBe(true)}
 fixture=controlFixture();vi.stubGlobal('fetch',vi.fn(fixture.fetcher));fixture.state.directorySource={kind:'LEGACY_PROJECT',referenceId:null};fixture.state.directoryRows.push({...fixture.state.directoryRows[0]!});const header=await readRuleControlDefinition(context,current);await expect(readRuleDeviceDirectory(context,header,undefined,24,current)).rejects.toThrow()
})
it('真实目录空游标越界页长或重复后继封闭拒绝且不自动重试',async()=>{
 const context={projectId:project,ruleId:rule,scopeKey:scope.scopeKey},header=await readRuleControlDefinition(context,current);const count=fixture.state.calls.length;for(const value of [0,51])await expect(readRuleDeviceDirectory(context,header,undefined,value,current)).rejects.toThrow();await expect(readRuleDeviceDirectory(context,header,'',24,current)).rejects.toThrow();expect(fixture.state.calls).toHaveLength(count);fixture.state.directorySource={kind:'LEGACY_PROJECT',referenceId:null};fixture.state.directoryCorrupt='cursor';await expect(readRuleDeviceDirectory(context,header,undefined,24,current,undefined,['cycle'])).rejects.toThrow();expect(fixture.state.calls).toHaveLength(count+1)
})

it('DATA输入流候选真实POST保双大CAS与原文，未知GET核新流且活动旧流可继续修订',async()=>{
 vi.stubGlobal('crypto',webcrypto)
 for(const mode of ['TYPE','DEVICE'] as const){
  const source=mode==='TYPE'?{kind:'DEVICE_TYPE' as const,referenceId:device}:{kind:'DEVICE' as const,referenceId:null,referenceIds:[device,'20000000-0000-4000-8000-000000000002']}
  const context={projectId:project,deviceTypeId:mode==='TYPE'?device:'',ruleId:rule,scopeKey:'input-stream-'+mode,...(mode==='DEVICE'?{deviceSource:source}:{})}
  let cas='9007199254740993',number='9007199254740993',latest=firstVersion,stream='input',lost=true
  const original='module.exports = function(identifier, data) { return null; };\r\n',down={protocol:'MQTT',streamIdentifier:'reply',source:original},tags={empty:'',zone:'机房'},calls:{method:string;path:string;body:string}[]=[]
  const header=()=>'{"id":'+JSON.stringify(rule)+',"name":"原名","description":"完整说明","status":"ACTIVE","activeVersionId":'+JSON.stringify(firstVersion)+',"version":'+cas+',"createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z"}'
  const version=()=>JSON.stringify({id:latest,versionNumber:null,source:original,sourceSha256:createHash('sha256').update(original).digest('hex'),createdBy:project,createdAt:'2026-11-01T00:00:00Z',actions:[],deviceSource:source,preprocessing:null,sourceFormat:'DATA_DOWNLINK_COMMON_JS_V1',streamIdentifier:stream,dataDownlink:down}).replace('"versionNumber":null','"versionNumber":'+number)
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const path=new URL(String(input),'http://localhost').pathname,method=String(init?.method??'GET').toUpperCase(),body=String(init?.body??'');calls.push({method,path,body})
   if(method==='POST'){const raw=readRawRuleJson(new TextEncoder().encode(body)),content=mode==='DEVICE'?raw.at(['content']):raw;expect(content.at(['expectedVersion']).integerText()).toBe(cas);expect(content.at(['baseVersionId']).string()).toBe(latest);expect(content.at(['name']).string()).toBe('原名');expect(content.at(['description']).string()).toBe('完整说明');expect(content.at(['dataDownlink']).raw()).toBe(JSON.stringify(down));expect(content.optional(['tags'])).toBeUndefined();if(mode==='DEVICE')expect(JSON.parse(raw.at(['deviceSource']).raw())).toEqual(source);stream=content.at(['streamIdentifier']).string();cas=String(BigInt(cas)+1n);number=String(BigInt(number)+1n);latest=latest===firstVersion?secondVersion:event;if(lost){lost=false;throw new TypeError('reply lost')}return new Response('{"definition":'+header()+',"savedVersion":'+version()+'}',{status:201})}
   if(path.endsWith('/version-history'))return new Response('{"items":['+version()+'],"nextCursor":null}')
   if(path.includes('/versions/'))return new Response(version())
   if(path.endsWith('/tags'))return new Response('{"ruleId":'+JSON.stringify(rule)+',"version":'+cas+',"tags":'+JSON.stringify(tags)+'}')
   if(path.endsWith('/message-rules/'+rule))return new Response(header())
   throw new Error('unexpected '+method+' '+path)
  }))
  const before=await readTypePreprocessor(context,rule,current),loaded=loadTypePreprocessContent(context,before);loaded.draft.streamIdentifier='input_next';const intent=makeTypePreprocessRevisionIntent(loaded,loaded.draft,attempt)
  await expect(reviseTypePreprocessor(context,before,intent,current)).rejects.toBeInstanceOf(PreprocessOutcomeUnknown)
  expect(calls.filter(row=>row.method!=='GET')).toHaveLength(1);const after=await readTypePreprocessor(context,rule,current);expect(after.streamIdentifier).toBe('input_next');expect(after.first.activeVersionId).toBe(firstVersion);expect(after.first.version).toBe('9007199254740994');expect(after.versionNumber).toBe('9007199254740994');expect(after.source).toBe(original);expect(after.tags).toEqual(tags);confirmTypePreprocessRevision(loaded,intent,after)
  expect(()=>confirmTypePreprocessRevision(loaded,intent,{...after,streamIdentifier:'input'})).toThrow();expect(()=>confirmTypePreprocessRevision(loaded,intent,{...after,first:{...after.first,version:'9007199254740995'}})).toThrow();expect(calls.filter(row=>row.method!=='GET')).toHaveLength(1)
  const again=loadTypePreprocessContent(context,after);again.draft.streamIdentifier='input_final';const next=makeTypePreprocessRevisionIntent(again,again.draft,secondVersion);const result=await reviseTypePreprocessor(context,after,next,current);expect(result.streamIdentifier).toBe('input_final');expect(result.first.activeVersionId).toBe(firstVersion);expect(result.source).toBe(original);expect(result.tags).toEqual(tags);expect(calls.filter(row=>row.method!=='GET')).toHaveLength(2);expect(calls.some(row=>row.path.endsWith('/activate'))).toBe(false)
  expect(calls.find(row=>row.method==='POST')!.path).toBe(mode==='TYPE'?`/api/v1/projects/${project}/device-types/${device}/message-rules/${rule}/versions`:`/api/v1/projects/${project}/message-rules/${rule}/data-versions`)
 }
})
