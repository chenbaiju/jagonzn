import { describe,it,expect,vi,beforeEach } from 'vitest'
import { mount,flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { reactive,ref } from 'vue'
import DeviceCreate from '../../src/features/devices/DeviceCreate.vue'
import { ApiError } from '../../src/core/http'
const device='00000000-0000-4000-8000-000000000001'
const saved={deviceId:device,name:'模拟设备',deviceKey:'cv1-a-test',businessKey:null,description:null,deviceTypeId:null,referenceVersion:'1',profileToken:'a'.repeat(64)}
const state=vi.hoisted(()=>({create:vi.fn(),read:vi.fn(),push:vi.fn()}))
vi.mock('vue-router',()=>({useRouter:()=>({push:state.push})}))
vi.mock('../../src/core/session',()=>({projectId:ref('00000000-0000-4000-8000-000000000001'),can:()=>true}))
vi.mock('../../src/features/devices/api',()=>({devicesApi:{createProfile:state.create,profile:state.read}}))
vi.mock('../../src/features/devices/device-tag-set-api',async original=>{const source=await original<typeof import('../../src/features/devices/device-tag-set-api')>();return{...source,readDeviceTagSet:vi.fn(async()=>new TextEncoder().encode(JSON.stringify({deviceId:device,revision:'1',tags:Object.entries(state.create.mock.lastCall?.[1].tags||{}).map(([key,value])=>({key,value}))})))}})
vi.mock('../../src/features/devices/use-options',()=>({useDeviceOptions:()=>({types:{data:ref(),error:ref(),loading:ref(false)},groups:{data:ref([]),error:ref()},allTypes:ref([]),moreTypes:vi.fn()})}))
describe('创建设备的提交与未知结果',()=>{
 beforeEach(()=>{vi.clearAllMocks()})
 async function setup(){const wrapper=mount(DeviceCreate,{global:{plugins:[ElementPlus]}});await wrapper.find('input[aria-label="设备名称"]').setValue('模拟设备');await wrapper.find('input[aria-label="设备唯一标识"]').setValue('cv1-a-test');return wrapper}
 it('提交单个创建请求后按ID回读再导航',async()=>{state.create.mockResolvedValue(saved);state.read.mockResolvedValue(saved);const w=await setup();await w.find('form').trigger('submit');await flushPromises();expect(state.create).toHaveBeenCalledTimes(1);expect(state.read).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001',device,expect.any(AbortSignal));expect(state.push).toHaveBeenCalledWith(`/devices/${device}`);w.unmount()})
 it('创建结果未知时保留输入并阻止再次提交',async()=>{state.create.mockRejectedValue(new ApiError('未知',0,undefined,undefined,true));const w=await setup();await w.find('form').trigger('submit');await flushPromises();await w.find('form').trigger('submit');await flushPromises();expect(state.create).toHaveBeenCalledTimes(1);expect((w.find('input[aria-label="设备唯一标识"]').element as HTMLInputElement).value).toBe('cv1-a-test');expect(w.text()).toContain('不要重复提交');expect(state.push).not.toHaveBeenCalled();w.unmount()})
})

describe('创建受理后的回读失败',()=>{
 it('已经创建但回读失败也不得重复创建',async()=>{vi.clearAllMocks();state.create.mockResolvedValue(saved);state.read.mockRejectedValue(new ApiError('回读失败'));const w=mount(DeviceCreate,{global:{plugins:[ElementPlus]}});await w.find('input[aria-label="设备名称"]').setValue('模拟设备');await w.find('input[aria-label="设备唯一标识"]').setValue('cv1-a-test');await w.find('form').trigger('submit');await flushPromises();await w.find('form').trigger('submit');await flushPromises();expect(state.create).toHaveBeenCalledTimes(1);expect(w.text()).toContain('不要重复提交');w.unmount()})
})


describe('资料创建回执完整性',()=>{
 it('已受理但返回旧设备形状时也不能重试创建',async()=>{vi.clearAllMocks();state.create.mockResolvedValue({id:device,deviceKey:'internal'});const w=mount(DeviceCreate,{global:{plugins:[ElementPlus]}});await w.find('input[aria-label="设备名称"]').setValue('模拟');await w.find('form').trigger('submit');await flushPromises();await w.find('form').trigger('submit');expect(state.create).toHaveBeenCalledTimes(1);expect(state.read).not.toHaveBeenCalled();expect(w.text()).toContain('不要重复提交');w.unmount()})
})


describe('创建回执绑定本次提交意图',()=>{
 beforeEach(()=>{vi.clearAllMocks()})
 async function setup(){const w=mount(DeviceCreate,{global:{plugins:[ElementPlus]}});await w.get('input[aria-label="设备名称"]').setValue('模拟设备');await w.get('input[aria-label="设备唯一标识"]').setValue('cv1-a-test');return w}
 it.each([
  {field:'名称',patch:{name:'另一台已有设备'}},
  {field:'业务别名',patch:{businessKey:'another-key'}},
  {field:'类型',patch:{deviceTypeId:'00000000-0000-4000-8000-000000000099'}},
  {field:'描述',patch:{description:'不属于本次提交的描述'}},
 ])('格式有效但$field不符，即使GET可返回相同资料也不导航或再次创建',async({patch})=>{const other={...saved,...patch};state.create.mockResolvedValue(other);state.read.mockResolvedValue(other);const w=await setup();await w.get('form').trigger('submit');await flushPromises();expect(state.create).toHaveBeenCalledTimes(1);expect(state.read).not.toHaveBeenCalled();expect(state.push).not.toHaveBeenCalled();expect(w.text()).toContain('本次提交不一致');expect(w.text()).toContain('不要重复提交');await w.get('form').trigger('submit');await flushPromises();expect(state.create).toHaveBeenCalledTimes(1);expect((w.get('input[aria-label="设备唯一标识"]').element as HTMLInputElement).value).toBe('cv1-a-test');w.unmount()})
 it('按规范化后的实际请求校验可空字段和描述，而非比较未裁剪表单',async()=>{const accepted={...saved,businessKey:null,description:'当前描述'};state.create.mockResolvedValue(accepted);state.read.mockResolvedValue(accepted);const w=await setup();await w.get('input[aria-label="设备名称"]').setValue('  模拟设备  ');await w.get('input[aria-label="设备唯一标识"]').setValue('');await w.get('textarea[aria-label="设备描述"]').setValue('  当前描述  ');await w.get('form').trigger('submit');await flushPromises();expect(state.create.mock.lastCall?.[1]).toMatchObject({name:'模拟设备',businessKey:null,description:'当前描述'});expect(state.read).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001',device,expect.any(AbortSignal));expect(state.push).toHaveBeenCalledWith('/devices/'+device);w.unmount()})
 it('回执核对绑定已发送的快照，响应前编辑表单不改变本次请求',async()=>{let resolve!:(value:typeof saved)=>void;state.create.mockImplementation(()=>new Promise<typeof saved>(r=>{resolve=r}));state.read.mockResolvedValue(saved);const w=await setup();await w.get('form').trigger('submit');await w.get('input[aria-label="设备名称"]').setValue('响应前编辑名称');resolve(saved);await flushPromises();expect(state.create.mock.calls[0]?.[1].name).toBe('模拟设备');expect(state.push).toHaveBeenCalledWith('/devices/'+device);expect(state.create).toHaveBeenCalledTimes(1);w.unmount()})
 it('请求匹配但GET回到别设备时仍拒绝确认且禁止重提',async()=>{state.create.mockResolvedValue(saved);state.read.mockResolvedValue({...saved,deviceId:'00000000-0000-4000-8000-000000000098'});const w=await setup();await w.get('form').trigger('submit');await flushPromises();expect(state.read).toHaveBeenCalledTimes(1);expect(state.push).not.toHaveBeenCalled();expect(w.text()).toContain('不要重复提交');await w.get('form').trigger('submit');expect(state.create).toHaveBeenCalledTimes(1);w.unmount()})
})


describe('创建标签共享规则的实际表单',()=>{
 beforeEach(()=>{vi.clearAllMocks()})
 async function setup(){const w=mount(DeviceCreate,{global:{plugins:[ElementPlus]}});await w.get('input[aria-label="设备名称"]').setValue('模拟设备');await w.get('input[aria-label="设备唯一标识"]').setValue('cv1-a-test');return w}
 it('创建标签允许完整64个补充平面符号且保持一次创建请求',async()=>{state.create.mockResolvedValue(saved);state.read.mockResolvedValue(saved);const w=await setup();const input=w.get('input[aria-label="标签名称1"]');expect(input.attributes('maxlength')).not.toBe('64');await input.setValue('😀'.repeat(64));await w.get('input[aria-label="标签值1"]').setValue('品控部');await w.get('form').trigger('submit');await flushPromises();expect(state.create).toHaveBeenCalledTimes(1);expect(state.create.mock.calls[0]?.[1].tags).toEqual({['😀'.repeat(64)]:'品控部'});expect(state.push).toHaveBeenCalledWith('/devices/'+device);w.unmount()})
 it('创建标签超过64码点时保留草稿并在任何POST前拒绝',async()=>{const w=await setup();const key='😀'.repeat(65);await w.get('input[aria-label="标签名称1"]').setValue(key);await w.get('input[aria-label="标签值1"]').setValue('品控部');await w.get('form').trigger('submit');await flushPromises();expect(state.create).not.toHaveBeenCalled();expect(state.read).not.toHaveBeenCalled();expect(state.push).not.toHaveBeenCalled();expect(w.text()).toContain('64');expect((w.get('input[aria-label="标签名称1"]').element as HTMLInputElement).value).toBe(key);w.unmount()})
})
