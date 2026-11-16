import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,DOMWrapper} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView,type Router} from 'vue-router'
import ElementPlus,{ElDialog,ElSelect,ElSwitch} from 'element-plus'
import Create from '../../src/features/device-types/DeviceTypeCreate.vue'
import Detail from '../../src/features/device-types/DeviceTypeDetail.vue'
import DeviceTypeSettings from '../../src/features/device-types/DeviceTypeSettings.vue'
import DeviceTypeApplications from '../../src/features/device-types/DeviceTypeApplications.vue'
import DeviceTypeExtensions from '../../src/features/device-types/DeviceTypeExtensions.vue'
import DeviceTypeDevices from '../../src/features/device-types/DeviceTypeDevices.vue'
import DeviceTypeProperties from '../../src/features/device-types/DeviceTypeProperties.vue'
import DeviceTypePublication from '../../src/features/device-types/DeviceTypePublication.vue'
import DeviceTypeModelCandidate from '../../src/features/device-types/DeviceTypeModelCandidate.vue'
import DeviceTypeModelDocumentation from '../../src/features/device-types/DeviceTypeModelDocumentation.vue'
import DeviceTypeEvents from '../../src/features/device-types/DeviceTypeEvents.vue'
import DeviceTypeCommands from '../../src/features/device-types/DeviceTypeCommands.vue'
import {propertyTransport,decodeProperty} from '../../src/features/device-types/property-definition-api'
import {currentProductPublicationTransport} from '../../src/features/device-types/current-product-publication-api'
import {decodePresenceSettings,typeSettingsAggregateTransport} from '../../src/features/device-types/type-settings-aggregate-api'
import DeviceTypeProductCredentials from '../../src/features/device-types/DeviceTypeProductCredentials.vue'
import DeviceTypeDefinitionImport from '../../src/features/device-types/DeviceTypeDefinitionImport.vue'
import DeviceTypeTslPreview from '../../src/features/device-types/DeviceTypeTslPreview.vue'
import DeviceTypeProductIdentifier from '../../src/features/device-types/DeviceTypeProductIdentifier.vue'
import DeviceTypeOnlinePolicy from '../../src/features/device-types/DeviceTypeOnlinePolicy.vue'
import DeviceTypePrivateTemplates from '../../src/features/device-types/DeviceTypePrivateTemplates.vue'
import DeviceTypeDefinitionBatch from '../../src/features/device-types/DeviceTypeDefinitionBatch.vue'
import {decodeTypeProfile,prepareTypeCreation,prepareTypeUpdate,typeProfileDraft,typeProfileTransport,creationMatches,type TypeProfile,type TypeProfileTransport} from '../../src/features/device-types/profile-api'
import {session} from '../../src/core/session'
import * as http from '../../src/core/http'
vi.mock('../../src/features/devices/device-type-association-api',async original=>({...await original<typeof import('../../src/features/devices/device-type-association-api')>(),readAdaptationBatch:vi.fn(async()=>new Map())}))

const project='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000100'
function raw(status='DRAFT'){return{type:{id,projectId:project,name:'已建类型',typeKey:'type_1',deviceKind:'DIRECT',networkType:'WIFI',payloadProtocol:'STANDARD',status,version:1,productKey:null,createdAt:'2026-10-28T01:00:00Z'},description:'说明',tags:{'区域':'华南'},revision:'0',profileToken:'a'.repeat(64)}}
function profile(status='DRAFT',changes:Partial<TypeProfile>={}){return decodeTypeProfile({...raw(status),...changes},project,id)}
function transport(value=profile()){return{read:vi.fn<TypeProfileTransport['read']>().mockResolvedValue(value),create:vi.fn<TypeProfileTransport['create']>().mockResolvedValue(value),recover:vi.fn<TypeProfileTransport['recover']>().mockResolvedValue({deviceTypeId:id,deleted:false}),update:vi.fn<TypeProfileTransport['update']>().mockResolvedValue(value),accessEditability:vi.fn<TypeProfileTransport['accessEditability']>().mockResolvedValue('EDITABLE')}}
let wrapper:ReturnType<typeof mount>|undefined,router:Router
function button(label:string){const node=[...document.querySelectorAll<HTMLButtonElement>('button')].find(value=>value.textContent?.trim()===label);if(!node)throw new Error('缺少按钮：'+label);return new DOMWrapper(node)}
function input(label:string){const node=document.querySelector<HTMLInputElement|HTMLTextAreaElement>(`input[aria-label="${label}"],textarea[aria-label="${label}"]`);if(!node)throw new Error('缺少输入：'+label);return new DOMWrapper(node)}
async function setup(port:TypeProfileTransport,path='/device-types/create',{realProperties=false,realSettings=false}={}){
 router=createRouter({history:createMemoryHistory(),routes:[
  {path:'/device-types',component:{template:'<p>类型目录目标</p>'}},
  {path:'/devices',component:{template:'<p>所有设备目标</p>'}},
  {path:'/device-types/create',component:Create,props:{transport:port}},
  {path:'/device-types/:typeId',component:Detail,props:route=>({typeId:String(route.params.typeId),transport:port})},
 ]})
 await router.push(path);await router.isReady()
 wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus],stubs:{DeviceTypeSettings:!realSettings,DeviceTypeExtensions:true,DeviceTypeDevices:true,DeviceTypeProperties:!realProperties,DeviceTypeEvents:true,DeviceTypeCommands:true,DeviceExtensionDefinitions:true,DeviceTypeModelCandidate:true,DeviceTypeModelVersions:true,DeviceTypeModelDocumentation:true,DeviceTypePublication:true,DeviceTypeDeleteDialog:true,DeviceTypeProductCredentials:true,DeviceTypeRegistrationPolicy:true,DeviceTypeDefinitionImport:true,DeviceTypeTslPreview:true,DeviceTypeProductIdentifier:true,DeviceTypeDefinitionBatch:true,DeviceTypeModelJson:true,DeviceTypeLocationPolicy:true,DeviceTypePlanarPolicy:true,DeviceTypeOnlinePolicy:true,DeviceTypePrivateTemplates:true}}})
 await flushPromises()
}
async function fillCreate(){await input('类型名称').setValue(' 已建类型 ');wrapper!.findAllComponents(ElSelect)[0]!.vm.$emit('update:modelValue','WIFI');await input('类型描述').setValue(' 说明 ');await input('标签名称1').setValue('区域');await input('标签值1').setValue('华南');await flushPromises()}
beforeEach(()=>{http.changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:[]} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})

