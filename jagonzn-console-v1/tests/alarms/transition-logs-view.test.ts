import { afterEach,describe,expect,it,vi } from 'vitest'
import { mount,flushPromises } from '@vue/test-utils'
import { createMemoryHistory,createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import Page from '../../src/features/alarms/AlarmTransitionLogsView.vue'
import { alarmTransitionLogApi,type AlarmLog } from '../../src/features/alarms/alarm-transition-log-api'
import { session } from '../../src/core/session'
import { changeIdentity,ApiError } from '../../src/core/http'
vi.mock('../../src/features/alarms/alarm-transition-log-api',()=>({alarmTransitionLogApi:{page:vi.fn(),get:vi.fn()}}))
const row:AlarmLog={id:'event-id',instanceId:'different-instance-id',ruleId:'rule',deviceId:'device',alarmType:'temp',state:'alerting',level:3,createdAt:'2026-10-24T00:00:00Z',value:null,clearReason:null,ruleName:'当前规则',deviceName:'当前设备',maintenanceAlarmReason:null,maintenanceSolution:null,maintenanceRemark:null,notificationLogs:[],notificationLogsTruncated:false,triggerValues:null}
let wrapper:ReturnType<typeof mount>|undefined
async function setup(read=true){
 session.user={currentProjectId:'p',permissions:read?['alarm:read','device:read']:[]}
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Page},{path:'/devices/:deviceId',component:{template:'<div>设备</div>'}}]});await router.push('/');await router.isReady()
 wrapper=mount(Page,{global:{plugins:[ElementPlus,router],stubs:{ElDialog:{props:['modelValue'],template:'<div v-if="modelValue" class="detail-dialog"><slot/><slot name="footer"/></div>'}}}});await flushPromises();return wrapper
}
function seed(items:AlarmLog[]=[row]){vi.mocked(alarmTransitionLogApi.page).mockImplementation(async(_p,q)=>({items,total:'49',page:q?.page??1,limit:q?.limit??24}));vi.mocked(alarmTransitionLogApi.get).mockResolvedValue(row)}
afterEach(()=>{wrapper?.unmount();wrapper=undefined;vi.resetAllMocks();session.user=null;changeIdentity()})
describe('事件历史时间线的隔离只读界面',()=>{
 it('同快照三字段直接显示各卡片，原文不作为HTML且不逐行读详情',async()=>{seed([{...row,maintenanceAlarmReason:'原因\n复核',maintenanceSolution:'',maintenanceRemark:'<img src=x onerror=alert(1)>'}]);const w=await setup();expect(w.find('.history-card .alarm-maintain').text()).toContain('复核');expect(w.find('.history-card .alarm-maintain').text()).toContain('<img');expect(w.find('.history-card img').exists()).toBe(false);expect(alarmTransitionLogApi.get).not.toHaveBeenCalled()})
 it('时间线按事件发生时间与真实状态显示，不把null补零或当前事故',async()=>{seed();const w=await setup();expect(w.text()).toContain('紧急告警');expect(w.find('.status-select').text()).toContain('所有状态');expect(w.text()).toContain('2026-10-24 08:00:00');expect(w.text()).toContain('触发值：—');expect(w.find('.alarm-type a').attributes('href')).toBe('/devices/device');expect(w.text()).not.toContain('确认告警');expect(w.text()).not.toContain('人工清除');expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(1)})
 it('正常/待定/三档告警及无已知级别分别保留，不默认普通告警',async()=>{seed([{...row,id:'ok',state:'ok',level:null,value:0},{...row,id:'pending',state:'pending',level:null},{...row,id:'one',level:1},{...row,id:'two',level:2},{...row,id:'unknown',level:null}]);const w=await setup();expect(w.findAll('.alarm-state').map(button=>button.text())).toEqual(['正常','待定','普通告警','重要告警','告警']);expect(w.text()).toContain('触发值：0')})
 it('原站分页只显示页码和前后页，仍按真实24条请求',async()=>{seed();const w=await setup();await w.find('[aria-label="下一页"]').trigger('click');await flushPromises();expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(2);expect(alarmTransitionLogApi.page).toHaveBeenLastCalledWith('p',{page:2,limit:24},expect.any(AbortSignal));expect(w.find('[aria-label="每页数量"]').exists()).toBe(false);expect(w.find('.tl-learning-resource').text()).toContain('什么是告警历史消息？')})
 it('状态和日期范围应用后从第一页读取，清范围不丢状态',async()=>{seed();const w=await setup();w.findComponent({name:'ElSelect'}).vm.$emit('update:modelValue','ok');await flushPromises();w.findComponent({name:'ElDatePicker'}).vm.$emit('update:modelValue',[new Date('2026-10-23T00:00:00Z'),new Date('2026-10-24T00:00:00Z')]);await flushPromises();expect(alarmTransitionLogApi.page).toHaveBeenLastCalledWith('p',{status:'ok',from:'2026-10-23T00:00:00.000Z',before:'2026-10-24T00:00:00.000Z',page:1,limit:24},expect.any(AbortSignal));w.findComponent({name:'ElDatePicker'}).vm.$emit('update:modelValue',null);await flushPromises();expect(alarmTransitionLogApi.page).toHaveBeenLastCalledWith('p',{status:'ok',page:1,limit:24},expect.any(AbortSignal))})
 it('详情直接GET事件ID，不使用instanceID；取消无写，错误不伪造资料',async()=>{seed();const w=await setup();await w.find('.alarm-bottom button').trigger('click');await flushPromises();expect(alarmTransitionLogApi.get).toHaveBeenCalledWith('p','event-id',expect.any(AbortSignal));expect(w.find('.detail-dialog').text()).toContain('event-id');await w.findAll('.detail-dialog button').find(button=>button.text()==='关闭')!.trigger('click');await flushPromises();expect(w.find('.detail-dialog').exists()).toBe(false);vi.mocked(alarmTransitionLogApi.get).mockRejectedValue(new ApiError('日志不可见',404));await w.find('.alarm-state').trigger('click');await flushPromises();expect(w.find('.detail-dialog').text()).toContain('日志不可见');expect(w.find('.detail-dialog').text()).not.toContain('当前设备')})
 it('typed列表与全局详情只消费本事件摘要，人工解除旧值有明确语义且无逐卡GET',async()=>{
  const historical:AlarmLog={...row,id:'typed-event',alarmType:'ATTRIBUTE',state:'ok',clearReason:'MANUAL',triggerValues:{totalProperties:1,items:[{key:'temperature',dataType:'NUMBER',known:true,valueJson:'81',truncated:false,acceptedAt:'2026-10-24T00:00:00Z',timeBasis:'ALARM_INTAKE'}],truncated:false}}
  seed([historical]);vi.mocked(alarmTransitionLogApi.get).mockResolvedValue(historical);const w=await setup()
  expect(w.find('.alarm-info').text()).toContain('告警已人工解除');expect(alarmTransitionLogApi.get).not.toHaveBeenCalled()
  await w.find('.alarm-state').trigger('click');await flushPromises()
  expect(alarmTransitionLogApi.get).toHaveBeenCalledExactlyOnceWith('p','typed-event',expect.any(AbortSignal))
  expect(w.find('.detail-dialog .trigger-values').text()).toContain('temperature：81');expect(w.find('.detail-dialog .trigger-values').text()).toContain('人工解除');expect(w.find('.detail-dialog .trigger-values').text()).toContain('最近触发')
 })
 it('当前名称为null只保持空，不显示ID冒充历史名称',async()=>{seed([{...row,ruleName:null,deviceName:null}]);const w=await setup();expect(w.find('.alarm-type').text()).toBe('');expect(w.findAll('.alarm-type a')).toHaveLength(0)})
 it('无读取权限没有时间筛选、详情、分页或请求',async()=>{seed();const w=await setup(false);expect(w.find('.history-filters').exists()).toBe(false);expect(w.find('.tl-pager').exists()).toBe(false);expect(alarmTransitionLogApi.page).not.toHaveBeenCalled()})
 it('首个空页按原站100像素空图和原文显示，不保留分页',async()=>{seed([]);const w=await setup();expect(w.findComponent({name:'ElEmpty'}).props('imageSize')).toBe(100);expect(w.text()).toContain('暂无告警历史消息');expect(w.find('.tl-pager').exists()).toBe(false)})

})
