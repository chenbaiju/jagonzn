import {describe,it,expect,vi} from 'vitest'
import {propertyObservations} from '../../src/features/devices/property-observations-api'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
describe('实际混合属性历史GET适配',()=>{
 it('带当前模型/来源/用户/签名位置且以有界原文读取，未调用旧上报专属路径',async()=>{
  const signal=new AbortController().signal;await propertyObservations({project:'project',device:'device',model:'model',property:'n',source:'PLATFORM_CLOUD_UPDATE',from:'2026-10-01T00:00:00Z',to:'2026-10-24T00:00:00Z',limit:20,includeActor:true},'signed-cursor',signal)
  expect(state.api).toHaveBeenCalledWith('/api/v1/projects/project/devices/device/property-observations/history',{query:{expectedModelVersionId:'model',propertyKey:'n',sourceKind:'PLATFORM_CLOUD_UPDATE',from:'2026-10-01T00:00:00Z',to:'2026-10-24T00:00:00Z',limit:20,cursor:'signed-cursor',includeActor:true},responseType:'bytes',maxResponseBytes:4194304,signal})
 })
 it('导出传递当前剩余字节预算，非法预算在请求前拒绝',async()=>{
  state.api.mockClear();const query={project:'project',device:'device',model:'model',property:'n',from:'2026-10-01T00:00:00Z',to:'2026-10-24T00:00:00Z',limit:50,includeActor:false};await propertyObservations(query,undefined,undefined,1234);expect(state.api.mock.calls[0]![1].maxResponseBytes).toBe(1234);expect(()=>propertyObservations(query,undefined,undefined,0)).toThrow();expect(state.api).toHaveBeenCalledTimes(1)
 })

})