it('正常创建一次保真中文标签、strip资料、回读后进入真实详情，九页签保持query位置',async()=>{
 const port=transport();await setup(port);await fillCreate();await button('创建').trigger('click');await flushPromises()
 expect(port.create).toHaveBeenCalledTimes(1);expect(port.create.mock.calls[0]![0].body).toEqual({name:'已建类型',description:'说明',tags:{'区域':'华南'},deviceKind:'DIRECT',networkType:'WIFI',payloadProtocol:'STANDARD'});expect(port.read).toHaveBeenCalledTimes(2);expect(router.currentRoute.value.path).toBe(`/device-types/${id}`);expect(wrapper!.text()).toContain('已建类型');expect(wrapper!.findAll('[role="tab"]')).toHaveLength(9)
 const original=port.create.mock.calls[0]![0].body;expect(creationMatches(profile('PUBLISHED'),original)).toBe(false);expect(creationMatches({...profile(),type:{...profile().type,networkType:'ETHERNET'}},original)).toBe(false)
 await router.replace({path:`/device-types/${id}`,query:{tab:'functions',keep:'original'}});await flushPromises();expect(wrapper!.getComponent(DeviceTypeProperties).props('typeId')).toBe(id);expect(wrapper!.findComponent(DeviceTypeModelDocumentation).exists()).toBe(false);expect(wrapper!.getComponent(DeviceTypeEvents).props('typeStatus')).toBe('DRAFT');expect(router.currentRoute.value.query.keep).toBe('original');await router.replace({path:`/device-types/${id}`,query:{tab:'devices',keep:'original'}});await flushPromises();const devices=wrapper!.getComponent(DeviceTypeDevices);expect(devices.props('deviceTypeId')).toBe(id);devices.vm.$emit('locked',true);await flushPromises();await router.push('/device-types');expect(router.currentRoute.value.path).toBe(`/device-types/${id}`);expect(button('编辑').attributes('disabled')).toBeDefined();devices.vm.$emit('locked',false);await flushPromises();await router.push('/device-types');expect(router.currentRoute.value.path).toBe('/device-types')
})

it('未接协议和工业格式不会保存；默认配置草稿与模板边界明确，取消零写返回目录',async()=>{
 const port=transport();await setup(port);await fillCreate();expect(wrapper!.getComponent(DeviceTypePrivateTemplates).props('mode')).toBe('import');expect(button('输入产品ID').attributes('disabled')).toBeDefined();expect(wrapper!.getComponent(ElSwitch).props('disabled')).toBe(false)
 wrapper!.getComponent(ElSwitch).vm.$emit('update:modelValue',true);await flushPromises()
 expect(port.create).not.toHaveBeenCalled()
 expect(wrapper!.findAllComponents(ElSelect).find(select=>select.props('ariaLabel')==='默认数据流消息格式')?.props('modelValue')).toBe('')
 expect(wrapper!.findAllComponents(ElSwitch).find(toggle=>toggle.props('ariaLabel')==='设为默认TCP目标配置')?.props('modelValue')).toBe(false)
 const draft={...typeProfileDraft(),name:'合法类型',deviceKind:'DIRECT',networkType:'WIFI',payloadProtocol:'STANDARD',defaultStream:true};expect(()=>prepareTypeCreation(project,draft)).toThrow('请选择已接入');expect(()=>prepareTypeCreation(project,{...draft,initialFormat:'MODBUS_RTU'})).toThrow('请选择已接入');expect(()=>prepareTypeCreation(project,{...draft,defaultStream:false,payloadProtocol:'UNSUPPORTED'})).toThrow('已接入');await button('取消').trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe('/device-types');expect(port.create).not.toHaveBeenCalled()
})

