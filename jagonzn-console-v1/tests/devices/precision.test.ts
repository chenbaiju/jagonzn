import {describe,it,expect} from 'vitest'
import {decodePropertyPage} from '../../src/features/devices/property-decoder'
import {reportedValues,valueText} from '../../src/features/devices/strict-values'
const bytes=(s:string)=>new TextEncoder().encode(s)
describe('设备值与原始历史精度',()=>{
 it('大整数与高精度小数不经过JS Number',()=>{const data=reportedValues('{"n":9007199254740993,"d":0.1234567890123456789}');expect(valueText(data.n)).toBe('9007199254740993');expect(valueText(data.d)).toBe('0.1234567890123456789')})
 const page=(id='device')=>`{"items":[{"deviceId":"${id}","propertyKey":"temperature","ts":"2026-10-24T00:00:00.123456789Z","value":9007199254740993,"dataType":"NUMBER","thingModelVersionId":null,"modelVersion":"1","quality":0}],"nextCursor":null,"hasMore":false}`
 it('原始历史值和UTC纳秒保真',()=>{const result=decodePropertyPage(bytes(page()),'device');expect(result.items[0].valueText).toBe('9007199254740993');expect(result.items[0].ts).toBe('2026-10-24T00:00:00.123456789Z')})
 it('拒绝其它设备或不完整分页信封',()=>{expect(()=>decodePropertyPage(bytes(page('other')),'device')).toThrow();expect(()=>decodePropertyPage(bytes(page().replace('"hasMore":false','"hasMore":true')),'device')).toThrow()})
 it('三编码原始历史保留0和OFF，旧布尔八字段兼容且高精度近1值不误收',()=>{
  const encoded=(raw:string,encoding?:string)=>page().replace('9007199254740993',raw).replace('"dataType":"NUMBER"',`"dataType":"SWITCH"${encoding?`,"switchEncoding":"${encoding}"`:''}`)
  for(const [raw,encoding] of [['false',undefined],['1.0','NUMBER'],['-0','NUMBER'],['"OFF"','TEXT']] as const)expect(decodePropertyPage(bytes(encoded(raw,encoding)),'device').items[0]!.valueText).toBe(raw)
  for(const [raw,encoding] of [['true','NUMBER'],['1.0000000000000000001','NUMBER'],['1e-1000','NUMBER'],['"off"','TEXT'],['"1"','NUMBER'],['false','BOGUS']] as const)expect(()=>decodePropertyPage(bytes(encoded(raw,encoding)),'device')).toThrow()
 })
})
