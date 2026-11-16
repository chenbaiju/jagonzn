import {flushPromises} from '@vue/test-utils'
import {solarAmapAdapter} from '../../src/features/rules/solar-amap-adapter'
import {afterEach,it,expect,vi} from 'vitest'
import {directoryAmapAdapter} from '../../src/features/devices/directory-amap-adapter'
import type {DirectoryAmapPoint,Wgs84Pair,Gcj02Pair} from '../../src/features/devices/directory-amap-coordinates'
function engine(){
 const layers:any[]=[],markers:any[]=[],maps:any[]=[],windows:any[]=[],scales:any[]=[]
 class Layer{listeners=new Map<string,Set<()=>void>>();constructor(){layers.push(this)}on(k:string,f:()=>void){if(!this.listeners.has(k))this.listeners.set(k,new Set());this.listeners.get(k)!.add(f)}off(k:string,f:()=>void){this.listeners.get(k)?.delete(f)}complete(){this.listeners.get('complete')?.forEach(f=>f())}}
 class SdkMap{constructor(public el:HTMLElement,public options:unknown){maps.push(this)}add=vi.fn();addControl=vi.fn();remove=vi.fn();destroy=vi.fn();setBounds=vi.fn();getZoom=()=>15;setZoom=vi.fn();setZoomAndCenter=vi.fn();zoomIn=vi.fn();zoomOut=vi.fn()}
 class Marker{constructor(public options:any){markers.push(this)}setMap=vi.fn();getContent=()=>this.options.content}
 class InfoWindow{constructor(public options:any){windows.push(this)}open=vi.fn();close=vi.fn()}
 class Scale{constructor(){scales.push(this)}}
 class LngLat{constructor(public lng:number,public lat:number,public noFix:boolean){}}
 class Bounds{constructor(public sw:any,public ne:any){}}
 const convertFrom=vi.fn()
 return {sdk:{Map:SdkMap,Marker,InfoWindow,Scale,LngLat,Bounds,TileLayer:{Satellite:Layer,RoadNet:Layer},createDefaultLayer:()=>new Layer(),convertFrom},layers,markers,maps,windows,scales,convertFrom}
}
const point=(id:string,lng=0):DirectoryAmapPoint=>({deviceId:id,name:'<img src=x onerror=alert(1)>',version:'0',online:true,sourceWgs84:[lng,0] as unknown as Wgs84Pair,displayGcj02:[lng,0] as unknown as Gcj02Pair})
afterEach(()=>vi.useRealTimers())
it('marker与popup仅textContent，SDK转换只接gps坐标，导航回调精确身份',async()=>{const e=engine(),select=vi.fn(),navigate=vi.fn(),host=document.createElement('div'),a=directoryAmapAdapter(e.sdk,host,()=>true,select,navigate);a.render([point('id')]);e.markers[0].options.content.click();expect(select).toHaveBeenCalledWith('id');expect(e.windows[0].options.content.querySelector('img')).toBeNull();host.append(e.windows[0].options.content);e.windows[0].options.content.querySelector('button').click();expect(navigate).toHaveBeenCalledWith('id');e.convertFrom.mockImplementation((coords,system,cb)=>cb('complete',{locations:[{lng:0,lat:0}]}));await expect(a.converter([[0,0] as unknown as Wgs84Pair])).resolves.toEqual([[0,0]]);expect(e.convertFrom.mock.calls[0].slice(0,2)).toEqual([[[0,0]],'gps']);a.destroy()})
it('反经线使用最小包络及显式不归一化显示副本，不改原坐标',()=>{const e=engine(),a=directoryAmapAdapter(e.sdk,document.createElement('div'),()=>true,vi.fn(),vi.fn()),points=[point('a',179),point('b',-179)];a.render(points);a.fit();expect(e.markers.map(m=>m.options.position.lng)).toEqual([179,181]);expect(e.maps[0].setBounds.mock.calls[0][0].ne.lng-e.maps[0].setBounds.mock.calls[0][0].sw.lng).toBe(2);expect(points[1].displayGcj02[0]).toBe(-179);a.destroy()})
it('快速切层取消旧等待且保留非本方监听，不重建地图或点',async()=>{const e=engine(),a=directoryAmapAdapter(e.sdk,document.createElement('div'),()=>true,vi.fn(),vi.fn());a.render([point('a')]);const foreign=vi.fn();e.layers[0].on('complete',foreign);const first=a.baseMap('vector'),second=a.baseMap('satellite');await expect(first).resolves.toBe(false);e.layers[0].complete();expect(foreign).toHaveBeenCalledTimes(1);e.layers[1].complete();e.layers[2].complete();await expect(second).resolves.toBe(true);expect(e.maps).toHaveLength(1);expect(e.markers).toHaveLength(1);a.destroy();e.layers[0].complete();expect(foreign).toHaveBeenCalledTimes(2)})
it('无complete不冒加载成功，15秒失败后不自动重发',async()=>{vi.useFakeTimers();const e=engine(),a=directoryAmapAdapter(e.sdk,document.createElement('div'),()=>true,vi.fn(),vi.fn()),promise=a.baseMap('vector');const rejected=expect(promise).rejects.toThrow('未完成');await vi.advanceTimersByTimeAsync(15000);await rejected;expect(e.maps[0].add).not.toHaveBeenCalled();a.destroy()})
it('到期与销毁后转换晚回调不能发布点，超时无重试',async()=>{const e=engine();let active=true;const a=directoryAmapAdapter(e.sdk,document.createElement('div'),()=>active,vi.fn(),vi.fn());const promise=a.converter([[0,0] as unknown as Wgs84Pair]);active=false;a.destroy();e.convertFrom.mock.calls[0][2]('complete',{locations:[{lng:0,lat:0}]});await expect(promise).rejects.toThrow('失效');expect(e.convertFrom).toHaveBeenCalledTimes(1);a.render([point('a')]);expect(e.markers).toHaveLength(0)})