it('创建响应未知仅查同一原键，404仍未知禁重发和导航，查到后读取实际详情',async()=>{
 const port=transport();port.read.mockRejectedValueOnce(new http.ApiError('创建后的读取失败',404)).mockResolvedValue(profile());port.recover.mockRejectedValueOnce(new http.ApiError('未找到',404)).mockResolvedValue({deviceTypeId:id,deleted:false});await setup(port);await fillCreate();await button('创建').trigger('click');await flushPromises();const original=port.create.mock.calls[0]![0]
 expect(input('类型名称').element.value).toBe(' 已建类型 ');expect(button('创建').attributes('disabled')).toBeDefined();await router.push('/device-types');expect(router.currentRoute.value.path).toBe('/device-types/create');await button('核对原创建请求').trigger('click');await flushPromises();expect(wrapper!.text()).toContain('仍保持未知');expect(port.create).toHaveBeenCalledTimes(1);await button('核对原创建请求').trigger('click');await flushPromises();expect(port.recover.mock.calls.every(call=>call[0]===original)).toBe(true);expect(port.create).toHaveBeenCalledTimes(1);expect(router.currentRoute.value.path).toBe(`/device-types/${id}`)
})

it('POST409保留原键，原创建已删除只报告原件终态，本页不可再次创建',async()=>{
 const port=transport();port.create.mockRejectedValue(new http.ApiError('原键结果需要核对',409));port.recover.mockResolvedValue({deviceTypeId:id,deleted:true});await setup(port);await fillCreate();await button('创建').trigger('click');await flushPromises();await button('核对原创建请求').trigger('click');await flushPromises();expect(wrapper!.text()).toContain('该类型现已删除');expect(button('创建').attributes('disabled')).toBeDefined();await button('创建').trigger('click');expect(port.create).toHaveBeenCalledTimes(1);expect(port.read).not.toHaveBeenCalled();await button('取消').trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe('/device-types')
})

it('已发布类型从修改信息保存名称和描述，接入配置只读并保留原回读合同',async()=>{
 const before=profile('PUBLISHED'),after=profile('PUBLISHED',{type:{...before.type,name:'新的显示名称'},description:'改后说明',revision:'1',profileToken:'b'.repeat(64)}),port=transport(before)
 port.read.mockResolvedValueOnce(before).mockResolvedValue(after);port.update.mockResolvedValue(after)
 await setup(port,`/device-types/${id}?tab=settings&keep=original`);await button('编辑').trigger('click');await flushPromises()
 expect(document.body.textContent).toContain('修改信息')
 expect(input('编辑类型名称').attributes('disabled')).toBeUndefined()
 expect([...document.querySelectorAll<HTMLInputElement>('input[type=radio]')].every(radio=>radio.disabled)).toBe(true)
 expect(document.body.textContent).toContain('已发布类型的接入配置只读')
 await input('编辑类型名称').setValue('新的显示名称');await input('编辑类型描述').setValue(' 改后说明 ');await button('保存').trigger('click');await flushPromises()
 expect(port.update).toHaveBeenCalledTimes(1)
 expect(port.update.mock.calls[0]![0].body).toEqual({name:'新的显示名称',description:'改后说明',tags:{'区域':'华南'},revision:'0',profileToken:'a'.repeat(64)})
 const feedback=document.querySelector<HTMLElement>('.el-message--success')
 expect(feedback?.textContent).toContain('设备类型资料已保存')
 expect(feedback?.style.top).toBe('64px')
 expect(wrapper!.text()).not.toContain('设备类型资料已保存')
 expect(wrapper!.getComponent(DeviceTypeSettings).props('profile').type.name).toBe('新的显示名称')
 expect(router.currentRoute.value.query).toEqual({tab:'settings',keep:'original'})
})

it('草稿按资格开放接入三项，选择网关后同一次保存完整接入配置',async()=>{
 const before=profile(),after=profile('DRAFT',{type:{...before.type,deviceKind:'GATEWAY',payloadProtocol:'STANDARD_GATEWAY'},revision:'1',profileToken:'b'.repeat(64)})
 const port=transport(before)
 port.read.mockResolvedValueOnce(before).mockResolvedValue(after);port.update.mockResolvedValue(after)
 port.accessEditability.mockResolvedValueOnce('ASSOCIATED_DEVICES')
 await setup(port,`/device-types/${id}`);await button('编辑').trigger('click');await flushPromises()
 expect(document.body.textContent).toContain('类型已关联设备，接入配置只读')
 await button('取消').trigger('click');await button('编辑').trigger('click');await flushPromises()
 const gateway=[...document.querySelectorAll<HTMLInputElement>('input[type=radio]')].find(radio=>radio.value==='GATEWAY')!
 expect(gateway.disabled).toBe(false)
 await new DOMWrapper(gateway).setValue(true);await flushPromises()
 expect(document.body.textContent).toContain('ThingsLink 标准网关协议')
 await button('保存').trigger('click');await flushPromises()
 expect(port.update).toHaveBeenCalledTimes(1)
 expect(port.update.mock.calls[0]![0].body.access).toEqual({deviceKind:'GATEWAY',payloadProtocol:'STANDARD_GATEWAY',networkType:'WIFI'})
 expect(wrapper!.text()).toContain('设备接入类型：网关')
})

