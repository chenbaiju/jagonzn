import {readFileSync} from 'node:fs'
import {convertThingsCloudBasicObjectTsl,convertThingsCloudSourceStyleTsl} from '../../src/features/device-types/things-cloud-tsl'
import {decodeMaterialEvents,decodeMaterialAdaptationDecisions,basicObjectTslMaterialFormat} from '../../src/features/device-types/function-material-values'
import {decodeEventDefinitions,eventCopyDraft,normalizeEventParameter,eventParameterForType} from '../../src/features/device-types/event-definition-api'
import {thingsCloudTslFile} from '../../src/features/device-types/things-cloud-tsl-export'
import {parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {convertThingsCloudTsl} from '../../src/features/device-types/things-cloud-tsl'
import Preview from '../../src/features/device-types/DeviceTypeTslPreview.vue'
import {session} from '../../src/core/session'
import {changeIdentity} from '../../src/core/http'
const id='10000000-0000-4000-8000-000000000001',type='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002'
const source=()=>({name:'REA-AUDIT-20261023-TYPE',descr:'',icon:'mdi-cube-outline',attributes:[{identifier:'audittemperature',name:'AuditTemperature',descr:'',attributeType:'report',dataType:'number',options:{}}],events:[],commands:[]})
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));let w:VueWrapper|undefined
function button(label:string){return w!.findAll('button').find(x=>x.text()===label)!}
beforeEach(()=>{changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:id,currentProjectId:id,projectRole:'OWNER',permissions:['device:read']};session.projects=[{id,status:'ACTIVE',myRole:'OWNER'}]})
afterEach(()=>{w?.unmount();w=undefined;session.user=null;session.projects=[];changeIdentity();vi.unstubAllGlobals();document.body.innerHTML=''})
it('通用Object事件显式V9完整转换、编辑复制与Source导出保持语义，缺Enum整份拒绝',()=>{
 const raw=JSON.parse(readFileSync('../../things-link/things-link-device/src/test/resources/device/tsl/source-basic-object-and-unsupported-enum.json','utf8'))
 const full=convertThingsCloudBasicObjectTsl(bytes(raw));expect(full.issues.some(row=>row.path.includes('commands')&&row.path.endsWith('dataType'))).toBe(true);expect(full.events).toEqual([]);expect(full.properties).toEqual([])
 const selected={...raw,attributes:[],commands:[],events:raw.events.filter((row:{identifier:string})=>row.identifier==='tag_detected')},local=convertThingsCloudBasicObjectTsl(bytes(selected))
 expect(local.issues).toEqual([]);expect(convertThingsCloudSourceStyleTsl(bytes(selected)).issues.length).toBeGreaterThan(0)
 const root=parseDashboardRuntimeResponse(bytes({events:local.events,decisions:local.adaptationDecisions})),events=decodeMaterialEvents(root.events as never,basicObjectTslMaterialFormat)
 expect(events[0]!.parameters[2]).toMatchObject({dataType:'OBJECT',compositeProfile:'BASIC_MIXED_OBJECT_V1',schema:'{"type":"object","maxProperties":64}'})
 expect(decodeMaterialAdaptationDecisions(root.decisions as never,events,[],[],basicObjectTslMaterialFormat)).toHaveLength(local.adaptationDecisions.length)
 expect(()=>decodeMaterialEvents(root.events as never,'THINGS_CLOUD_TSL_SOURCE_STYLE_TOKENS_V8')).toThrow()
 const event=decodeEventDefinitions([{id,typeId:undefined,deviceTypeId:type,eventKey:'tag_detected',name:'标签检测',level:'INFO',sortOrder:0,description:null,createdAt:'2026-10-31T00:00:00Z',parameters:events[0]!.parameters.map((row,index)=>({id:`30000000-0000-4000-8000-00000000000${index+1}`,parameterKey:row.parameterKey,name:row.name,dataType:row.dataType,required:false,sortOrder:index,schema:row.schema??null,description:row.description,...(row.compositeProfile?{compositeProfile:row.compositeProfile}:{})}))}].map(({typeId,...row})=>row),type)[0]!
 const empty={name:'对象',parameterKey:'obj',dataType:'NUMBER',required:false,sortOrder:0,enumOptions:[],schema:'',description:''},newObject=eventParameterForType(empty,'OBJECT')
 expect(normalizeEventParameter(newObject)).toMatchObject({dataType:'OBJECT',compositeProfile:'BASIC_MIXED_OBJECT_V1',schema:'{"type":"object","maxProperties":64}'})
 const strict={...empty,dataType:'OBJECT',schema:'{"type":"object","properties":{"value":{"type":"number"}},"additionalProperties":false,"maxProperties":1}'},retained=eventParameterForType(strict,'OBJECT',true)
 expect(retained.schema).toBe(strict.schema);expect(normalizeEventParameter(retained)).not.toHaveProperty('compositeProfile')
 const draft=eventCopyDraft(event),parameter=normalizeEventParameter(draft.parameters[2]!);expect(parameter.compositeProfile).toBe('BASIC_MIXED_OBJECT_V1');expect(JSON.parse(parameter.schema!)).toEqual({type:'object',maxProperties:64})
 const exported=thingsCloudTslFile({deviceTypeId:type,name:'原事件',description:null,properties:[],events:[event],commands:[]});expect(exported.issues).toEqual([])
 const object=JSON.parse(exported.file!.content).events[0].params[2];expect(object).toMatchObject({identifier:'obj',dataType:'object'});expect(object).not.toHaveProperty('schema');expect(object).not.toHaveProperty('compositeProfile');expect(object).not.toHaveProperty('maxProperties')
 expect(()=>normalizeEventParameter({...draft.parameters[2]!,dataType:'LIST'})).toThrow();expect(()=>normalizeEventParameter({...draft.parameters[2]!,schema:'{"type":"object","properties":{},"maxProperties":64}'})).toThrow()
})
it('原站已确认TSL Number/report/空options转正式属性候选，不补单位默认或覆盖类型资料',()=>{
 const result=convertThingsCloudTsl(bytes(source()));expect(result.issues).toEqual([]);expect(result.source).toEqual({name:'REA-AUDIT-20261023-TYPE',description:'',icon:'mdi-cube-outline'});expect(result.properties).toEqual([{propertyKey:'audittemperature',name:'AuditTemperature',accessType:'REPORT',dataType:'NUMBER',sortOrder:0,description:null}]);expect(Object.hasOwn(result.properties[0]!,'defaultValue')).toBe(false)
})
it('未知字段/协议方向/非空事件或命令和重复key逐路径拒绝，整份不生成部分候选',()=>{
 const raw=source() as any;raw.attributes.push({...raw.attributes[0],attributeType:'push',dataType:'switch',options:{min:9007199254740992}});raw.attributes[0].extra='禁止忽略';raw.events=[{identifier:'event'}];raw.commands=[{identifier:'command'}];const result=convertThingsCloudTsl(bytes(raw));expect(result.properties).toEqual([]);expect(result.issues.map(x=>x.path)).toEqual(expect.arrayContaining(['$.attributes[0].extra','$.attributes[1].identifier','$.attributes[1].attributeType','$.attributes[1].dataType','$.attributes[1].options.min','$.events','$.commands']))
 for(const rawText of ['{"name":"a","name":"b"}','{"n":1e}','{"name":"\\ud800"}'])expect(convertThingsCloudTsl(new TextEncoder().encode(rawText)).issues.length).toBeGreaterThan(0)
 const unicode=source();unicode.attributes[0]!.name='\ud800';expect(convertThingsCloudTsl(bytes(unicode)).issues).toEqual([{path:'$',message:'JSON原文无效：请检查重复字段、UTF-8、字符串或数字格式'}])
 expect(convertThingsCloudTsl(new Uint8Array(1024*1024+1)).issues[0]!.path).toBe('$');const many=source();many.attributes=Array.from({length:101},(_,i)=>({...many.attributes[0]!,identifier:'p'+i}));expect(convertThingsCloudTsl(bytes(many)).issues[0]!.path).toBe('$.attributes')
})
it('真实预览安全展示注入文本，编辑使结果失效，关闭清除且不发生网络或模型写入',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);w=mount(Preview,{props:{typeId:type,typeStatus:'DRAFT'},global:{plugins:[ElementPlus]}});await button('预览 ThingsCloud TSL 转换').trigger('click');const raw=source();raw.name='<script>alert(1)</script>';raw.attributes[0]!.name='<img src=x onerror=alert(1)>';await w.get('[aria-label="ThingsCloud TSL原文"]').setValue(JSON.stringify(raw));await button('转换预览').trigger('click');expect(w.text()).toContain('已转换 1 项功能');expect(w.find('script,img').exists()).toBe(false);expect(w.text()).toContain('<script>alert(1)</script>');await w.get('[aria-label="ThingsCloud TSL原文"]').setValue('{}');expect(w.find('[aria-label="ThingsLink属性转换预览"]').exists()).toBe(false);await button('关闭并清除').trigger('click');await button('预览 ThingsCloud TSL 转换').trigger('click');expect((w.get('[aria-label="ThingsCloud TSL原文"]').element as HTMLTextAreaElement).value).toBe('');expect(fetch).not.toHaveBeenCalled()
})
it('换类型或撤销读权清除私有原文与预览，已发布/归档只读不冒确认导入',async()=>{
 w=mount(Preview,{props:{typeId:type,typeStatus:'PUBLISHED'},global:{plugins:[ElementPlus]}});await button('预览 ThingsCloud TSL 转换').trigger('click');await w.get('[aria-label="ThingsCloud TSL原文"]').setValue(JSON.stringify(source()));await button('转换预览').trigger('click');await w.setProps({typeId:other});expect(w.find('[aria-label="ThingsCloud TSL原文"]').exists()).toBe(false);session.projects=[{id,status:'ARCHIVED',myRole:'OWNER'}];await flushPromises();await button('预览 ThingsCloud TSL 转换').trigger('click');expect(w.text()).toContain('转换预览不会写入或发布物模型');session.user={...session.user!,permissions:[]};await flushPromises();expect(w.find('[aria-label="ThingsCloud TSL原文"]').exists()).toBe(false);expect(w.findAll('button').some(x=>x.text().includes('确认导入'))).toBe(false)
})
