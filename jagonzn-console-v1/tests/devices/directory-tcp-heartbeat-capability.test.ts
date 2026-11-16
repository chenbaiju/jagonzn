import {expect,it} from 'vitest'
import {decodeDirectoryActivity,activitySupported} from '../../src/features/devices/directory-activity-capabilities'
import {directoryQuery} from '../../src/features/devices/directory-query'
const v2={contractVersion:2,policyReadSupported:true,mode:'POSITIVE_ONLY',observationEpoch:'tcp-v2',supportedFilters:['ACTIVE'],positiveKindsByProtocol:{MQTT:['PROPERTY_REPORT','EVENT'],HTTP:['PROPERTY_REPORT'],COAP:['PROPERTY_REPORT'],TCP:['PROPERTY_REPORT','HEARTBEAT']},negativeCoverage:'NOT_QUALIFIED',asOf:'2026-10-27T00:00:00.123456Z'}
it('v2仅TCP两类正证据并保持唯一ACTIVE筛选',()=>{const decoded=decodeDirectoryActivity(v2);expect(activitySupported(decoded)).toBe(true);expect(decoded?.contractVersion).toBe(2);expect(decoded?.positiveKindsByProtocol.TCP).toEqual(['PROPERTY_REPORT','HEARTBEAT']);expect(directoryQuery('','',{online:'',activity:'ACTIVE',alarm:'',enabled:'',kind:''},'CREATED_ASC',1,24,{groupId:'',tagKey:'',tagValue:''},decoded).activity).toBe('ACTIVE')})
it('v1原属性能力仍可读，数组不与输入共享',()=>{const raw=structuredClone(v2);const decoded=decodeDirectoryActivity(raw);raw.positiveKindsByProtocol.TCP.length=0;expect(decoded?.positiveKindsByProtocol.TCP).toEqual(['PROPERTY_REPORT','HEARTBEAT']);const old=decodeDirectoryActivity({...v2,contractVersion:1,positiveKindsByProtocol:{...v2.positiveKindsByProtocol,TCP:['PROPERTY_REPORT']}});expect(old?.contractVersion).toBe(1);expect(activitySupported(old)).toBe(true)})
it.each([
 {...v2,contractVersion:3},
 {...v2,contractVersion:1},
 {...v2,contractVersion:'2'},
 {...v2,mode:'DISABLED',observationEpoch:null,supportedFilters:[],positiveKindsByProtocol:{MQTT:[],HTTP:[],COAP:[],TCP:[]}},
 {...v2,positiveKindsByProtocol:{...v2.positiveKindsByProtocol,TCP:['PROPERTY_REPORT']}},
 {...v2,positiveKindsByProtocol:{...v2.positiveKindsByProtocol,TCP:['HEARTBEAT','PROPERTY_REPORT']}},
 {...v2,positiveKindsByProtocol:{...v2.positiveKindsByProtocol,TCP:['PROPERTY_REPORT','HEARTBEAT','HEARTBEAT']}},
 {...v2,positiveKindsByProtocol:{...v2.positiveKindsByProtocol,HTTP:['PROPERTY_REPORT','HEARTBEAT']}},
 {...v2,positiveKindsByProtocol:{...v2.positiveKindsByProtocol,COAP:['HEARTBEAT']}},
 {...v2,negativeCoverage:'QUALIFIED'},
 {...v2,supportedFilters:['ACTIVE','INACTIVE']},
])('非法版本/跨协议/负覆盖不降级为合法能力',raw=>expect(()=>decodeDirectoryActivity(raw)).toThrow())

it.each([
 '2026-02-30T00:00:00Z','2026-04-31T00:00:00Z','1900-02-29T00:00:00Z',
 '0100-02-29T00:00:00Z','2025-02-29T00:00:00Z','2026-00-01T00:00:00Z',
 '2026-13-01T00:00:00Z','2026-01-00T00:00:00Z','2026-01-32T00:00:00Z',
 '2026-10-27T24:00:00Z','2026-10-27T23:60:00Z','2026-10-27T23:59:60Z',
 '2026-10-27T00:00:00+24:00','2026-10-27T00:00:00-24:00',
 '2026-10-27T00:00:00+08:60','2026-10-27T00:00:00-23:60',
 '2026-10-27T00:00:00.Z','2026-10-27T00:00:00.1234567890Z',
 '2026-10-27T00:00:00','2026-10-27T00:00:00+8:00',
])('目录asOf拒不存在日期/24h/闰秒/坏偏移且不宽松归一化：%s',asOf=>{
 expect(()=>decodeDirectoryActivity({...v2,asOf})).toThrow('目录活跃能力无效')
 const v1={...v2,contractVersion:1,positiveKindsByProtocol:{...v2.positiveKindsByProtocol,TCP:['PROPERTY_REPORT']},asOf}
 expect(()=>decodeDirectoryActivity(v1)).toThrow('目录活跃能力无效')
})
it.each([
 '2024-02-29T23:59:59Z','2000-02-29T00:00:00Z','2400-02-29T00:00:00Z',
 '0000-02-29T00:00:00Z','0096-02-29T00:00:00Z','0099-12-31T23:59:59Z',
 '2026-04-30T23:59:59.1Z','2026-10-27T00:00:00.123456789Z',
 '2026-10-27T08:00:00.123456789+08:00','2026-10-26T23:30:00.000000001-00:30',
 '2026-10-27T00:00:00+23:59','2026-10-27T00:00:00-23:59',
])('目录asOf合法公历/小年份/纳秒及偏移原文逐字保留：%s',asOf=>{
 expect(decodeDirectoryActivity({...v2,asOf})?.asOf).toBe(asOf)
 const v1={...v2,contractVersion:1,positiveKindsByProtocol:{...v2.positiveKindsByProtocol,TCP:['PROPERTY_REPORT']},asOf}
 expect(decodeDirectoryActivity(v1)?.asOf).toBe(asOf)
})