it('版本冲突保留原草稿，只读当前后显式采用新基准，不自动再PUT',async()=>{
 const before=profile(),current=profile('DRAFT',{description:'当前资料',revision:'3',profileToken:'c'.repeat(64)}),port=transport(before);port.update.mockRejectedValue(new http.ApiError('版本冲突',409));port.read.mockResolvedValueOnce(before).mockResolvedValue(current);await setup(port,`/device-types/${id}?tab=settings`);wrapper!.getComponent(DeviceTypeSettings).vm.$emit('edit','name');await flushPromises();await input('编辑类型描述').setValue('原草稿');await button('保存').trigger('click');await flushPromises();expect(document.body.textContent).toContain('原草稿已保留');expect(input('编辑类型描述').element.value).toBe('原草稿');await button('读取当前资料').trigger('click');await flushPromises();await button('使用当前版本继续编辑').trigger('click');await flushPromises();expect(input('编辑类型描述').element.value).toBe('原草稿');expect(input('编辑类型描述').attributes('disabled')).toBeUndefined();expect(port.update).toHaveBeenCalledTimes(1);await button('取消').trigger('click');expect(port.update).toHaveBeenCalledTimes(1)
})

it('未知保存读到同值仍不报原操作成功，成员只读核对后显式结束才解导航锁',async()=>{
 const before=profile(),current=profile('DRAFT',{description:'未知草稿',revision:'1',profileToken:'b'.repeat(64)}),port=transport(before);port.update.mockResolvedValue(current);port.read.mockResolvedValueOnce(before).mockRejectedValueOnce(new http.ApiError('保存后的读取失败',409)).mockResolvedValue(current);await setup(port,`/device-types/${id}?tab=settings`);wrapper!.getComponent(DeviceTypeSettings).vm.$emit('edit','name');await flushPromises();await input('编辑类型描述').setValue('未知草稿');await button('保存').trigger('click');await flushPromises();await button('读取当前资料').trigger('click');await flushPromises();expect(document.body.textContent).toContain('当前资料不能证明原写入');await button('关闭').trigger('click');await router.push('/device-types');expect(router.currentRoute.value.path).toBe(`/device-types/${id}`)
 session.user={...session.user!,projectRole:'VIEWER'};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];await flushPromises();await button('核对资料保存结果').trigger('click');await flushPromises();expect(port.read).toHaveBeenCalledTimes(3);await button('已核对，结束本次操作').trigger('click');await flushPromises();expect(wrapper!.text()).toContain('原保存结果仍未确认');expect(port.update).toHaveBeenCalledTimes(1);await router.push('/device-types');expect(router.currentRoute.value.path).toBe('/device-types')
})

it('切scope清私有原意图且迟到创建不跳旧详情；真实transport固定写键和恢复头，合法旧枚举可读',async()=>{
 let finish!:(profile:TypeProfile)=>void;const pending=new Promise<TypeProfile>(resolve=>{finish=resolve}),port=transport();port.create.mockReturnValue(pending);await setup(port);await fillCreate();await button('创建').trigger('click');session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'},{id:other,myRole:'OWNER',status:'ACTIVE'}];session.user={...session.user!,currentProjectId:other};await flushPromises();finish(profile());await flushPromises();expect(input('类型名称').element.value).toBe('');expect(wrapper!.text()).not.toContain('创建结果尚未确认');expect(port.read).not.toHaveBeenCalled();expect(router.currentRoute.value.path).toBe('/device-types/create');session.user={...session.user!,projectRole:'VIEWER'};session.projects=[{id:other,myRole:'VIEWER',status:'ACTIVE'}];await flushPromises();await button('创建').trigger('click');expect(port.create).toHaveBeenCalledTimes(1)
 const source=profile(),create=prepareTypeCreation(project,{...typeProfileDraft(source),deviceKind:'DIRECT',networkType:'WIFI',payloadProtocol:'STANDARD',defaultStream:false}),update=prepareTypeUpdate(project,source,typeProfileDraft(source)),spy=vi.spyOn(http,'api');spy.mockResolvedValueOnce(raw()).mockResolvedValueOnce(raw()).mockResolvedValueOnce({deviceTypeId:id,deleted:false});const signal=new AbortController().signal;await typeProfileTransport.create(create,signal);await typeProfileTransport.update(update,signal);await typeProfileTransport.recover(create,signal);expect(spy.mock.calls[0]![1]?.headers).toEqual({'Idempotency-Key':create.key});expect(spy.mock.calls[1]![1]?.headers).toEqual({'Idempotency-Key':update.key});expect(spy.mock.calls[2]![1]?.headers).toEqual({'Original-Request-Key':create.key})
 expect(decodeTypeProfile({...raw(),type:{...raw().type,networkType:'BLE'}},project,id).type.networkType).toBe('BLE');expect(decodeTypeProfile({...raw(),type:{...raw().type,deviceKind:'SUB_DEVICE',payloadProtocol:'MODBUS_TCP_PASSTHROUGH',networkType:'RS485'}},project,id).type.payloadProtocol).toBe('MODBUS_TCP_PASSTHROUGH');expect(prepareTypeUpdate(project,profile('PUBLISHED'),{...typeProfileDraft(source),name:'允许改名'}).body.name).toBe('允许改名')
})

it('模型编辑与设置删除锁接入详情导航，明确删除回执后返回目录',async()=>{
 const port=transport();await setup(port,`/device-types/${id}?tab=functions`);expect(wrapper!.findComponent(DeviceTypePublication).exists()).toBe(false);const properties=wrapper!.getComponent(DeviceTypeProperties);properties.vm.$emit('locked',true);await flushPromises();expect(properties.props('disabled')).toBe(false);expect(wrapper!.getComponent(DeviceTypeEvents).props('disabled')).toBe(true);expect(button('查看功能定义文档').attributes('disabled')).toBeDefined();await router.replace({query:{tab:'settings'}});expect(router.currentRoute.value.query.tab).toBe('functions');properties.vm.$emit('locked',false);await flushPromises();await router.replace({query:{tab:'settings'}});await flushPromises();const settings=wrapper!.getComponent(DeviceTypeSettings);settings.vm.$emit('locked',true);await flushPromises();expect(settings.props('disabled')).toBe(false);await router.push('/device-types');expect(router.currentRoute.value.path).toBe(`/device-types/${id}`);settings.vm.$emit('locked',false);await flushPromises();settings.vm.$emit('removed');await flushPromises();expect(router.currentRoute.value.path).toBe('/device-types')
})

