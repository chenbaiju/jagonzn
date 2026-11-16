import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus,{ElMessageBox} from 'element-plus'
import {nextTick} from 'vue'
import {session} from '../../src/core/session'
import {changeIdentity} from '../../src/core/http'
import NotificationTemplatesPage from '../../src/features/alarms/NotificationTemplatesPage.vue'

const mock=vi.hoisted(()=>({templates:vi.fn(),saveTemplate:vi.fn(),deleteTemplate:vi.fn()}))
vi.mock('../../src/features/alarms/api',async original=>{const source=await original<typeof import('../../src/features/alarms/api')>();return{...source,alarmApi:mock}})
const project='00000000-0000-4000-8000-000000000001'
const template={id:'00000000-0000-4000-8000-000000000002',name:'邮件模板',channel:'EMAIL',subjectTemplate:'[${alarm.severity}] ${alarm.type}',bodyTemplate:'告警 ${alarm.type}',enabled:true,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'}
let wrapper:ReturnType<typeof mount>|undefined
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()===label);if(!found)throw new Error('缺少按钮：'+label);return found}
function input(label:string){const found=document.querySelector(`[aria-label="${label}"]`) as HTMLInputElement|HTMLTextAreaElement|null;if(!found)throw new Error('缺少输入：'+label);return found}
function setInput(label:string,value:string){const el=input(label);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}
async function render(){wrapper=mount(NotificationTemplatesPage,{attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises();await nextTick();await flushPromises()}
beforeEach(()=>{
 Object.values(mock).forEach(fn=>fn.mockReset());changeIdentity();session.ready=true;session.transitioning=false
 session.user={accountId:project,currentProjectId:project,permissions:['alarm:read','alarm:manage']} as never
 session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]
 mock.templates.mockResolvedValue({items:[template],nextCursor:null,hasMore:false})
 mock.saveTemplate.mockResolvedValue(template);mock.deleteTemplate.mockResolvedValue(undefined)
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML=''})
describe('通知模板目录与编辑',()=>{
 it('读取模板并显示渠道、状态和主题',async()=>{
  await render()
  expect(mock.templates).toHaveBeenCalledWith(project,undefined)
  expect(wrapper!.text()).toContain('邮件模板');expect(wrapper!.text()).toContain('邮箱通知');expect(wrapper!.text()).toContain('已启用')
 })
 it('创建模板提交名称、渠道、主题和正文并刷新',async()=>{
  await render();button('创建通知模板').click();await flushPromises()
  setInput('通知模板名称','新模板');setInput('通知模板主题','[${alarm.severity}]');setInput('通知模板正文','告警 ${alarm.type}');await nextTick()
  ;[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='保存')!.click();await flushPromises();await nextTick()
  expect(mock.saveTemplate).toHaveBeenCalledWith(project,{name:'新模板',channel:'EMAIL',subjectTemplate:'[${alarm.severity}]',bodyTemplate:'告警 ${alarm.type}',enabled:true},undefined)
  expect(mock.templates).toHaveBeenCalledTimes(2)
 })
 it('编辑携带当前version并拒绝未知变量',async()=>{
  await render();button('编辑').click();await flushPromises()
  setInput('通知模板正文','告警 ${unknown.key}');await nextTick()
  ;[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='保存')!.click();await flushPromises()
  expect(mock.saveTemplate).not.toHaveBeenCalled()
  expect(document.body.textContent||'').toContain('不支持的变量')
  setInput('通知模板正文','告警 ${alarm.value}');await nextTick()
  ;[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='保存')!.click();await flushPromises()
  expect(mock.saveTemplate).toHaveBeenCalledWith(project,expect.objectContaining({bodyTemplate:'告警 ${alarm.value}'}),template)
 })
 it('删除模板按当前version提交并刷新',async()=>{
  vi.spyOn(ElMessageBox,'confirm').mockResolvedValue('confirm' as never)
  await render();button('删除').click();await flushPromises();await nextTick()
  expect(mock.deleteTemplate).toHaveBeenCalledWith(project,template)
  expect(mock.templates).toHaveBeenCalledTimes(2)
 })
 it('续页使用游标并去重',async()=>{
  mock.templates.mockResolvedValueOnce({items:[template],nextCursor:'next',hasMore:true}).mockResolvedValueOnce({items:[{...template,id:'00000000-0000-4000-8000-000000000003',name:'第二页'}],nextCursor:null,hasMore:false})
  await render();button('加载更多').click();await flushPromises();await nextTick()
  expect(mock.templates).toHaveBeenLastCalledWith(project,'next')
  expect(wrapper!.text()).toContain('第二页')
 })
})
