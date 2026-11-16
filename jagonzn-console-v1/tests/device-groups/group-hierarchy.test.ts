import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElMessage} from 'element-plus'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'
import Directory from '../../src/features/device-groups/DeviceGroupDirectory.vue'
import {decodeGroup,decodeGroupPage,groupDraft,prepareGroup,groupMatchesIntent,type DeviceGroup,type GroupIntent,type GroupQuery,type GroupTransport} from '../../src/features/device-groups/device-group-api'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
const extras=vi.hoisted(()=>({enabled:undefined as boolean|undefined}))
vi.mock('../../src/core/replica-scope',async importOriginal=>{
 const actual=await importOriginal<typeof import('../../src/core/replica-scope')>()
 return {...actual,get THINGSLINK_EXTRAS_VISIBLE(){return extras.enabled??actual.THINGSLINK_EXTRAS_VISIBLE}}
})
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=id(100),other=id(101),root=id(1),child=id(2)
const group=(key=root,parentId:string|null=null,extra:Record<string,unknown>={})=>({id:key,name:key===root?'园区':'楼宇',description:null,type:'STATIC',rule:null,createdAt:'2026-10-29T00:00:00Z',parentId,color:null,tags:{},sortOrder:0,revision:'0',...extra}) as DeviceGroup
const wrappers:VueWrapper[]=[]
let router:ReturnType<typeof createRouter>
const list=vi.fn(),read=vi.fn(),write=vi.fn(),transport:GroupTransport={list,read,write}
function owner(){session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]}
function render(){const wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[ElementPlus,router],stubs:{DeviceGroupMembers:true}}});wrappers.push(wrapper);return wrapper.getComponent(Directory)}
function button(label:string){const node=[...document.querySelectorAll<HTMLButtonElement>('button')].find(value=>value.textContent?.trim()===label);expect(node,label).toBeDefined();return node!}
async function click(label:string){button(label).click();await flushPromises()}
type DirectoryWrapper=ReturnType<typeof render>
async function enter(wrapper:DirectoryWrapper){await wrapper.get('button.group-card').trigger('click');await flushPromises()}
async function settings(wrapper:DirectoryWrapper){await wrapper.get('[id="tab-settings"]').trigger('click');await flushPromises()}
async function color(_wrapper:DirectoryWrapper,value:string|null){document.querySelector<HTMLButtonElement>('[aria-label="组颜色"]')!.click();await flushPromises();expect(document.querySelector('.group-color-drawer')).not.toBeNull();document.querySelector<HTMLButtonElement>(`[aria-label="${value?`颜色 ${value}`:'清除颜色'}"]`)!.click();await flushPromises()}
async function input(label:string,value:string){const node=document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);expect(node,label).not.toBeNull();node!.value=value;node!.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises()}
function page(query:GroupQuery,values:DeviceGroup[]=[group()]){return {items:values.map(value=>({group:value,hasChildren:value.id===root,deviceCount:value.type==='DYNAMIC'?3:1,childCount:value.id===root?1:0})),total:values.length,page:query.page,size:query.size,hasMore:false}}
beforeEach(async()=>{router=createRouter({history:createMemoryHistory(),routes:[{path:'/device-groups/:groupId?',component:Directory,props:{transport}}]});await router.push('/device-groups');vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;owner();list.mockImplementation((_project,query)=>Promise.resolve(page(query,query.parentId===root?[group(child,root)]:[group()])));read.mockImplementation((_project,key)=>Promise.resolve(group(key,key===child?root:null)));write.mockImplementation((intent:GroupIntent)=>Promise.resolve(intent.kind==='delete'?undefined:group(intent.kind==='create'?id(3):intent.groupId!,intent.body?.parentId??null,{...intent.body,revision:intent.kind==='create'?'0':String(BigInt(intent.body!.revision!)+1n)})))})
afterEach(()=>{ElMessage.closeAll();wrappers.splice(0).forEach(w=>w.unmount());extras.enabled=undefined;session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})
it('正式层级页核父范围、总数、去重顺序及动态白名单，不把坏页当空树',()=>{
 const query={parentId:null,page:1,size:20},valid=page(query);expect(decodeGroupPage(valid,query).items[0]!.hasChildren).toBe(true)
 expect(()=>decodeGroupPage({...valid,total:2},query)).toThrow();expect(()=>decodeGroupPage({...valid,items:[{group:group(child,root),hasChildren:false,deviceCount:1,childCount:0}]},query)).toThrow();expect(()=>decodeGroupPage({...valid,extra:1},query)).toThrow()
 for(const patch of [{deviceCount:undefined},{deviceCount:-1},{childCount:0}])expect(()=>decodeGroupPage({...valid,items:[{...valid.items[0],...patch}]},query)).toThrow()
 expect(()=>decodeGroupPage({...valid,items:[valid.items[0],valid.items[0]],total:2},query)).toThrow();expect(()=>decodeGroup({...group(),sortOrder:1.5})).toThrow()
 const draft=groupDraft();draft.type='DYNAMIC';draft.rule='{"deviceTypeIds":[],"statuses":["ONLINE"],"tags":{},"tagMatch":null}';draft.name='在线';const intent=prepareGroup(project,'create',draft);if(intent.kind!=='create')throw new Error('创建意图类型不符');expect(intent.body.rule?.statuses).toEqual(['ONLINE']);expect(()=>prepareGroup(project,'create',{...draft,rule:'{"sql":"select *"}'})).toThrow()
 expect(groupMatchesIntent(group(id(3),null,{name:'在线',type:'DYNAMIC',rule:intent.body?.rule}),intent)).toBe(true)
})
it('静态和动态组卡片分别显示接口返回的设备数与子组数',async()=>{
 const query={parentId:null,page:1,size:20}
 const dynamic=group(child,null,{name:'动态验收组',type:'DYNAMIC',rule:{deviceTypeIds:[],statuses:['ONLINE'],tags:{},tagMatch:null}})
 list.mockResolvedValueOnce(decodeGroupPage(page(query,[group(),dynamic]),query))
 const wrapper=render();await flushPromises()
 const metadata=wrapper.findAll('.group-card-meta')
 expect(metadata.map(card=>card.findAll('span').map(part=>part.text()))).toEqual([
  ['1 设备','1 子组'],['3 设备','0 子组','动态组']
 ])
})
it('动态组修改信息不显示条件编辑且保存原有条件',async()=>{
 const rule={deviceTypeIds:[],statuses:['ONLINE'] as ('ONLINE')[],tags:{},tagMatch:null}
 const dynamic=group(root,null,{type:'DYNAMIC',rule})
 list.mockImplementation((_project,query)=>Promise.resolve(page(query,[dynamic])))
 read.mockResolvedValue(dynamic)
 const wrapper=render();await flushPromises();await enter(wrapper);await click('编辑')
 expect(document.querySelector('[aria-label="动态组白名单条件"]')).toBeNull()
 await input('组名称','修改后');await click('保存')
 expect(write.mock.calls[0]![0].body).toMatchObject({name:'修改后',type:'DYNAMIC',rule})
})
it('子组详情隐藏创建子组，父组选项只读取根组',async()=>{
 extras.enabled=true
 const wrapper=render()
 await flushPromises()
 await enter(wrapper)
 expect(wrapper.text()).toContain('创建子组')
 list.mockResolvedValueOnce(page({parentId:child,page:1,size:20},[]))
 await enter(wrapper)
 expect(wrapper.text()).not.toContain('创建子组')
 expect(wrapper.text()).not.toContain('子设备组')
 await settings(wrapper)
 await click('移动')
 await wrapper.get('[aria-label="选择父组"]').trigger('click')
 await flushPromises()
 expect(list).toHaveBeenLastCalledWith(project,{parentId:null,page:1,size:20},expect.any(AbortSignal))
 expect(wrapper.find('[aria-label="查看 园区 的子组"]').exists()).toBe(false)
 expect(write).not.toHaveBeenCalled()
})
it('根子组真实导航，创建取消零写，父位置与颜色标签一次保存并精确回读',async()=>{
 extras.enabled=true
 const wrapper=render();await flushPromises();expect(list).toHaveBeenLastCalledWith(project,{parentId:null,page:1,size:20},expect.any(AbortSignal));await enter(wrapper);expect(list).toHaveBeenLastCalledWith(project,{parentId:root,page:1,size:20},expect.any(AbortSignal));await click('创建子组');expect(document.body.textContent).toContain('所属父组');expect(document.body.textContent).toContain('园区');await click('取消');expect(write).not.toHaveBeenCalled()
 await click('创建子组');await input('组名称',' 子空间 ');await color(wrapper,'#ff6b6b');await wrapper.get('summary').trigger('click');await input('组顺序','3');await input('组标签名称1','区域');await input('组标签值1',' 原文 ');await click('创建');expect(write).toHaveBeenCalledTimes(1);const intent=write.mock.calls[0]![0] as GroupIntent;expect(intent.kind).toBe('create');expect(intent.body).toMatchObject({name:'子空间',parentId:root,color:'#ff6b6b',sortOrder:3,tags:{区域:' 原文 '}});expect(read).toHaveBeenCalledWith(project,id(3),expect.any(AbortSignal));expect(document.querySelector('.el-message')?.textContent).toContain('已保存设备组')
})
it('复刻界面创建时隐藏高级设置并使用静态组默认值',async()=>{
 const wrapper=render();await flushPromises();await enter(wrapper);await click('创建子组')
 expect(wrapper.find('summary').exists()).toBe(false)
 await input('组名称','普通组');await click('创建')
 const intent=write.mock.calls[0]![0] as GroupIntent
 expect(intent.body).toMatchObject({type:'STATIC',rule:null,sortOrder:0})
})
it('设备组菜单路由从详情及创建页回到目录，详情链接可重新加载',async()=>{
 const wrapper=render()
 await flushPromises()
 await enter(wrapper)
 expect(router.currentRoute.value.path).toBe('/device-groups/'+root)
 await click('创建子组')
 expect(router.currentRoute.value.query.create).toBe('1')
 await router.push('/device-groups');await flushPromises()
 expect(wrapper.text()).toContain('设备组(1)')
 expect(wrapper.text()).not.toContain('创建子组')
 await router.push('/device-groups/'+child);await flushPromises()
 expect(read).toHaveBeenCalledWith(project,child,expect.any(AbortSignal))
 expect(wrapper.text()).toContain('楼宇')
 expect(wrapper.text()).not.toContain('创建子组')
})
it('编辑和移动读取真实revision，显式清除保留其它资料，CAS拒绝后必须重新读取',async()=>{
 extras.enabled=true
 read.mockResolvedValueOnce(group(root,null,{color:'#112233',tags:{区域:'旧值'},description:'旧说明',revision:'7'})).mockResolvedValue(group(root,null,{revision:'8'}));const wrapper=render();await flushPromises();await enter(wrapper);await click('编辑');await color(wrapper,null);await input('组描述','新说明');await click('保存');expect(write).toHaveBeenCalledTimes(1);expect(write.mock.calls[0]![0].body).toMatchObject({color:null,tags:{区域:'旧值'},description:'新说明',revision:'7'})
 await settings(wrapper);await click('移动');await input('组顺序','4');write.mockRejectedValueOnce(new ApiError('当前版本已变化',409,10009));await click('确认移动');expect(write).toHaveBeenCalledTimes(2);expect(button('确认移动').disabled).toBe(true);read.mockResolvedValue(group(root,null,{revision:'8'}));await click('重新读取当前组资料');expect(button('确认移动').disabled).toBe(false);await input('组顺序','4');write.mockResolvedValueOnce(group(root,null,{sortOrder:4,revision:'9'}));read.mockResolvedValueOnce(group(root,null,{sortOrder:4,revision:'9'}));const submit=button('确认移动');submit.click();submit.click();await flushPromises();expect(write).toHaveBeenCalledTimes(3);expect(write.mock.calls[2]![0].body).toEqual({parentId:null,sortOrder:4,revision:'8'});expect(write.mock.calls[1]![0].key).not.toBe(write.mock.calls[2]![0].key)
})
it('未知创建冻结原key草稿且不重POST，局部同名读取不冒成功，scope丢弃迟到结果',async()=>{
 const wrapper=render();await flushPromises();write.mockRejectedValueOnce(new ApiError('连接中断',0,undefined,undefined,true));await click('创建设备组');await input('组名称','未知组');await click('创建');expect(write).toHaveBeenCalledTimes(1);const key=write.mock.calls[0]![0].key;expect(document.body.textContent).toContain(key);expect(button('创建').disabled).toBe(true);await click('只读核对原操作');expect(document.body.textContent).toContain('局部页不能证明全局不存在');expect(write).toHaveBeenCalledTimes(1);await click('结束本次核对');expect(button('创建设备组').disabled).toBe(true)
 let finish!:(value:DeviceGroup[])=>void;transport.order=vi.fn(()=>new Promise<DeviceGroup[]>(resolve=>{finish=resolve}));button('分组排序').click();await flushPromises();session.user={...session.user!,currentProjectId:other};session.projects=[{id:other,myRole:'OWNER',status:'ACTIVE'}];await flushPromises();finish([group(root,null,{name:'旧项目迟到'})]);await flushPromises();expect(wrapper.text()).not.toContain('旧项目迟到');expect(write).toHaveBeenCalledTimes(1);transport.order=undefined
})
it('非空拒删保持当前组，取消不写；VIEWER与归档无管理入口，权限撤销清编辑态',async()=>{
 const wrapper=render();await flushPromises();await enter(wrapper);await settings(wrapper)
 expect(wrapper.findAll('.group-settings h3').map(heading=>heading.text())).toEqual(['设备组描述','标签','移除设备组'])
 expect(wrapper.find('.group-settings-extras').exists()).toBe(false)
 expect(wrapper.get('device-group-members-stub').isVisible()).toBe(false)
 await click('移除设备组');await click('取消');expect(write).not.toHaveBeenCalled();await click('移除设备组');write.mockRejectedValueOnce(new ApiError('仍有设备不能移除',409,10009));await click('确定');expect(write).toHaveBeenCalledTimes(1);expect(document.body.textContent).toContain('仍有设备不能移除');expect(wrapper.text()).toContain('园区');await click('取消');session.user={...session.user!,projectRole:'VIEWER'};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];await flushPromises();expect(wrapper.findAll('button').some(node=>node.text()==='编辑')).toBe(false)
 owner();session.projects=[{id:project,myRole:'OWNER',status:'ARCHIVED'}];await flushPromises();expect(wrapper.findAll('button').some(node=>node.text()==='创建设备组')).toBe(false);owner();await flushPromises();await click('编辑');session.user=null;await flushPromises();expect(document.body.textContent).not.toContain('修改信息');expect(wrapper.text()).toContain('没有此内容的读取权限');expect(write).toHaveBeenCalledTimes(1)
})
