import {describe,expect,it} from 'vitest'
import {mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AlarmTransitionLogCard from '../../src/features/alarms/AlarmTransitionLogCard.vue'
import type {AlarmLog} from '../../src/features/alarms/alarm-transition-log-api'

const base:AlarmLog={id:'00000000-0000-4000-8000-000000000001',instanceId:'00000000-0000-4000-8000-000000000002',deviceId:'00000000-0000-4000-8000-000000000003',ruleId:'00000000-0000-4000-8000-000000000004',alarmType:'temperature',state:'alerting',level:1,value:null,createdAt:'2026-10-24T00:00:00Z',clearReason:null,ruleName:null,deviceName:null,maintenanceAlarmReason:null,maintenanceSolution:null,maintenanceRemark:null,notificationLogs:[],notificationLogsTruncated:false,triggerValues:null}

/** 历史卡片只用事件自身level显示三档；空值不猜测为普通告警。 */
describe('告警历史级别显示',()=>{
 it.each([
  {level:1,state:'alerting',label:'普通告警',tone:'warning'},
  {level:2,state:'alerting',label:'重要告警',tone:'warning'},
  {level:3,state:'alerting',label:'紧急告警',tone:'urgent'},
  {level:null,state:'alerting',label:'告警',tone:'warning'},
  {level:null,state:'pending',label:'待定',tone:'warning'},
  {level:null,state:'ok',label:'正常',tone:'ok'},
 ] as const)('$state level=$level 显示 $label',({level,state,label,tone})=>{
  const wrapper=mount(AlarmTransitionLogCard,{props:{row:{...base,level,state},canReadDevice:false,canMaintain:false,maintenance:null},global:{plugins:[ElementPlus],stubs:{AlarmLogMaintenanceFields:true,AlarmLogNotifications:true,RouterLink:true}}})
  expect(wrapper.get('.alarm-state').text()).toBe(label)
  expect(wrapper.classes()).toContain(tone)
 })
})
