import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus,{ElMessageBox} from 'element-plus'
import {createMemoryHistory,createRouter} from 'vue-router'
import {nextTick} from 'vue'
import {session} from '../../src/core/session'
import {changeIdentity} from '../../src/core/http'
import {addPropertyToDashboard,emptyDashboardContent} from '../../src/features/dashboards/dashboard-schema'
import DashboardDetail from '../../src/features/dashboards/DashboardDetail.vue'

const mock=vi.hoisted(()=>({find:vi.fn(),draft:vi.fn(),saveDraft:vi.fn(),publish:vi.fn(),withdraw:vi.fn(),softDelete:vi.fn(),create:vi.fn(),updateMetadata:vi.fn(),list:vi.fn()}))
const devices=vi.hoisted(()=>({shadow:vi.fn()}))
vi.mock('../../src/features/dashboards/dashboard-api',async original=>{const source=await original<typeof import('../../src/features/dashboards/dashboard-api')>();return{...source,dashboardApi:mock}})
vi.mock('../../src/features/devices/api',()=>({devicesApi:devices}))
const project='00000000-0000-4000-8000-000000000001',dashboard='00000000-0000-4000-8000-000000000002',version='00000000-0000-4000-8000-000000000003'
const catalog={id:dashboard,managementName:'设备总览',description:'说明',publicAccess:false,publicationRevision:'0',currentVersionId:null as string|null,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'}
const draft={dashboardId:dashboard,content:emptyDashboardContent(),revision:'2',updatedAt:'2026-01-01T00:00:00Z'}
let wrapper:ReturnType<typeof mount>|undefined
async function render(cat=catalog,doc=draft){
 mock.find.mockResolvedValue(cat);mock.draft.mockResolvedValue(doc)
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/dashboards/:dashboardId',component:DashboardDetail},{path:'/dashboards',component:{template:'<p>目录</p>'}}]})
 await router.push(`/dashboards/${dashboard}`);await router.isReady()
 wrapper=mount(DashboardDetail,{attachTo:document.body,global:{plugins:[router,ElementPlus]}})
 await flushPromises();await nextTick();await flushPromises()
}
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()===label);if(!found)throw new Error('缺少按钮：'+label);return found}
function dropdownItem(label:string){const found=[...document.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(item=>item.textContent?.trim().includes(label));if(!found)throw new Error('缺少菜单：'+label);found.click()}
function tab(label:string){const found=[...document.querySelectorAll<HTMLElement>('.el-drawer .el-tabs__item')].find(item=>item.textContent?.trim()===label);if(!found)throw new Error('缺少页签：'+label);found.click()}
beforeEach(()=>{
 Object.values(mock).forEach(fn=>fn.mockReset());devices.shadow.mockReset();changeIdentity();session.ready=true;session.transitioning=false
 session.user={accountId:project,currentProjectId:project,permissions:['dashboard_definition:read','dashboard_definition:manage']} as never
 session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]
 mock.saveDraft.mockImplementation(async (_p:string,_id:string,_rev:string,content:Record<string,unknown>)=>({...draft,content,revision:'3'}))
 mock.publish.mockResolvedValue({id:version,publishedAt:'2026-01-01T00:00:00Z'});mock.withdraw.mockResolvedValue(undefined)
 mock.updateMetadata.mockResolvedValue({...catalog,managementName:'新名称',description:'新说明'});mock.softDelete.mockResolvedValue(undefined)
 mock.list.mockResolvedValue({items:[catalog],nextCursor:null,hasMore:false});mock.create.mockResolvedValue({id:version,createdAt:'2026-01-01T00:00:00Z'})
 devices.shadow.mockResolvedValue({reported:'{"temperature":36}'})
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML=''})
describe('看板编辑器与设置',()=>{
 it('首次加载显示工具栏和空画布',async()=>{
  await render()
  expect(wrapper!.text()).toContain('设备总览');expect(wrapper!.text()).toContain('添加组件');expect(wrapper!.text()).toContain('看板设置')
  expect(mock.find).toHaveBeenCalledTimes(1);expect(mock.draft).toHaveBeenCalledTimes(1)
 })
 it('画布按绑定读取当前值并显示数值卡片',async()=>{
  const content=addPropertyToDashboard(undefined,{deviceId:project,deviceName:'泵站',propertyKey:'temperature',propertyName:'温度',dataType:'NUMBER',modelVersionId:version,modelDigest:'a'.repeat(64),modelDigestAlgorithm:'PG_JSONB_TEXT_V1_SHA256'})
  await render(catalog,{...draft,content});await flushPromises();await nextTick()
  expect(wrapper!.text()).toContain('温度');expect(wrapper!.text()).toContain('36')
  expect(devices.shadow).toHaveBeenCalledWith(project,project,expect.anything())
 })
 it('编辑组件标题和属性按当前草稿CAS保存并回读',async()=>{
  const content=addPropertyToDashboard(undefined,{deviceId:project,deviceName:'泵站',propertyKey:'temperature',propertyName:'温度',dataType:'NUMBER',modelVersionId:version,modelDigest:'a'.repeat(64),modelDigestAlgorithm:'PG_JSONB_TEXT_V1_SHA256'})
  await render(catalog,{...draft,content})
  ;(document.querySelector('.dashboard-widget__menu') as HTMLButtonElement).click();await flushPromises();await nextTick();dropdownItem('编辑');await flushPromises();await nextTick()
  const input=document.querySelector('input[aria-label="组件标题"]') as HTMLInputElement
  input.value='泵站温度';input.dispatchEvent(new Event('input',{bubbles:true}));await nextTick()
  ;[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='保存')!.click();await flushPromises();await nextTick()
  expect(mock.saveDraft).toHaveBeenCalledWith(project,dashboard,'2',expect.objectContaining({pages:expect.any(Array)}))
  const saved=mock.saveDraft.mock.calls[0]![3] as any
  expect(saved.pages[0].components[0].props.title).toBe('泵站温度')
  expect(saved.pages[0].components[0].layout).toEqual({x:0,y:0,w:6,h:12})
  expect(mock.find).toHaveBeenCalledTimes(2)
 })
 it('添加静态文本按当前草稿CAS保存并重新读取',async()=>{
  await render();button('添加组件').click();await flushPromises();await nextTick()
  const input=document.querySelector('textarea[aria-label="文本内容"]') as HTMLTextAreaElement
  input.value='泵站说明';input.dispatchEvent(new Event('input',{bubbles:true}));await nextTick()
  ;[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(item=>item.textContent?.trim()==='保存')!.click();await flushPromises();await nextTick()
  const saved=mock.saveDraft.mock.calls[0]![3] as any
  expect(saved.pages[0].components[0].kind).toBe('TEXT');expect(saved.pages[0].components[0].props.content).toBe('泵站说明')
  expect(saved.pages[0].components[0].props.title).toBeUndefined()
  expect(mock.find).toHaveBeenCalledTimes(2)
 })
 it('设置抽屉保存名称、描述与公开开关',async()=>{
  await render();button('看板设置').click();await flushPromises();await nextTick()
  const name=document.querySelector('input[aria-label="看板名称"]') as HTMLInputElement
  const description=document.querySelector('textarea[aria-label="看板描述"]') as HTMLTextAreaElement
  name.value='新名称';name.dispatchEvent(new Event('input',{bubbles:true}))
  description.value='新说明';description.dispatchEvent(new Event('input',{bubbles:true}));await nextTick()
  ;[...document.querySelectorAll<HTMLButtonElement>('.el-drawer button')].find(item=>item.textContent?.trim()==='保存')!.click();await flushPromises();await nextTick()
  expect(mock.updateMetadata).toHaveBeenCalledWith(project,dashboard,'新名称','新说明',false)
  expect(mock.find).toHaveBeenCalledTimes(2)
 })
 it('高级页签发布和撤回使用双revision',async()=>{
  vi.spyOn(ElMessageBox,'confirm').mockResolvedValue('confirm' as never)
  await render({...catalog,currentVersionId:version,publicationRevision:'1'})
  button('看板设置').click();await flushPromises();await nextTick();tab('高级');await flushPromises();await nextTick()
  button('发布草稿').click();await flushPromises();await nextTick()
  expect(mock.publish).toHaveBeenCalledWith(project,dashboard,'2','1')
  button('撤回发布').click();await flushPromises();await nextTick()
  expect(mock.withdraw).toHaveBeenCalledWith(project,dashboard,'1')
 })
})