it('统一扩展宿主保留未知锁，归档只读仍阻止导航并不反向禁用自身',async()=>{
 const port=transport();await setup(port,`/device-types/${id}?tab=extensions`);const extensions=wrapper!.getComponent(DeviceTypeExtensions);expect(extensions.props('typeId')).toBe(id);extensions.vm.$emit('locked',true);await flushPromises();expect(extensions.props('disabled')).toBe(false);await router.replace({query:{tab:'functions'}});expect(router.currentRoute.value.query.tab).toBe('extensions');session.projects=[{id:project,myRole:'OWNER',status:'ARCHIVED'}];await flushPromises();expect(extensions.props('disabled')).toBe(true);await router.push('/device-types');expect(router.currentRoute.value.query.tab).toBe('extensions');extensions.vm.$emit('locked',false);await flushPromises();await router.push('/device-types');expect(router.currentRoute.value.path).toBe('/device-types')
})

it('已发布模型在功能定义中保留表格和查看入口，隐藏单独的版本发布工具',async()=>{
 const port=transport(profile('PUBLISHED'));await setup(port,`/device-types/${id}?tab=functions`)
 expect(wrapper!.findComponent(DeviceTypeModelCandidate).exists()).toBe(false)
 expect(wrapper!.findComponent(DeviceTypePublication).exists()).toBe(false)
 expect(wrapper!.findComponent(DeviceTypeDefinitionBatch).exists()).toBe(false)
 for(const table of [DeviceTypeProperties,DeviceTypeEvents,DeviceTypeCommands])expect(wrapper!.getComponent(table).props('typeStatus')).toBe('PUBLISHED')
 expect(button('查看功能定义 TSL').element.disabled).toBe(false)
 expect(button('查看功能定义文档').element.disabled).toBe(false)
 expect(port.update).not.toHaveBeenCalled()
})

it('设置统一宿主隐藏产品凭据入口，锁阻止名称编辑和导航且自身可核对',async()=>{
 const port=transport(profile('PUBLISHED'));await setup(port,`/device-types/${id}?tab=settings`);const settings=wrapper!.getComponent(DeviceTypeSettings);expect(wrapper!.findComponent(DeviceTypeProductCredentials).exists()).toBe(false);expect(settings.props('profile')).toEqual(profile('PUBLISHED'));settings.vm.$emit('locked',true);await flushPromises();expect(settings.props('disabled')).toBe(false);expect(button('编辑').attributes('disabled')).toBeDefined();await button('编辑').trigger('click');expect(document.querySelector('input[aria-label="编辑类型名称"]')).toBeNull();await router.replace({query:{tab:'functions'}});expect(router.currentRoute.value.query.tab).toBe('settings');settings.vm.$emit('locked',false);await flushPromises();await button('编辑').trigger('click');await flushPromises();expect(settings.props('disabled')).toBe(true);await button('取消').trigger('click');await flushPromises();expect(settings.props('disabled')).toBe(false);expect(port.update).not.toHaveBeenCalled()
})

it('设置宿主失写权仍保留只读核对锁，不自动解导航或提交',async()=>{
 session.user={...session.user!,permissions:['device:read','device:update']}
 const presence=decodePresenceSettings({deviceTypeId:id,online:{deviceTypeId:id,onlineTimeoutMinutes:null,revision:'0'},activity:{deviceTypeId:id,configured:false,activeTimeoutMinutes:null,version:'0'}},id)
 const read=vi.spyOn(typeSettingsAggregateTransport,'readPresence').mockResolvedValue(presence)
 const write=vi.spyOn(typeSettingsAggregateTransport,'changePresence').mockRejectedValue(new http.ApiError('响应未知',0,undefined,undefined,true))
 vi.spyOn(currentProductPublicationTransport,'owned').mockResolvedValue({items:[],total:'0',available:true})
 const port=transport(profile('PUBLISHED'));await setup(port,`/device-types/${id}?tab=settings`,{realSettings:true})
 const onlineSettings=()=>wrapper!.findAll('section').find(section=>section.find('h3').text()==='设备在线及活跃设置')!.get('button')
 await onlineSettings().trigger('click');await flushPromises()
 await input('在线超时时间（分钟）').setValue('10')
 await button('保存').trigger('click');await flushPromises()
 expect(write).toHaveBeenCalledTimes(1)
 session.user={...session.user!,projectRole:'VIEWER',permissions:['device:read']}
 session.projects=[{id:project,myRole:'VIEWER',status:'ARCHIVED'}];await flushPromises()
 expect(wrapper!.findAll('button').some(control=>control.text()==='保存')).toBe(false)
 await router.push('/device-types');expect(router.currentRoute.value.query.tab).toBe('settings')
 await button('读取当前整组设置').trigger('click');await flushPromises()
 expect(read).toHaveBeenCalledTimes(2);expect(write).toHaveBeenCalledTimes(1)
 await button('采用当前设置并结束核对').trigger('click');await flushPromises()
 await onlineSettings().trigger('click');await flushPromises()
 expect(input('在线超时时间（分钟）').element.disabled).toBe(true)
 expect(button('保存').element.disabled).toBe(true)
 await button('保存').trigger('click');expect(write).toHaveBeenCalledTimes(1)
 await button('取消').trigger('click');await flushPromises()
 await router.push('/device-types');expect(router.currentRoute.value.path).toBe('/device-types')
 expect(port.update).not.toHaveBeenCalled()
})

