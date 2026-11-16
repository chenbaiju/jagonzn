import {expect,it} from 'vitest'
import {decodeDirectoryActivity,activitySupported} from '../../src/features/devices/directory-activity-capabilities'
import {directoryQuery} from '../../src/features/devices/directory-query'

function capability(){return{contractVersion:3,policyReadSupported:true,mode:'POSITIVE_ONLY',observationEpoch:'mqtt-v3',supportedFilters:['ACTIVE'],positiveKindsByProtocol:{MQTT:['PROPERTY_REPORT','EVENT','HEARTBEAT'],HTTP:['PROPERTY_REPORT'],COAP:['PROPERTY_REPORT'],TCP:['PROPERTY_REPORT']},negativeCoverage:'NOT_QUALIFIED',asOf:'2026-10-28T08:00:00.123456789+08:00'}}

it('v3必须包含MQTT心跳且TCP只接受单报告或报告加心跳',()=>{
 for(const tcp of [['PROPERTY_REPORT'],['PROPERTY_REPORT','HEARTBEAT']]){
  const raw=capability();raw.positiveKindsByProtocol.TCP=tcp
  const decoded=decodeDirectoryActivity(raw)
  expect(decoded?.contractVersion).toBe(3);expect(activitySupported(decoded)).toBe(true)
  expect(decoded?.positiveKindsByProtocol.MQTT).toEqual(['PROPERTY_REPORT','EVENT','HEARTBEAT'])
  expect(decoded?.positiveKindsByProtocol.TCP).toEqual(tcp);expect(decoded?.asOf).toBe(raw.asOf)
  expect(directoryQuery('','',{online:'',activity:'ACTIVE',alarm:'',enabled:'',kind:''},'CREATED_ASC',1,24,{groupId:'',tagKey:'',tagValue:''},decoded).activity).toBe('ACTIVE')
 }
})

it('v3不能关闭或省略MQTT心跳，也不接受重排重复或跨协议扩权',()=>{
 const base=capability()
 const invalid=[
  {...base,mode:'DISABLED',observationEpoch:null,supportedFilters:[],positiveKindsByProtocol:{MQTT:[],HTTP:[],COAP:[],TCP:[]}},
  ...[['PROPERTY_REPORT','EVENT'],['HEARTBEAT','PROPERTY_REPORT','EVENT'],['PROPERTY_REPORT','EVENT','HEARTBEAT','HEARTBEAT']].map(MQTT=>({...base,positiveKindsByProtocol:{...base.positiveKindsByProtocol,MQTT}})),
  ...[[],['HEARTBEAT'],['HEARTBEAT','PROPERTY_REPORT'],['PROPERTY_REPORT','HEARTBEAT','HEARTBEAT']].map(TCP=>({...base,positiveKindsByProtocol:{...base.positiveKindsByProtocol,TCP}})),
  ...['HTTP','COAP'].map(protocol=>({...base,positiveKindsByProtocol:{...base.positiveKindsByProtocol,[protocol]:['PROPERTY_REPORT','HEARTBEAT']}})),
 ]
 for(const raw of invalid)expect(()=>decodeDirectoryActivity(raw)).toThrow('目录活跃能力无效')
})

it('新心跳枚举不会扩张v1或v2的原MQTT闭集',()=>{
 for(const contractVersion of [1,2]){
  const raw=capability();raw.contractVersion=contractVersion
  raw.positiveKindsByProtocol.TCP=contractVersion===2?['PROPERTY_REPORT','HEARTBEAT']:['PROPERTY_REPORT']
  expect(()=>decodeDirectoryActivity(raw)).toThrow()
  raw.positiveKindsByProtocol.MQTT=['PROPERTY_REPORT','EVENT']
  expect(decodeDirectoryActivity(raw)?.contractVersion).toBe(contractVersion)
 }
})

it('v3仍严格约束八字段、有效epoch、原文asOf及唯一ACTIVE负覆盖',()=>{
 const raw=capability(),{asOf:_,...missing}=raw
 for(const invalid of [missing,{...raw,extra:true},{...raw,contractVersion:'3'},{...raw,policyReadSupported:false},{...raw,observationEpoch:null},{...raw,observationEpoch:' bad'},{...raw,asOf:'2026-10-28T24:00:00Z'},{...raw,supportedFilters:['ACTIVE','INACTIVE']},{...raw,negativeCoverage:'QUALIFIED'}])expect(()=>decodeDirectoryActivity(invalid)).toThrow()
 const decoded=decodeDirectoryActivity(raw)
 expect(()=>directoryQuery('','',{online:'',activity:'INACTIVE',alarm:'',enabled:'',kind:''},'CREATED_ASC',1,24,{groupId:'',tagKey:'',tagValue:''},decoded)).toThrow()
})

it('v3所有返回数组与输入及另一次解码相互隔离',()=>{
 const raw=capability(),first=decodeDirectoryActivity(raw),second=decodeDirectoryActivity(raw)
 for(const protocol of ['MQTT','HTTP','COAP','TCP'] as const){
  expect(first?.positiveKindsByProtocol[protocol]).not.toBe(raw.positiveKindsByProtocol[protocol])
  raw.positiveKindsByProtocol[protocol].length=0
 }
 raw.supportedFilters.length=0
 expect(first?.supportedFilters).toEqual(['ACTIVE'])
 expect(first?.positiveKindsByProtocol.MQTT).toEqual(['PROPERTY_REPORT','EVENT','HEARTBEAT'])
 first?.supportedFilters.splice(0)
 expect(second?.supportedFilters).toEqual(['ACTIVE'])
 expect(second?.positiveKindsByProtocol.TCP).toEqual(['PROPERTY_REPORT'])
})
