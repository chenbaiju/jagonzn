import {describe,it,expect} from 'vitest'
import {directoryBaseMapProvider,directoryMapProvider,osmTileUrl} from '../../src/features/devices/directory-map'
const legacy={VITE_DEVICE_MAP_PROVIDER:'OSM_STANDARD',VITE_DEVICE_MAP_TILE_URL:osmTileUrl}
const configured=(key:unknown='unit-test-only-public-key')=>({...legacy,VITE_DEVICE_DIRECTORY_MAP_PROVIDER:'MAPTILER_RASTER',VITE_DEVICE_DIRECTORY_MAP_KEY:key})
describe('目录专属街道与卫星底图闭集配置',()=>{
 it('默认null与原OSM合同保持；OSM没有卫星层且旧位置编辑器不读取目录供应商',()=>{
  expect(directoryBaseMapProvider({})).toBeNull();expect(directoryBaseMapProvider({VITE_DEVICE_DIRECTORY_MAP_PROVIDER:'',VITE_DEVICE_DIRECTORY_MAP_KEY:''})).toBeNull()
  const provider=directoryBaseMapProvider(legacy)!
  expect(provider.id).toBe('OSM_STANDARD');expect(provider.layers.vector?.tileUrl).toBe(osmTileUrl);expect(provider.layers.satellite).toBeUndefined();expect(directoryMapProvider(configured())).toEqual(directoryMapProvider(legacy))
 })
 it('MapTiler固定两张官方栅格模板、512瓦片与偏移，不把街道模式当vector tiles',()=>{
  const provider=directoryBaseMapProvider(configured())!
  expect(provider.id).toBe('MAPTILER_RASTER');expect(Object.keys(provider.layers)).toEqual(['vector','satellite'])
  for(const[kind,id]of [['vector','streets-v4'],['satellite','satellite-v4']]as const){
   const layer=provider.layers[kind]!,url=new URL(layer.tileUrl)
   expect(url.origin).toBe('https://api.maptiler.com');expect(decodeURI(url.pathname)).toBe(`/maps/${id}/{z}/{x}/{y}.png`);expect([...url.searchParams.keys()]).toEqual(['key']);expect(url.hash).toBe('')
   expect(layer).toMatchObject({tileSize:512,zoomOffset:-1,minZoom:1,maxZoom:19});expect(layer.attribution).toContain('https://api.maptiler.com/resources/logo.svg');expect(layer.attribution).toContain('https://www.maptiler.com/copyright/');expect(layer.attribution).toContain('https://www.openstreetmap.org/copyright')
  }
 })
 it('公开key按opaque值安全encode，不能注入host/path/参数/fragment或署名HTML',()=>{
  const key='unit-only-&other=x?/#=汉字<image>';const provider=directoryBaseMapProvider(configured(key))!
  for(const layer of Object.values(provider.layers)){const url=new URL(layer.tileUrl);expect(url.searchParams.get('key')).toBe(key);expect([...url.searchParams.keys()]).toEqual(['key']);expect(url.origin).toBe('https://api.maptiler.com');expect(url.hash).toBe('');expect(layer.attribution).not.toContain(key);expect(layer.tileUrl).not.toContain('<image>')}
 })
 it.each([undefined,null,0,{},'', 'with space','line\nbreak','\u007f', 'x'.repeat(257),'\ud800'])('MapTiler拒绝缺失或非法key而不泄漏其值 %j',key=>{
  expect(()=>directoryBaseMapProvider({...configured(),VITE_DEVICE_DIRECTORY_MAP_KEY:key})).toThrow('目录地图底图配置无效')
 })
 it('拒绝未知/半配置而不回退OSM，也不采纳任意外部模板',()=>{
  for(const env of [{...legacy,VITE_DEVICE_DIRECTORY_MAP_KEY:'unit-only'},{...configured(),VITE_DEVICE_DIRECTORY_MAP_PROVIDER:'OTHER'}])expect(()=>directoryBaseMapProvider(env)).toThrow()
  const provider=directoryBaseMapProvider({...configured(),VITE_DEVICE_DIRECTORY_MAP_TILE_URL:'https://evil.example/private'})!
  expect(provider.layers.vector?.tileUrl).toContain('https://api.maptiler.com/maps/streets-v4/');expect(provider.layers.satellite?.tileUrl).not.toContain('evil')
 })
 it('配置与两层冻结，消费者不能原地扩大可用供应商或修改模板',()=>{const provider=directoryBaseMapProvider(configured())!;expect(Object.isFrozen(provider)).toBe(true);expect(Object.isFrozen(provider.layers)).toBe(true);expect(Object.isFrozen(provider.layers.vector)).toBe(true);expect(Object.isFrozen(provider.layers.satellite)).toBe(true)})
})