it('导入工具锁阻止离开与其它定义写，成功刷新定义但保留原回执宿主',async()=>{
 const port=transport();await setup(port,`/device-types/${id}?tab=functions`);const importer=wrapper!.getComponent(DeviceTypeDefinitionImport),standard=wrapper!.getComponent(DeviceTypeTslPreview);expect(importer.props('toolbar')).toBe(true);expect(standard.props('toolbar')).toBe(true);importer.vm.$emit('locked',true);await flushPromises();expect(importer.props('disabled')).toBe(false);expect(standard.props('disabled')).toBe(true);expect(wrapper!.getComponent(DeviceTypeProperties).props('disabled')).toBe(true);await router.push('/device-types');expect(router.currentRoute.value.path).toBe(`/device-types/${id}`);importer.vm.$emit('locked',false);await flushPromises();const original=importer.vm,properties=wrapper!.getComponent(DeviceTypeProperties).vm,reads=port.read.mock.calls.length;importer.vm.$emit('changed');await flushPromises();expect(wrapper!.getComponent(DeviceTypeDefinitionImport).vm).toBe(original);expect(wrapper!.getComponent(DeviceTypeProperties).vm).not.toBe(properties);expect(port.read).toHaveBeenCalledTimes(reads)
})

it('初始数据流和TCP目标以同一创建POST提交，RS232/422媒介可保真回读',async()=>{
 const serial=decodeTypeProfile({...raw(),type:{...raw().type,deviceKind:'SUB_DEVICE',networkType:'RS232'}},project,id),port=transport(serial);await setup(port);await fillCreate();await wrapper!.get('input[value="SUB_DEVICE"]').setValue();wrapper!.findAllComponents(ElSelect).find(item=>item.props('ariaLabel')==='设备通信方式')!.vm.$emit('update:modelValue','RS232');wrapper!.getComponent(ElSwitch).vm.$emit('update:modelValue',true);await flushPromises();wrapper!.findAllComponents(ElSelect).find(item=>item.props('ariaLabel')==='默认数据流消息格式')!.vm.$emit('update:modelValue','JSON');wrapper!.findAllComponents(ElSwitch)[1]!.vm.$emit('update:modelValue',true);await flushPromises();await button('创建').trigger('click');await flushPromises();expect(port.create).toHaveBeenCalledTimes(1);expect(port.create.mock.calls[0]![0].body).toMatchObject({deviceKind:'SUB_DEVICE',networkType:'RS232',initialDataStream:{format:'JSON',tcpTarget:true}});expect(router.currentRoute.value.path).toBe(`/device-types/${id}`);expect((await port.read.mock.results.at(-1)!.value).type.networkType).toBe('RS232');expect(decodeTypeProfile({...raw(),type:{...raw().type,deviceKind:'SUB_DEVICE',networkType:'RS422'}},project,id).type.networkType).toBe('RS422')
})
it('初始数据流创建未知保留原格式与键，只GET原创建身份且不补发布或重发',async()=>{
 const port=transport();port.create.mockRejectedValue(new http.ApiError('网络结果未知',0,undefined,undefined,true));port.recover.mockRejectedValueOnce(new http.ApiError('尚未找到',404)).mockResolvedValue({deviceTypeId:id,deleted:false});await setup(port);await fillCreate();wrapper!.getComponent(ElSwitch).vm.$emit('update:modelValue',true);await flushPromises();wrapper!.findAllComponents(ElSelect).find(item=>item.props('ariaLabel')==='默认数据流消息格式')!.vm.$emit('update:modelValue','TEXT');await flushPromises();await button('创建').trigger('click');await flushPromises();const original=port.create.mock.calls[0]![0];expect(original.body.initialDataStream).toEqual({format:'TEXT',tcpTarget:false});session.user={...session.user!};await flushPromises();await router.push('/device-types');expect(router.currentRoute.value.path).toBe('/device-types/create');await button('核对原创建请求').trigger('click');await flushPromises();expect(wrapper!.text()).toContain('仍保持未知');expect(port.create).toHaveBeenCalledTimes(1);await button('核对原创建请求').trigger('click');await flushPromises();expect(port.recover.mock.calls.every(call=>call[0]===original)).toBe(true);expect(port.create).toHaveBeenCalledTimes(1);expect(router.currentRoute.value.path).toBe(`/device-types/${id}`)
})


