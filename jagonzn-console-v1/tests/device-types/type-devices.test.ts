import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {ref} from 'vue'
import ElementPlus from 'element-plus'
import Devices from '../../src/features/device-types/DeviceTypeDevices.vue'
import AddDevice from '../../src/features/device-types/DeviceTypeAddDeviceDialog.vue'
import DeviceCreate from '../../src/features/devices/DeviceCreate.vue'
import {decodeTypeDevices} from '../../src/features/device-types/type-devices-api'
import {adaptationStateLabel} from '../../src/features/devices/device-type-association-api'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
const state=vi.hoisted(()=>({directory:vi.fn(),profile:vi.fn(),api:vi.fn(),push:vi.fn(),type:vi.fn(),create:vi.fn(),association:vi.fn(),operation:vi.fn(),model:vi.fn(),adaptations:vi.fn(async()=>new Map())}))
vi.mock('vue-router',async original=>({...await original<typeof import('vue-router')>(),useRouter:()=>({push:state.push})}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
vi.mock('../../src/features/devices/api',async original=>{const source=await original<typeof import('../../src/features/devices/api')>();return {...source,devicesApi:{...source.devicesApi,directory:state.directory,profile:state.profile,type:state.type,createProfile:state.create}}})
vi.mock('../../src/features/devices/device-type-association-api',async original=>({...await original<typeof import('../../src/features/devices/device-type-association-api')>(),readAssociation:state.association,readAttachOperation:state.operation,readAdaptationBatch:state.adaptations}))
vi.mock('../../src/features/device-types/model-candidate-api',async original=>{const source=await original<typeof import('../../src/features/device-types/model-candidate-api')>();return {...source,modelCandidateTransport:{...source.modelCandidateTransport,byNumber:state.model,latest:state.model}}})
vi.mock('../../src/features/devices/use-options',()=>({useDeviceOptions:()=>({types:{data:ref(),error:ref(),loading:ref(false)},groups:{data:ref([]),error:ref()},allTypes:ref([]),moreTypes:vi.fn()})}))
vi.mock('../../src/features/devices/device-tag-set-api',async original=>({...await original<typeof import('../../src/features/devices/device-tag-set-api')>(),readDeviceTagSet:vi.fn(async()=>new TextEncoder().encode(JSON.stringify({deviceId:id(1),revision:'0',tags:[]})))}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const project=id(100),target=id(200),other=id(300),wrappers:VueWrapper[]=[]
const device=(n=1,type:string|null=target)=>({id:id(n),deviceTypeId:type,name:`设备${n}`,status:'OFFLINE',deviceKey:`protocol_${n}`,gatewayId:null,description:null,location:null,lastOnlineAt:null,createdAt:'2026-10-28T01:00:00Z'})
const profile=(type:string|null=null)=>({deviceId:id(1),deviceTypeId:type,name:'设备1',deviceKey:'device-key-01',description:null,businessKey:null,referenceVersion:'0',profileToken:'a'.repeat(64)})
function page(items:ReturnType<typeof device>[],total=String(items.length),number=1){return{items,total,page:number,limit:24,referenceIdentities:items.map(row=>({deviceId:row.id,businessKey:`asset_${row.id.slice(-2)}`,version:'0',updatedAt:'2026-10-28T01:00:00Z'})),displayFacts:items.map(row=>({deviceId:row.id,deviceTypeId:row.deviceTypeId,deviceTypeName:row.deviceTypeId?'类型':null,deviceKind:row.deviceTypeId?'DIRECT':null,enabled:true,staticGroups:[],lastDataReportAt:null})),alarmObservations:items.map(row=>({deviceId:row.id,modelVersionId:null,state:'UNKNOWN',highestSeverity:null,observedAt:'2026-10-28T01:00:00Z'}))}}
const encoded=()=>new TextEncoder().encode(JSON.stringify({deviceId:id(1),deviceTypeId:target}))
function render(component:typeof Devices|typeof AddDevice,props:Record<string,unknown>):VueWrapper{const wrapper=mount(component as typeof Devices,{props:(component===Devices?{displayTransport:{read:vi.fn(async(_project:string,typeId:string)=>({deviceTypeId:typeId,propertyKeys:[],revision:'0'})),choices:vi.fn(async()=>[]),change:vi.fn(),query:vi.fn()},...props}:props) as never,attachTo:document.body,global:{plugins:[ElementPlus],stubs:{RouterLink:{props:['to'],template:'<a><slot/></a>'}}}});wrappers.push(wrapper);return wrapper}
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()===label);expect(found,label).toBeDefined();return found!}
async function click(label:string){button(label).click();await flushPromises()}
async function choose(wrapper:VueWrapper,ids=[id(1)]){wrapper.findComponent({name:'ElSelect'}).vm.$emit('update:modelValue',ids);await flushPromises()}
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update','device:create']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}];state.directory.mockResolvedValue(page([device(1,null)]));state.profile.mockResolvedValue(profile());state.association.mockResolvedValue({deviceId:id(1),deviceTypeId:null,modelVersionId:null,retainedDeviceTypeId:null,retainedModelVersionId:null,revision:'0',bindingEpoch:'0',state:'UNASSOCIATED'});state.model.mockResolvedValue({version:{id:id(401)}});state.api.mockImplementation(()=>{state.profile.mockResolvedValue(profile(target));return Promise.resolve(encoded())})})
afterEach(()=>{for(const wrapper of wrappers.splice(0))wrapper.unmount();session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})

it('固定类型真实24+1分页，保固定类型导航且显示设置入口可用',async()=>{
 state.directory.mockResolvedValueOnce(page(Array.from({length:24},(_,n)=>device(n+1)),'25')).mockResolvedValueOnce(page([device(25)],'25',2)).mockResolvedValue(page([], '0'))
 const wrapper=render(Devices,{deviceTypeId:target});await flushPromises();expect(state.directory.mock.calls[0]![1]).toMatchObject({deviceTypeIds:[target],page:1,limit:24});expect(wrapper.text()).not.toContain('共 25 台设备');expect(wrapper.text()).toContain('尚无上报时间');expect(button('显示设置').disabled).toBe(false);expect(wrapper.find('input[aria-label="关联设备搜索"]').exists()).toBe(false);expect(wrapper.find('[aria-label="每页数量"]').exists()).toBe(false)
 await wrapper.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(state.directory.mock.calls[1]![1]).toMatchObject({deviceTypeIds:[target],page:2});expect(wrapper.text()).toContain('设备25');await click('在设备列表中查看󰁔');expect(state.push).toHaveBeenCalledWith({path:'/devices',query:{deviceTypeId:target}});expect(state.api).not.toHaveBeenCalled()
})

it('类型和角色切换清旧数据并隔离迟到请求',async()=>{
 let resolve!:(value:ReturnType<typeof page>)=>void;state.directory.mockImplementationOnce(()=>new Promise(r=>{resolve=r})).mockResolvedValue(page([device(2,other)]))
 const wrapper=render(Devices,{deviceTypeId:target});await wrapper.setProps({deviceTypeId:other});await flushPromises();resolve(page([device()]));await flushPromises();expect(wrapper.text()).toContain('设备2');expect(wrapper.text()).not.toContain('设备1')
 session.user={...session.user!,projectRole:'VIEWER',permissions:[]};await flushPromises();expect(wrapper.text()).not.toContain('设备2');expect(wrapper.text()).toContain('没有此内容的读取权限')
})
it('目录坏范围与坏总数拒绝，不伪装为空列表',async()=>{
 expect(()=>decodeTypeDevices(page([device(1,other)]) as never,{page:1,limit:24},target)).toThrow('类型范围')
 expect(()=>decodeTypeDevices({...page([device()]),total:1} as never,{page:1,limit:24},target)).toThrow('分页资料')
 expect(()=>decodeTypeDevices(page([{...device(),status:'UNKNOWN'}]) as never,{page:1,limit:24},target)).toThrow('身份')
 state.directory.mockRejectedValue(new ApiError('读取失败',503));const wrapper=render(Devices,{deviceTypeId:target});await flushPromises();expect(wrapper.text()).toContain('读取失败');expect(wrapper.text()).not.toContain('共 0 台设备')
})
it('有界候选页添加时读取当前类型，按内容前提保存并回读',async()=>{
 const wrapper=render(AddDevice,{open:true,deviceTypeId:target});await flushPromises();await choose(wrapper);await click('添加');expect(state.api).toHaveBeenCalledTimes(1);expect(state.api.mock.calls[0]![1].body).toEqual({expectedDeviceTypeId:null,deviceTypeId:target});expect(state.profile).toHaveBeenCalledTimes(2);expect(wrapper.emitted('changed')).toHaveLength(1)
 await wrapper.setProps({open:false});await wrapper.setProps({open:true});await flushPromises();expect(button('添加').disabled).toBe(true)
})
it('真实下拉多选保持展开、选中项高亮，搜索后保留标签并可逐项取消',async()=>{
 state.directory.mockResolvedValueOnce(page([device(1,null),device(2,null)])).mockResolvedValue(page([device(3,null)]))
 const wrapper=render(AddDevice,{open:true,deviceTypeId:target});await flushPromises()
 const input=wrapper.get('input[aria-label="选择设备"]')
 await wrapper.get('.el-select__wrapper').trigger('click')
 const options=wrapper.findAll('.candidate-option')
 await options[0]!.trigger('click')
 expect(input.attributes('aria-expanded')).toBe('true')
 expect(options[0]!.classes()).toContain('is-selected')
 await options[1]!.trigger('click')
 expect(input.attributes('aria-expanded')).toBe('true')
 expect(options[1]!.classes()).toContain('is-selected')
 expect(wrapper.findAll('.el-tag').map(tag=>tag.text())).toEqual(['设备1','设备2'])
 await input.setValue('asset_03')
 await vi.waitFor(()=>expect(wrapper.findAll('.candidate-option').map(row=>row.text())).toEqual([expect.stringContaining('设备3')]))
 expect(wrapper.findAll('.el-tag').map(tag=>tag.text())).toEqual(['设备1','设备2'])
 await wrapper.findAll('.el-tag__close')[0]!.trigger('click')
 expect(wrapper.findAll('.el-tag').map(tag=>tag.text())).toEqual(['设备2'])
 expect(state.api).not.toHaveBeenCalled()
})

it('提交多台设备先全部核对，遇到未知结果保留余项，核对后才可继续',async()=>{
 state.directory.mockResolvedValue(page([device(1,null),device(2,null),device(3,null)]))
 const saved=new Set<string>()
 state.profile.mockImplementation(async(_project,deviceId)=>({...profile(saved.has(deviceId)?target:null),deviceId}))
 state.api.mockImplementation(async(path)=>{
  const deviceId=path.split('/').at(-2)!
  saved.add(deviceId)
  if(deviceId===id(2))throw new ApiError('响应丢失',0,undefined,undefined,true)
  return new TextEncoder().encode(JSON.stringify({deviceId,deviceTypeId:target}))
 })
 const wrapper=render(AddDevice,{open:true,deviceTypeId:target});await flushPromises()
 await choose(wrapper,[id(1),id(2),id(3),id(3)]);await click('添加')
 expect(state.profile.mock.calls.slice(0,3).map(call=>call[1])).toEqual([id(1),id(2),id(3)])
 expect(state.api).toHaveBeenCalledTimes(2)
 expect(document.body.textContent).toContain('已添加 1 台设备。设备2')
 expect(wrapper.emitted('changed')).toHaveLength(1)
 await click('读取当前设备');await click('采用当前结果并刷新')
 expect(state.api).toHaveBeenCalledTimes(2)
 await click('添加')
 expect([...saved]).toEqual([id(1),id(2),id(3)])
 expect(state.api).toHaveBeenCalledTimes(3)
 expect(wrapper.emitted('changed')).toHaveLength(3)
 expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
})

it('多选包含需要指定版本的解绑设备时，其他设备也等待版本填写后再提交',async()=>{
 state.directory.mockResolvedValue(page([device(1,null),device(2,null)]))
 state.profile.mockImplementation(async(_project,deviceId)=>({...profile(),deviceId}))
 state.association.mockImplementation(async(_project,deviceId)=>deviceId===id(2)?{...detached(),deviceId}:{deviceTypeId:null,state:'UNASSOCIATED'})
 const wrapper=render(AddDevice,{open:true,deviceTypeId:target});await flushPromises()
 await choose(wrapper,[id(1),id(2)]);await click('添加')
 expect(wrapper.find('input[aria-label="设备2的物模型版本"]').exists()).toBe(true)
 expect(state.api).not.toHaveBeenCalled()
})
it('从选择设备直接搜索当前标识，过期候选不覆盖新结果，取消不写入',async()=>{
 let finishOld!:(value:ReturnType<typeof page>)=>void
 state.directory.mockResolvedValueOnce(page([device(1,null)])).mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve})).mockResolvedValueOnce(page([device(3,null)]))
 const wrapper=render(AddDevice,{open:true,deviceTypeId:target});await flushPromises()
 const input=wrapper.get('input[aria-label="选择设备"]')
 await input.setValue('asset_02')
 await vi.waitFor(()=>expect(state.directory).toHaveBeenCalledTimes(2))
 const oldSignal=state.directory.mock.lastCall![2] as AbortSignal
 await input.setValue('asset_03')
 await vi.waitFor(()=>expect(state.directory).toHaveBeenLastCalledWith(project,expect.objectContaining({keyword:'asset_03',page:1,limit:24,assignableToDeviceTypeId:target}),expect.any(AbortSignal)))
 finishOld(page([device(2,null)]));await flushPromises()
 expect(oldSignal.aborted).toBe(true)
 const options=wrapper.findAllComponents({name:'ElOption'})
 expect(options.map(option=>option.props('value'))).toEqual([id(3)])
 expect(options[0]!.text()).toContain('asset_03')
 expect(options[0]!.text()).not.toContain('protocol_3')
 await click('取消')
 expect(state.api).not.toHaveBeenCalled()
})
it('未知结果保留原意图且只读取当前设备核对，不再写',async()=>{
 state.directory.mockResolvedValueOnce(page([device()])).mockResolvedValueOnce(page([device(1,null)])).mockResolvedValue(page([device()]));state.api.mockRejectedValue(new ApiError('网络结果未知',0,undefined,undefined,true));const wrapper=render(Devices,{deviceTypeId:target});await flushPromises();await click('添加设备');const dialog=wrapper.findComponent(AddDevice);await choose(dialog);await click('添加');expect(document.body.textContent).toContain('保留原意图');expect(state.api).toHaveBeenCalledTimes(1);expect(wrapper.emitted('locked')?.at(-1)).toEqual([true])
 session.user={...session.user!};session.projects=session.projects.map(project=>({...project}));await flushPromises();expect(dialog.props('open')).toBe(true);expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);expect(document.body.textContent).toContain('保留原意图');expect(state.directory).toHaveBeenCalledTimes(2)
 await click('关闭');expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);await click('添加设备');await click('读取当前设备');expect(state.api).toHaveBeenCalledTimes(1);expect(document.body.textContent).toContain('原操作结果仍未确认');expect(dialog.emitted('changed')).toBeUndefined()
 state.profile.mockResolvedValue(profile(target));await click('读取当前设备');await click('采用当前结果并刷新');expect(state.api).toHaveBeenCalledTimes(1);expect(dialog.emitted('changed')).toHaveLength(1);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})