it('每map只安装一个真实构造比例尺，切层/换点/缩放不重装，destroy释放同map',async()=>{
 const e=engine(),a=directoryAmapAdapter(e.sdk,document.createElement('div'),()=>true,vi.fn(),vi.fn())
 expect(e.scales).toHaveLength(1);expect(e.maps[0].addControl).toHaveBeenCalledTimes(1);expect(e.maps[0].addControl).toHaveBeenCalledWith(e.scales[0])
 a.render([point('a')]);a.zoom('in');const switching=a.baseMap('satellite');e.layers[1].complete();e.layers[2].complete();await switching;a.render([point('b')]);expect(e.scales).toHaveLength(1);expect(e.maps[0].addControl).toHaveBeenCalledTimes(1)
 a.destroy();a.destroy();expect(e.maps[0].destroy).toHaveBeenCalledTimes(1)
})
it('缺Scale插件明确失败，已创建map必须释放而不是静默少比例尺',()=>{
 const e=engine(),sdk={...e.sdk,Scale:undefined}
 expect(()=>directoryAmapAdapter(sdk,document.createElement('div'),()=>true,vi.fn(),vi.fn())).toThrow('比例尺加载失败')
 expect(e.maps).toHaveLength(1);expect(e.maps[0].destroy).toHaveBeenCalledTimes(1);expect(e.maps[0].addControl).not.toHaveBeenCalled()
})
it('缺addControl公开接口明确失败，不构造不可安装控件或泄漏map',()=>{
 const e=engine(),OriginalMap=e.sdk.Map
 class MissingAddControl extends OriginalMap{constructor(...args:any[]){super(args[0],args[1]);this.addControl=undefined as any}}
 expect(()=>directoryAmapAdapter({...e.sdk,Map:MissingAddControl},document.createElement('div'),()=>true,vi.fn(),vi.fn())).toThrow('比例尺加载失败')
 expect(e.scales).toHaveLength(0);expect(e.maps[0].destroy).toHaveBeenCalledTimes(1)
})

