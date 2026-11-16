import {describe,it,expect} from 'vitest'
import {directoryDisplayFacts} from '../../src/features/devices/directory-display-facts'
import {decodeDirectoryManualLocation,directoryManualLocations} from '../../src/features/devices/directory-manual-location'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const point=(longitude:number|null=0,latitude:number|null=0,version='0')=>({longitude,latitude,version})
function page(order=[1,2]){
 const items=order.map(n=>({id:id(n)}))
 const facts=directoryDisplayFacts(items,items.map(item=>({deviceId:item.id,deviceTypeId:null,deviceTypeName:null,deviceKind:null,manualLocationPoint:point(),staticGroups:[],lastDataReportAt:null,enabled:true})))!
 return {items,facts}
}
describe('当前页手工位置只读投影',()=>{
 it('按设备页顺序保留零点、已知未设置和大版本，不按映射键顺序或过滤空值',()=>{
  const {items,facts}=page([3,1,2])
  facts[id(3)]!.manualLocationPoint=point(0,0,'9007199254740993')
  facts[id(1)]!.manualLocationPoint=point(null,null,'0')
  facts[id(2)]!.manualLocationPoint=point(180,-90,'9223372036854775807')
  const reversed=Object.fromEntries(Object.entries(facts).reverse())
  expect(directoryManualLocations(items,reversed)).toEqual([
   {deviceId:id(3),point:point(0,0,'9007199254740993')},
   {deviceId:id(1),point:point(null,null,'0')},
   {deviceId:id(2),point:point(180,-90,'9223372036854775807')}
  ])
 })
 it('混有未请求或整页投影缺失时拒绝，不冒充全部设备均无坐标',()=>{
  const {items,facts}=page();facts[id(2)]!.manualLocationPoint=null
  expect(()=>directoryManualLocations(items,facts)).toThrow('尚未请求')
  facts[id(1)]!.manualLocationPoint=null
  expect(()=>directoryManualLocations(items,facts)).toThrow('尚未请求')
  expect(()=>directoryManualLocations(items,undefined)).toThrow()
  expect(()=>directoryManualLocations(undefined,facts)).toThrow()
 })
 it('缺行、额外设备、跨设备身份或重复页身份拒绝，不拼不同页面',()=>{
  const {items,facts}=page()
  expect(()=>directoryManualLocations(items,{[id(1)]:facts[id(1)]!})).toThrow()
  expect(()=>directoryManualLocations(items,{...facts,[id(3)]:{...facts[id(1)]!,deviceId:id(3)}})).toThrow()
  expect(()=>directoryManualLocations(items,{...facts,[id(2)]:{...facts[id(2)]!,deviceId:id(3)}})).toThrow()
  expect(()=>directoryManualLocations([{id:id(1)},{id:id(1)}],facts)).toThrow()
 })
 it('读取投影与原事实对象解耦，后改坐标、版本和映射不污染已选快照',()=>{
  const {items,facts}=page([1]);const original=point(12.123456,-34.654321,'9007199254740993');facts[id(1)]!.manualLocationPoint=original
  const result=directoryManualLocations(items,facts)
  original.longitude=120;original.version='2';facts[id(1)]!.manualLocationPoint=point(null,null,'3')
  expect(result).toEqual([{deviceId:id(1),point:point(12.123456,-34.654321,'9007199254740993')}])
 })
 it('UI单页96全部保留，97即拒绝而不是沿后台200上限或静默截断',()=>{
  const accepted=page(Array.from({length:96},(_,i)=>i+1));expect(directoryManualLocations(accepted.items,accepted.facts)).toHaveLength(96)
  const extra={id:id(97)};expect(()=>directoryManualLocations([...accepted.items,extra],{...accepted.facts,[extra.id]:{...accepted.facts[id(1)]!,deviceId:extra.id}})).toThrow()
  expect(directoryManualLocations([],{})).toEqual([])
 })
 it('合法WGS84两端与完整坐标读取通过，不接受额外字段或原型继承字段',()=>{
  expect(decodeDirectoryManualLocation(point(-180,90))).toEqual(point(-180,90))
  expect(decodeDirectoryManualLocation(point(180,-90))).toEqual(point(180,-90))
  expect(()=>decodeDirectoryManualLocation({...point(),extra:true})).toThrow()
  expect(()=>decodeDirectoryManualLocation(Object.create(point()))).toThrow()
 })
})
