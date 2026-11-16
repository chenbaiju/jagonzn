import {afterEach,describe,expect,it,vi} from 'vitest'
import {effectScope} from 'vue'
import {flushPromises} from '@vue/test-utils'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity} from '../../src/core/http'
import {useAlarmRuleDirectory} from '../../src/features/alarms/use-alarm-rule-directory'
import {alarmRuleDirectoryApi,type AlarmRuleDirectoryPage} from '../../src/features/alarms/alarm-rule-directory-api'
import {directoryRule,ruleProject} from './rule-directory-fixture'
vi.mock('../../src/features/alarms/alarm-rule-directory-api',async original=>({...await original<object>(),alarmRuleDirectoryApi:{page:vi.fn()}}))
let scope:ReturnType<typeof effectScope>|undefined
async function setup(read=true){session.user={currentProjectId:ruleProject,permissions:read?['alarm:read']:[]};vi.mocked(alarmRuleDirectoryApi.page).mockImplementation(async(_p,q)=>({items:[directoryRule()],total:'49',page:Number(q?.page??1),limit:Number(q?.limit??24)}));scope=effectScope();const w=scope.run(useAlarmRuleDirectory)!;await flushPromises();return w}
afterEach(()=>{scope?.stop();scope=undefined;vi.resetAllMocks();session.user=null;changeIdentity()})
describe('V2规则真实页码与身份生命周期',()=>{
 it('初始一次只读，标签来自嵌套名称',async()=>{const w=await setup();expect(alarmRuleDirectoryApi.page).toHaveBeenCalledExactlyOnceWith(ruleProject,{page:'1',limit:'24',sourceKind:undefined},expect.any(AbortSignal));expect(w.rows.value[0].notificationGroupLabels).toEqual(['仓库值班人员通知'])})
 it('真实总数控制翻页，改变来源/条数重置第一页，刷新保留筛选',async()=>{const w=await setup();await w.selectPage(3);await w.selectPage(4);expect(alarmRuleDirectoryApi.page).toHaveBeenCalledTimes(2);await w.setSourceKind('DEVICE');await w.setLimit(48);await w.selectPage(2);await w.refresh();expect(alarmRuleDirectoryApi.page).toHaveBeenLastCalledWith(ruleProject,{page:'1',limit:'48',sourceKind:'DEVICE'},expect.any(AbortSignal));const count=vi.mocked(alarmRuleDirectoryApi.page).mock.calls.length;await w.setLimit(101);await w.selectPage(NaN);expect(alarmRuleDirectoryApi.page).toHaveBeenCalledTimes(count)})
 it('快速换来源与项目时旧请求被abort且迟到结果丢弃',async()=>{const w=await setup();let old!:(v:AlarmRuleDirectoryPage)=>void;vi.mocked(alarmRuleDirectoryApi.page).mockImplementationOnce(()=>new Promise(resolve=>old=resolve)).mockResolvedValueOnce({items:[],total:'0',page:1,limit:24});const pending=w.setSourceKind('DEVICE');const signal=vi.mocked(alarmRuleDirectoryApi.page).mock.lastCall![2]!;session.user={currentProjectId:'other',permissions:['alarm:read']};await flushPromises();expect(signal.aborted).toBe(true);old({items:[directoryRule()],total:'49',page:1,limit:24});await pending;expect(w.rows.value).toEqual([]);expect(w.sourceKind.value).toBeUndefined();expect(w.list.data.value?.total).toBe('0')})
 it('失去权限立即清除并禁止后续读取',async()=>{const w=await setup();session.user={currentProjectId:ruleProject,permissions:[]};const count=vi.mocked(alarmRuleDirectoryApi.page).mock.calls.length;await w.selectPage(2);await w.setSourceKind('DEVICE');await w.refresh();expect(w.rows.value).toEqual([]);expect(alarmRuleDirectoryApi.page).toHaveBeenCalledTimes(count)})
 it('同项目身份轮换立即清除旧行',async()=>{const w=await setup();changeIdentity();expect(w.rows.value).toEqual([])})
 it('403清除旧目录，不保留名称和数字误认为当前成功',async()=>{const w=await setup();vi.mocked(alarmRuleDirectoryApi.page).mockRejectedValue(new ApiError('项目不可见',403));await w.reload();expect(w.list.data.value).toBeUndefined();expect(w.rows.value).toEqual([]);expect(w.list.error.value).toBeInstanceOf(ApiError)})
 it('无权限不发起请求，没有真实total不猜页数',async()=>{const w=await setup(false);await w.reload();await w.selectPage(2);expect(alarmRuleDirectoryApi.page).not.toHaveBeenCalled();expect(w.rows.value).toEqual([])})
})