it('卫星与路网成对懒建且两层本次完成才成功，街道旧complete不能代替',async()=>{
 const e=engine(),a=directoryAmapAdapter(e.sdk,document.createElement('div'),()=>true,vi.fn(),vi.fn())
 expect(e.layers).toHaveLength(1)
 let settled=false;const pending=a.baseMap('satellite').then(value=>{settled=true;return value})
 expect(e.layers).toHaveLength(3);expect(e.maps[0].add).toHaveBeenCalledWith([e.layers[1],e.layers[2]])
 e.layers[0].complete();e.layers[1].complete();await Promise.resolve();expect(settled).toBe(false)
 e.layers[2].complete();await expect(pending).resolves.toBe(true);a.destroy()
})
it('切回移除卫星路网两层，下一次卫星创建新pair且旧回调不能完成新pair',async()=>{
 const e=engine(),a=directoryAmapAdapter(e.sdk,document.createElement('div'),()=>true,vi.fn(),vi.fn())
 const first=a.baseMap('satellite'),old=[e.layers[1],e.layers[2]],callbacks=old.flatMap(layer=>[...layer.listeners.get('complete')!])
 old.forEach(layer=>layer.complete());await first
 const street=a.baseMap('vector');e.layers[0].complete();await street;expect(e.maps[0].remove).toHaveBeenCalledWith(old)
 let settled=false;const next=a.baseMap('satellite').then(value=>{settled=true;return value});expect(e.layers).toHaveLength(5)
 callbacks.forEach(callback=>callback());e.layers[0].complete();await Promise.resolve();expect(settled).toBe(false)
 e.layers[3].complete();await Promise.resolve();expect(settled).toBe(false);e.layers[4].complete();await expect(next).resolves.toBe(true);a.destroy()
})
it('仅卫星完成而路网超时必须失败并清pair，不自动重试、不删外部监听',async()=>{
 vi.useFakeTimers();const e=engine(),a=directoryAmapAdapter(e.sdk,document.createElement('div'),()=>true,vi.fn(),vi.fn())
 const pending=a.baseMap('satellite'),pair=[e.layers[1],e.layers[2]],foreign=vi.fn();pair[1].on('complete',foreign);pair[0].complete()
 const rejected=expect(pending).rejects.toThrow('未完成');await vi.advanceTimersByTimeAsync(15000);await rejected
 expect(e.maps[0].remove).toHaveBeenCalledWith(pair);expect(e.layers).toHaveLength(3);expect(pair[0].listeners.get('complete').size).toBe(0)
 pair[1].complete();expect(foreign).toHaveBeenCalledTimes(1);expect(pair[1].listeners.get('complete').size).toBe(1);a.destroy()
})
it('在途取消与销毁清理两层，本次pair只移除一次且旧等待不会复活地图',async()=>{
 const e=engine(),a=directoryAmapAdapter(e.sdk,document.createElement('div'),()=>true,vi.fn(),vi.fn())
 const old=a.baseMap('satellite'),first=[e.layers[1],e.layers[2]],street=a.baseMap('vector');await expect(old).resolves.toBe(false)
 expect(e.maps[0].remove).toHaveBeenCalledWith(first);e.layers[0].complete();await street
 const pending=a.baseMap('satellite'),second=[e.layers[3],e.layers[4]];a.destroy();await expect(pending).resolves.toBe(false);a.destroy()
 expect(e.maps[0].remove.mock.calls.filter((args:readonly unknown[])=>Array.isArray(args[0])&&args[0][0]===first[0])).toHaveLength(1)
 expect(e.maps[0].remove.mock.calls.filter((args:readonly unknown[])=>Array.isArray(args[0])&&args[0][0]===second[0])).toHaveLength(1);expect(e.maps[0].destroy).toHaveBeenCalledTimes(1)
})

