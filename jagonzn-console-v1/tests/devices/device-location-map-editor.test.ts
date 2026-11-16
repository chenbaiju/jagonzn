import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DeviceLocation from '../../src/features/devices/DeviceLocation.vue'
import {ApiError} from '../../src/core/http'
const state=vi.hoisted(()=>({api:vi.fn(),write:null as any,status:null as any,events:{} as Record<string,Function>,setView:vi.fn(),map:vi.fn(),marker:vi.fn()}))
vi.mock('../../src/core/session',async()=>{const {ref,computed}=await import('vue');state.write=ref(true);state.status=ref('ACTIVE');return{projectId:ref('00000000-0000-4000-8000-000000000001'),session:{user:{accountId:'00000000-0000-4000-8000-000000000003'}},currentProject:computed(()=>({status:state.status.value})),can:(p:string)=>p==='device:read'||state.write.value}})
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
vi.mock('leaflet',()=>({map:state.map,marker:state.marker,divIcon:(v:unknown)=>v,tileLayer:()=>({on:vi.fn(),off:vi.fn(),addTo:vi.fn()}),control:{scale:()=>({addTo:vi.fn()})}}))
let wrapper:ReturnType<typeof mount>|undefined
const initial={longitude:0,latitude:0,version:'9007199254740993'},device='00000000-0000-4000-8000-000000000002'
let saved={...initial}
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v))
const writes=()=>state.api.mock.calls.filter(([,o])=>o?.method==='put')
function button(label:string){return [...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label)}
async function click(label:string){expect(button(label),label).toBeDefined();button(label)!.click();await flushPromises()}
beforeEach(()=>{vi.clearAllMocks();saved={...initial};state.write.value=true;state.status.value='ACTIVE';state.events={};vi.stubEnv('VITE_DEVICE_MAP_PROVIDER','OSM_STANDARD');vi.stubEnv('VITE_DEVICE_MAP_TILE_URL','https://tile.openstreetmap.org/{z}/{x}/{y}.png');state.api.mockImplementation((_p:string,o:any={})=>{if(o.method==='put')saved={longitude:o.body.longitude,latitude:o.body.latitude,version:String(BigInt(o.body.version)+1n)};return Promise.resolve(bytes(saved))});state.map.mockImplementation(()=>({attributionControl:{setPrefix:vi.fn()},setView:state.setView,getCenter:()=>({lng:0}),on:vi.fn((event:string,fn:Function)=>{state.events[event]=fn}),off:vi.fn(),remove:vi.fn(),invalidateSize:vi.fn()}));state.marker.mockImplementation(()=>({addTo:vi.fn(function(this:any){return this}),setLatLng:vi.fn(),remove:vi.fn()}))})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;document.body.innerHTML='';vi.unstubAllEnvs()})
it('地图选点只改草稿，保存仍走原大版本CAS和唯一回读',async()=>{
 wrapper=mount(DeviceLocation,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises();await click('编辑地理位置')
 expect(state.map).not.toHaveBeenCalled();await click('启用地图选点');await vi.waitFor(()=>expect(state.events.click).toBeDefined())
 state.events.click!({latlng:{lng:12.1234564,lat:-34.6543214}});await flushPromises()
 expect(wrapper.findAll<HTMLInputElement>('input[role="spinbutton"]').map(n=>n.element.value)).toEqual(['12.123456','-34.654321']);expect(writes()).toHaveLength(0)
 await click('保存');expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toEqual({longitude:12.123456,latitude:-34.654321,version:initial.version});expect(state.api.mock.calls).toHaveLength(4);expect(wrapper.text()).toContain('经度 12.123456 · 纬度 -34.654321')
})
it('真实手填与地图双向联动，取消和迟到选点不会污染重新打开的当前值',async()=>{
 wrapper=mount(DeviceLocation,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises();await click('编辑地理位置');await click('启用地图选点');await vi.waitFor(()=>expect(state.events.click).toBeDefined())
 const stale=state.events.click!,inputs=wrapper.findAll<HTMLInputElement>('input[role="spinbutton"]');state.setView.mockClear()
 await inputs[0]!.setValue('12.123456');await flushPromises();expect(state.setView).not.toHaveBeenCalled();await inputs[0]!.trigger('blur');inputs[1]!.element.value='-34.654321';for(const event of ['input','change','blur'])inputs[1]!.element.dispatchEvent(event==='blur'?new FocusEvent('blur',{bubbles:true}):new Event(event,{bubbles:true}));await flushPromises()
 expect(state.setView).toHaveBeenLastCalledWith([-34.654321,12.123456],13)
 expect(state.marker.mock.lastCall![0]).toEqual([-34.654321,12.123456]);await click('取消');await click('编辑地理位置');stale({latlng:{lng:99,lat:45}});await flushPromises()
 expect(wrapper.findAll<HTMLInputElement>('input[role="spinbutton"]').map(n=>n.element.value)).toEqual(['0.000000','0.000000']);expect(writes()).toHaveLength(0);expect(button('启用地图选点')).toBeDefined()
})
it('地图选点保存结果未知后销毁选点入口，迟到回调与重开均不重写',async()=>{
 const fake=state.api.getMockImplementation()!;state.api.mockImplementation((p:string,o:any)=>o?.method==='put'?Promise.reject(new ApiError('未知',0,undefined,undefined,true)):fake(p,o))
 wrapper=mount(DeviceLocation,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises();await click('编辑地理位置');await click('启用地图选点');await vi.waitFor(()=>expect(state.events.click).toBeDefined())
 const stale=state.events.click!;stale({latlng:{lng:1,lat:1}});await flushPromises();await click('保存');stale({latlng:{lng:2,lat:2}});await flushPromises()
 expect(document.body.textContent).toContain('保存结果尚未确认');expect(button('启用地图选点')).toBeUndefined();expect(button('保存')).toBeUndefined();expect(writes()).toHaveLength(1)
 await click('关闭');await click('编辑地理位置');expect(writes()).toHaveLength(1);expect(button('启用地图选点')).toBeUndefined();expect(button('使用当前坐标继续编辑')).toBeDefined()
})