it('模型绑定409保留原类型模型，切项目后的迟到写回不通知父页',async()=>{
 state.api.mockRejectedValueOnce(new ApiError('绑定冲突',409,30063));const wrapper=render(AddDevice,{open:true,deviceTypeId:target});await flushPromises();await choose(wrapper);await click('添加');expect(document.body.textContent).toContain('原类型与模型保持不变');expect(wrapper.emitted('changed')).toBeUndefined();expect(state.api.mock.calls[0]![1].body).not.toHaveProperty('thingModelVersionId')
 let resolve!:(value:Uint8Array)=>void;state.api.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));await choose(wrapper);button('添加').click();await flushPromises();session.user={...session.user!,currentProjectId:other};session.projects=[{id:other,myRole:'OWNER',status:'ACTIVE'}];await flushPromises();resolve(encoded());await flushPromises();expect(wrapper.emitted('changed')).toBeUndefined();expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
})
it('滚动到底追加候选，排除目标类型已绑定并保留其他类型设备',async()=>{
 state.directory.mockResolvedValueOnce(page(Array.from({length:24},(_,n)=>device(n+1,null)),'27')).mockResolvedValueOnce(page([device(25,target),device(26,other),device(27,null)],'27',2))
 const wrapper=render(AddDevice,{open:true,deviceTypeId:target});await flushPromises()
 const list=wrapper.get<HTMLElement>('.el-select-dropdown__wrap')
 Object.defineProperties(list.element,{clientHeight:{value:290},scrollHeight:{value:1162}})
 list.element.scrollTop=200
 await list.trigger('scroll')
 expect(state.directory).toHaveBeenCalledTimes(1)
 list.element.scrollTop=872
 await list.trigger('scroll');await flushPromises()
 expect(state.directory.mock.calls[1]![1]).toMatchObject({page:2,limit:24,assignableToDeviceTypeId:target})
 const options=wrapper.findAllComponents({name:'ElOption'})
 expect(options.map(option=>option.props('value'))).toEqual([...Array.from({length:24},(_,n)=>id(n+1)),id(26),id(27)])
 await list.trigger('scroll')
 expect(state.directory).toHaveBeenCalledTimes(2)
 expect(state.api).not.toHaveBeenCalled()
})
it('候选加载后被其他类型绑定，提交按单次跨类型换绑处理',async()=>{
 state.profile.mockResolvedValue(profile(other));state.association.mockResolvedValueOnce(associatedOther()).mockResolvedValue(crossAttached());state.api.mockResolvedValue(bytes(crossAttached()))
 const wrapper=render(AddDevice,{open:true,deviceTypeId:target});await flushPromises()
 await choose(wrapper);await click('添加')
 expect(state.api).toHaveBeenCalledTimes(1)
 expect(state.api.mock.calls[0]![1].body).toEqual({operationKey:expect.any(String),revision:'0',expectedDeviceTypeId:other,expectedModelVersionId:id(500),deviceTypeId:target,modelVersionId:id(401)})
 expect(wrapper.emitted('changed')).toHaveLength(1)
})
it('固定目录外DRAFT类型直读创建回读，首次项目恢复和后续切换隔离',async()=>{
 session.user={...session.user!,currentProjectId:''};state.type.mockResolvedValue({id:target,projectId:project,name:'目录外草稿类型',status:'DRAFT'});state.create.mockResolvedValue(profile(target));state.profile.mockResolvedValue(profile(target));const wrapper=mount(DeviceCreate,{props:{fixedDeviceTypeId:target,returnDeviceTypeId:target},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);await flushPromises();expect(state.type).not.toHaveBeenCalled();session.user={...session.user!,currentProjectId:project};await flushPromises();expect(state.type).toHaveBeenCalledWith(project,target,expect.any(AbortSignal));expect(wrapper.findComponent({name:'ElSelect'}).props('disabled')).toBe(true)
 await click('取消');expect(state.create).not.toHaveBeenCalled();expect(state.push).toHaveBeenCalledWith(`/device-types/${target}`)
 await wrapper.get('input[aria-label="设备名称"]').setValue('设备1');await wrapper.get('form').trigger('submit');await flushPromises();expect(state.create).toHaveBeenCalledTimes(1);expect(state.create.mock.lastCall![1].deviceTypeId).toBe(target);expect(state.push).toHaveBeenLastCalledWith(`/device-types/${target}`)
 session.user={...session.user!,currentProjectId:other};session.projects=[{id:other,myRole:'OWNER',status:'ACTIVE'}];await flushPromises();expect((wrapper.get('input[aria-label="设备名称"]').element as HTMLInputElement).value).toBe('');expect(state.type).toHaveBeenCalledTimes(1);await wrapper.get('form').trigger('submit');expect(state.create).toHaveBeenCalledTimes(1)
})

it('添加已受理后回读409仍保持未知锁，只GET核对而不重复PUT',async()=>{
 state.api.mockResolvedValue(encoded());state.profile.mockResolvedValueOnce(profile()).mockRejectedValueOnce(new ApiError('回读冲突',409,30063)).mockResolvedValue(profile(target))
 const wrapper=render(AddDevice,{open:true,deviceTypeId:target});await flushPromises();await choose(wrapper);await click('添加')
 expect(document.body.textContent).toContain('添加结果尚未确认');expect(document.body.textContent).not.toContain('原类型与模型保持不变');expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);expect(wrapper.emitted('changed')).toBeUndefined()
 await click('读取当前设备');expect(state.api).toHaveBeenCalledTimes(1);await click('采用当前结果并刷新');expect(wrapper.emitted('changed')).toHaveLength(1);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})


