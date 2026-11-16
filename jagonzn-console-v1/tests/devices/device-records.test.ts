import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElSelect,ElOption,ElRadioGroup} from 'element-plus'
import Records from '../../src/features/devices/DeviceRecords.vue'
import CursorPager from '../../src/ui/CursorPager.vue'
import {ApiError} from '../../src/core/http'

const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
vi.mock('../../src/core/session',async()=>{const{ref}=await import('vue');return{projectId:ref('project'),hasMenu:()=>true}})
vi.mock('../../src/features/devices/api',()=>({devicePath:(p:string,d:string)=>`/api/v1/projects/${p}/devices/${d}`}))
let wrappers:VueWrapper[]=[]
function render(){const w=mount(Records,{props:{deviceId:'device',kind:'automations'},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{RouterLink:{props:['to'],template:'<a><slot /></a>'}}}});wrappers.push(w);return w}
beforeEach(()=>{
 state.api.mockReset().mockImplementation((_path:string,options:any)=>options.query.limit>50?Promise.reject(new ApiError('分页数量超过50',400)):Promise.resolve({items:[{id:'item',name:'已发布自动化',status:'ACTIVE',createdAt:'2026-10-24T00:00:00Z'}],nextCursor:'cursor',hasMore:true}))
})
afterEach(()=>{wrappers.forEach(w=>w.unmount());wrappers=[];document.body.innerHTML=''})
describe('设备自动化消费既有有界游标读口',()=>{
 it.each(['definitions','history'])('%s只提供合法数量，48使用原查询而失效72事件不出站',async mode=>{
  const w=render();await flushPromises();if(mode==='history'){w.findComponent(ElRadioGroup).vm.$emit('update:modelValue','history');await flushPromises()}
  const pager=w.findComponent(CursorPager),sizes=pager.findAllComponents(ElOption).map(o=>o.props('value'))
  expect(sizes).toEqual([24,48]);pager.findComponent(ElSelect).vm.$emit('update:modelValue',48);await flushPromises()
  expect(state.api.mock.lastCall?.[0]).toBe(`/api/v1/projects/project/devices/device/${mode==='history'?'automation-executions':'automations'}`)
  expect(state.api.mock.lastCall?.[1].query).toMatchObject({limit:48,cursor:undefined});const calls=state.api.mock.calls.length
  pager.vm.$emit('update:limit',72);await flushPromises();expect(state.api).toHaveBeenCalledTimes(calls);expect(w.text()).not.toContain('分页数量超过50')
 })
 it('第二页变更合法数量只重置当前游标，不伪造总数或重用旧游标',async()=>{
  const w=render();await flushPromises();await w.find('button[aria-label="下一页"]').trigger('click');await flushPromises();expect(state.api.mock.lastCall?.[1].query.cursor).toBe('cursor')
  w.findComponent(CursorPager).findComponent(ElSelect).vm.$emit('update:modelValue',48);await flushPromises();expect(state.api.mock.lastCall?.[1].query).toMatchObject({limit:48,cursor:undefined});expect(w.findComponent(CursorPager).props('page')).toBe(1);expect(w.findComponent(CursorPager).props('total')).toBeUndefined()
 })
})
