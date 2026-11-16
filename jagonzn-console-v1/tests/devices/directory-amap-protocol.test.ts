import {it,expect} from 'vitest'
import {decodeParentMessage,decodeChildMessage,directoryAmapSdkServiceHost,validFrameConfiguration,validFrameRows,ownedFrameEvent,nextFrameGeneration,frameExpiryMillis,frameChannel} from '../../src/features/devices/directory-amap-protocol'
const pid='00000000-0000-4000-8000-000000000001',nonce='00000000-0000-4000-8000-000000000002'
const contextId='a'.repeat(43),configuration=()=>({contextId,serviceHost:`/api/v1/projects/${pid}/directory-map-contexts/${contextId}/_AMapService`,publicKey:'public-test-only',jsApiVersion:'2.0' as const,expiresAt:new Date(Date.now()+45000).toISOString()})
const row={deviceId:'device-a',name:'<img src=x>',longitude:0,latitude:0,online:false,version:'9007199254740993'}
const envelope={channel:frameChannel,nonce,generation:1,serial:1}
it('SDK代理绝对地址的一级路径符合高德校验，同时保留原项目上下文完整路径',()=>{const value=directoryAmapSdkServiceHost(configuration(),'https://console.test');const url=new URL(value);expect(url.origin).toBe('https://console.test');expect(url.pathname.split('/')[1]).toBe('_AMapService');expect(url.pathname.slice('/_AMapService'.length)).toBe(configuration().serviceHost)})
it('配置必须精确项目与派生路径，外部host/换项目/多字段/到期拒绝',()=>{expect(validFrameConfiguration(configuration(),pid)).toBe(true);for(const bad of [{...configuration(),serviceHost:'https://evil.test/'},{...configuration(),serviceHost:configuration().serviceHost.replace(pid,nonce)},{...configuration(),securityJsCode:'forbidden'},{...configuration(),expiresAt:new Date(Date.now()-1).toISOString()}])expect(validFrameConfiguration(bad,pid)).toBe(false)})
it('实例与代次均闭集，未知导航命令与非法serial拒绝',()=>{expect(decodeParentMessage({...envelope,kind:'fit'},nonce)?.kind).toBe('fit');for(const bad of [{...envelope,kind:'url',url:'https://evil.test/'},{...envelope,kind:'fit',serial:0},{...envelope,kind:'fit',generation:-1},{...envelope,kind:'fit',nonce:pid},{...envelope,kind:'fit',bearer:'forbidden'}])expect(decodeParentMessage(bad,nonce)).toBeNull()})
it('点集保零点及大版本字符串，拒重复身份/部分坐标/非有限/越界/97点',()=>{expect(validFrameRows([row,{...row,deviceId:'b',longitude:null,latitude:null}])).toBe(true);for(const bad of [[row,row],[{...row,longitude:null}],[{...row,longitude:Infinity}],[{...row,latitude:91}],Array.from({length:97},(_,i)=>({...row,deviceId:String(i)}))])expect(validFrameRows(bad)).toBe(false)})
it('init闭集不接受额外token，选点必须在该消息点集',()=>{const init={...envelope,kind:'init',configuration:configuration(),projectId:pid,rows:[row],selected:'device-a',baseMap:'vector'};expect(decodeParentMessage(init,nonce)?.kind).toBe('init');expect(decodeParentMessage({...init,token:'x'},nonce)).toBeNull();expect(decodeParentMessage({...init,selected:'outside'},nonce)).toBeNull()})
it('来自子页的身份必须属于当前页，错误仅限固定枚举且拒任意文本',()=>{expect(decodeChildMessage({...envelope,kind:'navigate',deviceId:'device-a'},nonce,new Set(['device-a']))?.kind).toBe('navigate');expect(decodeChildMessage({...envelope,kind:'navigate',deviceId:'outside'},nonce,new Set(['device-a']))).toBeNull();expect(decodeChildMessage({...envelope,kind:'error',reason:'private URL'},nonce,new Set())).toBeNull()})
it('精确origin与Window源缺一不可，同nonce不代表窗口归属',()=>{const peer={} as Window,other={} as Window;expect(ownedFrameEvent({origin:'https://console.test',source:peer},'https://console.test',peer)).toBe(true);expect(ownedFrameEvent({origin:'https://evil.test',source:peer},'https://console.test',peer)).toBe(false);expect(ownedFrameEvent({origin:'https://console.test',source:other},'https://console.test',peer)).toBe(false);expect(ownedFrameEvent({origin:'https://console.test',source:null},'https://console.test',null)).toBe(false)})
it('代次不回绕或精度丢失，严格晚于旧查询',()=>{expect(nextFrameGeneration(0)).toBe(1);expect(nextFrameGeneration(9007199254740990)).toBe(9007199254740991);expect(()=>nextFrameGeneration(Number.MAX_SAFE_INTEGER)).toThrow();expect(()=>nextFrameGeneration(NaN)).toThrow()})
it('无当前project不接renew，非法session字段不能进入配置',()=>{expect(decodeParentMessage({...envelope,kind:'renew',configuration:configuration()},nonce)).toBeNull();expect(decodeParentMessage({...envelope,kind:'renew',configuration:configuration()},nonce,pid)?.kind).toBe('renew');expect(validFrameConfiguration({...configuration(),accessToken:'x'},pid)).toBe(false)})