it('关联设备多选、全选和半选按当前页生效，选中显示类型移除且取消零写',async()=>{
 state.directory.mockResolvedValue(page([device(1),device(2)]))
 const wrapper=render(Devices,{deviceTypeId:target});await flushPromises()
 const check=(label:string)=>wrapper.get(`[aria-label="${label}"] input`)
 expect(wrapper.text()).not.toContain('从类型中移除设备');await check('选择设备 设备1').setValue(true)
 expect(button('从类型中移除设备').className).toContain('el-button--danger');expect(wrapper.text()).not.toContain('清除选择');expect(wrapper.get('[aria-label="选择本页全部设备"] .el-checkbox__input').classes()).toContain('is-indeterminate')
 await click('从类型中移除设备');expect(document.body.textContent).toContain('确认从设备类型中移除吗？');await click('取消');expect(state.api).not.toHaveBeenCalled();expect(state.profile).not.toHaveBeenCalled()
 await check('选择本页全部设备').setValue(true);expect((check('选择设备 设备2').element as HTMLInputElement).checked).toBe(true)
 await check('选择本页全部设备').setValue(false);expect(wrapper.text()).not.toContain('从类型中移除设备')
 await check('选择设备 设备2').setValue(true);await click('刷新');expect(wrapper.text()).not.toContain('从类型中移除设备')
 await check('选择设备 设备1').setValue(true);state.directory.mockResolvedValue(page([device(2,other)]));await wrapper.setProps({deviceTypeId:other});await flushPromises();expect(wrapper.text()).not.toContain('从类型中移除设备');expect(state.api).not.toHaveBeenCalled()
})

