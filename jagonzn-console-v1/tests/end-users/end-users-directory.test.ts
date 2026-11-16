import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus,{ElMessageBox} from 'element-plus'
import {nextTick} from 'vue'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity} from '../../src/core/http'
import EndUsersDirectory from '../../src/features/end-users/EndUsersDirectory.vue'

const mock=vi.hoisted(()=>({list:vi.fn(),lookup:vi.fn(),devices:vi.fn(),updateRole:vi.fn(),provision:vi.fn(),assignRole:vi.fn(),suspend:vi.fn(),restore:vi.fn(),notificationContact:vi.fn(),updateNotificationContact:vi.fn()}))
vi.mock('../../src/features/end-users/end-user-api',async original=>{const source=await original<typeof import('../../src/features/end-users/end-user-api')>();return{...source,endUserApi:mock}})
const project='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002'
const row={id:user,username:'alice',displayName:'张三',status:'ACTIVE',role:'OPERATOR',roleStatus:'ACTIVE',assignedAt:'2026-01-01T00:00:00Z'}
let wrapper:ReturnType<typeof mount>|undefined
async function render(){wrapper=mount(EndUsersDirectory,{attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises();await nextTick();await flushPromises()}
beforeEach(()=>{
 Object.values(mock).forEach(fn=>fn.mockReset());changeIdentity();session.ready=true;session.transitioning=false
 session.user={accountId:project,currentProjectId:project,permissions:['enduser:read','enduser:manage']} as never
 session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]
 mock.list.mockResolvedValue({items:[row],nextCursor:null,hasMore:false});mock.lookup.mockResolvedValue(row);mock.devices.mockResolvedValue([{deviceId:'00000000-0000-4000-8000-000000000009',relationRole:'PRIMARY',status:'ACTIVE',createdAt:'2026-01-01T00:00:00Z'}]);mock.updateRole.mockResolvedValue(undefined);mock.provision.mockResolvedValue({...row,role:null,roleStatus:null,assignedAt:null});mock.assignRole.mockResolvedValue(undefined);mock.suspend.mockResolvedValue(undefined);mock.restore.mockResolvedValue(undefined)
 mock.notificationContact.mockResolvedValue({voiceNumber:'+8613800000000',smsNumber:null,revision:'2'})
 mock.updateNotificationContact.mockImplementation(async(_p:string,_u:string,body:{voiceNumber:string|null;smsNumber:string|null;expectedRevision:string})=>({voiceNumber:body.voiceNumber,smsNumber:body.smsNumber,revision:'3'}))
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML=''})
describe('终端用户目录',()=>{
 it('显示用户名、角色和分配时间',async()=>{
  await render()
  expect(wrapper!.text()).toContain('alice');expect(wrapper!.text()).toContain('张三');expect(wrapper!.text()).toContain('操作员');expect(wrapper!.text()).toContain('正常')
  expect(mock.list).toHaveBeenCalledWith(project,undefined,expect.any(AbortSignal))
 })
 it('空目录显示空态',async()=>{
  mock.list.mockResolvedValue({items:[],nextCursor:null,hasMore:false})
  await render();expect(wrapper!.text()).toContain('用户(0)');expect(wrapper!.text()).toContain('创建新用户')
 })
 it('无读取权限显示禁止态且不请求',async()=>{
  session.user={accountId:project,currentProjectId:project,permissions:[]} as never
  await render();expect(wrapper!.text()).toContain('没有此内容的读取权限');expect(mock.list).not.toHaveBeenCalled()
 })
 function setInput(label:string,value:string){const el=document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;if(!el)throw new Error('缺少输入：'+label);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}
 it('创建用户先预置再分配角色并刷新',async()=>{
  await render()
  ;[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()==='创建新用户')!.click();await flushPromises()
  setInput('终端用户用户名','bob');setInput('终端用户初始口令','password1');setInput('终端用户显示名称','Bob')
  const submit=[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='创建并分配角色')
  submit!.click();await flushPromises();await nextTick()
  expect(mock.provision).toHaveBeenCalledWith(project,{username:'bob',password:'password1',displayName:'Bob'})
  expect(mock.assignRole).toHaveBeenCalledWith(project,user,'OPERATOR')
  expect(mock.list).toHaveBeenCalledTimes(2)
 })
 it('角色分配失败保留已创建用户并可重新分配',async()=>{
  mock.assignRole.mockRejectedValueOnce(new Error('角色写入失败'))
  await render()
  ;[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()==='创建新用户')!.click();await flushPromises()
  setInput('终端用户用户名','bob');setInput('终端用户初始口令','password1')
  ;[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='创建并分配角色')!.click();await flushPromises();await nextTick()
  expect(document.body.textContent||'').toContain('用户已创建')
  expect(mock.provision).toHaveBeenCalledTimes(1)
  ;[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='重新分配角色')!.click();await flushPromises();await nextTick()
  expect(mock.assignRole).toHaveBeenCalledTimes(2)
  expect(mock.provision).toHaveBeenCalledTimes(1)
 })
 it('修改角色按当前用户提交并重新读取目录',async()=>{
  await render()
  const edit=[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()==='修改角色')
  edit!.click();await flushPromises()
  const save=[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='保存')
  save!.click();await flushPromises();await nextTick()
  expect(mock.updateRole).toHaveBeenCalledWith(project,user,'OPERATOR')
  expect(mock.list).toHaveBeenCalledTimes(2)
 })
 it('停用角色经确认后提交并刷新',async()=>{
  vi.spyOn(ElMessageBox,'confirm').mockResolvedValue('confirm' as never)
  await render()
  const stop=[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()==='停用')
  stop!.click();await flushPromises();await nextTick()
  expect(mock.suspend).toHaveBeenCalledWith(project,user)
  expect(mock.list).toHaveBeenCalledTimes(2)
 })
 it('续页追加去重项',async()=>{
  mock.list.mockResolvedValueOnce({items:[row],nextCursor:'n',hasMore:true}).mockResolvedValueOnce({items:[{...row,id:'00000000-0000-4000-8000-000000000003',username:'bob'}],nextCursor:null,hasMore:false})
  await render()
  const more=[...document.querySelectorAll('button')].find(item=>item.textContent?.trim()==='加载更多')
  more!.click();await flushPromises();await nextTick()
  expect(mock.list).toHaveBeenLastCalledWith(project,'n')
  expect(wrapper!.text()).toContain('bob')
 })
 it('接收号码弹窗读取当前项目号码并按revision保存',async()=>{
  await render()
  ;[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()==='接收号码')!.click();await flushPromises();await nextTick()
  expect(mock.notificationContact).toHaveBeenCalledWith(project,user,expect.any(AbortSignal))
  expect((document.querySelector('input[aria-label="电话告警接收号码"]') as HTMLInputElement).value).toBe('+8613800000000')
  setInput('电话告警接收号码','+8613900000000')
  setInput('短信告警接收号码','+8613700000000')
  await nextTick()
  ;[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='保存接收号码')!.click();await flushPromises();await nextTick()
  expect(mock.updateNotificationContact).toHaveBeenCalledWith(project,user,{voiceNumber:'+8613900000000',smsNumber:'+8613700000000',expectedRevision:'2'})
  expect(document.body.textContent||'').toContain('接收号码已保存')
 })
 it('接收号码结果未知时重新读取且不自动重复保存',async()=>{
  mock.updateNotificationContact.mockRejectedValueOnce(new ApiError('保存回应丢失',0,undefined,undefined,true))
  await render()
  ;[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()==='接收号码')!.click();await flushPromises();await nextTick()
  setInput('电话告警接收号码','+8613900000000')
  await nextTick()
  ;[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='保存接收号码')!.click();await flushPromises();await nextTick()
  expect(mock.updateNotificationContact).toHaveBeenCalledTimes(1)
  expect(mock.notificationContact).toHaveBeenCalledTimes(2)
  expect(document.body.textContent||'').toContain('结果未知')
 })
 it('管理员按精确用户名查找并显示可空项目角色',async()=>{
  await render()
  ;[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()==='精确查找')!.click();await flushPromises()
  setInput('精确用户名',' Alice ');await nextTick()
  ;[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='精确查找')!.click();await flushPromises();await nextTick()
  expect(mock.lookup).toHaveBeenCalledWith(project,'Alice')
  expect(document.body.textContent||'').toContain('操作员')
  expect(document.body.textContent||'').toContain('alice')
 })
 it('只读设备绑定按当前用户读取并展示',async()=>{
  await render()
  ;[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()==='查看')!.click();await flushPromises();await nextTick()
  expect(mock.devices).toHaveBeenCalledWith(project,user)
  expect(document.body.textContent||'').toContain('PRIMARY')
  expect(document.body.textContent||'').toContain('00000000-0000-4000-8000-000000000009')
 })
 it('非管理员不显示精确查找入口',async()=>{
  session.user={accountId:project,currentProjectId:project,permissions:['enduser:read']} as never
  await render()
  expect([...document.querySelectorAll<HTMLButtonElement>('button')].some(item=>item.textContent?.trim()==='精确查找')).toBe(false)
 })
 it('接收号码CAS冲突提示并重新读取',async()=>{
  mock.updateNotificationContact.mockRejectedValueOnce(new ApiError('号码已变化',409,60062))
  await render()
  ;[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()==='接收号码')!.click();await flushPromises();await nextTick()
  setInput('短信告警接收号码','+8613700000000')
  await nextTick()
  ;[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='保存接收号码')!.click();await flushPromises();await nextTick()
  expect(document.body.textContent||'').toContain('其他管理员修改')
  expect(mock.notificationContact).toHaveBeenCalledTimes(2)
 })
})
