import {describe,it,expect} from 'vitest'
import {directoryDisplayFacts,staticGroupPath} from '../../src/features/devices/directory-display-facts'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const fact=(n:number)=>({deviceId:id(n),deviceTypeId:null,deviceTypeName:null,deviceKind:null,manualLocationPoint:null,staticGroups:[],lastDataReportAt:null,enabled:true})
describe('同页展示事实',()=>{
 it('组颜色接受缺省、null及六位十六进制，拒绝无效内容',()=>{
  for(const color of [undefined,null,'#ff1493','#00AA55'])expect(directoryDisplayFacts([{id:id(1)}],[{...fact(1),staticGroups:[{id:id(3),name:'组',color}]}])?.[id(1)]?.staticGroups?.[0]?.color).toBe(color)
  for(const color of ['red','#fff','#12345678','url(test)',123])expect(()=>directoryDisplayFacts([{id:id(1)}],[{...fact(1),staticGroups:[{id:id(3),name:'组',color}]}])).toThrow()
 })
 it('组父链接受缺省、null、空及根到父名称链，拒绝空名、超长和非数组',()=>{
  const withPath=(ancestors:unknown)=>({...fact(1),staticGroups:[{id:id(3),name:'子组',ancestors}] as any})
  for(const ancestors of [undefined,null,[],['根'],['根','父']])expect(()=>directoryDisplayFacts([{id:id(1)}],[withPath(ancestors)])).not.toThrow()
  for(const ancestors of ['根',[null],[''],[' '],Array.from({length:17},(_,i)=>'组'+i),123,{}])expect(()=>directoryDisplayFacts([{id:id(1)}],[withPath(ancestors)])).toThrow()
 })
 it('组卡片路径由父链和组名组成，缺父链时只显示组名',()=>{
  expect(staticGroupPath({name:'子组',ancestors:['根','父']})).toBe('根/父/子组')
  expect(staticGroupPath({name:'根组'})).toBe('根组')
  expect(staticGroupPath({name:'根组',ancestors:[]})).toBe('根组')
 })
 it('未知不从lastOnline回填，旧运行实例缺整个字段时保持未知',()=>{expect(directoryDisplayFacts([{id:id(1),lastOnlineAt:'2026-10-24T00:00:00Z'}],[fact(1)])?.[id(1)]?.lastDataReportAt).toBeNull();expect(directoryDisplayFacts([{id:id(1)}],undefined)).toBeUndefined()})
 it('当前页顺序、重复、缺项、跨设备、类型和组身份不符即拒绝',()=>{const items=[{id:id(1)},{id:id(2)}];for(const values of [[fact(1)],[fact(2),fact(1)],[fact(1),fact(1)],[fact(1),{...fact(2),deviceTypeName:'无绑定的名称'}],[fact(1),{...fact(2),staticGroups:[{id:id(3),name:'组'},{id:id(3),name:'重复'}]}],[fact(1),{...fact(2),lastDataReportAt:'invalid'}]])expect(()=>directoryDisplayFacts(items,values)).toThrow()})
 it('同页类型种类只接受正式枚举或null，旧字段缺失明确归一为未知',()=>{
  for(const deviceKind of ['DIRECT','GATEWAY','SUB_DEVICE',null])expect(directoryDisplayFacts([{id:id(1)}],[{...fact(1),deviceTypeId:id(9),deviceKind}])?.[id(1)]?.deviceKind).toBe(deviceKind)
  const {deviceKind:_,...legacy}=fact(1);expect(directoryDisplayFacts([{id:id(1)}],[legacy])?.[id(1)]?.deviceKind).toBeNull()
 })
 it('非法种类及无类型绑定却带种类的投影拒绝，不借首页选项修补',()=>{
  for(const deviceKind of ['UNKNOWN','',0,false,{}])expect(()=>directoryDisplayFacts([{id:id(1)}],[{...fact(1),deviceTypeId:id(9),deviceKind}])).toThrow()
  for(const deviceKind of ['DIRECT','GATEWAY','SUB_DEVICE'])expect(()=>directoryDisplayFacts([{id:id(1)}],[{...fact(1),deviceKind}])).toThrow()
 })
 it('旧投影未请求手工坐标与明确null均保持未知，不伪装已知未设置',()=>{
  const {manualLocationPoint:_,...legacy}=fact(1)
  expect(directoryDisplayFacts([{id:id(1)}],[legacy])?.[id(1)]?.manualLocationPoint).toBeNull()
  expect(directoryDisplayFacts([{id:id(1)}],[fact(1)])?.[id(1)]?.manualLocationPoint).toBeNull()
 })
 it('已请求手工坐标保留零点、双null和Long.MAX版本，读取后不受输入对象后改影响',()=>{
  const point={longitude:0,latitude:0,version:'9223372036854775807'}
  const result=directoryDisplayFacts([{id:id(1)},{id:id(2)}],[{...fact(1),manualLocationPoint:point},{...fact(2),manualLocationPoint:{longitude:null,latitude:null,version:'0'}}])!
  point.longitude=120;point.version='1'
  expect(result[id(1)]!.manualLocationPoint).toEqual({longitude:0,latitude:0,version:'9223372036854775807'})
  expect(result[id(2)]!.manualLocationPoint).toEqual({longitude:null,latitude:null,version:'0'})
 })
 it.each([
  {longitude:null,latitude:0,version:'0'}, {longitude:0,latitude:null,version:'0'},
  {longitude:181,latitude:0,version:'0'}, {longitude:0,latitude:-91,version:'0'},
  {longitude:NaN,latitude:0,version:'0'}, {longitude:0,latitude:Infinity,version:'0'},
  {longitude:'0',latitude:0,version:'0'}, {longitude:0,latitude:0,version:0},
  ...['01','+1','1e3','','-1','9223372036854775808'].map(version=>({longitude:0,latitude:0,version})),
  {latitude:0,version:'0'}, {longitude:0,version:'0'}, {longitude:0,latitude:0}, [], 'unknown'
 ].map(manualLocationPoint=>({manualLocationPoint})))('坏手工坐标投影拒绝：$manualLocationPoint',({manualLocationPoint})=>{
  expect(()=>directoryDisplayFacts([{id:id(1)}],[{...fact(1),manualLocationPoint}])).toThrow()
 })
 it('类型删除保留绑定ID和未知名，空组只代表当前有效静态成员为空',()=>{const value={...fact(1),deviceTypeId:id(9)};expect(directoryDisplayFacts([{id:id(1)}],[value])?.[id(1)]).toEqual(value)})
})
