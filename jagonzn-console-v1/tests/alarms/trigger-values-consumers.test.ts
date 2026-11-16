import {describe,expect,it} from 'vitest'
import {shallowMount} from '@vue/test-utils'
import {alarmLogSnapshot,type AlarmLog} from '../../src/features/alarms/alarm-transition-log-api'
import {alarmLogExportDisplay,alarmLogExportSnapshot} from '../../src/features/alarms/alarm-log-export-api'
import {buildAlarmLogExportFile} from '../../src/features/alarms/alarm-log-export-file'
import Card from '../../src/features/alarms/AlarmTransitionLogCard.vue'
const id=(n:number)=>`00000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`
const property=(valueJson='81')=>({key:'temperature',dataType:'NUMBER',known:true,valueJson,truncated:false,acceptedAt:'2026-10-25T03:40:49.123456Z',timeBasis:'ALARM_INTAKE'})
const summary=(valueJson='81')=>({totalProperties:1,items:[property(valueJson)],truncated:false})
const wire=(n=1,triggerValues:unknown=summary())=>({id:id(n),instanceId:id(99),ruleId:id(98),deviceId:id(97),alarmType:'ATTRIBUTE',state:'alerting',level:2,createdAt:'2026-10-25T03:40:49.123456Z',value:null,clearReason:null,ruleName:null,deviceName:null,maintenanceAlarmReason:null,maintenanceSolution:null,maintenanceRemark:null,notificationLogs:[],notificationLogsTruncated:false,triggerValues})
const item=(log:AlarmLog)=>({log,deviceTypeName:null})
const props=(row:AlarmLog)=>({row,canReadDevice:false,canMaintain:false})
describe('真实typed历史有界属性的卡片与导出消费者',()=>{
 it('同一事故的三事件分别保留81/82/79，不读取当前实例或追加详情',()=>{
  const rows=['81','82','79'].map((value,i)=>alarmLogSnapshot(wire(i+1,summary(value))))
  for(const [i,row] of rows.entries()){
   expect(row).toHaveProperty('triggerValues',summary(['81','82','79'][i]))
   const w=shallowMount(Card,{props:props(row)});expect(w.find('.alarm-info').text()).toContain(`temperature：${['81','82','79'][i]}`);w.unmount()
   expect(alarmLogExportDisplay(item(row)).alarm_attributes).toContain(`temperature：${['81','82','79'][i]}`)
  }
 })
 it('精确大数文字与假值经wire夹具到CSV不经过double或真值过滤',()=>{
  const precise='900719925474099312345678901234567890.123456789'
  for(const value of [precise,'0','1e+80']){
   const row=alarmLogSnapshot(wire(1,summary(value)));expect(alarmLogExportDisplay(item(row)).alarm_attributes).toContain(value)
   expect(buildAlarmLogExportFile([alarmLogExportDisplay(item(row))],['alarm_attributes'],'csv').text).toContain(value)
  }
  const data=summary();data.items=[{...property('false'),dataType:'SWITCH'}];expect(alarmLogExportDisplay(item(alarmLogSnapshot(wire(1,data)))).alarm_attributes).toContain('false')
 })
 it('legacy显式null保持原来的标量零、空导出与卡片破折号',()=>{
  const base=wire(1,null);expect(alarmLogExportDisplay(item(alarmLogSnapshot({...base,value:0}))).alarm_attributes).toBe('触发值：0')
  expect(alarmLogExportDisplay(item(alarmLogSnapshot(base))).alarm_attributes).toBe('')
  const w=shallowMount(Card,{props:props(alarmLogSnapshot(base))});expect(w.text()).toContain('触发值：—');w.unmount()
 })
 it('缺required摘要、半JSON、错误型、额外字段或typed与旧标量并存拒绝整包',()=>{
  const bad=[undefined,{...summary(),secret:'private'},summary('8e'),{...summary(),items:[{...property('false')}] }]
  for(const value of bad){expect(()=>alarmLogSnapshot({...wire(),triggerValues:value})).toThrow();expect(()=>alarmLogExportSnapshot({items:[{log:{...wire(),triggerValues:value},deviceTypeName:null}],limit:1000,truncated:false})).toThrow()}
  expect(()=>alarmLogSnapshot({...wire(),value:81})).toThrow()
 })
 it('摘要复制冻结后不随外部原响应变更，未丢失required null',()=>{
  const data=summary(),row=alarmLogSnapshot(wire(1,data));data.items[0]!.valueJson='99'
  expect(row).toHaveProperty('triggerValues.items.0.valueJson','81')
  const frozen=Object.getOwnPropertyDescriptor(row,'triggerValues')!.value
  expect(Object.isFrozen(frozen)).toBe(true);expect(Object.isFrozen(frozen.items)).toBe(true);expect(Object.isFrozen(frozen.items[0])).toBe(true)
 })
 it('人工解除卡片不把保留旧MATCH值说成自动恢复，导出明确旧值含义',()=>{
  const row=alarmLogSnapshot({...wire(),state:'ok',clearReason:'MANUAL'}),w=shallowMount(Card,{props:props(row)})
  expect(w.find('.alarm-info').text()).toContain('告警已人工解除');expect(w.find('.alarm-info').text()).not.toContain('temperature：81');w.unmount()
  const text=alarmLogExportDisplay(item(row)).alarm_attributes;expect(text).toContain('人工解除');expect(text).toContain('最近触发');expect(text).toContain('temperature：81')
 })
 it('未知值、长值和未列出的键明确区分，INACTIVITY显示真实历史接纳依据',()=>{
  const data={totalProperties:3,items:[{...property(),key:'a',known:false,valueJson:null,acceptedAt:null,timeBasis:'UNKNOWN'},{...property(),key:'b',truncated:true,valueJson:null}],truncated:true}
  const row=alarmLogSnapshot({...wire(1,data),alarmType:'INACTIVITY'}),text=alarmLogExportDisplay(item(row)).alarm_attributes
  for(const part of ['a：未知','平台接纳时间未知','b：内容较长','2026-10-25 11:40:49','另1个属性未显示','查看详情'])expect(text).toContain(part)
 })
 it('新增全部变长文本计入原1MiB整包预算，不挑选或截去坏记录',()=>{
  const data={totalProperties:8,items:Array.from({length:8},(_,i)=>({...property(JSON.stringify('中'.repeat(80))),dataType:'TEXT',key:`key_${i}`})),truncated:false}
  const items=Array.from({length:600},(_,i)=>({log:wire(i+1,data),deviceTypeName:null}))
  expect(()=>alarmLogExportSnapshot({items,limit:1000,truncated:false})).toThrow('缩小筛选范围')
 })
 it('typed原文仍作文本，HTML/XLS转义且CSV公式保护保持',()=>{
  const data={totalProperties:1,items:[{...property(JSON.stringify('<img src=x>\n=1')),dataType:'TEXT'}],truncated:false}
  const row=alarmLogSnapshot({...wire(1,data),maintenanceRemark:'=HYPERLINK("private")',maintenanceAlarmReason:'',maintenanceSolution:''}),display=alarmLogExportDisplay(item(row))
  expect(buildAlarmLogExportFile([display],['alarm_attributes'],'xls').text).toContain('&lt;img src=x&gt;')
  expect(buildAlarmLogExportFile([display],['remark'],'csv').text).toContain('"\'=HYPERLINK(')
 })
})
