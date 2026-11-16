import {inverseSolarMapPoint} from '../../src/features/rules/solar-amap-adapter'
import {describe,it,expect,vi} from 'vitest'
import {convertDirectoryAmapPoints,type CoordinatePair,type Wgs84Pair} from '../../src/features/devices/directory-amap-coordinates'
import type {DirectoryMapRow} from '../../src/features/devices/directory-map'

const row=(index:number,longitude:number|null=120,latitude:number|null=30):DirectoryMapRow=>({deviceId:`device-${index}`,name:`名称-${index}`,longitude,latitude,version:'9007199254740993',online:index%2===0})
const unchanged=async(points:readonly Wgs84Pair[]):Promise<readonly CoordinatePair[]>=>points
const invalidResults:{points:CoordinatePair[]}[]=[{points:[]},{points:[[NaN,30]]},{points:[[120,90]]},{points:[[120,30],[121,31]]}]
describe('目录高德显示坐标的只读有界转换',()=>{
 it('96行按40/40/16串行转换，只向供应商传坐标并保留原身份/顺序/大版本',async()=>{
  const rows=Array.from({length:96},(_,i)=>row(i)),before=JSON.stringify(rows)
  const sizes:number[]=[]
  const result=await convertDirectoryAmapPoints(rows,async points=>{sizes.push(points.length);expect(Object.isFrozen(points)).toBe(true);expect(points.every(p=>p.length===2&&Object.isFrozen(p))).toBe(true);return points.map(([lng,lat])=>[lng+.01,lat+.01] as const)},()=>true)
  expect(sizes).toEqual([40,40,16]);expect(JSON.stringify(rows)).toBe(before)
  expect(result).toHaveLength(96);expect(result!.map(p=>p.deviceId)).toEqual(rows.map(p=>p.deviceId));expect(result![0]).toEqual({deviceId:'device-0',name:'名称-0',version:'9007199254740993',online:true,sourceWgs84:[120,30],displayGcj02:[120.01,30.01]})
  expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result![0]!.sourceWgs84)).toBe(true);expect(Object.isFrozen(result![0]!.displayGcj02)).toBe(true)
 })
 it('零点/重复点/境外及跨日期变更线保留，空点和极区不送转换也不伪造零点',async()=>{
  const rows=[row(0,0,0),row(1,0,0),row(2,179,40),row(3,-179,-40),row(4,-74,41),row(5,null,null),row(6,180,90)]
  const convert=vi.fn(unchanged),result=await convertDirectoryAmapPoints(rows,convert,()=>true)
  expect(convert).toHaveBeenCalledExactlyOnceWith([[0,0],[0,0],[179,40],[-179,-40],[-74,41]])
  expect(result!.map(p=>p.deviceId)).toEqual(rows.slice(0,5).map(p=>p.deviceId));expect(rows[6]!.latitude).toBe(90)
 })
 it('空页不调用供应商，超96行拒绝而非截断',async()=>{
  const convert=vi.fn(unchanged);expect(await convertDirectoryAmapPoints([],convert,()=>true)).toEqual([])
  await expect(convertDirectoryAmapPoints(Array.from({length:97},(_,i)=>row(i)),convert,()=>true)).rejects.toThrow('上限');expect(convert).not.toHaveBeenCalled()
 })
 it.each([[NaN,30],[Infinity,30],[181,30],[120,91],[null,30],[120,null]])('拒绝原始无效或半空点 %s/%s',async(lng,lat)=>{
  const convert=vi.fn(unchanged);await expect(convertDirectoryAmapPoints([row(0,lng,lat)],convert,()=>true)).rejects.toThrow('原始坐标');expect(convert).not.toHaveBeenCalled()
 })
 it('重复身份整页拒绝，不把供应商按位置返回的点配给错误设备',async()=>{const convert=vi.fn(unchanged);await expect(convertDirectoryAmapPoints([row(0),row(0)],convert,()=>true)).rejects.toThrow('身份');expect(convert).not.toHaveBeenCalled()})
 it.each(invalidResults)('不接收缺项、额外项及无效显示点 $points',async({points})=>{
  await expect(convertDirectoryAmapPoints([row(0)],async()=>points,()=>true)).rejects.toThrow('转换结果')
 })
 it('第一批进行中失效后丢弃迟到成功，不请求下一批',async()=>{
  let active=true,finish!:(points:readonly CoordinatePair[])=>void
  const convert=vi.fn(()=>new Promise<readonly CoordinatePair[]>(resolve=>{finish=resolve}))
  const pending=convertDirectoryAmapPoints(Array.from({length:41},(_,i)=>row(i)),convert,()=>active)
  active=false;finish(Array.from({length:40},()=>[121,31] as const));expect(await pending).toBeNull();expect(convert).toHaveBeenCalledTimes(1)
 })
 it('失效后的错误不覆盖新范围，初始失效不请求',async()=>{
  let active=true,reject!:(error:Error)=>void
  const convert=vi.fn(()=>new Promise<readonly CoordinatePair[]>((_,r)=>{reject=r}))
  const pending=convertDirectoryAmapPoints([row(0)],convert,()=>active);active=false;reject(new Error('旧范围失败'));expect(await pending).toBeNull()
  expect(await convertDirectoryAmapPoints([row(0)],convert,()=>false)).toBeNull();expect(convert).toHaveBeenCalledTimes(1)
 })
 it('第二批失败只拒绝整页，不发布首批或自动重试',async()=>{
  const convert=vi.fn(unchanged).mockImplementationOnce(unchanged).mockRejectedValueOnce(new Error('供应商失败'))
  await expect(convertDirectoryAmapPoints(Array.from({length:41},(_,i)=>row(i)),convert,()=>true)).rejects.toThrow('供应商失败');expect(convert).toHaveBeenCalledTimes(2)
 })
 it('转换期间原行被外部修改不改变本批捕获的坐标和元数据',async()=>{
  const mutable={...row(0)};const result=await convertDirectoryAmapPoints([mutable],async points=>{mutable.name='新页';mutable.longitude=1;return points},()=>true)
  expect(result![0]).toMatchObject({name:'名称-0',sourceWgs84:[120,30],displayGcj02:[120,30]})
 })
})


