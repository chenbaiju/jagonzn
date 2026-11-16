import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Form from '../../src/features/alarms/NotificationGroupCreationForm.vue'
import { createOrdinaryGroupAndVerify } from '../../src/features/alarms/ordinary-group-creation'
import { changeIdentity, setAccessToken } from '../../src/core/http'
import { session } from '../../src/core/session'
import type { NotificationGroupCreationContext, NotificationGroupDraft } from '../../src/features/alarms/notification-group-draft'
import { ordinaryCreationServer, creationFixtureProject as project, creationFixtureAccount as account } from './ordinary-creation-server'
let wrapper:ReturnType<typeof mount>
afterEach(()=>{wrapper?.unmount();session.user=null;changeIdentity();vi.unstubAllGlobals()})
describe('完整创建表单与正式普通API的隔离组合旅程',()=>{
 async function setup(mode:'member'|'email'|'sms'|'voice',scenario='success'){
  const server=ordinaryCreationServer(scenario);vi.stubGlobal('fetch',server.fetcher);setAccessToken('fixture-only')
  session.user={accountId:account,currentProjectId:project,projectRole:'OWNER',permissions:['alarm:read','alarm:manage']}
  const members=[{accountId:account,email:'member@example.invalid',availableChannels:['EMAIL' as const]}]
  wrapper=mount(Form,{props:{projectId:project,canManage:true,initialMode:mode,members,save:async(context:NotificationGroupCreationContext,draft:NotificationGroupDraft)=>{await createOrdinaryGroupAndVerify(context,draft,members)}},global:{plugins:[ElementPlus]}})
  await wrapper.find('input[aria-label="通知组名称"]').setValue('值班通知')
  await wrapper.find('textarea[aria-label="通知组描述"]').setValue('记录')
  if(mode==='email')await wrapper.find('textarea[aria-label="设置邮箱"]').setValue('a@example.invalid\nb@example.invalid')
  else if(mode==='sms')await wrapper.find('textarea[aria-label="设置手机号"]').setValue('13812345678')
  else if(mode==='voice')await wrapper.find('input[aria-label="设置被叫号码"]').setValue('0755-12345678')
  else await wrapper.find('input[type="checkbox"]').setValue(true)
  await flushPromises();return server
 }
 const submit=()=>wrapper.findAll('button').find(item=>item.text()==='创建')!
 it.each(['member','email','sms','voice']as const)('%s真实组件→HTTP封装→回读核对后才发saved',async mode=>{
  const server=await setup(mode);await submit().trigger('click');await flushPromises();expect(wrapper.emitted('saved')).toHaveLength(1)
  expect(server.calls.filter(call=>call.method==='POST')).toHaveLength(1);expect(server.calls.filter(call=>call.method==='GET').length).toBe(mode==='email'?4:3)
 })
 it('POST已落夹具但回复丢失时不发saved、不自动重试并保留字段',async()=>{
  const server=await setup('sms','unknown');await submit().trigger('click');await flushPromises();expect(server.created()).toBe(true);expect(wrapper.emitted('saved')).toBeUndefined();expect(submit().attributes('disabled')).toBeDefined()
  await submit().trigger('click');expect(server.calls.filter(call=>call.method==='POST')).toHaveLength(1);expect(wrapper.find('textarea[aria-label="设置手机号"]').element).toHaveProperty('value','13812345678')
 })
 it('创建后配置已被改动时显示冲突并停止重放',async()=>{
  const server=await setup('voice','changed');await submit().trigger('click');await flushPromises();expect(wrapper.emitted('saved')).toBeUndefined();expect(wrapper.text()).toContain('已变更');expect(submit().attributes('disabled')).toBeDefined();expect(server.calls.filter(call=>call.method==='POST')).toHaveLength(1)
 })
 it('写后管理读取403时经真实HTTP错误封装清空输入并退出',async()=>{
  const server=await setup('email','denied');await submit().trigger('click');await flushPromises();expect(server.created()).toBe(true);expect(wrapper.emitted('saved')).toBeUndefined();expect(wrapper.emitted('cancel')).toHaveLength(1)
  expect(wrapper.find('textarea[aria-label="设置邮箱"]').element).toHaveProperty('value','');expect(server.calls.some(call=>call.path.endsWith('/email-options/edit'))).toBe(false);expect(server.calls.filter(call=>call.method==='POST')).toHaveLength(1)
 })
})
