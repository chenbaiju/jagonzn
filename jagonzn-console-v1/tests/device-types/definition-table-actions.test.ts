import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,DOMWrapper} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView,type Router} from 'vue-router'
import ElementPlus,{ElDropdown,ElTable} from 'element-plus'
import type {Component} from 'vue'
import {decodeEventDefinitions} from '../../src/features/device-types/event-definition-api'
import {decodeCommandList} from '../../src/features/device-types/command-definition-api'
import Properties from '../../src/features/device-types/DeviceTypeProperties.vue'
import Events from '../../src/features/device-types/DeviceTypeEvents.vue'
import Commands from '../../src/features/device-types/DeviceTypeCommands.vue'
import {decodeProperty,propertyTransport,type PropertyDefinition,type PropertyTransport} from '../../src/features/device-types/property-definition-api'
import {prepareDefinitionTableOperation,type DefinitionContext,type DefinitionTableList} from '../../src/features/device-types/model-definition-table-api'
import {session} from '../../src/core/session'
import * as http from '../../src/core/http'
vi.mock('../../src/ui/JsonCodeEditor.vue',()=>({default:{props:['modelValue'],template:'<textarea :value="modelValue"/>'}}))
const project='00000000-0000-4000-8000-000000000001',type='00000000-0000-4000-8000-000000000100',first='00000000-0000-4000-8000-000000000201',second='00000000-0000-4000-8000-000000000202'
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
function raw(id=first,sortOrder=0){return{id,deviceTypeId:type,name:id===first?'温度':'湿度',propertyKey:id===first?'temperature':'humidity',accessType:'REPORT',dataType:'TEXT',unit:null,decimalPlaces:null,minimumValue:null,maximumValue:null,enumOptions:null,onLabel:null,offLabel:null,schema:null,sortOrder,createdAt:'2026-10-28T01:00:00Z',description:null,defaultValue:null}}
function context(token='a',status:'DRAFT'|'PUBLISHED'='DRAFT'):DefinitionContext{return{deviceTypeId:type,typeStatus:status,versionId:status==='PUBLISHED'?project:null,versionNumber:status==='PUBLISHED'?'1.0.0':null,token:token.repeat(64)}}
function rows(){return[decodeProperty(bytes(raw()),type),decodeProperty(bytes(raw(second,1)),type)]}
function port(initial:DefinitionTableList<PropertyDefinition>){return{list:vi.fn<PropertyTransport['list']>(),write:vi.fn<PropertyTransport['write']>(),definitionList:vi.fn<NonNullable<PropertyTransport['definitionList']>>().mockResolvedValue(initial),tableWrite:vi.fn<NonNullable<PropertyTransport['tableWrite']>>()}}
let wrapper:ReturnType<typeof mount>|undefined,router:Router
function button(text:string){const value=[...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()===text);if(!value)throw new Error('缺少按钮 '+text);return new DOMWrapper(value)}
async function setup(transport:unknown,status:'DRAFT'|'PUBLISHED'='DRAFT',component:Component=Properties){router=createRouter({history:createMemoryHistory(),routes:[{path:'/type',component,props:{typeId:type,typeStatus:status,transport}},{path:'/other',component:{template:'<p>其它页面</p>'}}]});await router.push('/type');await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await flushPromises()}
async function select(selected:readonly PropertyDefinition[]){wrapper!.getComponent(ElTable).vm.$emit('selection-change',selected);await flushPromises();expect(button('批量操作')).toBeTruthy();wrapper!.getComponent(ElDropdown).vm.$emit('command','delete');await flushPromises()}
function pointer(target:EventTarget,name:string,x:number,y:number){const event=new MouseEvent(name,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperties(event,{pointerId:{value:7},isPrimary:{value:true}});target.dispatchEvent(event)}
async function drag(source=first,target=second){const handle=wrapper!.findAll('button[aria-label="排序"]')[source===first?0:1]!,hit=wrapper!.get(`.model-definition-row-${target}`);vi.spyOn(document,'elementFromPoint').mockReturnValue(hit.element);pointer(handle.get('svg').element,'pointerdown',20,30);pointer(window,'pointermove',20,80);pointer(window,'pointerup',20,80);pointer(window,'pointerup',20,80);await flushPromises()}

beforeEach(()=>{if(!document.elementFromPoint)Object.defineProperty(document,'elementFromPoint',{configurable:true,writable:true,value:()=>null});http.changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})

it('指针从手柄SVG拖动超过阈值提交完整顺序一次，回读更新且不调用单行写入',async()=>{
 const before=rows(),after=[{...before[1]!,sortOrder:0},{...before[0]!,sortOrder:1}],transport=port({items:before,context:context()})
 transport.tableWrite.mockResolvedValue({items:after,context:context('b')});transport.definitionList.mockResolvedValueOnce({items:before,context:context()}).mockResolvedValue({items:after,context:context('b')})
 await setup(transport);expect(wrapper!.get('button[aria-label="排序"]').attributes('title')).toBe('请点此拖动进行上下排序');await drag()
 expect(transport.tableWrite).toHaveBeenCalledTimes(1);expect(transport.tableWrite.mock.calls[0]![0]).toMatchObject({kind:'properties',operation:'order',ids:[second,first],context:context()});expect(transport.write).not.toHaveBeenCalled();expect(transport.definitionList).toHaveBeenCalledTimes(2)
 expect(wrapper!.findAll('.el-table__row').map(row=>row.text().includes('湿度')?'湿度':'温度')).toEqual(['湿度','温度']);expect(wrapper!.text()).toContain('排序已保存');expect(wrapper!.getComponent(Properties).emitted('changed')).toHaveLength(1)
})

it('已发布表内明确选择后只有移除项；取消零写，确定一次同域原子移除并回读',async()=>{
 const before=rows(),transport=port({items:before,context:context('a','PUBLISHED')})
 transport.tableWrite.mockResolvedValue({items:[],context:context('b','PUBLISHED')});transport.definitionList.mockResolvedValueOnce({items:before,context:context('a','PUBLISHED')}).mockResolvedValue({items:[],context:context('b','PUBLISHED')})
 await setup(transport,'PUBLISHED');expect(document.body.textContent).not.toContain('批量操作');await select(before);expect(document.body.textContent).toContain('确认移除吗？');expect(wrapper!.getComponent(ElDropdown).findAllComponents({name:'ElDropdownItem'}).map(item=>item.text())).toEqual(['移除属性'])
 await button('取消').trigger('click');expect(transport.tableWrite).not.toHaveBeenCalled();await select(before);await button('确定').trigger('click');await flushPromises()
 expect(transport.tableWrite).toHaveBeenCalledTimes(1);expect(transport.tableWrite.mock.calls[0]![0]).toMatchObject({operation:'delete',kind:'properties',ids:[first,second],context:context('a','PUBLISHED')});expect(transport.definitionList).toHaveBeenCalledTimes(2);expect(wrapper!.text()).toContain('已移除选中的功能定义')
})

it('表格写入结果未知保留原选择和请求身份，只允许GET核对；降权后仍可只读核对并阻止导航',async()=>{
 const before=rows(),transport=port({items:before,context:context()});transport.tableWrite.mockRejectedValue(new Error('连接中断'))
 await setup(transport);await select([before[0]!]);await button('确定').trigger('click');await flushPromises();const original=transport.tableWrite.mock.calls[0]![0]
 expect(document.body.textContent).toContain('原操作结果尚未确认');await router.push('/other');expect(router.currentRoute.value.path).toBe('/type');const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true)
 session.user={...session.user!,projectRole:'OPERATOR'};session.projects=[{id:project,myRole:'OPERATOR',status:'ACTIVE'}];await flushPromises();await button('读取当前定义').trigger('click');await flushPromises()
 expect(transport.tableWrite).toHaveBeenCalledTimes(1);expect(transport.tableWrite.mock.calls[0]![0]).toBe(original);expect(original.ids).toEqual([first]);expect(transport.definitionList).toHaveBeenCalledTimes(2);expect(document.body.textContent).not.toContain('已移除选中的功能定义');await button('结束核对').trigger('click');await flushPromises();expect(wrapper!.text()).toContain('原操作结果仍未确认');expect(wrapper!.findAll('button[aria-label="排序"]')).toHaveLength(0)
})

