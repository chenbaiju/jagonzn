import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,RouterLinkStub,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElMessage} from 'element-plus'
import {createRouter,createMemoryHistory} from 'vue-router'
import Members from '../../src/features/device-groups/DeviceGroupMembers.vue'
import {decodeMemberPage,decodeMoveState,prepareMemberMove,type MemberTransport,type MemberQuery} from '../../src/features/device-groups/group-members-api'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
import {groupReturnPath} from '../../src/features/device-groups/group-return'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=id(100),root=id(1),target=id(2),device=id(10),candidate=id(11),other=id(99)
const group=(key=root,type='STATIC')=>({id:key,name:key===root?'本组':'目标组',type,description:null,rule:type==='STATIC'?null:{deviceTypeIds:[],statuses:['ONLINE'],tags:{},tagMatch:null},createdAt:'2026-10-29T00:00:00Z',parentId:null,color:null,tags:{},sortOrder:0,revision:'0'})
const row=(key=device)=>({id:key,name:key===device?'当前设备':key===candidate?'待添加设备':'另一台设备',status:'INACTIVE',deviceKey:key,createdAt:'2026-10-29T00:00:00Z'})
function response(query:MemberQuery,items=[row()],groupId=root,kind='STATIC') {return{group:group(groupId,kind),scope:query.scope,directory:{items,total:String(items.length),page:query.page,limit:query.limit,alarmObservations:items.map(d=>({deviceId:d.id,modelVersionId:null,state:'UNKNOWN',highestSeverity:null,observedAt:'2026-10-29T00:00:00Z'})),referenceIdentities:[],displayFacts:items.map(d=>({deviceId:d.id,deviceTypeId:null,deviceTypeName:null,deviceKind:null,enabled:true,staticGroups:[{id:groupId,name:'本组'}],lastDataReportAt:null}))}}}
const query={scope:'DIRECT',page:1,limit:20,keyword:''} as const
const edge=(member:boolean,key=device,groupId=root)=>({projectId:project,deviceId:key,groupId,name:groupId===root?'本组':'目标组',member})
const moved=(source=true,targetMember=false)=>({projectId:project,deviceId:device,source:edge(source),target:edge(targetMember,device,target)})
const calls={members:vi.fn(),devices:vi.fn(),groups:vi.fn(),write:vi.fn(),recover:vi.fn()},transport:MemberTransport=calls,wrappers:VueWrapper[]=[]
function owner(){session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]}
function render(){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{template:'<div/>'}},{path:'/devices',name:'devices',component:{template:'<div/>'}}]});const wrapper=mount(Members,{props:{groupId:root,transport},attachTo:document.body,global:{plugins:[ElementPlus,router],stubs:{RouterLink:RouterLinkStub}}});wrappers.push(wrapper);return wrapper}
function button(label:string){const value=[...document.querySelectorAll<HTMLButtonElement>('button')].find(value=>value.textContent?.trim()===label||value.getAttribute('aria-label')===label);expect(value,label).toBeDefined();return value!}
async function click(label:string){button(label).click();await flushPromises()}
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;owner();calls.members.mockImplementation((_p,g,q)=>Promise.resolve(decodeMemberPage(response(q,[row()],g),g,q)));calls.devices.mockResolvedValue(candidatePage([row(device),row(candidate),row(other)]));calls.groups.mockResolvedValue({items:[{group:group(),hasChildren:false,deviceCount:0,childCount:0},{group:group(target),hasChildren:false,deviceCount:0,childCount:0}],total:2,page:1,size:20,hasMore:false});calls.recover.mockImplementation(intent=>Promise.resolve(intent.kind==='move'?moved():edge(!intent.original.member,intent.original.device,intent.original.group)));calls.write.mockImplementation(intent=>Promise.resolve(intent.kind==='move'?moved(false,true):edge(intent.original.member,intent.original.device,intent.original.group)))})
afterEach(()=>{ElMessage.closeAll();wrappers.splice(0).forEach(w=>w.unmount());session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})
it('成员页绑定明确scope与去重总数，移动回执精确核两组且当前同值不冒历史',()=>{
 const value=response(query);expect(decodeMemberPage(value,root,query).directory.total).toBe('1');expect(()=>decodeMemberPage({...value,scope:'SUBTREE'},root,query)).toThrow();expect(()=>decodeMemberPage({...value,directory:{...value.directory,total:'2'}},root,query)).toThrow();expect(()=>decodeMemberPage({...value,directory:{...value.directory,items:[row(),row()],total:'2'}},root,query)).toThrow();const intent=prepareMemberMove(project,device,root,target);expect(decodeMoveState(moved(false,true),intent,true).source.member).toBe(false);expect(()=>decodeMoveState(moved(),intent,true)).toThrow();expect(decodeMoveState(moved(),intent).source.member).toBe(true);expect(()=>decodeMoveState({...moved(),deviceId:other},intent)).toThrow()
})
function candidatePage(items:ReturnType<typeof row>[],page=1,total=items.length){
 const directory=response({...query,page},items).directory
 return {...directory,total:String(total),displayFacts:directory.displayFacts.map(fact=>({
  ...fact,staticGroups:fact.deviceId===device?fact.staticGroups:[]
 }))}
}
async function selectRows(wrapper:VueWrapper){
 await wrapper.get('[aria-label="选择本页全部设备"] input').setValue(true)
 await flushPromises()
}
function toast(){return document.querySelector('.el-message')?.textContent??''}
it('设备及类型链接保留来源组，返回仅接受有效组 ID',async()=>{
 const typeId=id(20)
 calls.members.mockImplementation((_p,g,q)=>{const value=response(q,[row()],g);value.directory.displayFacts[0]={...value.directory.displayFacts[0]!,deviceTypeId:typeId,deviceTypeName:'传感器',deviceKind:'DIRECT'} as never;return Promise.resolve(decodeMemberPage(value,g,q))})
 const wrapper=render();await flushPromises()
 const links=wrapper.findAllComponents(RouterLinkStub)
 expect(links.map(link=>link.props('to'))).toEqual([{path:'/devices/'+device,query:{sourceGroupId:root}},{path:'/device-types/'+typeId,query:{sourceGroupId:root}}])
 expect(groupReturnPath({sourceGroupId:root})).toBe('/device-groups/'+root)
 expect(groupReturnPath({sourceGroupId:'//other.example'})).toBeUndefined()
 expect(groupReturnPath({})).toBeUndefined()
})
it('概要只显示原站操作，高级管理保留搜索、子组范围和导出',async()=>{
 const wrapper=render();await flushPromises()
 expect(wrapper.text()).toContain('在设备列表中查看')
 expect(wrapper.text()).not.toMatch(/组批量操作|导出当前成员页|包含子组/)
 expect(wrapper.text()).not.toContain('从分组中移除设备')
 await wrapper.setProps({advanced:true})
 await click('高级成员管理')
 document.querySelector<HTMLInputElement>('input[value="SUBTREE"]')!.click();await flushPromises()
 expect(calls.members.mock.calls.at(-1)![2].scope).toBe('SUBTREE')
 expect(button('导出当前完整条件（最多500台）')).toBeDefined()
 await wrapper.setProps({advanced:false});await flushPromises()
 expect(calls.members.mock.calls.at(-1)![2].scope).toBe('DIRECT')
 session.projects=[{id:project,myRole:'OWNER',status:'ARCHIVED'}];await flushPromises()
 expect(wrapper.text()).not.toContain('添加设备')
 owner()
 calls.members.mockImplementation((_p,g,q)=>Promise.resolve(decodeMemberPage(response(q,[row()],g,'DYNAMIC'),g,q)))
 await click('刷新成员')
 expect(wrapper.text()).not.toContain('添加设备')
 expect(wrapper.find('[aria-label="选择本页全部设备"] input').exists()).toBe(false)
})
it('多选加入过滤本组成员，取消零写，成功仅显示顶部提示',async()=>{
 const wrapper=render();await flushPromises()
 await click('添加设备');await click('取消');expect(calls.write).not.toHaveBeenCalled()
 await click('添加设备')
 const select=wrapper.getComponent({name:'ElSelect'})
 expect(select.props('multiple')).toBe(true)
 expect(select.findAllComponents({name:'ElOption'}).map(option=>option.props('value'))).toEqual([candidate,other])
 select.vm.$emit('update:modelValue',[candidate,other]);await flushPromises()
 expect(select.props('modelValue')).toEqual([candidate,other])
 await click('加入')
 expect(calls.write.mock.calls.map(([intent])=>intent.original)).toMatchObject([
  {device:candidate,group:root,member:true},{device:other,group:root,member:true},
 ])
 expect(toast()).toContain('已加入当前静态组（已确认 2 台）')
 expect(wrapper.text()).not.toContain('已加入当前静态组')
})
it('添加候选滚动分页及搜索时保留前页已选设备',async()=>{
 calls.devices.mockResolvedValueOnce(candidatePage([row(candidate)],1,21))
  .mockResolvedValueOnce(candidatePage([row(other)],2,21)).mockResolvedValueOnce(candidatePage([row(other)]))
 const wrapper=render();await flushPromises();await click('添加设备')
 const select=wrapper.getComponent({name:'ElSelect'})
 await select.get('input').trigger('click');await flushPromises()
 select.vm.$emit('update:modelValue',[candidate]);await flushPromises()
 const list=document.querySelector<HTMLElement>('.group-device-options .el-select-dropdown__wrap')!
 list.dispatchEvent(new Event('scroll'));await flushPromises()
 expect(calls.devices).toHaveBeenLastCalledWith(project,'',2,expect.any(AbortSignal))
 expect(select.findAllComponents({name:'ElOption'}).map(option=>option.props('value'))).toEqual([candidate,other])
 const filter=select.props('filterMethod') as (keyword:string)=>void
 vi.useFakeTimers()
 try{filter(' B01 ');await vi.advanceTimersByTimeAsync(200)}finally{vi.useRealTimers()}
 await flushPromises()
 expect(calls.devices).toHaveBeenLastCalledWith(project,'B01',1,expect.any(AbortSignal))
 expect(select.props('modelValue')).toEqual([candidate])
 select.vm.$emit('update:modelValue',[candidate,other]);await flushPromises()
 expect(select.props('modelValue')).toEqual([candidate,other])
})
it('勾选两台后可取消或确认移除，只更新当前组的关系',async()=>{
 calls.members.mockImplementation((_p,g,q)=>Promise.resolve(decodeMemberPage(response(q,[row(),row(other)],g),g,q)))
 const wrapper=render();await flushPromises()
 await selectRows(wrapper)
 await click('从分组中移除设备')
 expect(document.body.textContent).toContain('确认从设备组中移除吗？')
 await click('取消');expect(calls.write).not.toHaveBeenCalled()
 await click('从分组中移除设备');await click('确定')
 expect(calls.write.mock.calls.map(([intent])=>intent.original)).toMatchObject([
  {device,group:root,member:false},{device:other,group:root,member:false},
 ])
 expect(toast()).toContain('已从当前静态组移除')
 expect(wrapper.text()).not.toContain('从分组中移除设备')
})
it('移除响应未知保留原请求，停止后续设备，核对不重发',async()=>{
 calls.members.mockImplementation((_p,g,q)=>Promise.resolve(decodeMemberPage(response(q,[row(),row(other)],g),g,q)))
 const wrapper=render();await flushPromises();await selectRows(wrapper)
 calls.write.mockRejectedValueOnce(new ApiError('不可回放结果',409,10014))
 await click('从分组中移除设备');await click('确定')
 expect(calls.write).toHaveBeenCalledTimes(1)
 const key=calls.write.mock.calls[0]![0].original.key
 expect(document.body.textContent).toContain(key)
 expect(document.body.textContent).toContain('后续设备未提交')
 session.user={...session.user!};session.projects=session.projects.map(p=>({...p}));await flushPromises()
 expect(document.body.textContent).toContain(key)
 calls.recover.mockResolvedValueOnce(edge(false))
 await click('只读核对当前关系')
 expect(document.body.textContent).toContain('不证明原请求历史')
 expect(calls.write).toHaveBeenCalledTimes(1)
 await click('结束本次核对')
 expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})
