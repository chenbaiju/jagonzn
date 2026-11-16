import {setColor} from './definition-picker-helpers'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Events from '../../src/features/device-types/DeviceTypeEvents.vue'
import {decodeEventDefinitions,eventDraft,prepareEvent} from '../../src/features/device-types/event-definition-api'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
const state=vi.hoisted(()=>({api:vi.fn(),rows:[] as any[],status:'DRAFT'}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=uuid(100),type=uuid(200),other=uuid(300)
const row=(patch:Record<string,unknown>={})=>({id:uuid(1),deviceTypeId:type,eventKey:'overheat',name:'温度事件',level:'INFO',description:null,sortOrder:7,parameters:[] as any[],createdAt:'2026-10-28T01:00:00Z',presentation:null,...patch})
const parameter=(patch:Record<string,unknown>={})=>({id:uuid(10),parameterKey:'temperature',name:'温度',dataType:'NUMBER',required:true,enumOptions:[],sortOrder:9,schema:null,description:null,...patch})
const wrappers:VueWrapper[]=[]
function render(status='DRAFT'){state.status=status;const wrapper=mount(Events,{props:{typeId:type,typeStatus:status},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);return wrapper}
function button(label:string){const parameter=document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);if(parameter)return parameter;const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()===label);expect(found,label).toBeDefined();return found!}
async function click(label:string){button(label).click();await flushPromises()}
async function input(label:string,value:string){const element=document.querySelector<HTMLInputElement|HTMLTextAreaElement>(`input[aria-label="${label}"],textarea[aria-label="${label}"]`);expect(element,label).not.toBeNull();await new DOMWrapper(element!).setValue(value)}
const writes=()=>state.api.mock.calls.filter(([,options])=>options?.method)
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}];state.rows=[];state.status='DRAFT';state.api.mockImplementation((path:string,options?:any)=>{
 if(!options?.method){const rows=state.rows.filter(item=>path.includes(item.deviceTypeId));if(path.endsWith('/model-definition-context'))return Promise.resolve(new TextEncoder().encode(JSON.stringify({deviceTypeId:type,typeStatus:state.status,versionId:state.status==='PUBLISHED'?uuid(20):null,versionNumber:state.status==='PUBLISHED'?'1.0.0':null,token:'a'.repeat(64),properties:[],events:rows,commands:[]})));return Promise.resolve(path.endsWith('/model-edit')?new TextEncoder().encode(JSON.stringify({deviceTypeId:type,versionId:uuid(20),versionNumber:'1.0.0',token:'a'.repeat(64),properties:[],events:rows,commands:[]})):rows)}
 if(options.method==='delete'){state.rows=state.rows.filter(item=>!path.endsWith(item.id));return Promise.resolve(undefined)}
 const id=options.method==='post'?uuid(1):path.split('/').at(-1),value=row({...options.body,id,description:options.body.description||null,presentation:options.body.presentation??state.rows.find(item=>item.id===id)?.presentation??null,parameters:(options.body.parameters||[]).map((item:any,index:number)=>({...item,id:uuid(10+index),enumOptions:item.enumOptions||[]}))});state.rows=options.method==='post'?[...state.rows,value]:state.rows.map(item=>item.id===id?value:item);return Promise.resolve(value)
 })})
afterEach(()=>{for(const wrapper of wrappers.splice(0))wrapper.unmount();session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})

