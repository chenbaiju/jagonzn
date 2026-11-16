import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus,{ElDialog,ElSelect} from 'element-plus'
import {ApiError} from '@/core/http'
const state=vi.hoisted(()=>({prepare:vi.fn(),send:vi.fn(),recover:vi.fn(),project:null as any,permission:null as any,current:null as any}))
vi.mock('@/core/session',async()=>{const {ref}=await import('vue');state.project=ref('11111111-1111-4111-8111-111111111111');state.permission=ref(true);state.current=ref({status:'ACTIVE'});return {projectId:state.project,currentProject:state.current,can:()=>state.permission.value}})
vi.mock('@/features/devices/device-downlink-api',async()=>({...await vi.importActual('@/features/devices/device-downlink-api'),prepareDownlink:state.prepare,sendDownlink:state.send,recoverDownlink:state.recover}))
import Component from '@/features/devices/DeviceMessageDownlink.vue'
const device='22222222-2222-4222-8222-222222222222'
let w:ReturnType<typeof mount>|undefined
function button(label:string){return w!.findAll('button').find(b=>b.text().trim()===label)!}
function deferred(){let resolve!:(value:any)=>void;const promise=new Promise<any>(r=>resolve=r);return {promise,resolve}}
function render(){w=mount(Component,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{JsonCodeEditor:{name:'JsonCodeEditor',props:['modelValue','ariaLabel','height','disabled'],emits:['update:modelValue'],template:'<textarea data-editor :aria-label="ariaLabel" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\',$event.target.value)"/>'}}}});return w}
async function open(){await button('下发消息').trigger('click');await flushPromises()}
async function input(){await w!.get('textarea[data-editor]').setValue('{"n":9007199254740993.25}')}
beforeEach(()=>{state.project.value='11111111-1111-4111-8111-111111111111';state.permission.value=true;state.current.value={status:'ACTIVE'};state.prepare.mockReset().mockImplementation(async(project,device,kind,body)=>Object.freeze({project,device,kind,key:'original-key',model:'model',body,bodyHash:'hash'}));state.send.mockReset().mockResolvedValue(undefined);state.recover.mockReset().mockResolvedValue(undefined)})
afterEach(()=>{w?.unmount();w=undefined;document.body.innerHTML=''})
describe('Source通用660下发窗口与未知回执',()=>{
 it('两种真实类型、660框和300高编辑器，取消只保留草稿不发送',async()=>{
  render();await open();expect(w!.getComponent(ElDialog).props('width')).toBe('min(660px,96vw)');expect(w!.getComponent({name:'JsonCodeEditor'}).props('height')).toBe(300)
  await input();await button('取消').trigger('click');await open();expect((w!.get('textarea[data-editor]').element as HTMLTextAreaElement).value).toContain('9007199254740993.25');expect(state.prepare).not.toHaveBeenCalled();expect(state.send).not.toHaveBeenCalled()
 })
 it('在途锁定取消和类型，重复发送事件不产生第二个意图，受理后关闭刷新',async()=>{
  const late=deferred();state.send.mockReturnValue(late.promise);render();await open();await input();await button('发送').trigger('click');await flushPromises()
  expect(button('取消').attributes('disabled')).toBeDefined();expect(w!.getComponent(ElSelect).props('disabled')).toBe(true);await button('发送').trigger('click');expect(state.prepare).toHaveBeenCalledTimes(1);expect(state.send).toHaveBeenCalledTimes(1)
  late.resolve(undefined);await flushPromises();expect(w!.getComponent(ElDialog).props('modelValue')).toBe(false);expect(w!.emitted('saved')).toHaveLength(1);expect(w!.emitted('busy')?.at(-1)).toEqual([false])
 })
 it('未知关闭再打开仍留原键/原稿，核对仅用原意图，不重发或重新prepare',async()=>{
  state.send.mockRejectedValue(new ApiError('丢失响应',0,undefined,undefined,true));render();await open();await input();await button('发送').trigger('click');await flushPromises();const intent=await state.prepare.mock.results[0]!.value
  expect(w!.text()).toContain('结果未知');await button('取消').trigger('click');await open();expect((w!.get('textarea').element as HTMLTextAreaElement).value).toContain('9007199254740993.25');expect(button('发送')).toBeUndefined()
  await button('核对原请求').trigger('click');await flushPromises();expect(state.recover.mock.calls[0]![0]).toBe(intent);expect(state.prepare).toHaveBeenCalledTimes(1);expect(state.send).toHaveBeenCalledTimes(1);expect(w!.getComponent(ElDialog).props('modelValue')).toBe(false)
 })
 it('核对404保未知和原稿，重复核对也是读取而非提交',async()=>{
  state.send.mockRejectedValue(new ApiError('丢失响应',0,undefined,undefined,true));state.recover.mockRejectedValue(new ApiError('未定位',404));render();await open();await input();await button('发送').trigger('click');await flushPromises();await button('核对原请求').trigger('click');await flushPromises();await button('核对原请求').trigger('click');await flushPromises()
  expect(w!.text()).toContain('暂未定位原请求回执');expect(state.send).toHaveBeenCalledTimes(1);expect(state.prepare).toHaveBeenCalledTimes(1);expect(state.recover).toHaveBeenCalledTimes(2);expect(w!.getComponent(ElDialog).props('modelValue')).toBe(true)
 })
 it('准备期间切设备使迟到结果失效，零POST且清除私有草稿',async()=>{
  const late=deferred();state.prepare.mockReturnValue(late.promise);render();await open();await input();await button('发送').trigger('click');await w!.setProps({deviceId:'33333333-3333-4333-8333-333333333333'});late.resolve({project:state.project.value,device,key:'old',kind:'COMMAND',method:'reboot',input:'{}'});await flushPromises()
  expect(state.send).not.toHaveBeenCalled();expect(w!.emitted('saved')).toBeUndefined();expect(w!.getComponent(ElDialog).props('modelValue')).toBe(false);expect(w!.emitted('busy')?.at(-1)).toEqual([false])
 })
 it('只读角色和归档项目没有可执行写入，服务函数不被调用',async()=>{
  state.permission.value=false;render();expect(button('下发消息')).toBeUndefined();w!.unmount();w=undefined;state.permission.value=true;state.current.value={status:'ARCHIVED'};render();expect(button('下发消息').attributes('disabled')).toBeDefined();expect(state.prepare).not.toHaveBeenCalled();expect(state.send).not.toHaveBeenCalled()
 })
 it('属性准备期间归档时首次发送前停止并释放busy，恢复后不自动发送',async()=>{
  const late=deferred();state.prepare.mockReturnValueOnce(late.promise)
  render();await open();await input();await button('发送').trigger('click');await flushPromises()
  expect(state.prepare).toHaveBeenCalledTimes(1);expect(state.send).not.toHaveBeenCalled();expect(w!.emitted('busy')?.at(-1)).toEqual([true])
  const [project,preparedDevice,kind,body]=state.prepare.mock.calls[0]!
  state.current.value={status:'ARCHIVED'};await flushPromises()
  late.resolve(Object.freeze({project,device:preparedDevice,kind,key:'prepared-key',model:'model',body,bodyHash:'hash'}));await flushPromises()
  expect(state.permission.value).toBe(true);expect(state.send).not.toHaveBeenCalled();expect(state.recover).not.toHaveBeenCalled()
  expect(w!.emitted('busy')?.at(-1)).toEqual([false]);expect(w!.text()).toContain('尚未发送');expect(w!.emitted('saved')).toBeUndefined()
  expect(button('取消').attributes('disabled')).toBeUndefined();expect(button('发送').attributes('disabled')).toBeDefined()
  state.current.value={status:'ACTIVE'};await flushPromises();expect(state.send).not.toHaveBeenCalled()
  await button('发送').trigger('click');await flushPromises();expect(state.prepare).toHaveBeenCalledTimes(2);expect(state.send).toHaveBeenCalledTimes(1)
  expect(w!.emitted('saved')).toHaveLength(1)
 })
 it('已发送未知后归档仍核对同一原件，关闭重开不再次准备或发送',async()=>{
  state.send.mockRejectedValue(new ApiError('丢失响应',0,undefined,undefined,true))
  render();await open();await input();await button('发送').trigger('click');await flushPromises()
  const original=state.send.mock.calls[0]![0]
  state.current.value={status:'ARCHIVED'};await flushPromises();await button('取消').trigger('click');await open()
  expect(button('发送')).toBeUndefined();expect(w!.emitted('busy')?.at(-1)).toEqual([true])
  await button('核对原请求').trigger('click');await flushPromises()
  expect(state.recover).toHaveBeenCalledTimes(1);expect(state.recover.mock.calls[0]![0]).toBe(original)
  expect(state.prepare).toHaveBeenCalledTimes(1);expect(state.send).toHaveBeenCalledTimes(1)
  expect(w!.emitted('busy')?.at(-1)).toEqual([false]);expect(w!.emitted('saved')).toHaveLength(1)
  expect(w!.getComponent(ElDialog).props('modelValue')).toBe(false);expect(button('下发消息').attributes('disabled')).toBeDefined()
 })
})
