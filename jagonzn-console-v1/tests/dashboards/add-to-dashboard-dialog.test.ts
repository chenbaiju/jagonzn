import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {nextTick} from 'vue'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity} from '../../src/core/http'
import {addPropertyToDashboard,emptyDashboardContent} from '../../src/features/dashboards/dashboard-schema'
import Dialog from '../../src/features/dashboards/AddToDashboardDialog.vue'

const mock=vi.hoisted(()=>({list:vi.fn(),draft:vi.fn(),create:vi.fn(),saveDraft:vi.fn()}))
vi.mock('../../src/features/dashboards/dashboard-api',async original=>{const source=await original<typeof import('../../src/features/dashboards/dashboard-api')>();return{...source,dashboardApi:mock}})
const project='00000000-0000-4000-8000-000000000001',dashboardId='00000000-0000-4000-8000-000000000002',device='00000000-0000-4000-8000-000000000003',model='00000000-0000-4000-8000-000000000004'
const target={deviceId:device,deviceName:'泵站设备',propertyKey:'temperature',propertyName:'温度',dataType:'NUMBER',modelVersionId:model,modelDigest:'b'.repeat(64),modelDigestAlgorithm:'PG_JSONB_TEXT_V1_SHA256'}
const catalogItem={id:dashboardId,managementName:'现有看板',description:'',publicAccess:false,publicationRevision:'0',currentVersionId:null,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'}
let wrapper:ReturnType<typeof mount>|undefined
function baseDraft(content:Record<string,unknown>=emptyDashboardContent(),revision='0'){return{dashboardId,content,revision,updatedAt:'2026-01-01T00:00:00Z'}}
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()===label);if(!found)throw new Error('缺少按钮：'+label);return found}
async function open(){wrapper=mount(Dialog,{props:{modelValue:false,target},attachTo:document.body,global:{plugins:[ElementPlus]}});await wrapper.setProps({modelValue:true});await flushPromises();await nextTick()}
async function toStepTwo(){button('下一步').click();await flushPromises();await nextTick()}
beforeEach(()=>{
 Object.values(mock).forEach(fn=>fn.mockReset());changeIdentity();session.ready=true;session.transitioning=false
 session.user={accountId:project,currentProjectId:project,permissions:['dashboard_definition:manage']} as never
 session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]
 mock.list.mockResolvedValue({items:[catalogItem],nextCursor:null,hasMore:false})
 mock.draft.mockResolvedValue(baseDraft())
 mock.saveDraft.mockImplementation(async(_p:string,_id:string,_rev:string,content:Record<string,unknown>)=>({...baseDraft(content,'1')}))
 mock.create.mockResolvedValue({id:dashboardId,createdAt:'2026-01-01T00:00:00Z'})
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML=''})
describe('属性添加到看板弹窗',()=>{
 it('第一步只显示两种去向，第二步选择现有看板并显示组件数后保存',async()=>{
  await open()
  expect(document.body.textContent||'').toContain('添加到看板')
  expect(document.body.textContent||'').not.toContain('0 个组件')
  await toStepTwo()
  expect(document.body.textContent||'').toContain('现有看板');expect(document.body.textContent||'').toContain('0 个组件')
  expect(document.body.textContent||'').toContain('数据源');expect(document.body.textContent||'').toContain('温度')
  button('保存').click();await flushPromises();await nextTick()
  expect(mock.saveDraft).toHaveBeenCalledTimes(1)
  const [callProject,callId,revision,content]=mock.saveDraft.mock.calls[0]!
  expect(callProject).toBe(project);expect(callId).toBe(dashboardId);expect(revision).toBe('0')
  expect(JSON.stringify(content)).toContain('"temperature"')
  expect(wrapper!.emitted('saved')).toEqual([[dashboardId]])
  expect(wrapper!.emitted('update:modelValue')).toEqual([[false]])
 })
 it('没有既有看板时在第一步选择创建新看板并回读',async()=>{
  mock.list.mockResolvedValue({items:[],nextCursor:null,hasMore:false})
  mock.draft.mockResolvedValue(baseDraft(addPropertyToDashboard(undefined,target),'0'))
  await open()
  const createRadio=[...document.querySelectorAll<HTMLElement>('label.el-radio')].find(item=>item.textContent?.includes('创建新看板'))
  if(!createRadio)throw new Error('缺少创建新看板选项')
  createRadio.click();await flushPromises();await nextTick()
  expect((document.querySelector('input[aria-label="新看板名称"]') as HTMLInputElement).value).toContain('泵站设备')
  await toStepTwo();button('保存').click();await flushPromises();await nextTick()
  expect(mock.create).toHaveBeenCalledTimes(1)
  expect(mock.create.mock.calls[0]![0]).toBe(project)
  expect(mock.create.mock.calls[0]![1]).toContain('泵站设备')
  expect(mock.create.mock.calls[0]![2]).toBe('');expect(mock.create.mock.calls[0]![3]).toBe(false)
  expect(JSON.stringify(mock.create.mock.calls[0]![4])).toContain('"temperature"')
  expect(wrapper!.emitted('saved')).toEqual([[dashboardId]])
 })
 it('结果未知时保留提示且不自动重试',async()=>{
  mock.saveDraft.mockRejectedValue(new ApiError('保存回应丢失',0,undefined,undefined,true))
  await open();await toStepTwo();button('保存').click();await flushPromises();await nextTick()
  expect(mock.saveDraft).toHaveBeenCalledTimes(1)
  expect(document.body.textContent||'').toContain('结果未知')
  expect(wrapper!.emitted('saved')).toBeUndefined()
  expect(button('保存').disabled).toBe(true)
 })
 it('没有看板管理权限时不能进入下一步',async()=>{
  session.user={accountId:project,currentProjectId:project,permissions:[]} as never
  await open()
  expect(document.body.textContent||'').toContain('没有管理看板定义的权限')
  expect(button('下一步').disabled).toBe(true)
  expect([...document.querySelectorAll('button')].some(item=>item.textContent?.trim()==='保存')).toBe(false)
 })
})
