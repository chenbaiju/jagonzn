import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus,{ElMessageBox} from 'element-plus'
import {nextTick} from 'vue'
import {session} from '../../src/core/session'
import {changeIdentity} from '../../src/core/http'
import RuleNotificationBindingsDialog from '../../src/features/alarms/RuleNotificationBindingsDialog.vue'

const mock=vi.hoisted(()=>({bindings:vi.fn(),groups:vi.fn(),templates:vi.fn(),saveBinding:vi.fn(),deleteBinding:vi.fn()}))
vi.mock('../../src/features/alarms/api',async original=>{const source=await original<typeof import('../../src/features/alarms/api')>();return{...source,alarmApi:mock}})
const project='00000000-0000-4000-8000-000000000001',rule='00000000-0000-4000-8000-000000000002'
const group={id:'00000000-0000-4000-8000-000000000003',name:'运维组',enabled:true,version:0}
const template={id:'00000000-0000-4000-8000-000000000004',name:'邮件模板',channel:'EMAIL',subjectTemplate:'主题',bodyTemplate:'正文',enabled:true,version:0}
const binding={id:'00000000-0000-4000-8000-000000000005',ruleId:rule,groupId:group.id,templateId:template.id,channel:'EMAIL',enabled:true,version:0}
let wrapper:ReturnType<typeof mount>|undefined
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()===label);if(!found)throw new Error('缺少按钮：'+label);return found}
beforeEach(()=>{
 Object.values(mock).forEach(fn=>fn.mockReset());changeIdentity();session.ready=true;session.transitioning=false
 session.user={accountId:project,currentProjectId:project,permissions:['alarm:read','alarm:manage']} as never
 session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]
 mock.bindings.mockResolvedValue([binding]);mock.groups.mockResolvedValue({items:[group],nextCursor:null,hasMore:false});mock.templates.mockResolvedValue({items:[template],nextCursor:null,hasMore:false})
 mock.saveBinding.mockResolvedValue(binding);mock.deleteBinding.mockResolvedValue(undefined)
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML=''})
async function render(){wrapper=mount(RuleNotificationBindingsDialog,{props:{modelValue:true,ruleId:rule,ruleName:'温度规则'},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises();await nextTick();await flushPromises()}
describe('规则通知路由',()=>{
 it('读取当前规则路由并显示同渠道组和模板',async()=>{
  await render()
  expect(mock.bindings).toHaveBeenCalledWith(project,rule)
  expect(wrapper!.text()).toContain('温度规则');expect(wrapper!.text()).toContain('运维组');expect(wrapper!.text()).toContain('邮件模板')
 })
 it('新增路由默认选择启用组和同渠道模板并按当前规则提交',async()=>{
  await render();button('添加通知路由').click();await flushPromises();await nextTick()
  ;[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='保存')!.click();await flushPromises();await nextTick()
  expect(mock.saveBinding).toHaveBeenCalledWith(project,rule,{groupId:group.id,templateId:template.id,channel:'EMAIL',enabled:true},undefined)
  expect(mock.bindings).toHaveBeenCalledTimes(2)
 })
 it('编辑携带当前version，删除按当前version提交',async()=>{
  vi.spyOn(ElMessageBox,'confirm').mockResolvedValue('confirm' as never)
  await render();button('编辑').click();await flushPromises()
  ;[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='保存')!.click();await flushPromises();await nextTick()
  expect(mock.saveBinding).toHaveBeenCalledWith(project,rule,expect.objectContaining({channel:'EMAIL'}),binding)
  button('删除').click();await flushPromises();await nextTick()
  expect(mock.deleteBinding).toHaveBeenCalledWith(project,binding)
 })
})
