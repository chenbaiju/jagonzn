import {afterEach,describe,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Page from '../../src/features/alarms/AlarmRuleDirectoryView.vue'
import {alarmRuleDirectoryApi} from '../../src/features/alarms/alarm-rule-directory-api'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity} from '../../src/core/http'
import {directoryRule,ruleProject} from './rule-directory-fixture'
vi.mock('../../src/features/alarms/alarm-rule-directory-api',async original=>({...await original<object>(),alarmRuleDirectoryApi:{page:vi.fn()}}))
let wrapper:ReturnType<typeof mount>|undefined
async function setup(read=true,manage=false){session.user={currentProjectId:ruleProject,permissions:read?['alarm:read',...(manage?['alarm:manage']:[])]:[]};wrapper=mount(Page,{props:{manageAvailable:manage},global:{plugins:[ElementPlus]}});await flushPromises();return wrapper}
function seed(empty=false){vi.mocked(alarmRuleDirectoryApi.page).mockImplementation(async(_p,q)=>({items:empty?[]:[{...directoryRule(),notificationGroups:[{id:directoryRule().notificationGroupIds[0],name:'<b>值班组</b>'}]}],total:empty?'0':'49',page:Number(q?.page??1),limit:Number(q?.limit??24)}))}
afterEach(()=>{wrapper?.unmount();wrapper=undefined;vi.resetAllMocks();session.user=null;changeIdentity()})
describe('V2规则目录完整只读消费者',()=>{
 it('真实总数/六列/组名称/四图标均来自一次目录读取，文字安全转义',async()=>{seed();const w=await setup();expect(w.find('h1').text()).toBe('告警规则(49)');expect(w.findAll('thead th')).toHaveLength(7);expect(w.text()).toContain('<b>值班组</b>');expect(w.find('.rule-group-tags b').exists()).toBe(false);expect(w.findAll('.channel-icon')).toHaveLength(4);expect(alarmRuleDirectoryApi.page).toHaveBeenCalledTimes(1);expect(w.text()).not.toContain(directoryRule().id)})
 it('真实页码与每页条数接线，切页重新读取而非本地重排',async()=>{seed();const w=await setup();await w.find('[aria-label="下一页"]').trigger('click');await flushPromises();expect(alarmRuleDirectoryApi.page).toHaveBeenLastCalledWith(ruleProject,{page:'2',limit:'24',sourceKind:undefined},expect.any(AbortSignal));w.findAllComponents({name:'ElSelect'})[0].vm.$emit('update:modelValue',48);await flushPromises();expect(alarmRuleDirectoryApi.page).toHaveBeenLastCalledWith(ruleProject,{page:'1',limit:'48',sourceKind:undefined},expect.any(AbortSignal))})
 it('无编辑能力时不激活编辑，历史仅发原身份事件',async()=>{seed();const w=await setup();expect(w.findAll('tbody button').find(b=>b.text()==='编辑')!.attributes('disabled')).toBeDefined();await w.findAll('tbody button').find(b=>b.text()==='告警历史')!.trigger('click');expect(w.emitted('history')).toEqual([[directoryRule().id]]);expect(w.emitted('edit')).toBeUndefined();expect(alarmRuleDirectoryApi.page).toHaveBeenCalledTimes(1)})
 it('上层提供管理能力且有权限才发精确编辑事件',async()=>{seed();const w=await setup(true,true);await w.findAll('tbody button').find(b=>b.text()==='编辑')!.trigger('click');expect(w.emitted('edit')).toEqual([[directoryRule().id]])})
 it('空页保留表头并显示零总数，不显示分页',async()=>{seed(true);const w=await setup();expect(w.findAll('thead th')).toHaveLength(7);expect(w.text()).toContain('暂无数据');expect(w.find('h1').text()).toContain('(0)');expect(w.find('.tl-pager').exists()).toBe(false)})
 it('错误不冒充空成功，无权限不读取也不显示表格',async()=>{vi.mocked(alarmRuleDirectoryApi.page).mockRejectedValue(new ApiError('读取目录失败',503));const w=await setup();expect(w.text()).toContain('读取目录失败');expect(w.find('.tl-pager').exists()).toBe(false);expect(w.find('h1').text()).toBe('告警规则');session.user={currentProjectId:ruleProject,permissions:[]};await flushPromises();expect(w.find('table').exists()).toBe(false);expect(alarmRuleDirectoryApi.page).toHaveBeenCalledTimes(1)})
})
