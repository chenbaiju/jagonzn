import {expect,it} from 'vitest'
import {decodeDirectoryActivity,activitySupported} from '../../src/features/devices/directory-activity-capabilities'
import {directoryQuery} from '../../src/features/devices/directory-query'
function bounded(){return{contractVersion:4,policyReadSupported:true,mode:'BOUNDED_WINDOW',observationEpoch:'bounded-v4',supportedFilters:['ACTIVE','INACTIVE'],positiveKindsByProtocol:{MQTT:['PROPERTY_REPORT','EVENT','HEARTBEAT'],HTTP:['PROPERTY_REPORT'],COAP:['PROPERTY_REPORT'],TCP:['PROPERTY_REPORT','HEARTBEAT']},negativeCoverage:'QUALIFIED_WHEN_COMPLETE',asOf:'2026-10-28T08:00:00.123456789+08:00'}}
it('v4精确窗口合同允许两个筛选，保留原asOf且返回数组隔离',()=>{
 const raw=bounded(),decoded=decodeDirectoryActivity(raw)
 expect(decoded?.contractVersion).toBe(4);expect(decoded?.asOf).toBe(raw.asOf)
 for(const activity of ['ACTIVE','INACTIVE'] as const){
  expect(activitySupported(decoded,activity)).toBe(true)
  expect(directoryQuery('','',{online:'',activity,alarm:'',enabled:'',kind:''},'CREATED_ASC',1,24,{groupId:'',tagKey:'',tagValue:''},decoded).activity).toBe(activity)
 }
 raw.supportedFilters.length=0;raw.positiveKindsByProtocol.TCP.length=0
 expect(decoded?.supportedFilters).toEqual(['ACTIVE','INACTIVE']);expect(decoded?.positiveKindsByProtocol.TCP).toEqual(['PROPERTY_REPORT','HEARTBEAT'])
})
it('v4拒不完整窗口或跨版本负向扩权，旧版本仍不能发送INACTIVE',()=>{
 const base=bounded()
 for(const raw of [{...base,mode:'POSITIVE_ONLY'},{...base,negativeCoverage:'NOT_QUALIFIED'},{...base,supportedFilters:['INACTIVE','ACTIVE']},{...base,supportedFilters:['ACTIVE']},{...base,observationEpoch:null},{...base,asOf:'2026-10-28T24:00:00Z'},{...base,positiveKindsByProtocol:{...base.positiveKindsByProtocol,TCP:['PROPERTY_REPORT']}},{...base,positiveKindsByProtocol:{...base.positiveKindsByProtocol,HTTP:['PROPERTY_REPORT','HEARTBEAT']}}])expect(()=>decodeDirectoryActivity(raw)).toThrow('目录活跃能力无效')
 for(const contractVersion of [1,2,3]){
  expect(()=>decodeDirectoryActivity({...base,contractVersion})).toThrow()
  const old=decodeDirectoryActivity({...base,contractVersion,mode:'POSITIVE_ONLY',supportedFilters:['ACTIVE'],negativeCoverage:'NOT_QUALIFIED',positiveKindsByProtocol:{...base.positiveKindsByProtocol,MQTT:contractVersion===3?['PROPERTY_REPORT','EVENT','HEARTBEAT']:['PROPERTY_REPORT','EVENT'],TCP:contractVersion===1?['PROPERTY_REPORT']:['PROPERTY_REPORT','HEARTBEAT']}})
  expect(activitySupported(old,'INACTIVE')).toBe(false)
  expect(()=>directoryQuery('','',{online:'',activity:'INACTIVE',alarm:'',enabled:'',kind:''},'CREATED_ASC',1,24,{groupId:'',tagKey:'',tagValue:''},old)).toThrow()
 }
})
