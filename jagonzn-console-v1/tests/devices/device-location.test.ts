import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Component from '../../src/features/devices/DeviceLocation.vue'
import {ApiError,changeIdentity} from '../../src/core/http'
const state=vi.hoisted(()=>({api:vi.fn(),project:null as any,read:null as any,write:null as any,status:null as any}))
vi.mock('../../src/core/session',async()=>{const {ref,computed}=await import('vue');state.project=ref('00000000-0000-4000-8000-000000000001');state.read=ref(true);state.write=ref(true);state.status=ref('ACTIVE');return{projectId:state.project,session:{user:{accountId:'00000000-0000-4000-8000-000000000005'}},currentProject:computed(()=>({status:state.status.value})),can:(p:string)=>p==='device:read'?state.read.value:state.write.value}})
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)),initial={longitude:121.123456,latitude:31.123456,version:'9007199254740993'}
let saved={...initial};const wrappers:ReturnType<typeof mount>[]=[]
function fake(_p:string,o:any={}){if(o.method==='put')saved={longitude:o.body.longitude,latitude:o.body.latitude,version:String(BigInt(o.body.version)+1n)};return Promise.resolve(bytes(saved))}
function render(useTypePolicy=false){const w=mount(Component,{props:{deviceId:device,useTypePolicy},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);return w}
function button(label:string){return [...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label)}
async function click(label:string){expect(button(label),label).toBeDefined();button(label)!.click();await flushPromises()}
const writes=()=>state.api.mock.calls.filter(([,o])=>o?.method==='put')
async function editValues(w:ReturnType<typeof mount>,longitude=122,latitude=32){const inputs=w.findAllComponents({name:'ElInputNumber'});inputs[0]!.vm.$emit('update:modelValue',longitude);inputs[1]!.vm.$emit('update:modelValue',latitude);await flushPromises()}
describe('坐标编辑当前权限与未知保存隔离',()=>{
 beforeEach(()=>{vi.clearAllMocks();saved={...initial};state.project.value=project;state.read.value=true;state.write.value=true;state.status.value='ACTIVE';state.api.mockImplementation(fake)})
 afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());document.body.innerHTML=''})
 it('打开重新读取并冻结当前大版本，只修改坐标，成功后当前GET核对',async()=>{const w=render();await flushPromises();saved={...initial,version:'9007199254740995'};await click('编辑地理位置');await editValues(w);await click('保存');expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toEqual({longitude:122,latitude:32,version:'9007199254740995'});expect(state.api.mock.calls).toHaveLength(4);expect(w.text()).toContain('122');expect(w.findComponent({name:'ElDialog'}).props('modelValue')).toBe(false)})
 it('真实数值输入的六位小数和负纬度经DOM事件保存并回读',async()=>{
  const w=render();await flushPromises();await click('编辑地理位置')
  const inputs=w.findAll<HTMLInputElement>('input[role="spinbutton"]');expect(inputs).toHaveLength(2)
  await inputs[0]!.setValue('12.123456');await inputs[0]!.trigger('blur')
  await inputs[1]!.setValue('-34.654321');await inputs[1]!.trigger('blur');await flushPromises()
  expect(inputs.map(input=>input.element.value)).toEqual(['12.123456','-34.654321'])
  await click('保存')
  expect(writes()).toHaveLength(1)
  expect(writes()[0]![1].body).toEqual({longitude:12.123456,latitude:-34.654321,version:initial.version})
  expect(state.api.mock.calls).toHaveLength(4)
  expect(state.api.mock.lastCall![0]).toContain(device+'/location-point')
  expect(state.api.mock.lastCall![1].method).toBeUndefined()
  expect(w.text()).toContain('经度 12.123456 · 纬度 -34.654321')
  expect(w.findComponent({name:'ElDialog'}).props('modelValue')).toBe(false)
  await click('编辑地理位置')
  expect(w.findAll<HTMLInputElement>('input[role="spinbutton"]').map(input=>input.element.value)).toEqual(['12.123456','-34.654321'])
  expect(writes()).toHaveLength(1)
 })
 it('清除明确一对null和原版本，不改旧文本位置或其它设备资料',async()=>{render();await flushPromises();await click('编辑地理位置');await click('清除坐标');expect(writes()[0]![1].body).toEqual({longitude:null,latitude:null,version:initial.version});expect(Object.keys(writes()[0]![1].body)).toHaveLength(3)})
 it('新快照读取失败时无假输入，显式重读成功才挂载可访问编辑控件',async()=>{const w=render();await flushPromises();state.api.mockRejectedValueOnce(new ApiError('当前坐标读取失败',503));await click('编辑地理位置');expect(w.findAllComponents({name:'ElInputNumber'})).toHaveLength(0);expect(button('保存')?.disabled).toBe(true);await click('重新读取坐标');expect(w.findAllComponents({name:'ElInputNumber'})).toHaveLength(2);for(const input of w.findAll('input[role="spinbutton"]')){expect(input.attributes('aria-disabled')).not.toBe('true');expect(input.attributes('disabled')).toBeUndefined()}expect(writes()).toHaveLength(0)})
 it('未知保存关闭重开只GET原设备，显式继续再保存才新键新版本',async()=>{let first=true;state.api.mockImplementation((p:string,o:any)=>{if(o?.method==='put'&&first){first=false;fake(p,o);return Promise.reject(new ApiError('未知',0,undefined,undefined,true))}return fake(p,o)});const w=render();await flushPromises();await click('编辑地理位置');await editValues(w);await click('保存');expect(button('保存')).toBeUndefined();await click('关闭');await click('编辑地理位置');expect(writes()).toHaveLength(1);expect(state.api.mock.lastCall![0]).toContain(device+'/location-point');await click('使用当前坐标继续编辑');await editValues(w,123,33);await click('保存');expect(writes()).toHaveLength(2);expect(writes()[1]![1].body.version).toBe('9007199254740994');expect(writes()[1]![1].headers['Idempotency-Key']).not.toBe(writes()[0]![1].headers['Idempotency-Key'])})
 it('坏2xx以及GET404继续锁定，不能将其当作未执行后直接重写',async()=>{state.api.mockImplementation((p:string,o:any)=>o?.method==='put'?Promise.resolve(bytes({})):fake(p,o));render();await flushPromises();await click('编辑地理位置');await click('保存');expect(document.body.textContent).toContain('保存结果尚未确认');state.api.mockRejectedValueOnce(new ApiError('未找到',404));await click('读取当前坐标');expect(document.body.textContent).toContain('不会重新提交');expect(button('保存')).toBeUndefined();expect(button('使用当前坐标继续编辑')).toBeUndefined();expect(writes()).toHaveLength(1)})
 it('明确409准确提示已拒绝，也必须读取当前版本并显式继续编辑',async()=>{state.api.mockImplementation((p:string,o:any)=>o?.method==='put'?Promise.reject(new ApiError('版本冲突',409)):fake(p,o));render();await flushPromises();await click('编辑地理位置');await click('保存');expect(document.body.textContent).toContain('本次保存已被拒绝');expect(button('保存')).toBeUndefined();await click('读取当前坐标');expect(writes()).toHaveLength(1);expect(button('使用当前坐标继续编辑')).toBeDefined()})
 it('已受理但当前GET读到其它版本/值，不能假称本次坐标已确认',async()=>{state.api.mockImplementation((p:string,o:any)=>{if(o?.method==='put')return Promise.resolve(bytes({...initial,version:'9007199254740994'}));return fake(p,o)});render();await flushPromises();await click('编辑地理位置');await click('保存');expect(document.body.textContent).toContain('当前坐标已发生变化');expect(button('保存')).toBeUndefined();expect(writes()).toHaveLength(1)})
 it('关闭未返回写后迟到成功不刷新新界面，重开仍只核对',async()=>{let resolve!:(v:Uint8Array)=>void;state.api.mockImplementation((p:string,o:any)=>o?.method==='put'?new Promise(r=>{resolve=r}):fake(p,o));const w=render();await flushPromises();await click('编辑地理位置');await click('保存');await click('关闭');resolve(bytes({...initial,version:'9007199254740994'}));await flushPromises();expect(state.api).toHaveBeenCalledTimes(3);await click('编辑地理位置');expect(button('保存')).toBeUndefined();expect(w.findComponent({name:'ElDialog'}).props('title')).toBe('核对当前坐标');expect(writes()).toHaveLength(1)})
 it('设备与身份切换清字段和旧意图，迟到旧写不污染新设备',async()=>{let resolve!:(v:Uint8Array)=>void;state.api.mockImplementation((p:string,o:any)=>o?.method==='put'?new Promise(r=>{resolve=r}):fake(p,o));const w=render();await flushPromises();await click('编辑地理位置');await click('保存');await w.setProps({deviceId:other});changeIdentity();saved={longitude:1,latitude:2,version:'0'};await flushPromises();resolve(bytes({...initial,version:'9007199254740994'}));await flushPromises();expect(w.findComponent({name:'ElDialog'}).props('modelValue')).toBe(false);expect(state.api.mock.calls.filter(([p,o])=>p.includes(other)&&o?.method==='put')).toHaveLength(0);expect(writes()).toHaveLength(1)})
 it('Viewer与归档只有读，无读权限零GET，原设备读取403清私有坐标',async()=>{state.write.value=false;const w=render();await flushPromises();expect(w.text()).toContain('121.123456');expect(button('编辑地理位置')).toBeUndefined();state.write.value=true;state.status.value='ARCHIVED';await flushPromises();expect(button('编辑地理位置')).toBeUndefined();state.read.value=false;state.api.mockClear();await flushPromises();expect(state.api).not.toHaveBeenCalled();expect(w.text()).not.toContain('121.123456');state.api.mockRejectedValue(new ApiError('已撤销访问',403));state.read.value=true;await flushPromises();expect(w.text()).not.toContain('121.123456');expect(button('编辑地理位置')).toBeUndefined()})
 it('打开后的角色撤销关闭并清除坐标表单，不能保存旧权限',async()=>{const w=render();await flushPromises();await click('编辑地理位置');state.write.value=false;await flushPromises();expect(w.findComponent({name:'ElDialog'}).props('modelValue')).toBe(false);expect(button('编辑地理位置')).toBeUndefined();expect(writes()).toHaveLength(0)})

