import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus,{ElMessageBox} from 'element-plus'
import {createMemoryHistory,createRouter} from 'vue-router'
import {nextTick} from 'vue'
import {session} from '../../src/core/session'
import {changeIdentity} from '../../src/core/http'
import DashboardDirectory from '../../src/features/dashboards/DashboardDirectory.vue'

const mock=vi.hoisted(()=>({list:vi.fn(),draft:vi.fn(),create:vi.fn(),updateMetadata:vi.fn(),saveDraft:vi.fn(),publish:vi.fn(),withdraw:vi.fn(),softDelete:vi.fn(),find:vi.fn()}))
vi.mock('../../src/features/dashboards/dashboard-api',async original=>{const source=await original<typeof import('../../src/features/dashboards/dashboard-api')>();return{...source,dashboardApi:mock}})
const project='00000000-0000-4000-8000-000000000001',project2='00000000-0000-4000-8000-000000000009'
function item(id:string,name:string){return{id,managementName:name,description:'',publicAccess:false,publicationRevision:'0',currentVersionId:null,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'}}
const first=item('00000000-0000-4000-8000-000000000002','设备总览'),second=item('00000000-0000-4000-8000-000000000003','能耗看板'),other=item('00000000-0000-4000-8000-000000000004','第二项目看板')
const empty={dashboardId:first.id,content:{schemaVersion:'tc.dashboard/v1',presentation:{mode:'RESPONSIVE_GRID'},models:[],variables:[],pages:[{id:'main',title:'主页面',components:[{id:'component_1',kind:'TEXT',componentVersion:'1.0.0',layout:{x:0,y:0,w:6,h:12},props:{content:'说明'},bindings:{}}]}]},revision:'0',updatedAt:'2026-01-01T00:00:00Z'}
let wrapper:ReturnType<typeof mount>|undefined
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()===label);if(!found)throw new Error('缺少按钮：'+label);return found}
async function render(){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/dashboards',component:DashboardDirectory},{path:'/dashboards/new',component:{template:'<p>创建</p>'}},{path:'/dashboards/:dashboardId',component:{template:'<p>详情</p>'}}]})
 await router.push('/dashboards');await router.isReady()
 wrapper=mount(DashboardDirectory,{attachTo:document.body,global:{plugins:[router,ElementPlus]}})
 await flushPromises();await flushPromises();await nextTick()
}
function identity(id:string){session.user={accountId:project,currentProjectId:id,permissions:['dashboard_definition:read','dashboard_definition:manage']} as never;session.projects=[{id,myRole:'OWNER',status:'ACTIVE'}]}
beforeEach(()=>{
 Object.values(mock).forEach(fn=>fn.mockReset());changeIdentity();session.ready=true;session.transitioning=false;identity(project)
 mock.list.mockImplementation(async (id:string)=>({items:id===project2?[other]:[first],nextCursor:null,hasMore:false}))
 mock.draft.mockResolvedValue(empty);mock.softDelete.mockResolvedValue(undefined);mock.create.mockResolvedValue({id:second.id,createdAt:'2026-01-01T00:00:00Z'})
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML=''})
describe('看板目录',()=>{
 it('切换项目清空旧行并读取新项目目录',async()=>{
  await render()
  expect(wrapper!.text()).toContain('设备总览');expect(wrapper!.text()).toContain('1 组件')
  changeIdentity();identity(project2);await flushPromises();await flushPromises()
  expect(wrapper!.text()).toContain('第二项目看板')
  expect(wrapper!.text()).not.toContain('设备总览')
 })
 it('续页期间切换项目不能追加旧响应',async()=>{
  let resolveMore:(value:unknown)=>void=()=>undefined
  let calls=0
  mock.list.mockImplementation(async (id:string)=>{
   calls++
   if(calls===1)return{items:[first],nextCursor:'n',hasMore:true}
   if(calls===2)return new Promise(resolve=>{resolveMore=resolve})
   return{items:[other],nextCursor:null,hasMore:false}
  })
  await render()
  button('加载更多').click();await flushPromises()
  changeIdentity();identity(project2);await flushPromises();await flushPromises()
  resolveMore({items:[second],nextCursor:null,hasMore:false});await flushPromises();await flushPromises()
  expect(wrapper!.text()).toContain('第二项目看板')
  expect(wrapper!.text()).not.toContain('能耗看板')
 })
 it('卡片按原站显示组件数、复制与移除菜单',async()=>{
  await render()
  expect(wrapper!.text()).toContain('1 组件')
  ;(document.querySelector('.dashboard-card__menu-button') as HTMLButtonElement).click();await flushPromises();await nextTick()
  expect(document.body.textContent).toContain('复制到新看板');expect(document.body.textContent).toContain('移除看板')
  vi.spyOn(ElMessageBox,'confirm').mockResolvedValue('confirm' as never)
  ;[...document.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(item=>item.textContent?.includes('移除看板'))!.click();await flushPromises();await nextTick()
  expect(mock.softDelete).toHaveBeenCalledWith(project,first.id,'0')
 })
})