it('SDK重建弹层并阻断冒泡时仍导航精确设备，清理后旧按钮失效',()=>{
 const e=engine(),host=document.createElement('div'),navigate=vi.fn(),a=directoryAmapAdapter(e.sdk,host,()=>true,vi.fn(),navigate)
 a.render([point('owned')]);a.select('owned')
 const clone=e.windows[0].options.content.cloneNode(true) as HTMLElement
 clone.addEventListener('click',event=>event.stopPropagation());host.append(clone)
 clone.querySelector('button')!.click();expect(navigate).toHaveBeenCalledExactlyOnceWith('owned')
 a.destroy();clone.querySelector('button')!.click();expect(navigate).toHaveBeenCalledTimes(1)
})

it('太阳初始化被输入取消静默保map，后续当前坐标查询仍可正常返回',async()=>{
 vi.useFakeTimers()
 const e=engine(),result=vi.fn(),failure=vi.fn(),busy=vi.fn()
 class SolarMap extends e.sdk.Map{on=vi.fn();off=vi.fn();getCenter=()=>({lng:120.006,lat:30.002})}
 let address:unknown={formattedAddress:'当前位置'}
 class Geocoder{getAddress(_point:unknown,callback:(status:string,value:unknown)=>void){callback('complete',{regeocode:address})}}
 let first!:(status:string,value:unknown)=>void;e.convertFrom.mockImplementationOnce((_points,_system,callback)=>{first=callback})
 const adapter=solarAmapAdapter({...e.sdk,Map:SolarMap,Geocoder},document.createElement('div'),()=>true,busy,result,failure)
 const initial=adapter.initialize({longitude:120,latitude:30});adapter.cancel();first('complete',{locations:[{lng:120.006,lat:30.002}]});await expect(initial).resolves.toBeUndefined()
 expect(e.maps[0].destroy).not.toHaveBeenCalled();expect(result).not.toHaveBeenCalled();expect(e.markers).toHaveLength(0)
 e.convertFrom.mockImplementation((_points,_system,callback)=>callback('complete',{locations:[{lng:120.006,lat:30.002}]}));adapter.locateCoordinates({longitude:120,latitude:30});await vi.advanceTimersByTimeAsync(1100);await flushPromises()
 expect(result).toHaveBeenCalledExactlyOnceWith({longitude:120,latitude:30},'当前位置');expect(failure).not.toHaveBeenCalled();expect(e.maps[0].setZoomAndCenter).toHaveBeenLastCalledWith(8,[120.006,30.002])
 address={formattedAddress:'街道地址',addressComponent:{country:'中国',province:'广东省',city:'深圳市',district:'南山区'}};adapter.locateCoordinates({longitude:120,latitude:30});await vi.advanceTimersByTimeAsync(1100);await flushPromises();expect(result).toHaveBeenLastCalledWith({longitude:120,latitude:30},'中国广东省深圳市南山区')
 const removed=e.maps[0].remove.mock.calls.length;address={formattedAddress:'街道地址',addressComponent:{country:{invalid:true}}};adapter.locateCoordinates({longitude:120,latitude:30});await vi.advanceTimersByTimeAsync(1100);await flushPromises();expect(result).toHaveBeenCalledTimes(2);expect(failure).toHaveBeenCalledTimes(1);expect(e.markers).toHaveLength(2);expect(e.maps[0].remove).toHaveBeenCalledTimes(removed);const calls=e.convertFrom.mock.calls.length;adapter.locateCoordinates({longitude:120,latitude:30});adapter.cancel();await vi.advanceTimersByTimeAsync(1100);expect(e.convertFrom).toHaveBeenCalledTimes(calls);adapter.destroy()
})