it('创建事件与标量参数保存后真实列表回读，参数取消不写且只发送支持字段',async()=>{
 const wrapper=render();await flushPromises();await click('添加事件');await input('事件名称','温度事件');await input('事件标识符','overheat');await click('添加参数');await input('参数名称','放弃草稿');await click('取消参数');expect(writes()).toHaveLength(0)
 await click('添加参数');await input('参数名称','温度');await input('参数标识符','temperature');await click('确定参数');await click('保存');expect(writes()).toHaveLength(1);expect(writes()[0]![1].method).toBe('post');expect(writes()[0]![1].body.parameters[0]).toEqual({parameterKey:'temperature',name:'温度',dataType:'NUMBER',required:false,sortOrder:0,enumOptions:undefined,schema:null,description:null});expect(writes()[0]![1].body).not.toHaveProperty('style');expect(writes()[0]![1].body.parameters[0].description).toBeNull();expect(wrapper.emitted('changed')).toHaveLength(1);expect(wrapper.text()).toContain('事件定义已保存')
})
it('编辑保留既有required与顺序，删除确认取消及一次DELETE回读',async()=>{
 state.rows=[row({parameters:[parameter()]})];const wrapper=render();await flushPromises();await click('编辑');await click('编辑参数');await input('参数名称','实际温度');await click('确定参数');await input('事件名称','温度报警');await click('保存');expect(writes()[0]![1].method).toBe('put');expect(writes()[0]![1].body.sortOrder).toBe(7);expect(writes()[0]![1].body.parameters[0]).toMatchObject({required:true,sortOrder:9,name:'实际温度'});expect(document.querySelector('input[aria-label="事件参数必填"]')).toBeNull()
 await click('删除');await click('取消');expect(writes()).toHaveLength(1);await click('删除');await click('确定删除');expect(writes()).toHaveLength(2);expect(writes()[1]![1].method).toBe('delete');expect(wrapper.emitted('changed')).toHaveLength(2);expect(wrapper.text()).toContain('事件已删除')
})
it('非法或缺少复合Schema不能发写请求，取消零写',async()=>{
 const wrapper=render();await flushPromises();await click('添加事件');await click('保存');expect(writes()).toHaveLength(0);expect(document.body.textContent).toContain('请检查事件名称')
 const draft={...eventDraft(),name:'事件',eventKey:'event'};expect(prepareEvent(project,type,{...draft,level:'SUCCESS'}).body?.level).toBe('SUCCESS');expect(()=>prepareEvent(project,type,{...draft,parameters:[{name:'对象',parameterKey:'object',dataType:'OBJECT',required:false,sortOrder:0,enumOptions:[],schema:'',description:''}]})).toThrow();expect(()=>decodeEventDefinitions([row({deviceTypeId:other})],type)).toThrow();await click('取消');expect(writes()).toHaveLength(0);expect(wrapper.text()).toContain('事件')
})
it('已发布编辑仍受成员权限约束，角色与范围变化不保留旧行',async()=>{
 state.rows=[row()];const wrapper=render('PUBLISHED');await flushPromises();expect(wrapper.text()).toContain('温度事件');expect(wrapper.findAll('button').find(node=>node.text()==='添加事件')!.attributes('disabled')).toBeUndefined()
 await wrapper.setProps({typeStatus:'DRAFT'});session.user={...session.user!,projectRole:'VIEWER',permissions:['device:read']};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];await flushPromises();expect(wrapper.findAll('button').some(node=>node.text()==='编辑')).toBe(false);expect(writes()).toHaveLength(0)
 await wrapper.setProps({typeId:other});await flushPromises();expect(wrapper.text()).not.toContain('温度事件')
})
it('未知结果原意图不重发，同值会话替换和自身disabled不误清，只GET当前核对',async()=>{
 const normal=state.api.getMockImplementation()!;state.api.mockImplementation((path,options)=>options?.method?Promise.reject(new ApiError('网络结果未知',0,undefined,undefined,true)):normal(path,options));const wrapper=render();await flushPromises();await click('添加事件');await input('事件名称','温度事件');await input('事件标识符','overheat');await click('保存');expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);expect(writes()).toHaveLength(1)
 session.user={...session.user!};session.projects=session.projects.map(item=>({...item}));await wrapper.setProps({disabled:true});await flushPromises();await click('关闭');await click('查看未确认操作');await click('读取当前事件');expect(writes()).toHaveLength(1);expect(document.body.textContent).toContain('不能证明原操作的历史结果');expect(wrapper.emitted('changed')).toBeUndefined();await click('结束本次核对');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(wrapper.emitted('changed')).toBeUndefined();expect(wrapper.text()).toContain('未标记为保存或删除成功')
})
it('切类型后迟到写回不刷新新范围或发成功事件',async()=>{
 const normal=state.api.getMockImplementation()!;let resolve!:(value:ReturnType<typeof row>)=>void;state.api.mockImplementation((path,options)=>options?.method?new Promise(done=>{resolve=done}):normal(path,options));const wrapper=render();await flushPromises();await click('添加事件');await input('事件名称','温度事件');await input('事件标识符','overheat');button('保存').click();await flushPromises();await wrapper.setProps({typeId:other});resolve(row());await flushPromises();expect(wrapper.emitted('changed')).toBeUndefined();expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(wrapper.text()).not.toContain('温度事件');expect(writes()).toHaveLength(1)
})
it('事件复制清新键且取消零写，保留级别描述参数和顺序后只POST新副本',async()=>{
 const original=row({id:uuid(2),level:'WARNING',description:'原事件描述',parameters:[parameter({dataType:'ENUM',enumOptions:['AUTO','MANUAL']})]});state.rows=[original]
 const wrapper=render();await flushPromises();await click('复制');expect((document.querySelector('input[aria-label="事件标识符"]') as HTMLInputElement).value).toBe('');await click('取消');expect(writes()).toHaveLength(0)
 await click('复制');await click('创建副本');expect(writes()).toHaveLength(0);await input('事件标识符','overheat_copy');await click('创建副本')
 expect(writes()).toHaveLength(1);const [path,options]=writes()[0]!;expect(path).toBe(`/api/v1/projects/${project}/device-types/${type}/events`);expect(options.method).toBe('post');expect(options.body).toMatchObject({name:'温度事件',eventKey:'overheat_copy',level:'WARNING',description:'原事件描述',sortOrder:8,parameters:[{parameterKey:'temperature',name:'温度',dataType:'ENUM',required:true,enumOptions:['AUTO','MANUAL'],sortOrder:9}]});expect(options.body).not.toHaveProperty('id');expect(options.body.parameters[0]).not.toHaveProperty('id');expect(state.rows.find(value=>value.id===uuid(2))).toEqual(original);expect(wrapper.emitted('changed')).toHaveLength(1);expect(wrapper.text()).toContain('事件定义已保存')
})
it('事件排序领域值保持非负整数，参数身份及原位编辑语义保留',()=>{
 const before=decodeEventDefinitions([row({parameters:[parameter()]})],type)[0]!
 for(const sortOrder of [-1,1.5,2147483648])expect(()=>prepareEvent(project,type,{...eventDraft(before),sortOrder},before)).toThrow()
 expect(prepareEvent(project,type,{...eventDraft(before),sortOrder:3},before)).toMatchObject({kind:'update',body:{sortOrder:3,parameters:[{parameterKey:'temperature',required:true,sortOrder:9}]}})
})