it('关闭来源的空点可无版本且不转换，有坐标却无原版本必须拒绝',async()=>{
 const convert=vi.fn(unchanged);expect(await convertDirectoryAmapPoints([{...row(0,null,null),version:null,locationSource:'DISABLED'}],convert,()=>true)).toEqual([]);expect(convert).not.toHaveBeenCalled();await expect(convertDirectoryAmapPoints([{...row(1),version:null}],convert,()=>true)).rejects.toThrow('缺少原位置版本');expect(convert).not.toHaveBeenCalled()
})

it('真实报告来源允许空人工版本并只转换显示副本，未声明来源仍拒缺版本',async()=>{
 const report={...row(0),version:null,locationSource:'REPORTED_PROPERTY' as const},convert=vi.fn(unchanged);const actual=await convertDirectoryAmapPoints([report],convert,()=>true);expect(actual?.[0]?.version).toBeNull();expect(actual?.[0]?.sourceWgs84).toEqual([report.longitude,report.latitude]);expect(report.version).toBeNull();await expect(convertDirectoryAmapPoints([{...report,locationSource:'MANUAL'}],convert,()=>true)).rejects.toThrow('缺少原位置版本')
})

it('太阳拾点最多四校正再核六位候选，未收敛或失效不发布旧草稿',async()=>{
 const point={longitude:116.4,latitude:39.9},forward=vi.fn(async(p:{longitude:number;latitude:number})=>({longitude:p.longitude+.006,latitude:p.latitude+.002}))
 await expect(inverseSolarMapPoint(point,forward,()=>true)).resolves.toEqual({longitude:116.394,latitude:39.898});expect(forward).toHaveBeenCalledTimes(3)
 const drifting=vi.fn(async(p:{longitude:number;latitude:number})=>({longitude:116.5,latitude:39.9}))
 await expect(inverseSolarMapPoint(point,drifting,()=>true)).rejects.toThrow('转换');expect(drifting).toHaveBeenCalledTimes(5)
 let active=true,finish!:(point:{longitude:number;latitude:number})=>void;const delayed=vi.fn(()=>new Promise<{longitude:number;latitude:number}>(resolve=>{finish=resolve}));const pending=inverseSolarMapPoint(point,delayed,()=>active);active=false;finish(point);await expect(pending).rejects.toThrow('失效');expect(delayed).toHaveBeenCalledTimes(1)
})
