import {describe,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {ref} from 'vue'
import DeviceOverview from '../../src/features/devices/DeviceOverview.vue'
import DeviceProperties from '../../src/features/devices/DeviceProperties.vue'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/session',()=>({projectId:ref('project')}))
vi.mock('../../src/core/http',async(importOriginal)=>({...await importOriginal<typeof import('../../src/core/http')>(),api:state.api}))
describe('原站概览的扩展字段边界',()=>{
 it('不再用TL接入诊断冒充原站活跃图，隐藏字段也不发诊断请求',async()=>{
  const w=mount(DeviceOverview,{props:{deviceId:'00000000-0000-4000-8000-000000000001'},global:{stubs:{DeviceProperties:true,DeviceActivityOverview:true,DeviceUsageOverview:true}}});await flushPromises()
  expect(w.getComponent(DeviceProperties).props()).toMatchObject({deviceId:'00000000-0000-4000-8000-000000000001',presentation:'cards'});expect(w.text()).not.toContain('协议 / 接入状态');expect(w.text()).not.toContain('最近认证');expect(state.api).not.toHaveBeenCalled();w.unmount()
 })
})
