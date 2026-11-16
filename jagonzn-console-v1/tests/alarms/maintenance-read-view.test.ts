import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import View from '../../src/features/alarms/AlarmLogMaintenanceView.vue'
import {alarmLogMaintenanceApi} from '../../src/features/alarms/alarm-log-maintenance-api'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity} from '../../src/core/http'
vi.mock('../../src/features/alarms/alarm-log-maintenance-api',async original=>({...await original<typeof import('../../src/features/alarms/alarm-log-maintenance-api')>(),alarmLogMaintenanceApi:{read:vi.fn(),save:vi.fn()}}))
const project='00000000-0000-0000-0000-000000000002',event='00000000-0000-0000-0000-000000000004',note={eventId:event,version:1,alarmReason:'原因',solution:'保留方案',remark:'',updatedBy:null,createdAt:'2026-10-24T00:00:00Z',updatedAt:'2026-10-24T00:00:00Z'}
let wrapper:ReturnType<typeof mount>
async function setup(){wrapper=mount(View,{props:{logId:event},global:{plugins:[ElementPlus]}});await flushPromises()}
beforeEach(()=>{vi.resetAllMocks();session.user={currentProjectId:project,projectRole:'VIEWER',permissions:['alarm:read']};vi.mocked(alarmLogMaintenanceApi.read).mockResolvedValue(note)})
afterEach(()=>{wrapper?.unmount();session.user=null;changeIdentity()})
describe('详情中的维护信息只读视图',()=>{
 it('VIEWER只读非空字段，不猜署名或时间，也不输出空白备注',async()=>{await setup();expect(wrapper.text()).toContain('告警原因：原因');expect(wrapper.text()).toContain('解决方案：保留方案');expect(wrapper.text()).not.toContain('其它备注');expect(wrapper.find('textarea').exists()).toBe(false);expect(alarmLogMaintenanceApi.save).not.toHaveBeenCalled()})
 it('撤回读权限马上清除已读原文，迟到旧项目回复不能回填',async()=>{let resolve!:(value:typeof note)=>void;vi.mocked(alarmLogMaintenanceApi.read).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));await setup();session.user={currentProjectId:project,permissions:[]};await flushPromises();resolve(note);await flushPromises();expect(wrapper.text()).not.toContain('保留方案');expect(alarmLogMaintenanceApi.read).toHaveBeenCalledTimes(1);expect(alarmLogMaintenanceApi.save).not.toHaveBeenCalled()})
 it('错误不回退旧原文或伪造空成功，版本0没有维护段落',async()=>{vi.mocked(alarmLogMaintenanceApi.read).mockRejectedValueOnce(new ApiError('维护信息无法读取',503));await setup();expect(wrapper.text()).toContain('维护信息无法读取');expect(wrapper.find('.alarm-maintain').exists()).toBe(false);wrapper.unmount();vi.mocked(alarmLogMaintenanceApi.read).mockResolvedValueOnce({...note,version:0,alarmReason:'',solution:'',createdAt:null,updatedAt:null});await setup();expect(wrapper.findAll('.alarm-maintain p')).toHaveLength(0)})
})
