import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Page from '../../src/features/devices/DeviceAlarms.vue'
import History from '../../src/features/alarms/DeviceAlarmHistory.vue'
import {alarmTransitionLogApi} from '../../src/features/alarms/alarm-transition-log-api'
import {session} from '../../src/core/session'
import {changeIdentity} from '../../src/core/http'
vi.mock('../../src/features/alarms/alarm-transition-log-api',()=>({alarmTransitionLogApi:{page:vi.fn(),get:vi.fn()}}))
const device='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',project='00000000-0000-4000-8000-000000000010'
const Rules={name:'DeviceAlarmRules',props:['deviceId','visible'],template:'<div v-show="visible"><div class="stub-rule-toolbar"><slot name="leading"/></div>当前设备规则</div>'}
const Learning={name:'DeviceLearningResource',props:['kind'],template:'<aside>学习入口</aside>'}
let wrapper:ReturnType<typeof mount>|undefined
beforeEach(()=>{session.user={accountId:project,currentProjectId:project,permissions:['device:read','alarm:read']};session.projects=[{id:project,status:'ACTIVE'}];vi.mocked(alarmTransitionLogApi.page).mockResolvedValue({items:[],total:'0',page:1,limit:24})})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];changeIdentity();vi.resetAllMocks();document.body.innerHTML=''})
async function setup(){wrapper=mount(Page,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{DeviceAlarmRules:Rules,DeviceLearningResource:Learning,ManagedAlarmLogExportDialog:true}}});await flushPromises();return wrapper}
async function mode(value:'rules'|'history'){await wrapper!.findAll('input[type="radio"]').find(input=>input.attributes('value')===value&&input.isVisible())!.setValue(true);await flushPromises()}
describe('设备父页挂载真实历史与既有规则',()=>{
 it('默认读不可变事件历史，固定设备范围并保留学习/规则入口',async()=>{const w=await setup();expect(w.findComponent(History).exists()).toBe(true);expect(w.findComponent(Learning).props('kind')).toBe('alarm');expect(w.findComponent(Rules).props()).toMatchObject({deviceId:device,visible:false});expect(alarmTransitionLogApi.page).toHaveBeenCalledExactlyOnceWith(project,{deviceId:device,page:1,limit:24},expect.any(AbortSignal));expect(w.text()).toContain('暂无告警历史消息')})
 it('规则模式隐藏历史并停止设备变化引发的历史读，重开才读新设备',async()=>{const w=await setup();await mode('rules');expect(w.findComponent(Rules).props('visible')).toBe(true);expect(w.findComponent(History).props('visible')).toBe(false);await w.setProps({deviceId:other});await flushPromises();expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(1);expect(w.findComponent(Rules).props('deviceId')).toBe(other);await mode('history');expect(alarmTransitionLogApi.page).toHaveBeenLastCalledWith(project,{deviceId:other,page:1,limit:24},expect.any(AbortSignal));expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(2)})
 it('历史读权撤销后清理页面，不用隐藏规则或通用事故表补数据',async()=>{const w=await setup();session.user={...session.user!,permissions:[]};await flushPromises();expect(w.text()).toContain('当前账号没有此内容的读取权限');expect(w.findComponent({name:'DeviceRecords'}).exists()).toBe(false);expect(alarmTransitionLogApi.get).not.toHaveBeenCalled();expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(1)})
})
