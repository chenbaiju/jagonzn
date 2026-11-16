import {afterEach,describe,expect,it,vi} from 'vitest'
import {changeIdentity,setAccessToken} from '../../src/core/http'
import {alarmRuleChoicePage,readAlarmRuleChoicePage,type AlarmRuleChoiceCatalogKind} from '../../src/features/alarms/alarm-rule-choice-catalog'
import {managementDevice,managementProject,managementRule} from './rule-management-fixture'
const page=<T>(items:T[],nextCursor:string|null=null)=>({items,nextCursor,hasMore:nextCursor!==null})
afterEach(()=>{vi.unstubAllGlobals();changeIdentity()})
describe('规则选项仅消费已有正式目录分页',()=>{
 it('四目录只映射真实名称，当前类型必须属于同项目',()=>{
  for(const kind of ['DEVICE','DEVICE_TYPE','GROUP','APPLICATION'] as const){const item={id:managementDevice,name:'真实名称',managementName:'应用管理名称',projectId:managementProject};expect(alarmRuleChoicePage(page([item]),kind,managementProject).items).toEqual([{id:managementDevice,label:kind==='APPLICATION'?'应用管理名称':'真实名称'}])}
  expect(()=>alarmRuleChoicePage(page([{id:managementDevice,name:'外部',projectId:managementRule}]),'DEVICE_TYPE',managementProject)).toThrow()
 })
 it('分页身份与完整性、200上限、重复ID和不动游标严格拒绝',()=>{
  const item={id:managementDevice,name:'设备'}
  for(const value of [{items:[item],hasMore:false},{...page([item]),nextCursor:'bad'},page([item,item]),page(Array.from({length:201},()=>item)),page([{id:'bad',name:'设备'}]),page([{...item,name:'\ud800'}]),page([{...item,name:'x'.repeat(129)}]),{...page([item]),hasMore:'false'}])expect(()=>alarmRuleChoicePage(value as never,'DEVICE',managementProject)).toThrow()
  expect(()=>alarmRuleChoicePage(page([item],'same'),'DEVICE',managementProject,'same')).toThrow()
  expect(alarmRuleChoicePage(page([],'next'),'DEVICE',managementProject)).toEqual({items:[],nextCursor:'next'})
 })
 it('非设备搜索仅筛当前真实页且保留继续分页，不冒全部搜索',()=>{const value=page([{id:managementDevice,name:'环境监控'},{id:managementRule,name:'生产设备'}],'opaque');expect(alarmRuleChoicePage(value,'GROUP',managementProject,undefined,'环境')).toEqual({items:[{id:managementDevice,label:'环境监控'}],nextCursor:'opaque'});expect(alarmRuleChoicePage(value,'DEVICE',managementProject,undefined,'没有匹配')).toEqual({items:value.items.map(item=>({id:item.id,label:item.name})),nextCursor:'opaque'})})
 it('真实共享HTTP只请求正式四目录，设备使用keyword且其它不造参数',async()=>{
  changeIdentity();setAccessToken('catalog-token');const requests:URL[]=[]
  vi.stubGlobal('fetch',vi.fn(async input=>{const url=new URL(String(input));requests.push(url);return new Response(JSON.stringify(page([{id:managementDevice,name:'当前名称',managementName:'应用名称',projectId:managementProject}])))}))
  for(const kind of ['DEVICE','DEVICE_TYPE','GROUP','APPLICATION'] as AlarmRuleChoiceCatalogKind[])await readAlarmRuleChoicePage(managementProject,kind,'环境','cursor',new AbortController().signal)
  expect(requests.map(url=>url.pathname.split('/').slice(-2).join('/'))).toEqual(['devices/search','device-types/search',`${managementProject}/alarm-notification-groups`,`${managementProject}/applications`]);expect(requests[0]!.searchParams.get('keyword')).toBe('环境');expect(requests.map(url=>url.searchParams.get('limit'))).toEqual(['200','200','100','200']);expect(requests.every(url=>url.searchParams.get('cursor')==='cursor')).toBe(true);expect(requests.slice(1).every(url=>!url.searchParams.has('keyword'))).toBe(true)
 })
 it('通知组严格100上限整页校验，其它三目录仍完整接受200项',()=>{
  const rows=Array.from({length:200},(_,index)=>({id:`00000000-0000-0000-0000-${String(index+1).padStart(12,'0')}`,name:`真实组${index}`,managementName:`应用${index}`,projectId:managementProject}))
  expect(alarmRuleChoicePage(page(rows.slice(0,100),'group-next'),'GROUP',managementProject).items).toHaveLength(100)
  // 超页即使最终keyword筛为空也要先整包拒绝，不能用本地筛选隐藏协议损坏。
  expect(()=>alarmRuleChoicePage(page(rows.slice(0,101),'group-next'),'GROUP',managementProject,undefined,'没有匹配')).toThrow()
  for(const kind of ['DEVICE','DEVICE_TYPE','APPLICATION'] as const)expect(alarmRuleChoicePage(page(rows),kind,managementProject).items).toHaveLength(200)
 })
 it('真实HTTP符合通知组100合同，空筛选页仍可沿原游标继续取得后页名称',async()=>{
  changeIdentity();setAccessToken('catalog-token');const requests:URL[]=[],cursor='opaque-group-page-2'
  const first=Array.from({length:100},(_,index)=>({id:`00000000-0000-0000-0000-${String(index+1).padStart(12,'0')}`,name:`其它真实组${index}`}))
  vi.stubGlobal('fetch',vi.fn(async input=>{
   const url=new URL(String(input));requests.push(url)
   if(Number(url.searchParams.get('limit'))>100)return new Response(JSON.stringify({code:10001,message:'分页大小必须1到100'}),{status:400})
   return new Response(JSON.stringify(url.searchParams.get('cursor')===cursor?page([{id:managementDevice,name:'待选环境组'}]):page(first,cursor)))
  }))
  const signal=new AbortController().signal,initial=await readAlarmRuleChoicePage(managementProject,'GROUP','环境',undefined,signal)
  expect(initial).toEqual({items:[],nextCursor:cursor})
  const next=await readAlarmRuleChoicePage(managementProject,'GROUP','环境',initial.nextCursor!,signal)
  expect(next).toEqual({items:[{id:managementDevice,label:'待选环境组'}],nextCursor:null})
  expect(requests.map(url=>url.searchParams.get('limit'))).toEqual(['100','100']);expect(requests.map(url=>url.searchParams.get('cursor'))).toEqual([null,cursor]);expect(requests.every(url=>!url.searchParams.has('keyword'))).toBe(true)
 })
 it('非法项目或搜索字节在HTTP前拒绝',async()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);for(const [project,query] of [['bad',''],[managementProject,'x'.repeat(129)],[managementProject,'\ud800']])await expect(readAlarmRuleChoicePage(project!, 'DEVICE',query!,undefined,new AbortController().signal)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled()})
})