it('太阳同实例逆解转换至少间隔1100ms，取消等待后不再调用SDK',async()=>{
 vi.useFakeTimers();const e=engine(),result=vi.fn(),failure=vi.fn(),times:number[]=[]
 class SolarMap extends e.sdk.Map{on=vi.fn();off=vi.fn();getCenter=()=>({lng:116.4,lat:39.9})}
 class Geocoder{getAddress(_point:unknown,callback:(status:string,value:unknown)=>void){callback('complete',{regeocode:{formattedAddress:'已选点'}})}}
 e.convertFrom.mockImplementation((coords,_system,callback)=>{times.push(Date.now());callback('complete',{locations:[{lng:coords[0][0]+.006,lat:coords[0][1]+.002}]})})
 const adapter=solarAmapAdapter({...e.sdk,Map:SolarMap,Geocoder},document.createElement('div'),()=>true,vi.fn(),result,failure)
 await adapter.initialize(null);const click=e.maps[0].on.mock.calls.find((args:unknown[])=>args[0]==='click')[1]
 click({lnglat:{lng:116.4,lat:39.9}});await vi.advanceTimersByTimeAsync(2199);expect(e.convertFrom).toHaveBeenCalledTimes(2);expect(result).not.toHaveBeenCalled()
 await vi.advanceTimersByTimeAsync(1);await flushPromises();expect(result).toHaveBeenCalledExactlyOnceWith({longitude:116.394,latitude:39.898},'已选点');expect(times).toHaveLength(3);for(let index=1;index<times.length;index++)expect(times[index]!-times[index-1]!).toBeGreaterThanOrEqual(1100)
 click({lnglat:{lng:116.5,lat:39.9}});await vi.advanceTimersByTimeAsync(1100);const calls=e.convertFrom.mock.calls.length;adapter.cancel();await vi.advanceTimersByTimeAsync(10000);expect(e.convertFrom).toHaveBeenCalledTimes(calls);expect(result).toHaveBeenCalledTimes(1);expect(failure).not.toHaveBeenCalled();adapter.destroy()
})

it('勾选范围只移动视野并保留全部标记，空集合不移动，缺点回原站默认视野',()=>{const e=engine(),a=directoryAmapAdapter(e.sdk,document.createElement('div'),()=>true,vi.fn(),vi.fn());a.render([point('a',10),point('b',20),point('c',30)]);a.fit(['b']);expect(e.maps[0].setZoomAndCenter).toHaveBeenLastCalledWith(13,expect.objectContaining({lng:20,lat:0}));expect(e.markers).toHaveLength(3);expect(e.maps[0].remove).not.toHaveBeenCalled();a.fit(['a','c']);expect(e.maps[0].setBounds).toHaveBeenLastCalledWith(expect.objectContaining({sw:expect.objectContaining({lng:10}),ne:expect.objectContaining({lng:30})}),true,[100,100,100,100]);a.fit([]);expect(e.maps[0].setBounds).toHaveBeenCalledTimes(1);a.clear();a.fit();expect(e.maps[0].setZoomAndCenter).toHaveBeenLastCalledWith(10,[116.307484,39.98412]);a.destroy()})

it('浮层展示已有类型、活跃与原始WGS84，所有业务文字仍作为文本',()=>{const e=engine(),a=directoryAmapAdapter(e.sdk,document.createElement('div'),()=>true,vi.fn(),vi.fn());a.render([{...point('a',116),details:{deviceTypeName:'<img src=x>',lastDataReportAt:'2026-11-03T09:00:00Z'}}]);a.select('a');const card=e.windows[0].options.content as HTMLElement;expect(card.querySelector('.mc-type')?.textContent).toBe('<img src=x>');expect(card.querySelector('img')).toBeNull();expect(card.querySelector('.mc-active')?.textContent).toContain('2026');expect(card.querySelector('.mc-latlng')?.textContent).toBe('0, 116');a.destroy()})

it('跨日期线勾选单点与当前标记使用同一未归一化世界副本',()=>{const e=engine(),a=directoryAmapAdapter(e.sdk,document.createElement('div'),()=>true,vi.fn(),vi.fn());a.render([point('a',179),point('b',-179)]);a.fit(['b']);expect(e.maps[0].setZoomAndCenter).toHaveBeenLastCalledWith(13,expect.objectContaining({lng:e.markers[1].options.position.lng,lat:0}));expect(e.maps[0].setZoomAndCenter.mock.calls.at(-1)[1].lng).toBe(181);a.destroy()})
