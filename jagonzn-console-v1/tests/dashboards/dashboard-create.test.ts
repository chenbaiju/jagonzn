import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {createMemoryHistory,createRouter} from 'vue-router'
import {nextTick} from 'vue'
import {session} from '../../src/core/session'
import {changeIdentity} from '../../src/core/http'
import DashboardCreate from '../../src/features/dashboards/DashboardCreate.vue'

const mock=vi.hoisted(()=>({create:vi.fn()}))
vi.mock('../../src/features/dashboards/dashboard-api',async original=>{const source=await original<typeof import('../../src/features/dashboards/dashboard-api')>();return{...source,dashboardApi:mock}})
const project='00000000-0000-4000-8000-000000000001',dashboard='00000000-0000-4000-8000-000000000002'
let wrapper:ReturnType<typeof mount>|undefined,router:ReturnType<typeof createRouter>
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()===label);if(!found)throw new Error('缺少按钮：'+label);return found}
async function render(){
 router=createRouter({history:createMemoryHistory(),routes:[{path:'/dashboards/new',component:DashboardCreate},{path:'/dashboards',component:{template:'<p>目录</p>'}},{path:'/dashboards/:dashboardId',component:{template:'<p>详情</p>'}}]})
 await router.push('/dashboards/new');await router.isReady()
 wrapper=mount(DashboardCreate,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await flushPromises();await nextTick()
}
beforeEach(()=>{
 mock.create.mockReset();changeIdentity();session.ready=true;session.transitioning=false
 session.user={accountId:project,currentProjectId:project,permissions:['dashboard_definition:manage']} as never
 session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]
 mock.create.mockResolvedValue({id:dashboard,createdAt:'2026-01-01T00:00:00Z'})
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML=''})
describe('看板创建页',()=>{
 it('按原站字段提交名称、描述与私有可见性',async()=>{
  await render()
  const name=document.querySelector('input[aria-label="看板名称"]') as HTMLInputElement
  const description=document.querySelector('textarea[aria-label="看板描述"]') as HTMLTextAreaElement
  name.value='设备总览';name.dispatchEvent(new Event('input',{bubbles:true}))
  description.value='现场总览';description.dispatchEvent(new Event('input',{bubbles:true}));await nextTick()
  button('创建').click();await flushPromises();await nextTick()
  expect(mock.create).toHaveBeenCalledWith(project,'设备总览','现场总览',false,expect.objectContaining({schemaVersion:'tc.dashboard/v1'}),expect.any(String),expect.anything())
  expect(router.currentRoute.value.path).toBe(`/dashboards/${dashboard}`)
 })
 it('公开看板提交true',async()=>{
  await render()
  const name=document.querySelector('input[aria-label="看板名称"]') as HTMLInputElement
  name.value='公开看板';name.dispatchEvent(new Event('input',{bubbles:true}));await nextTick()
  ;[...document.querySelectorAll<HTMLElement>('.el-radio')].find(item=>item.textContent?.trim()==='公开看板')!.click();await nextTick()
  button('创建').click();await flushPromises();await nextTick()
  expect(mock.create.mock.calls[0]![3]).toBe(true)
 })
 it('缺少名称时不提交且取消返回目录',async()=>{
  await render();button('创建').click();await flushPromises()
  expect(mock.create).not.toHaveBeenCalled();expect(wrapper!.text()).toContain('请输入看板名称')
  button('取消').click();await flushPromises();await nextTick()
  expect(router.currentRoute.value.path).toBe('/dashboards')
 })
})
