import {afterEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Form from '../../src/features/alarms/NotificationGroupCreationForm.vue'
import {createNotificationGroupAndVerify} from '../../src/features/alarms/notification-group-creation'
import {changeIdentity,setAccessToken} from '../../src/core/http'
import {session} from '../../src/core/session'
import {notificationGroupModes,type NotificationGroupCreationContext,type NotificationGroupDraft,type NotificationGroupMode} from '../../src/features/alarms/notification-group-draft'
import {fullCreationServer} from './full-creation-server'
import {creationFixtureProject as project,creationFixtureAccount as account} from './ordinary-creation-server'
let wrapper:ReturnType<typeof mount>
afterEach(()=>{wrapper?.unmount();session.user=null;changeIdentity();vi.unstubAllGlobals()})
const members=[{accountId:account,email:'member@example.invalid',availableChannels:['EMAIL' as const]}]
async function setup(mode:NotificationGroupMode,scenario='success'){
 const server=fullCreationServer(scenario);vi.stubGlobal('fetch',server.fetcher);setAccessToken('fixture-only');session.user={accountId:account,currentProjectId:project,projectRole:'OWNER',permissions:['alarm:read','alarm:manage']}
 wrapper=mount(Form,{props:{projectId:project,canManage:true,initialMode:mode,members,save:async(context:NotificationGroupCreationContext,draft:NotificationGroupDraft)=>{await createNotificationGroupAndVerify(context,draft,members)}},global:{plugins:[ElementPlus]}})
 await wrapper.find('input[aria-label="通知组名称"]').setValue('值班通知');await wrapper.find('textarea[aria-label="通知组描述"]').setValue('记录')
 if(mode==='member')await wrapper.find('input[type="checkbox"]').setValue(true)
 else if(mode==='email')await wrapper.find('textarea[aria-label="设置邮箱"]').setValue('a@example.invalid')
 else if(mode==='sms')await wrapper.find('textarea[aria-label="设置手机号"]').setValue('13812345678')
 else if(mode==='voice')await wrapper.find('input[aria-label="设置被叫号码"]').setValue('0755-12345678')
 else await wrapper.find('input[placeholder="https://"]').setValue('https://example.invalid/notify?key=fixture')
 return server
}
const submit=()=>wrapper.findAll('button').find(button=>button.text()==='创建')!
describe('完整八方式表单→正式498 HTTP封装→权威回读',()=>{
 it.each(notificationGroupModes.map(row=>row.value))('%s按对应正式POST创建，所有回读一致才发saved',async mode=>{const server=await setup(mode);await submit().trigger('click');await flushPromises();expect(wrapper.emitted('saved')).toHaveLength(1);const writes=server.calls.filter(row=>row.method==='POST');expect(writes).toHaveLength(1);expect(writes[0]!.path).toBe(`/api/v1/projects/${project}/console/alarm-notification-groups`+(['member','email','sms','voice'].includes(mode)?'':'/secret'));expect(server.calls.every(call=>!call.path.startsWith('/notify'))).toBe(true)})
 it('秘密POST回复丢失保留URL并锁定，不重放或假装创建失败可重试',async()=>{const server=await setup('webhook','unknown');await submit().trigger('click');await flushPromises();expect(server.secretCreated()).toBe(true);expect(wrapper.emitted('saved')).toBeUndefined();expect(submit().attributes('disabled')).toBeDefined();await submit().trigger('click');expect(server.calls.filter(call=>call.method==='POST')).toHaveLength(1);expect(wrapper.find('input[placeholder="https://"]').element).toHaveProperty('value','https://example.invalid/notify?key=fixture')})
 it('写后管理读403清除原URL并退出，409保留待核对输入',async()=>{const server=await setup('qywx_robot','denied');await submit().trigger('click');await flushPromises();expect(wrapper.emitted('cancel')).toHaveLength(1);expect(wrapper.find('input[placeholder="https://"]').element).toHaveProperty('value','');expect(server.calls.filter(call=>call.method==='POST')).toHaveLength(1);wrapper.unmount();await setup('webhook','changed');await submit().trigger('click');await flushPromises();expect(wrapper.text()).toContain('已变更');expect(submit().attributes('disabled')).toBeDefined();expect(wrapper.emitted('saved')).toBeUndefined()})
 it('自定义正文不被降级为默认格式保存，源码保留且没有POST',async()=>{const server=await setup('webhook');wrapper.findComponent({name:'ElSwitch'}).vm.$emit('update:modelValue',true);await flushPromises();await wrapper.find('textarea[aria-label="编辑正文函数"]').setValue('return { key: "keep" }');await submit().trigger('click');await flushPromises();expect(wrapper.text()).toContain('自定义正文尚不能保存');expect(wrapper.find('textarea[aria-label="编辑正文函数"]').element).toHaveProperty('value','return { key: "keep" }');expect(submit().attributes('disabled')).toBeUndefined();expect(server.calls.filter(call=>call.method==='POST')).toHaveLength(0)})
})
