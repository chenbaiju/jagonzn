import {describe,it,expect} from 'vitest'
import {directoryMapProvider,directoryMapRows,directoryEffectiveMapRows,directoryMapBounds,canPlaceMapPoint,displayMapLongitude,osmTileUrl,type DirectoryMapRow} from '../../src/features/devices/directory-map'
const id='00000000-0000-4000-8000-000000000001'
const row=(longitude:number|null,latitude:number|null):DirectoryMapRow=>({deviceId:id,name:'测试点',longitude,latitude,version:'0',online:true})
describe('目录地图准入与真实坐标模型',()=>{
 it('无显式provider默认不允许公共瓦片，只有精确OSM HTTPS模板可用',()=>{expect(directoryMapProvider({})).toBeNull();expect(directoryMapProvider({VITE_DEVICE_MAP_PROVIDER:'',VITE_DEVICE_MAP_TILE_URL:''})).toBeNull();expect(directoryMapProvider({VITE_DEVICE_MAP_PROVIDER:'OSM_STANDARD',VITE_DEVICE_MAP_TILE_URL:osmTileUrl})).toMatchObject({id:'OSM_STANDARD',tileUrl:osmTileUrl})})
 it.each([osmTileUrl+'?deviceId=private',osmTileUrl.replace('https:','http:'),osmTileUrl.replace('tile.openstreetmap.org','evil.example'),osmTileUrl+'#token',''])('拒绝非白名单、查询或残缺模板 %s',url=>{expect(()=>directoryMapProvider({VITE_DEVICE_MAP_PROVIDER:'OSM_STANDARD',VITE_DEVICE_MAP_TILE_URL:url})).toThrow()})
 it('拒绝未知provider和仅填URL的半配置',()=>{expect(()=>directoryMapProvider({VITE_DEVICE_MAP_PROVIDER:'TENCENT',VITE_DEVICE_MAP_TILE_URL:osmTileUrl})).toThrow();expect(()=>directoryMapProvider({VITE_DEVICE_MAP_TILE_URL:osmTileUrl})).toThrow()})
 it('零点、大版本和已知空点严格保留；缺投影不当空点',()=>{
  const item={id,name:'原名称',status:'ONLINE' as const},fact={deviceId:id,deviceTypeId:null,deviceTypeName:null,deviceKind:null,staticGroups:[],lastDataReportAt:null,enabled:true,manualLocationPoint:{longitude:0,latitude:0,version:'9007199254740993'}}
  expect(directoryMapRows([item],{[id]:fact})).toEqual([{deviceId:id,name:'原名称',longitude:0,latitude:0,version:'9007199254740993',online:true}]);expect(()=>directoryMapRows([item],undefined)).toThrow()
  expect(directoryMapRows([item],{[id]:{...fact,manualLocationPoint:{longitude:null,latitude:null,version:'2'}}})[0]).toMatchObject({longitude:null,latitude:null});expect(directoryMapRows([],{})).toEqual([])
 })
 it('只有明确启用且ONLINE才画在线，停用或缺失启用事实不推定为true',()=>{
  const fact={deviceId:id,manualLocationPoint:{longitude:0,latitude:0,version:'0'}}
  for(const enabled of [false,undefined])expect(directoryMapRows([{id,status:'ONLINE'}],{[id]:{...fact,enabled}})[0]!.online).toBe(false)
  expect(directoryMapRows([{id,status:'OFFLINE'}],{[id]:{...fact,enabled:true}})[0]!.online).toBe(false)
  expect(directoryMapRows([{id,status:'ONLINE'}],{[id]:{...fact,enabled:true}})[0]!.online).toBe(true)
 })
 it('极区合法点保留原值但不可放到Mercator底图，空点不成为0,0',()=>{expect(canPlaceMapPoint(row(0,0))).toBe(true);expect(canPlaceMapPoint(row(180,90))).toBe(false);expect(canPlaceMapPoint(row(-180,-90))).toBe(false);expect(canPlaceMapPoint(row(null,null))).toBe(false);expect(directoryMapBounds([row(180,90),row(null,null)])).toBeNull()})
 it('普通点/重叠点与反经线取最小经度跨度',()=>{expect(directoryMapBounds([row(120,30),row(121,31)])).toEqual({south:30,north:31,west:120,east:121});expect(directoryMapBounds([row(0,0),row(0,0)])).toEqual({south:0,north:0,west:0,east:0});const bounds=directoryMapBounds([row(179,1),row(-179,2)])!;expect(bounds.east-bounds.west).toBe(2);expect(displayMapLongitude(-179,bounds.west)).toBe(181)})
})

it('有效点显式关闭不得回退原人工点，人工模式保持版本且缺观察整页拒绝',()=>{
 const item={id,name:'设备',status:'ONLINE' as const},fact={deviceId:id,deviceTypeId:null,deviceTypeName:null,deviceKind:null,staticGroups:[],lastDataReportAt:null,enabled:true,manualLocationPoint:{longitude:120,latitude:30,version:'7'}}
 const disabled=directoryEffectiveMapRows([item],{[id]:{...fact,locationObservation:{source:'DISABLED',longitude:null,latitude:null,manualVersion:null}}})
 expect(disabled[0]).toMatchObject({longitude:null,latitude:null,version:null,locationSource:'DISABLED'});expect(directoryMapBounds(disabled)).toBeNull();expect(()=>directoryEffectiveMapRows([item],{[id]:fact})).toThrow();expect(directoryEffectiveMapRows([item],{[id]:{...fact,locationObservation:{source:'MANUAL',longitude:12.5,latitude:-34.5,manualVersion:'9007199254740993'}}})[0]).toMatchObject({longitude:12.5,latitude:-34.5,version:'9007199254740993'});expect(fact.manualLocationPoint.version).toBe('7')
})