it('到期Instant拒绝24点/闰秒/错误日期/超长fraction，保纳秒字符串精度边界',()=>{for(const value of ['2026-10-28T24:00:00Z','2026-10-28T00:00:60Z','2026-02-30T00:00:00Z','2026-10-28T00:00:00.1234567890Z'])expect(Number.isNaN(frameExpiryMillis(value))).toBe(true);expect(Number.isFinite(frameExpiryMillis('2026-10-28T00:00:00.123456789Z'))).toBe(true)})

it('显式来源保持原六字段兼容，reported不造人工版本，关闭不夹旧点或未知字段',()=>{
 expect(validFrameRows([row])).toBe(true);expect(validFrameRows([{...row,locationSource:'MANUAL'}])).toBe(true);expect(validFrameRows([{...row,version:null,locationSource:'REPORTED_PROPERTY'}])).toBe(true);expect(validFrameRows([{...row,longitude:null,latitude:null,version:null,locationSource:'DISABLED'}])).toBe(true);for(const bad of [{...row,version:null},{...row,locationSource:'REPORTED_PROPERTY'},{...row,locationSource:'DISABLED',version:null},{...row,locationSource:'FUTURE'},{...row,locationSource:'MANUAL',extra:1}])expect(validFrameRows([bad])).toBe(false)
})

it('太阳固定点用途独立闭集，不复用目录设备身份或透传凭据',()=>{
 const init={...envelope,kind:'picker-init',configuration:configuration(),projectId:pid,point:null,request:0}
 expect(decodeParentMessage(init,nonce)?.kind).toBe('picker-init')
 expect(decodeParentMessage({...init,point:{longitude:0,latitude:0}},nonce)?.kind).toBe('picker-init')
 for(const bad of [{...init,bearer:'x'},{...init,point:{longitude:0,latitude:91}},{...init,point:{longitude:0,latitude:0,deviceId:'x'}}])expect(decodeParentMessage(bad,nonce)).toBeNull()
 const query={...envelope,kind:'picker-query',request:2,query:{kind:'name',name:'北京'}}
 expect(decodeParentMessage(query,nonce)?.kind).toBe('picker-query');expect(decodeParentMessage({...query,query:{kind:'name',name:'a\n'}},nonce)).toBeNull()
 const result={...envelope,kind:'picker-result',request:2,point:{longitude:0,latitude:0},name:''}
 expect(decodeChildMessage(result,nonce,new Set())?.kind).toBe('picker-result')
 expect(decodeChildMessage({...result,name:'\ud800'},nonce,new Set())).toBeNull();expect(decodeChildMessage({...result,request:-1},nonce,new Set())).toBeNull()
})

it('范围设备身份有界且唯一，保持无参数全页fit与拒绝多字段',()=>{expect(decodeParentMessage({...envelope,kind:'fit',deviceIds:['a','b']},nonce)).toMatchObject({kind:'fit',deviceIds:['a','b']});for(const deviceIds of [[],['a','a'],[''],['x\n'],[123],Array.from({length:97},(_,i)=>String(i))])expect(decodeParentMessage({...envelope,kind:'fit',deviceIds},nonce)).toBeNull();expect(decodeParentMessage({...envelope,kind:'fit',deviceIds:['a'],url:'x'},nonce)).toBeNull()})

it('浮层只接目录已有的类型与活跃事实，拒绝未审字段或非法时间',()=>{const details={deviceTypeName:'温湿度',lastDataReportAt:'2026-11-03T09:00:00Z'};expect(validFrameRows([{...row,details}])).toBe(true);for(const bad of [{...details,url:'https://x'},{...details,lastDataReportAt:'tomorrow'},{...details,deviceTypeName:123}])expect(validFrameRows([{...row,details:bad}])).toBe(false)})

it('设备位置地图只接受有界整数缩放和布尔只读标记，未传时保留旧太阳选择器合同',()=>{const init={...envelope,kind:'picker-init',configuration:configuration(),projectId:pid,point:{longitude:0,latitude:0},request:0};expect(decodeParentMessage(init,nonce)?.kind).toBe('picker-init');expect(decodeParentMessage({...init,zoom:13,readOnly:true,appearance:'device-location'},nonce)?.kind).toBe('picker-init');for(const extra of [{zoom:1},{zoom:19},{zoom:13.5},{zoom:'13'},{readOnly:1},{appearance:'other'}])expect(decodeParentMessage({...init,...extra},nonce)).toBeNull()})
