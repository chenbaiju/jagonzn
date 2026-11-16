import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Picker from '../../src/features/devices/DeviceLocationMapPicker.vue'
const state=vi.hoisted(()=>({center:0,map:vi.fn(),marker:vi.fn(),tile:vi.fn(),remove:vi.fn(),off:vi.fn(),setView:vi.fn(),markerRemove:vi.fn(),events:{} as Record<string,Function>,tileEvents:{} as Record<string,Function>}))
vi.mock('leaflet',()=>({map:state.map,marker:state.marker,divIcon:(v:unknown)=>v,tileLayer:state.tile,control:{scale:()=>({addTo:vi.fn()})}}))
let wrapper:ReturnType<typeof render>|undefined
function render(longitude:number|undefined=0,latitude:number|undefined=0){const mounted=mount(Picker,{props:{longitude,latitude,session:7},global:{plugins:[ElementPlus]}});wrapper=mounted;return mounted}
async function activate(){await wrapper!.get('button').trigger('click');await vi.waitFor(()=>expect(state.events.click).toBeDefined())}
beforeEach(()=>{
 vi.clearAllMocks();state.center=0;state.events={};state.tileEvents={};vi.stubEnv('VITE_DEVICE_MAP_PROVIDER','OSM_STANDARD');vi.stubEnv('VITE_DEVICE_MAP_TILE_URL','https://tile.openstreetmap.org/{z}/{x}/{y}.png')
 state.map.mockImplementation(()=>({attributionControl:{setPrefix:vi.fn()},setView:state.setView,getCenter:()=>({lng:state.center}),on:vi.fn((e:string,f:Function)=>{state.events[e]=f}),off:state.off,remove:state.remove,invalidateSize:vi.fn()}))
 state.marker.mockImplementation(()=>({addTo:vi.fn(function(this:any){return this}),remove:state.markerRemove}))
 state.tile.mockImplementation(()=>({on:vi.fn((e:string,f:Function)=>{state.tileEvents[e]=f}),off:vi.fn(),addTo:vi.fn()}))
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;vi.unstubAllEnvs()})
it('未显式启用不创建地图或瓦片，启用显示真实零点且保留来源署名',async()=>{
 render();await flushPromises();expect(state.map).not.toHaveBeenCalled();expect(state.tile).not.toHaveBeenCalled()
 await activate();expect(state.marker.mock.calls[0]![0]).toEqual([0,0]);expect(state.setView).toHaveBeenCalledWith([0,0],13)
 expect(state.tile).toHaveBeenCalledWith('https://tile.openstreetmap.org/{z}/{x}/{y}.png',expect.objectContaining({referrerPolicy:'origin',attribution:expect.stringContaining('OpenStreetMap')}))
 expect(Object.keys(state.events)).toEqual(['click']);expect(wrapper!.emitted('select')).toBeUndefined()
})
it('手填联动移动标记但不自动改变视野，半空或极区保持数值提示',async()=>{
 render();await activate();state.setView.mockClear()
 await wrapper!.setProps({longitude:12.123456,latitude:-34.654321});expect(state.marker.mock.lastCall![0]).toEqual([-34.654321,12.123456]);expect(state.setView).not.toHaveBeenCalled()
 await wrapper!.setProps({latitude:90});expect(wrapper!.text()).toContain('手填坐标仍可保存');expect(wrapper!.props('latitude')).toBe(90)
 state.marker.mockClear();await wrapper!.setProps({latitude:undefined});expect(state.marker).not.toHaveBeenCalled();expect(wrapper!.text()).toContain('完整填写经纬度');expect(wrapper!.emitted('select')).toBeUndefined()
})
it('点击只发一次完整草稿与原会话，禁用和旧会话事件均不能选点',async()=>{
 render();await activate();const stale=state.events.click!
 stale({latlng:{lng:181.1234564,lat:-1.1234564}});expect(wrapper!.emitted('select')).toEqual([[{longitude:-178.876544,latitude:-1.123456},7]])
 await wrapper!.setProps({disabled:true});stale({latlng:{lng:2,lat:2}})
 await wrapper!.setProps({disabled:false,session:8});stale({latlng:{lng:3,lat:3}});expect(wrapper!.emitted('select')).toHaveLength(1)
 wrapper!.unmount();wrapper=undefined;stale({latlng:{lng:4,lat:4}});expect(state.off).toHaveBeenCalledTimes(1);expect(state.remove).toHaveBeenCalledTimes(1)
})
it('无配置或非法供应商只保留手填退路，不启动外部地图',async()=>{
 vi.stubEnv('VITE_DEVICE_MAP_PROVIDER','');vi.stubEnv('VITE_DEVICE_MAP_TILE_URL','');render();expect(wrapper!.text()).toContain('请手动填写');expect(wrapper!.find('button').exists()).toBe(false);wrapper!.unmount()
 vi.stubEnv('VITE_DEVICE_MAP_PROVIDER','OSM_STANDARD');vi.stubEnv('VITE_DEVICE_MAP_TILE_URL','https://unapproved.example/{z}/{x}/{y}');render();expect(wrapper!.get('[role="alert"]').text()).toContain('配置无效');expect(state.map).not.toHaveBeenCalled();expect(state.tile).not.toHaveBeenCalled()
})
it('瓦片失败只提示手填，不变更坐标或自动重试',async()=>{
 render();await activate();state.tileEvents.tileerror!();await flushPromises();expect(wrapper!.get('[role="alert"]').text()).toContain('可继续手动填写');expect(wrapper!.emitted('select')).toBeUndefined();expect(state.tile).toHaveBeenCalledTimes(1)
})
it('启用后尚未加载即关闭，不创建迟到地图或瓦片',async()=>{
 render();const activation=wrapper!.get('button').trigger('click');wrapper!.unmount();wrapper=undefined
 await activation;await flushPromises();expect(state.map).not.toHaveBeenCalled();expect(state.tile).not.toHaveBeenCalled()
})
it('日期变更线世界副本内点击保持标记可见，保存草稿仍是标准经度',async()=>{
 render();await activate();state.center=181
 state.events.click!({latlng:{lng:181,lat:0}});expect(wrapper!.emitted('select')).toEqual([[{longitude:-179,latitude:0},7]])
 await wrapper!.setProps({longitude:-179,latitude:0});expect(state.marker.mock.lastCall![0]).toEqual([0,181])
})
it('加载中失去可写状态不创建底图，恢复后可再次显式启用',async()=>{
 render();const activation=wrapper!.get('button').trigger('click');await wrapper!.setProps({disabled:true});await activation;await flushPromises()
 expect(state.map).not.toHaveBeenCalled();expect(state.tile).not.toHaveBeenCalled();expect(wrapper!.text()).toContain('启用地图选点')
 await wrapper!.setProps({disabled:false});await activate();expect(state.map).toHaveBeenCalledTimes(1)
})
it('加载中会话改变不创建旧会话底图',async()=>{
 render();const activation=wrapper!.get('button').trigger('click');await wrapper!.setProps({session:8});await activation;await flushPromises()
 expect(state.map).not.toHaveBeenCalled();expect(state.tile).not.toHaveBeenCalled()
})
it('平移到另一世界后点击相同标准点，仍将标记显示在所点副本',async()=>{
 render(-179,0);await activate();state.center=181;state.marker.mockClear()
 state.events.click!({latlng:{lng:181,lat:0}});await flushPromises()
 expect(wrapper!.emitted('select')).toEqual([[{longitude:-179,latitude:0},7]])
 expect(state.marker).toHaveBeenLastCalledWith([0,181],expect.objectContaining({title:'草稿位置'}))
})
