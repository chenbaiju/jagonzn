import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import DirectoryAmapFrame from '../../src/features/devices/DirectoryAmapFrame.vue'
import {frameChannel} from '../../src/features/devices/directory-amap-protocol'
const fixture=vi.hoisted(()=>({adapter:null as any,load:vi.fn(),read:vi.fn()}))
vi.mock('@amap/amap-jsapi-loader',()=>({load:fixture.load}))
vi.mock('../../src/features/devices/directory-amap-adapter',()=>({directoryAmapAdapter:()=>fixture.adapter}))
vi.mock('../../src/features/devices/directory-amap-context-api',()=>({readDirectoryMapContext:fixture.read}))
const pid='00000000-0000-4000-8000-000000000001',nonce='00000000-0000-4000-8000-000000000002',contextId='a'.repeat(43)
const row={deviceId:'device-a',name:'设备a',longitude:0,latitude:0,version:'0',online:true}
function configuration(){return {contextId,serviceHost:`/api/v1/projects/${pid}/directory-map-contexts/${contextId}/_AMapService`,publicKey:'test-public-only',jsApiVersion:'2.0',expiresAt:new Date(Date.now()+60000).toISOString()}}
let wrapper:VueWrapper|undefined,peer:{postMessage:ReturnType<typeof vi.fn>}|undefined
beforeEach(()=>{
 vi.useFakeTimers();vi.resetModules();fixture.load.mockReset().mockResolvedValue({});fixture.read.mockReset().mockImplementation(async()=>configuration())
 fixture.adapter={converter:vi.fn().mockResolvedValue([[0,0]]),clear:vi.fn(),render:vi.fn(),fit:vi.fn(),select:vi.fn(),baseMap:vi.fn().mockResolvedValue(true),destroy:vi.fn(),resize:vi.fn(),zoom:vi.fn()}
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;window.dispatchEvent(new Event('pagehide'));vi.unstubAllGlobals();vi.useRealTimers();document.body.innerHTML='';location.hash='';peer=undefined})
function deliver(target:Window|object,data:unknown){const event=new MessageEvent('message',{origin:location.origin,data});Object.defineProperty(event,'source',{value:target});window.dispatchEvent(event)}
async function driver(){
 peer={postMessage:vi.fn()};vi.stubGlobal('parent',peer);vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}})
 location.hash=nonce;document.body.innerHTML='<div id="directory-map"></div>'
 // 导入真实 iframe 控制器；仅供应商 Loader/adapter 被替换，不调用网络或 SDK。
 await import('../../src/directory-map-frame')
 deliver(peer,{channel:frameChannel,nonce,generation:1,serial:1,kind:'init',configuration:configuration(),projectId:pid,rows:[row],selected:'',baseMap:'vector'})
 await flushPromises();await flushPromises()
 return peer
}
function errors(){return peer!.postMessage.mock.calls.map(args=>args[0]).filter(message=>message.kind==='error')}
it('真实控制器：坐标转换拒绝只归CONVERSION且销毁，不尝试底图或重试转换',async()=>{
 fixture.adapter.converter.mockRejectedValue(new Error('private-conversion-diagnostic'))
 await driver();expect(errors()).toHaveLength(1);expect(errors()[0].reason).toBe('CONVERSION');expect(fixture.adapter.baseMap).not.toHaveBeenCalled();expect(fixture.adapter.converter).toHaveBeenCalledTimes(1);expect(fixture.adapter.destroy).toHaveBeenCalledTimes(1)
})
it('真实控制器：SDK渲染抛错归SDK，不冒坐标转换失败',async()=>{
 fixture.adapter.render.mockImplementation(()=>{throw new Error('private-render-diagnostic')})
 await driver();expect(errors()).toHaveLength(1);expect(errors()[0].reason).toBe('SDK');expect(fixture.adapter.baseMap).not.toHaveBeenCalled();expect(fixture.adapter.destroy).toHaveBeenCalledTimes(1)
})
it('真实控制器：初始底图等待拒绝归BASEMAP，不冒CONVERSION或成功，且不自动重试',async()=>{
 fixture.adapter.baseMap.mockRejectedValue(new Error('private-layer-diagnostic'))
 const owner=await driver();expect(errors()).toHaveLength(1);expect(errors()[0].reason).toBe('BASEMAP');expect(owner.postMessage.mock.calls.map(args=>args[0].kind)).not.toContain('rendered');expect(fixture.adapter.baseMap).toHaveBeenCalledTimes(1);expect(fixture.adapter.destroy).toHaveBeenCalledTimes(1)
})
it('真实控制器：切底图拒绝也归BASEMAP，初始成功不能覆盖本次失败',async()=>{
 await driver();expect(errors()).toHaveLength(0);fixture.adapter.baseMap.mockRejectedValueOnce(new Error('private-satellite-diagnostic'))
 deliver(peer!,{channel:frameChannel,nonce,generation:1,serial:2,kind:'basemap',baseMap:'satellite'})
 await flushPromises();await flushPromises();expect(errors()).toHaveLength(1);expect(errors()[0].reason).toBe('BASEMAP');expect(fixture.adapter.baseMap).toHaveBeenCalledTimes(2);expect(fixture.adapter.destroy).toHaveBeenCalledTimes(1)
})
it('真实父组件：BASEMAP固定提示与CONVERSION分开，拆iframe/清ready且不自动重读授权',async()=>{
 wrapper=mount(DirectoryAmapFrame,{props:{projectId:pid,scopeKey:'actor:g1',rows:[row],selected:'',baseMap:'vector'},attachTo:document.body});await flushPromises()
 const iframe=wrapper.get('iframe').element as HTMLIFrameElement,currentNonce=iframe.getAttribute('src')!.split('#')[1]!
 await wrapper.get('iframe').trigger('load')
 deliver(iframe.contentWindow!,{channel:frameChannel,nonce:currentNonce,generation:1,serial:1,kind:'error',reason:'BASEMAP'});await flushPromises()
 expect(wrapper.emitted('error')!.at(-1)).toEqual(['地图底图加载失败，设备位置列表仍可查看。']);expect(wrapper.find('iframe').exists()).toBe(false);expect(wrapper.emitted('ready')!.at(-1)).toEqual([false]);expect(fixture.read).toHaveBeenCalledTimes(1)
 await vi.advanceTimersByTimeAsync(120000);expect(fixture.read).toHaveBeenCalledTimes(1)
})

it('真实iframe Loader固定2.0且只声明AMap.Scale，不启其他工具插件',async()=>{
 await driver()
 expect(fixture.load).toHaveBeenCalledTimes(1)
 expect(fixture.load).toHaveBeenCalledWith({key:'test-public-only',version:'2.0',plugins:['AMap.Scale']})
})
