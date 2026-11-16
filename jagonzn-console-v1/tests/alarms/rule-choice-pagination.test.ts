import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Editor from '../../src/features/alarms/AlarmRuleEditor.vue'
import Managed from '../../src/features/alarms/ManagedAlarmRuleEditor.vue'
import {alarmRuleManagementApi} from '../../src/features/alarms/alarm-rule-management-api'
import {changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
import {editorChoices,editorRule} from './rule-editor-fixture'
import {managementProject,managementRule} from './rule-management-fixture'
vi.mock('../../src/features/alarms/alarm-rule-management-api',async original=>({...await original<typeof import('../../src/features/alarms/alarm-rule-management-api')>(),alarmRuleManagementApi:{get:vi.fn(),create:vi.fn(),update:vi.fn(),setEnabled:vi.fn(),remove:vi.fn()}}))
let wrapper:ReturnType<typeof mount>
const pages={sources:{previous:false,next:true},groups:{previous:true,next:true},applications:{previous:false,next:true}},global={plugins:[ElementPlus],stubs:{ElDialog:{template:'<div><slot/><slot name="footer"/></div>'}}}
beforeEach(()=>{vi.resetAllMocks();session.user={currentProjectId:managementProject,permissions:['alarm:read','alarm:manage']};vi.mocked(alarmRuleManagementApi.get).mockResolvedValue(editorRule())})
afterEach(()=>{wrapper?.unmount();session.user=null;changeIdentity()})
describe('规则编辑器真实目录翻页接线',()=>{
 it('翻页保留已选组与应用曾读到的真实名称，读到新名称优先，不凭UUID造标签',async()=>{
  const initial=editorRule();initial.configuration.notifications.groupIds=[managementRule];initial.configuration.notifications.customerChannels=['WECHAT'];initial.configuration.notifications.wechatClickAction='PROJECT_APP';initial.configuration.notifications.wechatAppId=managementRule
  wrapper=mount(Editor,{props:{projectId:managementProject,ruleId:managementRule,canManage:true,initial,choices:editorChoices(),choicePages:pages,save:vi.fn()},global});await flushPromises();await wrapper.get('#tab-notify').trigger('click');expect(wrapper.text()).toContain('值班通知组');expect(wrapper.text()).toContain('用户服务应用');await wrapper.setProps({choices:{...editorChoices(),groups:[],applications:[]}});await flushPromises();expect(wrapper.text()).toContain('值班通知组');expect(wrapper.text()).toContain('用户服务应用');expect(wrapper.text()).not.toContain('通知组资料待核对');await wrapper.setProps({choices:{...editorChoices(),groups:[{id:managementRule,label:'当前新组名'}],applications:[{id:managementRule,label:'当前新应用名'}]}});expect(wrapper.text()).toContain('当前新组名');expect(wrapper.text()).toContain('当前新应用名')
 })

 it('来源/通知组/用户应用分别翻页，不提交、不修改当前草稿',async()=>{
  const initial=editorRule();initial.configuration.notifications.customerChannels=['WECHAT'];initial.configuration.notifications.wechatClickAction='PROJECT_APP';initial.configuration.notifications.wechatAppId=managementRule;const save=vi.fn()
  wrapper=mount(Editor,{props:{projectId:managementProject,ruleId:managementRule,canManage:true,initial,choices:editorChoices(),choicePages:pages,save},global});await flushPromises();await wrapper.get('[aria-label="设备源下一页"]').trigger('click');await wrapper.get('#tab-notify').trigger('click');await wrapper.get('[aria-label="通知组上一页"]').trigger('click');await wrapper.get('[aria-label="用户应用下一页"]').trigger('click');expect(wrapper.emitted('pageChoices')).toEqual([['sources','next'],['groups','previous'],['applications','next']]);expect(save).not.toHaveBeenCalled();expect(initial.configuration.source.ids).toEqual(editorChoices().source.ids)
 })
 it('没有更多目录不造分页入口，加载/失权期间不能触发翻页',async()=>{
  wrapper=mount(Editor,{props:{projectId:managementProject,ruleId:managementRule,canManage:true,initial:editorRule(),choices:editorChoices(),choicePages:pages,choicesLoading:true,save:vi.fn()},global});await flushPromises();expect(wrapper.get('[aria-label="设备源下一页"]').attributes('disabled')).toBeDefined();await wrapper.get('[aria-label="设备源下一页"]').trigger('click');expect(wrapper.emitted('pageChoices')).toBeUndefined();await wrapper.setProps({choicesLoading:false,choicePages:undefined});expect(wrapper.find('[aria-label="设备源下一页"]').exists()).toBe(false)
 })
 it('管理宿主通过move与原上下文重读，重新读取配置和保存互不触发',async()=>{
  const loadChoices=vi.fn(async(project,source)=>({...editorChoices(),projectId:project,source,pages})),moveChoicePage=vi.fn(()=>true)
  wrapper=mount(Managed,{props:{ruleId:managementRule,loadChoices,moveChoicePage},global});await flushPromises();const before=loadChoices.mock.calls.length;await wrapper.get('[aria-label="设备源下一页"]').trigger('click');await flushPromises();expect(moveChoicePage).toHaveBeenCalledExactlyOnceWith('sources','next');expect(loadChoices).toHaveBeenCalledTimes(before+1);expect(loadChoices.mock.calls.at(-1)!.slice(0,2)).toEqual([managementProject,editorChoices().source]);expect(alarmRuleManagementApi.get).toHaveBeenCalledTimes(1);expect(alarmRuleManagementApi.update).not.toHaveBeenCalled();expect(wrapper.getComponent(Editor).props('initial')?.version).toBe(0)
 })
 it('无效翻页不重读，失权后没有选项按钮或写请求',async()=>{
  const loadChoices=vi.fn(async(project,source)=>({...editorChoices(),projectId:project,source,pages})),moveChoicePage=vi.fn(()=>false)
  wrapper=mount(Managed,{props:{ruleId:managementRule,loadChoices,moveChoicePage},global});await flushPromises();const before=loadChoices.mock.calls.length;await wrapper.get('[aria-label="设备源下一页"]').trigger('click');await flushPromises();expect(loadChoices).toHaveBeenCalledTimes(before);session.user={currentProjectId:managementProject,permissions:['alarm:read']};await flushPromises();expect(wrapper.find('[aria-label="设备源下一页"]').exists()).toBe(false);expect(alarmRuleManagementApi.update).not.toHaveBeenCalled()
 })
})
