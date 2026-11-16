import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElSwitch,ElRadioGroup} from 'element-plus'
import PropertyHistoryExport from '../../src/features/devices/PropertyHistoryExport.vue'
import {ApiError,changeIdentity} from '../../src/core/http'
const state=vi.hoisted(()=>({read:vi.fn(),download:vi.fn(),allowed:undefined as any}))
vi.mock('../../src/features/devices/property-history-export',()=>({readPropertyHistoryExport:state.read,downloadPropertyHistory:state.download}))
vi.mock('../../src/core/session',async()=>{const{ref}=await import('vue');state.allowed=ref(true);return{projectId:ref('project'),can:()=>state.allowed.value}})
const props={deviceId:'00000000-0000-4000-8000-000000000001',modelVersionId:'00000000-0000-4000-8000-000000000002',propertyKey:'n',from:'2026-10-20T00:00:00Z',to:'2026-10-24T00:00:00Z',propertyName:'温度'},wrappers:VueWrapper[]=[]
function render(){const w=mount(PropertyHistoryExport,{props,attachTo:document.body,global:{plugins:[ElementPlus],stubs:{teleport:{template:'<div><slot /></div>'}}}});wrappers.push(w);return w}
function button(w:VueWrapper,text:string){return w.findAll('button').find(b=>b.text()===text)!}
describe('历史导出真实弹窗与会话资格',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.allowed.value=true;state.read.mockResolvedValue({items:[{sourceId:'one'}],hasMore:false})})
 afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());document.body.innerHTML=''})
 it('默认不含毫秒/Excel，显示5000上限，完成一次独立读取后才下载并关闭',async()=>{
  const w=render();await flushPromises();expect(w.text()).toContain('前5000条');expect(w.findComponent(ElSwitch).props('modelValue')).toBe(false);expect(w.findComponent(ElRadioGroup).props('modelValue')).toBe('xlsx');await button(w,'导出').trigger('click');await flushPromises()
  expect(state.read).toHaveBeenCalledTimes(1);expect(state.read.mock.calls[0]![0]).toEqual({project:'project',device:props.deviceId,model:props.modelVersionId,property:'n',from:props.from,to:props.to});expect(state.download).toHaveBeenCalledWith(expect.anything(),false,'xlsx','温度');expect(w.emitted('close')).toBeTruthy()
 })
 it('用户选毫秒/CSV实际进入下载；空历史和失败不产生文件并保留重试设置',async()=>{
  const w=render();await flushPromises();w.findComponent(ElSwitch).vm.$emit('update:modelValue',true);w.findComponent(ElRadioGroup).vm.$emit('update:modelValue','csv');await flushPromises();state.read.mockResolvedValueOnce({items:[]});await button(w,'导出').trigger('click');await flushPromises();expect(w.text()).toContain('当前时间范围内无历史数据');expect(state.download).not.toHaveBeenCalled()
  state.read.mockRejectedValueOnce(new Error('第二页失败'));await button(w,'导出').trigger('click');await flushPromises();expect(w.text()).toContain('第二页失败');expect(state.download).not.toHaveBeenCalled();await button(w,'导出').trigger('click');await flushPromises();expect(state.download).toHaveBeenCalledWith(expect.anything(),true,'csv','温度')
 })
 it('取消在途读取后即使迟到成功或进度回调仍不下载、不复活计数',async()=>{
  let resolve!:(value:any)=>void,progress!:(n:number)=>void;state.read.mockImplementationOnce((_q:any,_signal:AbortSignal,onProgress:any)=>{progress=onProgress;return new Promise(r=>resolve=r)})
  const w=render();await flushPromises();await button(w,'导出').trigger('click');await flushPromises();progress(50);await flushPromises();expect(w.text()).toContain('50 条');await button(w,'取消').trigger('click');progress(5000);resolve({items:[{}]});await flushPromises();expect(state.download).not.toHaveBeenCalled();expect(w.text()).not.toContain('5000 条');expect(w.emitted('close')).toBeTruthy()
 })
 it('401/403/404通知父页清私有内容；权限撤回、身份和查询模型变更取消旧资格',async()=>{
  for(const status of [401,403,404]){state.read.mockRejectedValueOnce(new ApiError('失权',status));const w=render();await flushPromises();await button(w,'导出').trigger('click');await flushPromises();expect(w.emitted('unavailable')).toHaveLength(1);expect(state.download).not.toHaveBeenCalled();w.unmount();wrappers.pop()}
  const w=render();await flushPromises();state.allowed.value=false;await flushPromises();expect(w.emitted('unavailable')).toHaveLength(1);state.allowed.value=true;const second=render();await second.setProps({modelVersionId:props.deviceId});expect(second.emitted('close')).toBeTruthy();const third=render();changeIdentity();await flushPromises();expect(third.emitted('unavailable')).toBeTruthy()
 })
})
