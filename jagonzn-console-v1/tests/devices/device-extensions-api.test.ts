import {beforeEach,describe,expect,it,vi} from 'vitest'
import {decodeExtensionSchema,decodeExtensionValues,prepareExtensionValues,submitExtensionValues,prepareExtensionDefinitions,submitExtensionDefinitions,validExtensionScalar,type ExtensionField} from '../../src/features/devices/device-extensions-api'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',()=>({api:state.api}))
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',type='00000000-0000-4000-8000-000000000003',fieldId='00000000-0000-4000-8000-000000000004'
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
function field(kind='TEXT',defaultValue:string|null='默认'):ExtensionField{return {id:fieldId,name:'维护人',description:'负责人',kind:kind as ExtensionField['kind'],enabled:true,options:kind==='SELECT'?['安装','维护']:[],defaultValue,onLabel:kind==='SWITCH'?'开启':null,offLabel:kind==='SWITCH'?'关闭':null}}
function row(value:string|null=null,definition=field()){return {deviceId:device,deviceTypeId:type,definitionRevision:1,valueRevision:value===null?0:1,fields:[{definition,value,effectiveValue:value??definition.defaultValue}]}}
const scope={project,device},signal=()=>new AbortController().signal
beforeEach(()=>state.api.mockReset())
describe('设备扩展信息正式合同适配',()=>{
 it('默认值不冒充人工值，false、0和空字符串按精确文本保留',()=>{
  expect(decodeExtensionValues(encode(row()),device).fields[0]).toMatchObject({value:null,effectiveValue:'默认'})
  for(const [kind,value] of [['TEXT',''],['SWITCH','false'],['NUMBER','0'],['NUMBER','9007199254740993.12345678901234567890']]){
   const result=decodeExtensionValues(encode(row(value!,field(kind!,null))),device)
   expect(result.fields[0]!.value).toBe(value);expect(result.fields[0]!.effectiveValue).toBe(value)
  }
 })
 it('未绑定类型和缺失定义是明确空态，不能夹带旧类型字段',()=>{
  expect(decodeExtensionValues(encode({deviceId:device,deviceTypeId:null,definitionRevision:0,valueRevision:0,fields:[]}),device).deviceTypeId).toBeNull()
  expect(decodeExtensionSchema(encode({deviceTypeId:type,revision:0,fields:[]}),type).fields).toEqual([])
  expect(()=>decodeExtensionValues(encode({...row(),deviceTypeId:null}),device)).toThrow()
  expect(()=>decodeExtensionSchema(encode({deviceTypeId:type,revision:0,fields:[field()]}),type)).toThrow()
 })
 it('错误设备、缺字段、重复字段、未来字段和不一致有效值不能成为成功读取',()=>{
  const mutate=[(r:any)=>r.deviceId=project,(r:any)=>delete r.valueRevision,(r:any)=>r.extra=true,(r:any)=>r.fields[0].effectiveValue='错误',(r:any)=>r.fields.push(r.fields[0]),(r:any)=>r.fields[0].definition.enabled=false,(r:any)=>r.fields[0].value=0]
  for(const change of mutate){const value=row();change(value);expect(()=>decodeExtensionValues(encode(value),device)).toThrow()}
  expect(()=>decodeExtensionValues(new TextEncoder().encode(JSON.stringify(row()).replace('"valueRevision":0','"valueRevision":0,"valueRevision":0')),device)).toThrow()
 })
 it('版本拒绝小数、负数、指数、字符串和溢出且拒绝超大完整响应',()=>{
  for(const value of ['-1','1.0','1e0','"1"','2147483648','-0'])expect(()=>decodeExtensionValues(new TextEncoder().encode(JSON.stringify(row()).replace('"valueRevision":0',`"valueRevision":${value}`)),device)).toThrow()
  expect(()=>decodeExtensionValues(new Uint8Array(262145),device)).toThrow()
 })
 it('选择值、严格日期时间和链接协议受控，精确大数不经Number转换',()=>{
  expect(validExtensionScalar(field('NUMBER',null),'9007199254740993.123456789')).toBe(true)
  for(const [kind,value] of [['NUMBER','1e3'],['NUMBER','01'],['DATE','2026-02-29'],['TIME','24:00'],['URL','javascript:alert(1)'],['URL','https:/example.org'],['SELECT','未知']])expect(validExtensionScalar(field(kind!,null),value!)).toBe(false)
  for(const [kind,value] of [['DATE','2024-02-29'],['TIME','00:00'],['URL','https://example.org/x'],['SELECT','维护']])expect(validExtensionScalar(field(kind!,null),value!)).toBe(true)
 })
 it('冻结原始类型和双版本及输入值，不用后续读取静默覆盖保存前提',()=>{
  const before=row('原值'),values=[{fieldId,value:'新值'}],intent=prepareExtensionValues(scope,before,values)
  before.fields[0]!.value='后来变化';values[0]!.value='另一个草稿'
  expect(intent.before.fields[0]!.value).toBe('原值');expect(intent.values[0]!.value).toBe('新值');expect(Object.isFrozen(intent.before.fields[0]!.definition.options)).toBe(true)
 })
 it('实际保存只发当前设备一次PUT，回执必须匹配原类型、定义和值差额',async()=>{
  const exact='9007199254740993.12345678901234567890',before=row(null,field('NUMBER',null)),intent=prepareExtensionValues(scope,before,[{fieldId,value:exact}]);state.api.mockResolvedValueOnce(encode(row(exact,field('NUMBER',null))))
  expect((await submitExtensionValues(intent,signal())).fields[0]!.value).toBe(exact)
  expect(state.api).toHaveBeenCalledTimes(1);expect(state.api.mock.calls[0]![0]).toBe(`/api/v1/projects/${project}/devices/${device}/extension-values`)
  expect(state.api.mock.calls[0]![1].body).toEqual({expectedDeviceTypeId:type,expectedDefinitionRevision:1,expectedValueRevision:0,values:[{fieldId,value:exact}]})
 })
 it('错误2xx不自动重发或补偿，省略条目清空后可显示默认值',async()=>{
  const intent=prepareExtensionValues(scope,row('原值'),[])
  state.api.mockResolvedValueOnce(encode({...row(),valueRevision:1}))
  await expect(submitExtensionValues(intent,signal())).rejects.toThrow();expect(state.api).toHaveBeenCalledTimes(1)
  state.api.mockReset().mockResolvedValueOnce(encode({...row(),valueRevision:2}));expect((await submitExtensionValues(intent,signal())).fields[0]!.value).toBeNull()
 })
 it('相同存值不增加版本，未知或重复字段在发请求前拒绝',async()=>{
  const before=row('原值'),intent=prepareExtensionValues(scope,before,[{fieldId,value:'原值'}]);state.api.mockResolvedValueOnce(encode(before));expect((await submitExtensionValues(intent,signal())).valueRevision).toBe(1)
  expect(()=>prepareExtensionValues(scope,before,[{fieldId:project,value:'x'}])).toThrow()
  expect(()=>prepareExtensionValues(scope,before,[{fieldId,value:'x'},{fieldId,value:'y'}])).toThrow()
 })
 it('定义保留稳定类型和原选项，只允许追加选项或改显示元数据',()=>{
  const original=field('SELECT','安装'),before={deviceTypeId:type,revision:3,fields:[original]}
  expect(prepareExtensionDefinitions({project,type},before,[{...original,name:'安装状态',options:['安装','维护','回收']}]).fields[0]!.options).toHaveLength(3)
  expect(()=>prepareExtensionDefinitions({project,type},before,[field('TEXT','')])).toThrow()
  expect(()=>prepareExtensionDefinitions({project,type},before,[{...original,options:['维护','安装']}])).toThrow()
 })
 it('定义写回要求完整字段与精确版本，空定义和无改动保存分别核验',async()=>{
  const before={deviceTypeId:type,revision:3,fields:[field()]};state.api.mockResolvedValueOnce(encode({...before,revision:4,fields:[]}))
  expect((await submitExtensionDefinitions(prepareExtensionDefinitions({project,type},before,[]),signal())).revision).toBe(4)
  state.api.mockResolvedValueOnce(encode(before));expect((await submitExtensionDefinitions(prepareExtensionDefinitions({project,type},before,before.fields),signal())).revision).toBe(3)
  expect(state.api.mock.calls[0]![1].body).toEqual({expectedRevision:3,fields:[]})
 })
 it('电话原文和多行描述按Source类型保留，电话不隐式改写为数字或账号标识',()=>{
  const phone={...field('PHONE',null),description:'安装电话\n支持分机'},actual='+86 (755) 1234-5678 转 12'
  const result=decodeExtensionValues(encode(row(actual,phone)),device)
  expect(result.fields[0]!.definition.kind).toBe('PHONE');expect(result.fields[0]!.definition.description).toBe('安装电话\n支持分机');expect(result.fields[0]!.value).toBe(actual)
  expect(validExtensionScalar(phone,'1'.repeat(65))).toBe(false);expect(validExtensionScalar(phone,'123\n456')).toBe(false)
 })
})
