import {beforeEach,describe,expect,it,vi} from 'vitest'
import {ApiError} from '../../src/core/http'
import {devicesApi} from '../../src/features/devices/api'

const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async(importOriginal)=>({...await importOriginal<typeof import('../../src/core/http')>(),api:state.api}))

describe('设备模型绑定读取',()=>{
 beforeEach(()=>vi.resetAllMocks())
 it('无绑定的204明确提示，设备404仍保留原错误',async()=>{
  state.api.mockResolvedValueOnce(undefined)
  await expect(devicesApi.binding('project','device')).rejects.toThrow('设备尚未关联物模型')
  const missing=new ApiError('设备不存在',404,30020)
  state.api.mockRejectedValueOnce(missing)
  await expect(devicesApi.binding('project','missing')).rejects.toBe(missing)
 })
})
