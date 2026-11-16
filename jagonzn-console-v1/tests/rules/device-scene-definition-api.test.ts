import {beforeEach,describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
import {deviceSceneDefinitionApi as port} from '../../src/features/rules/device-scene-definition-api'
const p='10000000-0000-4000-8000-000000000001',d='20000000-0000-4000-8000-000000000001'
describe('正式559场景关联列表适配',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.api.mockResolvedValue({})})
 it('当前设备GET携服务器状态、名称描述及签名游标，不走旧项目候选',async()=>{
  const signal=new AbortController().signal;await port.read(p,d,{status:'PAUSED',name:'机房'},'signed-cursor',signal);expect(state.api).toHaveBeenCalledExactlyOnceWith(`/api/v1/projects/${p}/devices/${d}/scenes`,{query:{status:'PAUSED',name:'机房',cursor:'signed-cursor',limit:24},signal})
 })
 it('未知状态、过长搜索、空游标及非法设备在网络前拒绝，未找到不转项目列表',async()=>{
  const signal=new AbortController().signal;for(const [id,filter,cursor] of [[d,{status:'DRAFT',name:''},undefined],[d,{status:'',name:'x'.repeat(129)},undefined],[d,{status:'',name:''},''],['bad',{status:'',name:''},undefined]] as const)await expect(port.read(p,id,filter as any,cursor,signal)).rejects.toThrow();expect(state.api).not.toHaveBeenCalled();const failure=new Error('未找到');state.api.mockRejectedValue(failure);await expect(port.read(p,d,{status:'',name:''},undefined,signal)).rejects.toBe(failure);expect(state.api).toHaveBeenCalledTimes(1)
 })
})
