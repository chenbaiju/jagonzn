import {describe,it,expect,vi,beforeEach} from 'vitest'
import {locationCodePayload,readLocationCode} from '../../src/features/devices/device-location-code'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',()=>({api:state.api}))
const project={id:'00000000-0000-4000-8000-000000000001',projectCode:'园区',name:'项目'} as any
const device='00000000-0000-4000-8000-000000000002',address='https://api.example.com',value={kind:'thingslink.device',version:1,purpose:'LOCATE',projectKey:project.projectCode,deviceId:device}
describe('设备定位码独立只读合同',()=>{
 beforeEach(()=>vi.clearAllMocks())
 it('精确编码同项目设备与规范源站，只有location GET',async()=>{state.api.mockResolvedValue(value);const signal=new AbortController().signal;const payload=await readLocationCode(project,address+'/',device,signal);expect(JSON.parse(payload)).toEqual({...value,origin:address});expect(state.api).toHaveBeenCalledExactlyOnceWith(`/api/v1/projects/${project.id}/devices/${device}/purpose-codes/location`,{signal,maxResponseBytes:8192})})
 it.each([null,[],{...value,version:'1'},{...value,purpose:'CLAIM'},{...value,projectKey:'另一项目'},{...value,deviceId:'另一设备'},{...value,token:'secret'},{...value,extra:true}])('拒绝错范围、能力混入及非封闭五字段 %#',bad=>{expect(()=>locationCodePayload(project,address,device,bad)).toThrow()})
 it.each(['http://api.example.com','https://user:password@api.example.com','https://api.example.com/path','https://api.example.com?next=other','https://api.example.com#secret'])('非法平台地址在发GET之前失败 %#',async origin=>{await expect(readLocationCode(project,origin,device,new AbortController().signal)).rejects.toThrow();expect(state.api).not.toHaveBeenCalled()})
})