it('CAS冲突不重绑旧选择意图；明确重读后新选择使用新token',async()=>{
 const before=rows(),transport=port({items:before,context:context()});transport.tableWrite.mockRejectedValue(new http.ApiError('冲突',409));transport.definitionList.mockResolvedValueOnce({items:before,context:context()}).mockResolvedValue({items:before,context:context('b')})
 await setup(transport);await select([before[0]!]);await button('确定').trigger('click');await flushPromises();expect(transport.definitionList).toHaveBeenCalledTimes(1);expect(document.body.textContent).toContain('功能定义已变化');await drag();expect(transport.tableWrite).toHaveBeenCalledTimes(1)
 await button('重新读取').trigger('click');await flushPromises();await select([before[1]!]);await button('确定').trigger('click');await flushPromises();expect(transport.tableWrite).toHaveBeenCalledTimes(2);expect(transport.tableWrite.mock.calls[1]![0]).toMatchObject({ids:[second],context:context('b')});expect(transport.tableWrite.mock.calls[1]![0].key).not.toBe(transport.tableWrite.mock.calls[0]![0].key)
})

it('正式transport保留草稿空版本与NUMBER词法，发送本表CAS及幂等键并拒绝部分排序',async()=>{
 const snapshot={...context(),properties:[{...raw(),dataType:'NUMBER'}],events:[],commands:[]},encoded=new TextEncoder().encode(JSON.stringify(snapshot).replace('"defaultValue":null','"defaultValue":9007199254740993.125')),spy=vi.spyOn(http,'api').mockResolvedValue(encoded),signal=new AbortController().signal
 const actual=await propertyTransport.definitionList!(project,type,signal);expect(actual.context.versionId).toBeNull();expect(actual.items[0]!.defaultValue).toBe('9007199254740993.125');const original=prepareDefinitionTableOperation(project,type,'properties','delete',actual.context,[first],[first]);await propertyTransport.tableWrite!(original,signal)
 expect(spy.mock.calls[1]![0]).toBe(`/api/v1/projects/${project}/device-types/${type}/model-definition-deletions/properties`);expect(spy.mock.calls[1]![1]).toMatchObject({method:'post',body:{ids:[first]},headers:{'If-Match':context().token,'Idempotency-Key':original.key}})
 expect(()=>prepareDefinitionTableOperation(project,type,'properties','order',context(),[first,second],[first])).toThrow();expect(()=>prepareDefinitionTableOperation(project,type,'properties','delete',context(),[first],[second])).toThrow()
})


