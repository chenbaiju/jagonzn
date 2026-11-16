import {describe,it,expect,vi,beforeEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {ref} from 'vue'
import DeviceImage from '../../src/features/devices/DeviceImage.vue'
import {ApiError} from '../../src/core/http'
const state=vi.hoisted(()=>({api:vi.fn(),writable:true}))
vi.mock('../../src/core/http',async importOriginal=>({...await importOriginal<object>(),api:state.api}))
vi.mock('../../src/core/session',()=>({projectId:ref('project'),can:()=>state.writable}))
const slot={revision:'9223372036854775806',present:false,width:null,height:null,sizeBytes:null,pendingState:null,writable:true}
describe('设备图片修订与未知结果',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.writable=true;vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:test'),revokeObjectURL:vi.fn()}))})
 it('上传原始Blob、原字符串修订和一次幂等键',async()=>{state.api.mockResolvedValue(slot);const w=mount(DeviceImage,{props:{deviceId:'device'},global:{plugins:[ElementPlus]}});await flushPromises();const input=w.find('input[type=file]');const file=new File(['data'],'test.png',{type:'image/png'});Object.defineProperty(input.element,'files',{value:[file],configurable:true});await input.trigger('change');await w.findAll('button').find(b=>b.text()==='上传或替换')!.trigger('click');await flushPromises();const mutation=state.api.mock.calls.find(c=>c[1]?.method==='put');expect(mutation?.[1]).toMatchObject({body:file,query:{expectedRevision:slot.revision},headers:{'Content-Type':'image/png'}});expect(mutation?.[1].headers['Idempotency-Key']).toMatch(/^[a-f0-9-]{36}$/);w.unmount()})
 it('未知上传仅单发并重读，不自动重传',async()=>{state.api.mockImplementation((_p:string,o:{method?:string})=>o?.method==='put'?Promise.reject(new ApiError('未知',0,undefined,undefined,true)):Promise.resolve(slot));const w=mount(DeviceImage,{props:{deviceId:'device'},global:{plugins:[ElementPlus]}});await flushPromises();const input=w.find('input[type=file]');Object.defineProperty(input.element,'files',{value:[new File(['data'],'test.png',{type:'image/png'})],configurable:true});await input.trigger('change');await w.findAll('button').find(b=>b.text()==='上传或替换')!.trigger('click');await flushPromises();expect(state.api.mock.calls.filter(c=>c[1]?.method==='put')).toHaveLength(1);expect(w.text()).toContain('未自动重传');expect(w.find('input[type=file]').element).not.toBe(input.element);w.unmount()})
 it('超限与错误MIME不发送写请求',async()=>{state.api.mockResolvedValue(slot);const w=mount(DeviceImage,{props:{deviceId:'device'},global:{plugins:[ElementPlus]}});await flushPromises();const input=w.find('input[type=file]');Object.defineProperty(input.element,'files',{value:[new File(['data'],'test.svg',{type:'image/svg+xml'})],configurable:true});await input.trigger('change');expect(w.text()).toContain('PNG/JPEG');expect(state.api.mock.calls.some(c=>c[1]?.method==='put')).toBe(false);w.unmount()})
})
