import {afterEach,describe,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Managed from '../../src/features/alarms/ManagedAlarmLogExportDialog.vue'
import {alarmLogExportApi,type AlarmLogExport} from '../../src/features/alarms/alarm-log-export-api'
import {session} from '../../src/core/session'
import {changeIdentity} from '../../src/core/http'
vi.mock('../../src/features/alarms/alarm-log-export-api',async original=>({...await original<typeof import('../../src/features/alarms/alarm-log-export-api')>(),alarmLogExportApi:{read:vi.fn()}}))
const project='00000000-0000-4000-8000-000000000001',event='00000000-0000-4000-8000-000000000002'
const data:AlarmLogExport={items:[{deviceTypeName:'传感器',log:{id:event,instanceId:event,ruleId:event,deviceId:event,alarmType:'temperature',state:'ok',level:null,createdAt:'2026-10-24T00:00:00Z',value:0,clearReason:null,ruleName:null,deviceName:null,maintenanceAlarmReason:null,maintenanceSolution:null,maintenanceRemark:null,notificationLogs:null,notificationLogsTruncated:null,triggerValues:null}}],limit:1000,truncated:false}
let wrapper:ReturnType<typeof mount>|undefined
function setup(read=true){session.user={currentProjectId:project,permissions:read?['alarm:read']:[]};vi.mocked(alarmLogExportApi.read).mockResolvedValue(data);const download=vi.fn();wrapper=mount(Managed,{props:{modelValue:true,filters:{status:'ok'},download},global:{plugins:[ElementPlus],stubs:{ElDialog:{props:['modelValue'],template:'<div v-if="modelValue"><slot/><slot name="footer"/></div>'}}}});return {w:wrapper,download}}
async function submit(w:ReturnType<typeof mount>){await w.findAll('button').find(button=>button.text()==='导出')!.trigger('click');await flushPromises()}
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;changeIdentity();vi.resetAllMocks();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers()})
describe('当前身份与筛选的正式导出宿主',()=>{
 it('点击才一次读取当前筛选，真实文件编码交给宿主并关闭',async()=>{const {w,download}=setup();expect(alarmLogExportApi.read).not.toHaveBeenCalled();await submit(w);expect(alarmLogExportApi.read).toHaveBeenCalledExactlyOnceWith(project,{status:'ok'},expect.any(AbortSignal));expect(download).toHaveBeenCalledOnce();expect(download.mock.calls[0]![0]).toMatchObject({mime:'application/vnd.ms-excel'});expect(w.emitted('update:modelValue')).toEqual([[false]])})
 it.each(['identity','project','filters','permission'] as const)('%s变化取消旧范围且不下载迟到结果',async kind=>{const {w,download}=setup();let finish!:(value:AlarmLogExport)=>void;vi.mocked(alarmLogExportApi.read).mockImplementation(()=>new Promise(resolve=>finish=resolve));await submit(w);const signal=vi.mocked(alarmLogExportApi.read).mock.calls[0]![2]!;if(kind==='identity')changeIdentity();if(kind==='project')session.user={currentProjectId:event,permissions:['alarm:read']};if(kind==='filters')await w.setProps({filters:{status:'pending'}});if(kind==='permission')session.user={currentProjectId:project,permissions:[]};await flushPromises();expect(signal.aborted).toBe(true);finish(data);await flushPromises();expect(download).not.toHaveBeenCalled();expect(w.emitted('update:modelValue')).toContainEqual([false])})
 it('无读取资格没有弹层/导出请求',async()=>{const {w}=setup(false);expect(w.find('button').exists()).toBe(false);expect(alarmLogExportApi.read).not.toHaveBeenCalled()})
 it.each(['csv','xls'] as const)('默认%s下载声明正确扩展名、类型，并释放临时地址',async format=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']})
  const create=vi.fn(()=> 'blob:export-fixture'),revoke=vi.fn()
  vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=revoke})
  const clicks:{name:string;href:string;connected:boolean}[]=[]
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){clicks.push({name:this.download,href:this.href,connected:this.isConnected})})
  const {w}=setup();await w.setProps({download:undefined})
  await w.find(`input[type="radio"][value="${format}"]`).setValue(true)
  await submit(w)
  expect(clicks).toHaveLength(1);expect(clicks[0]!.name).toMatch(new RegExp(`\\.${format}$`))
  expect(clicks[0]).toMatchObject({href:'blob:export-fixture',connected:true})
  expect((create.mock.calls[0] as unknown as [Blob])[0].type).toBe(format==='csv'?'application/csv':'application/vnd.ms-excel')
  expect(document.querySelector('a[download]')).toBeNull()
  await vi.advanceTimersByTimeAsync(1000);expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:export-fixture')
 })
})