it('SUCCESS的Object/List与说明样式只提交真实字段，精确Schema保持且取消零写',async()=>{
 const objectSchema='{"type":"object","maxProperties":1,"additionalProperties":false,"properties":{"value":{"type":"number","minimum":0.1234567890123456789}}}',listSchema='{"type":"array","maxItems":2,"items":{"type":"boolean"}}'
 const original=row({level:'SUCCESS',presentation:{iconId:'alarm',color:'#00aa00'},parameters:[parameter({dataType:'OBJECT',schema:objectSchema,description:'原说明'}),parameter({id:uuid(11),parameterKey:'flags',name:'开关列表',dataType:'LIST',required:false,schema:listSchema,description:'列表说明'})]});state.rows=[original]
 const wrapper=render();await flushPromises();await click('编辑');await click('编辑参数');await input('参数说明','实际对象说明');await input('参数 Schema',objectSchema);await click('确定参数');await setColor('事件','#AABBCC');await click('保存')
 expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toMatchObject({level:'SUCCESS',presentation:{iconId:'alarm',color:'#aabbcc'},parameters:[{dataType:'OBJECT',schema:objectSchema,description:'实际对象说明',required:true},{dataType:'LIST',schema:listSchema,description:'列表说明'}]});expect(wrapper.emitted('changed')).toHaveLength(1)
 await click('复制');await input('事件标识符','composite_copy');await click('取消');expect(writes()).toHaveLength(1)
 const draft=eventDraft(decodeEventDefinitions([original],type)[0]);expect(()=>prepareEvent(project,type,{...draft,parameters:[{...draft.parameters[0]!,schema:listSchema}]})).toThrow('根类型')
})
it('复合事件未知期间失写权或类型发布仍保留原意图，只GET不重发',async()=>{
 state.rows=[row({level:'SUCCESS',parameters:[parameter({dataType:'LIST',schema:'{"type":"array","maxItems":2,"items":{"type":"boolean"}}',description:'保留说明'})]})]
 const normal=state.api.getMockImplementation()!;state.api.mockImplementation((path,options)=>options?.method?Promise.reject(new ApiError('结果未知',0,undefined,undefined,true)):normal(path,options));const wrapper=render();await flushPromises();await click('编辑');await input('事件名称','修改事件');await click('保存');expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);const original=writes()[0]![1]
 session.user={...session.user!,projectRole:'VIEWER',permissions:['device:read']};session.projects=[{id:project,myRole:'VIEWER',status:'ARCHIVED'}];await wrapper.setProps({typeStatus:'PUBLISHED',disabled:true});await flushPromises();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);await click('读取当前事件');expect(writes()).toHaveLength(1);expect(writes()[0]![1]).toBe(original);expect(wrapper.emitted('changed')).toBeUndefined();await click('结束本次核对');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})