const detached=()=>({deviceId:id(1),deviceTypeId:null,modelVersionId:null,retainedDeviceTypeId:target,retainedModelVersionId:id(400),revision:'1',bindingEpoch:'0',state:'DETACHED'})
const attached=()=>({...detached(),deviceTypeId:target,modelVersionId:id(401),revision:'2',bindingEpoch:'1',state:'ASSOCIATED'})
const associatedOther=()=>({deviceId:id(1),deviceTypeId:other,modelVersionId:id(500),retainedDeviceTypeId:null,retainedModelVersionId:null,revision:'0',bindingEpoch:'0',state:'ASSOCIATED'})
const crossAttached=()=>({deviceId:id(1),deviceTypeId:target,modelVersionId:id(401),retainedDeviceTypeId:other,retainedModelVersionId:id(500),revision:'1',bindingEpoch:'1',state:'ASSOCIATED'})
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v))
it('已解绑设备必须明确填写版本，旧模型零写，指定新版本按六字段关联且核对模型',async()=>{
 state.association.mockResolvedValue(detached());state.model.mockImplementation(async(_p,_t,number)=>({version:{id:number==='1.0.0'?id(400):id(401)}}))
 state.api.mockImplementation(async()=>{state.association.mockResolvedValue(attached());return new TextEncoder().encode(JSON.stringify(attached()))})
 const wrapper=render(AddDevice,{open:true,deviceTypeId:target});await flushPromises();await choose(wrapper);await click('添加')
 expect(state.api).not.toHaveBeenCalled();expect(state.model).not.toHaveBeenCalled();expect(wrapper.get('input[aria-label="重新添加物模型版本"]').element).toBeDefined()
 await wrapper.get('input[aria-label="重新添加物模型版本"]').setValue('1.0.0');await click('添加');expect(state.api).not.toHaveBeenCalled();expect(document.body.textContent).toContain('未在旧关联使用过')
 await wrapper.get('input[aria-label="重新添加物模型版本"]').setValue('2.0.0');await click('添加')
 expect(state.model).toHaveBeenLastCalledWith(project,target,'2.0.0',expect.any(AbortSignal));expect(state.api).toHaveBeenCalledTimes(1)
 expect(state.api.mock.calls[0]![0]).toMatch(/\/type-association$/);expect(state.api.mock.calls[0]![1].body).toEqual({operationKey:expect.any(String),revision:'1',expectedDeviceTypeId:null,expectedModelVersionId:null,deviceTypeId:target,modelVersionId:id(401)})
 expect(wrapper.emitted('changed')).toHaveLength(1);expect(state.association).toHaveBeenCalledTimes(4)
})
it('新关联响应未知保留原键，核对持久原操作确认且不重发',async()=>{
 state.association.mockResolvedValue(detached());state.model.mockResolvedValue({version:{id:id(401)}});state.api.mockRejectedValue(new ApiError('响应丢失',0,undefined,undefined,true));state.operation.mockResolvedValue(attached())
 const wrapper=render(AddDevice,{open:true,deviceTypeId:target});await flushPromises();await choose(wrapper);await click('添加');await wrapper.get('input[aria-label="重新添加物模型版本"]').setValue('2.0.0');await click('添加')
 expect(document.body.textContent).toContain('保留原意图');expect(state.api).toHaveBeenCalledTimes(1);expect(wrapper.emitted('changed')).toBeUndefined();await click('读取当前设备')
 expect(state.operation).toHaveBeenCalledTimes(1);expect(state.operation.mock.calls[0]![0].key).toBe(state.api.mock.calls[0]![1].body.operationKey);expect(state.api).toHaveBeenCalledTimes(1);expect(wrapper.emitted('changed')).toHaveLength(1)
})
it('已解绑设备可跨类型恢复，目标使用当前已发布模型',async()=>{
 const attachedCross={deviceId:id(1),deviceTypeId:target,modelVersionId:id(401),retainedDeviceTypeId:other,retainedModelVersionId:id(500),revision:'2',bindingEpoch:'1',state:'ASSOCIATED'};state.association.mockResolvedValueOnce({...detached(),retainedDeviceTypeId:other,retainedModelVersionId:id(500)}).mockResolvedValue(attachedCross);state.model.mockResolvedValue({version:{id:id(401)}});state.api.mockResolvedValue(bytes(attachedCross))
 const wrapper=render(AddDevice,{open:true,deviceTypeId:target});await flushPromises();await choose(wrapper);await click('添加')
 expect(state.api).toHaveBeenCalledTimes(1);expect(state.api.mock.calls[0]![1].body).toEqual({operationKey:expect.any(String),revision:'1',expectedDeviceTypeId:null,expectedModelVersionId:null,deviceTypeId:target,modelVersionId:id(401)});expect(wrapper.emitted('changed')).toHaveLength(1)
})

it('适配状态只按当前代次事实映射，缺失行不伪造为已就绪',()=>{
 expect(adaptationStateLabel(undefined)).toBe('未登记')
 expect(adaptationStateLabel({status:'READY',reason:null})).toBe('已就绪')
 expect(adaptationStateLabel({status:'WAITING_MODEL',reason:'MODEL_REQUIRED'})).toBe('等待物模型')
 expect(adaptationStateLabel({status:'WAITING',reason:'GATEWAY_REQUIRED'})).toBe('等待网关')
 expect(adaptationStateLabel({status:'WAITING',reason:'ADDRESS_REQUIRED'})).toBe('等待地址')
 expect(adaptationStateLabel({status:'WAITING',reason:null})).toBe('等待适配')
})