it('类型关闭禁编辑但原点保留，切人工后真实新点回读成为有效展示',async()=>{
 let mode='DISABLED';state.api.mockImplementation((p:string,o:any)=>p.endsWith('/location-observation')?Promise.resolve({source:mode,longitude:mode==='MANUAL'?saved.longitude:null,latitude:mode==='MANUAL'?saved.latitude:null,manualVersion:mode==='MANUAL'?saved.version:null}):fake(p,o));const w=render(true);await flushPromises();expect(w.text()).toContain('该类型已关闭地理坐标扩展');expect(w.text()).toContain('保留的人工经度 121.123456');expect(button('编辑地理位置')).toBeUndefined();expect(writes()).toHaveLength(0);mode='MANUAL';await click('刷新位置');await click('编辑地理位置');await editValues(w,12.5,-34.5);await click('保存');expect(writes()).toHaveLength(1);expect(w.text()).toContain('经度 12.5 · 纬度 -34.5');expect(w.emitted('locked')?.at(-1)).toEqual([false])
})
it('人工坐标原写未知在策略关闭和归档后保锁，只读核对可明确结束而不重PUT',async()=>{
 let mode='MANUAL';state.api.mockImplementation((p:string,o:any)=>{if(p.endsWith('/location-observation'))return Promise.resolve({source:mode,longitude:mode==='MANUAL'?saved.longitude:null,latitude:mode==='MANUAL'?saved.latitude:null,manualVersion:mode==='MANUAL'?saved.version:null});if(o?.method==='put'){fake(p,o);return Promise.reject(new ApiError('原结果未知',0,undefined,undefined,true))}return fake(p,o)});const w=render(true);await flushPromises();await click('编辑地理位置');await editValues(w);await click('保存');expect(w.emitted('locked')?.at(-1)).toEqual([true]);mode='DISABLED';state.status.value='ARCHIVED';await flushPromises();await click('读取当前坐标');expect(w.emitted('locked')?.at(-1)).toEqual([true]);await click('采用当前坐标并结束核对');expect(writes()).toHaveLength(1);expect(w.text()).toContain('原写入结果仍未确认');expect(w.emitted('locked')?.at(-1)).toEqual([false]);expect(button('编辑地理位置')).toBeUndefined()
})

})