it('其它及自定义分类可一次创建并保真回读，清楚提示标准报文未适配',async()=>{
 for(const [kind,protocol] of [['DIRECT','OTHER'],['SUB_DEVICE','OTHER'],['GATEWAY','CUSTOM_GATEWAY']]){
  const value=decodeTypeProfile({...raw(),type:{...raw().type,deviceKind:kind,payloadProtocol:protocol}},project,id),port=transport(value);await setup(port);await fillCreate();await wrapper!.get(`input[value="${kind}"]`).setValue();await flushPromises();wrapper!.findAllComponents(ElSelect).find(item=>item.props('ariaLabel')==='设备通信方式')!.vm.$emit('update:modelValue','WIFI');wrapper!.findAllComponents(ElSelect).find(item=>item.props('ariaLabel')==='设备接入协议')!.vm.$emit('update:modelValue',protocol);await flushPromises();expect(wrapper!.text()).toContain('尚无报文适配器');expect(port.create).not.toHaveBeenCalled();await button('创建').trigger('click');await flushPromises();expect(port.create).toHaveBeenCalledTimes(1);expect(port.create.mock.calls[0]![0].body).toMatchObject({deviceKind:kind,payloadProtocol:protocol});expect(router.currentRoute.value.path).toBe(`/device-types/${id}`);expect((await port.read.mock.results.at(-1)!.value).type.payloadProtocol).toBe(protocol);wrapper!.unmount();wrapper=undefined;document.body.innerHTML='';
 }
 expect(()=>prepareTypeCreation(project,{...typeProfileDraft(),name:'非法',deviceKind:'GATEWAY',networkType:'WIFI',payloadProtocol:'OTHER',defaultStream:false})).toThrow('已接入');expect(()=>prepareTypeCreation(project,{...typeProfileDraft(),name:'非法',deviceKind:'DIRECT',networkType:'WIFI',payloadProtocol:'CUSTOM_GATEWAY',defaultStream:false})).toThrow('已接入')
})


it('标准功能工具保留独立锁，设置页不默认挂产品识别码或凭据面板',async()=>{
 const port=transport();await setup(port,`/device-types/${id}?tab=functions`);const material=wrapper!.getComponent(DeviceTypeTslPreview);material.vm.$emit('locked',true);await flushPromises();expect(material.props('disabled')).toBe(false);expect(wrapper!.getComponent(DeviceTypeDefinitionImport).props('disabled')).toBe(true);expect(wrapper!.getComponent(DeviceTypeProperties).props('disabled')).toBe(true);await router.push('/devices');expect(router.currentRoute.value.path).toBe(`/device-types/${id}`);const uid=material.vm.$.uid,reads=port.read.mock.calls.length;material.vm.$emit('changed');await flushPromises();expect(wrapper!.getComponent(DeviceTypeTslPreview).vm.$.uid).toBe(uid);expect(port.read).toHaveBeenCalledTimes(reads);material.vm.$emit('locked',false);await flushPromises();await router.replace({query:{tab:'settings'}});await flushPromises();expect(wrapper!.findComponent(DeviceTypeProductIdentifier).exists()).toBe(false);expect(wrapper!.findComponent(DeviceTypeProductCredentials).exists()).toBe(false);expect(wrapper!.findComponent(DeviceTypeSettings).exists()).toBe(true)
})

it('扩展设置只在扩展页挂载，切换类型不会继承旧宿主锁',async()=>{
 const port=transport();await setup(port,`/device-types/${id}?tab=functions`);expect(wrapper!.findComponent(DeviceTypeExtensions).exists()).toBe(false);await router.replace({query:{tab:'extensions'}});await flushPromises();const extensions=wrapper!.getComponent(DeviceTypeExtensions);extensions.vm.$emit('locked',true);await flushPromises();await router.push('/devices');expect(router.currentRoute.value.query.tab).toBe('extensions');extensions.vm.$emit('locked',false);await flushPromises();await router.push('/devices');expect(router.currentRoute.value.path).toBe('/devices');expect(port.update).not.toHaveBeenCalled()
})

it('设置不默认挂在线策略，变更回调刷新真实资料而不制造保存成功',async()=>{
 const port=transport();await setup(port,`/device-types/${id}?tab=settings`);expect(wrapper!.findComponent(DeviceTypeOnlinePolicy).exists()).toBe(false);const settings=wrapper!.getComponent(DeviceTypeSettings);const before=port.read.mock.calls.length;settings.vm.$emit('changed');await flushPromises();expect(port.read).toHaveBeenCalledTimes(before+1);expect(port.update).not.toHaveBeenCalled();expect(wrapper!.text()).not.toContain('设备类型资料已保存')
})

it('创建页私有模板仍传播锁，但类型设置不展示额外私有模板入口',async()=>{
 const p=transport();await setup(p);const templates=wrapper!.getComponent(DeviceTypePrivateTemplates);expect(templates.props('mode')).toBe('import');templates.vm.$emit('locked',true);await flushPromises();expect(button('创建').attributes('disabled')).toBeDefined();await router.push('/device-types');expect(router.currentRoute.value.path).toBe('/device-types/create');templates.vm.$emit('locked',false);await flushPromises();templates.vm.$emit('created',id);await flushPromises();expect(router.currentRoute.value.path).toBe(`/device-types/${id}`);await router.replace({path:`/device-types/${id}`,query:{tab:'settings'}});await flushPromises();expect(wrapper!.findComponent(DeviceTypePrivateTemplates).exists()).toBe(false);expect(wrapper!.findComponent(DeviceTypeSettings).exists()).toBe(true)
})