it('已发布事件由同一完整快照编辑，参数名称说明顺序保留并使用条件写入',async()=>{
 const before=row({parameters:[parameter({description:'精确说明'})]}),after=row({name:'已修事件',parameters:[parameter({description:'精确说明'})]}),token='a'.repeat(64);let reads=0
 state.api.mockImplementation((path:string,options?:any)=>{if(!options?.method){reads++;return Promise.resolve(new TextEncoder().encode(JSON.stringify({deviceTypeId:type,typeStatus:'PUBLISHED',versionId:uuid(reads===1?20:21),versionNumber:reads===1?'1.0.0':'2.0.0',token:reads===1?token:'b'.repeat(64),properties:[],events:[reads===1?before:after],commands:[]})))}return Promise.resolve(after)})
 const wrapper=render('PUBLISHED');await flushPromises();await click('编辑');await input('事件名称','已修事件');await click('保存');expect(writes()).toHaveLength(1);expect(writes()[0]![0]).toBe(`/api/v1/projects/${project}/device-types/${type}/model-edit/events/${before.id}`);expect(writes()[0]![1]).toMatchObject({method:'put',headers:{'If-Match':token},body:{name:'已修事件',sortOrder:7,parameters:[{name:'温度',description:'精确说明',sortOrder:9,required:true}]}});expect(wrapper.text()).toContain('事件定义已保存');expect(reads).toBe(2)
})

it('已发布事件10014保留原意图，409或422仅只读核对且不解锁重写',async()=>{
 const ordinaryRead=state.api.getMockImplementation()!
 for(const status of [409,422]){
  state.api.mockClear();state.rows=[row()];state.api.mockImplementation((path:string,options?:any)=>options?.method?Promise.reject(new ApiError('原请求结果暂未确认',status,10014)):ordinaryRead(path,options))
  const wrapper=render('PUBLISHED');await flushPromises();await click('编辑');await input('事件名称','待核对事件');await click('保存')
  expect(writes()).toHaveLength(1);const original=writes()[0]![1];expect(writes()[0]![0]).toContain('/model-edit/events/');expect(original.headers['If-Match']).toBe('a'.repeat(64));expect(original.body.name).toBe('待核对事件');expect(document.body.textContent).toContain('原操作结果尚未确认');expect(document.body.textContent).not.toContain('功能定义已变化');expect(wrapper.emitted('locked')?.at(-1)).toEqual([true])
  expect([...document.querySelectorAll('button')].some(node=>node.textContent?.trim()==='保存')).toBe(false)
  await click('读取当前事件');await click('读取当前事件');expect(writes()).toHaveLength(1);expect(writes()[0]![1]).toBe(original);expect(wrapper.emitted('changed')).toBeUndefined();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);expect(wrapper.text()).not.toContain('事件定义已保存')
  wrappers.splice(wrappers.indexOf(wrapper),1);wrapper.unmount();document.body.innerHTML=''
 }
})