it.each(['events','commands'] as const)('%s三表宿主使用本域真实移除动作并回读',async kind=>{
 const items=kind==='events'?decodeEventDefinitions([{id:first,deviceTypeId:type,eventKey:'overheat',name:'过热',level:'WARNING',description:null,sortOrder:0,parameters:[],createdAt:'2026-10-28T01:00:00Z'}],type):decodeCommandList(bytes([{id:first,deviceTypeId:type,commandKey:'restart',name:'重启',description:null,inputSchema:null,outputSchema:null,timeoutSeconds:30,sortOrder:0,createdAt:'2026-10-28T01:00:00Z'}]),type)
 const transport={list:vi.fn(),write:vi.fn(),definitionList:vi.fn().mockResolvedValueOnce({items,context:context()}).mockResolvedValue({items:[],context:context('b')}),tableWrite:vi.fn().mockResolvedValue({items:[],context:context('b')})}
 await setup(transport,'DRAFT',kind==='events'?Events:Commands);wrapper!.getComponent(ElTable).vm.$emit('selection-change',items);await flushPromises();wrapper!.getComponent(ElDropdown).vm.$emit('command','delete');await flushPromises();await button('确定').trigger('click');await flushPromises();expect(transport.tableWrite).toHaveBeenCalledTimes(1);expect(transport.tableWrite.mock.calls[0]![0]).toMatchObject({kind,operation:'delete',ids:[first]});expect(transport.definitionList).toHaveBeenCalledTimes(2);expect(wrapper!.text()).toContain('已移除选中的功能定义')
})


it('指针轻点、pointercancel、确认弹窗期间的排序均为零写',async()=>{
 const before=rows(),transport=port({items:before,context:context()});await setup(transport);const handle=wrapper!.get('button[aria-label="排序"]'),hit=wrapper!.get(`.model-definition-row-${second}`);vi.spyOn(document,'elementFromPoint').mockReturnValue(hit.element)
 pointer(handle.element,'pointerdown',20,30);pointer(window,'pointerup',22,32);await flushPromises();expect(transport.tableWrite).not.toHaveBeenCalled()
 pointer(handle.element,'pointerdown',20,30);pointer(window,'pointermove',20,80);pointer(window,'pointercancel',20,80);pointer(window,'pointerup',20,80);await flushPromises();expect(transport.tableWrite).not.toHaveBeenCalled()
 await select([before[0]!]);expect(handle.attributes('disabled')).toBeDefined();pointer(handle.element,'pointerdown',20,30);pointer(window,'pointermove',20,80);pointer(window,'pointerup',20,80);await flushPromises();expect(transport.tableWrite).not.toHaveBeenCalled();await button('取消').trigger('click')
})

it('指针中途切项目丢弃起拖身份，松开不向新项目重绑旧排序',async()=>{
 const before=rows(),transport=port({items:before,context:context()});await setup(transport);const handle=wrapper!.get('button[aria-label="排序"]'),hit=wrapper!.get(`.model-definition-row-${second}`);vi.spyOn(document,'elementFromPoint').mockReturnValue(hit.element)
 pointer(handle.element,'pointerdown',20,30);pointer(window,'pointermove',20,80);const next='00000000-0000-4000-8000-000000000002';session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'},{id:next,myRole:'OWNER',status:'ACTIVE'}];session.user={...session.user!,currentProjectId:next};await flushPromises();pointer(window,'pointerup',20,80);await flushPromises();expect(transport.tableWrite).not.toHaveBeenCalled()
})

it('指针排序结果未知后禁止再次拖动，只GET核对不双发',async()=>{
 const before=rows(),transport=port({items:before,context:context()});transport.tableWrite.mockRejectedValue(new Error('指针排序响应丢失'));await setup(transport);await drag();expect(transport.tableWrite).toHaveBeenCalledTimes(1);const original=transport.tableWrite.mock.calls[0]![0];expect(original.operation).toBe('order');expect(document.body.textContent).toContain('原操作结果尚未确认');await drag();expect(transport.tableWrite).toHaveBeenCalledTimes(1);await button('读取当前定义').trigger('click');await flushPromises();expect(transport.definitionList).toHaveBeenCalledTimes(2);expect(transport.tableWrite.mock.calls[0]![0]).toBe(original)
})