it('文档按按钮打开且弹窗阻止跨Tab，关闭后恢复导航',async()=>{
 const port=transport();await setup(port,`/device-types/${id}?tab=functions`);expect(wrapper!.findComponent(DeviceTypeModelDocumentation).exists()).toBe(false);await button('查看功能定义文档').trigger('click');await flushPromises();expect(wrapper!.getComponent(DeviceTypeModelDocumentation).props('typeId')).toBe(id);await router.replace({query:{tab:'settings'}});expect(router.currentRoute.value.query.tab).toBe('functions');expect(button('编辑').attributes('disabled')).toBeDefined();const dialog=wrapper!.findAllComponents(ElDialog).find(value=>value.props('title')==='查看功能定义文档');expect(dialog).toBeDefined();dialog!.vm.$emit('update:modelValue',false);await flushPromises();await router.replace({query:{tab:'settings'}});expect(router.currentRoute.value.query.tab).toBe('settings')
})


it('属性保存并继续保持自身空表单，兄弟表刷新且未确认组件先保留再延迟刷新',async()=>{
 const context={deviceTypeId:id,versionId:project,versionNumber:'1.0.0',token:'a'.repeat(64)},next={...context,versionId:other,versionNumber:'2.0.0',token:'b'.repeat(64)}
 const saved=decodeProperty(new TextEncoder().encode(JSON.stringify({id:other,deviceTypeId:id,name:'新属性',propertyKey:'new_field',accessType:'REPORT',dataType:'TEXT',sortOrder:0,presentation:null,defaultValue:null,description:null})),id)
 const reads=vi.spyOn(propertyTransport,'definitionList').mockResolvedValueOnce({items:[],context:{...context,typeStatus:'PUBLISHED'}}).mockResolvedValue({items:[saved],context:{...next,typeStatus:'PUBLISHED'}})
 const write=vi.spyOn(propertyTransport,'write').mockResolvedValue(saved)
 const port=transport(profile('PUBLISHED'));await setup(port,`/device-types/${id}?tab=functions`,{realProperties:true})
 const properties=wrapper!.getComponent(DeviceTypeProperties),events=wrapper!.getComponent(DeviceTypeEvents),commands=wrapper!.getComponent(DeviceTypeCommands),sourceUid=properties.vm.$.uid,eventUid=events.vm.$.uid,commandUid=commands.vm.$.uid
 await button('添加属性').trigger('click');await flushPromises();await input('属性名称').setValue('新属性');await input('属性标识符').setValue('new_field');properties.findAllComponents(ElSelect).find(item=>item.props('ariaLabel')==='属性数据类型')!.vm.$emit('update:modelValue','TEXT');await flushPromises();await button('保存并继续添加').trigger('click');await flushPromises()
 expect(write).toHaveBeenCalledTimes(1);expect(write.mock.calls[0]![0].modelEdit).toEqual(context);expect(reads).toHaveBeenCalledTimes(2);expect(wrapper!.getComponent(DeviceTypeProperties).vm.$.uid).toBe(sourceUid);expect(input('属性名称').element.value).toBe('');expect(wrapper!.getComponent(DeviceTypeEvents).vm.$.uid).not.toBe(eventUid);expect(wrapper!.getComponent(DeviceTypeCommands).vm.$.uid).not.toBe(commandUid)
 const unknown=wrapper!.getComponent(DeviceTypeEvents),unknownUid=unknown.vm.$.uid;unknown.vm.$emit('locked',true);await flushPromises();wrapper!.getComponent(DeviceTypeDefinitionImport).vm.$emit('changed');await flushPromises();expect(wrapper!.getComponent(DeviceTypeProperties).vm.$.uid).toBe(sourceUid);expect(wrapper!.getComponent(DeviceTypeEvents).vm.$.uid).toBe(unknownUid);expect(input('属性名称').element.value).toBe('')
 await button('取消').trigger('click');await flushPromises();expect(wrapper!.getComponent(DeviceTypeProperties).vm.$.uid).not.toBe(sourceUid);expect(wrapper!.getComponent(DeviceTypeEvents).vm.$.uid).toBe(unknownUid);unknown.vm.$emit('locked',false);await flushPromises();expect(wrapper!.getComponent(DeviceTypeEvents).vm.$.uid).not.toBe(unknownUid);expect(write).toHaveBeenCalledTimes(1)
})


it('应用配置传当前类型并接全程锁，禁止标题编辑和离开且不自禁恢复',async()=>{
 const port=transport(profile('PUBLISHED'));await setup(port,`/device-types/${id}?tab=apps`);const apps=wrapper!.getComponent(DeviceTypeApplications);expect(apps.props('typeId')).toBe(id);expect(apps.props('disabled')).toBe(false);apps.vm.$emit('locked',true);await flushPromises();expect(apps.props('disabled')).toBe(false);expect(button('编辑').attributes('disabled')).toBeDefined();await button('编辑').trigger('click');expect(document.querySelector('input[aria-label="编辑类型名称"]')).toBeNull();await router.replace({query:{tab:'functions'}});expect(router.currentRoute.value.query.tab).toBe('apps');session.projects=[{id:project,myRole:'OWNER',status:'ARCHIVED'}];await flushPromises();expect(apps.props('disabled')).toBe(false);await router.push('/device-types');expect(router.currentRoute.value.query.tab).toBe('apps');apps.vm.$emit('locked',false);await flushPromises();await router.push('/device-types');expect(router.currentRoute.value.path).toBe('/device-types');expect(port.update).not.toHaveBeenCalled()
})
