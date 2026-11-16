import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import Page from '../../src/features/alarms/NotificationGroupsPage.vue'
import { session } from '../../src/core/session'
import { alarmApi } from '../../src/features/alarms/api'
import { changeIdentity } from '../../src/core/http'
vi.mock('../../src/features/alarms/api', () => ({ alarmApi: { groupConfiguration:vi.fn(),groupEmailOptions:vi.fn(),group: vi.fn(), groups: vi.fn(), groupDirectory: vi.fn(), recipients: vi.fn(), saveGroup: vi.fn() } }))
let wrapper: ReturnType<typeof mount>
afterEach(() => { wrapper?.unmount(); session.user = null; changeIdentity(); vi.clearAllMocks() })
async function setup(manage: boolean) {
  session.user = { currentProjectId: 'p', permissions: manage ? ['alarm:read', 'alarm:manage'] : ['alarm:read'] }
  vi.mocked(alarmApi.group).mockResolvedValue({ id: 'g', name: '值班', version: 8, enabled: false })
  vi.mocked(alarmApi.recipients).mockResolvedValue([])
  vi.mocked(alarmApi.groupConfiguration).mockResolvedValue({groupId:'g',configured:true,notificationType:'EMAIL',configurationVersion:0})
  vi.mocked(alarmApi.groupEmailOptions).mockResolvedValue([])
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/notification-groups/:groupId', component: Page }] })
  await router.push('/notification-groups/g'); await router.isReady()
  wrapper = mount(Page, { global: { plugins: [ElementPlus, router] } }); await flushPromises()
  return wrapper
}
describe('通知组真实组件渲染', () => {
  it('直达详情显示两页签，管理者可打开名称编辑', async () => { const w = await setup(true); expect(w.text()).toContain('值班'); expect(w.findAll('[role=tab]').map(t => t.text())).toEqual(['通知组', '设置']); const edit = w.findAll('button').find(b => b.text() === '编辑')!; await edit.trigger('click'); await flushPromises(); expect(w.find('.el-dialog input').element).toHaveProperty('value', '值班'); expect(w.find('.el-dialog input').attributes('maxlength')).toBe('64'); expect(w.find('.el-dialog textarea').attributes('rows')).toBe('5'); expect(w.findComponent({name:'ElDialog'}).props('width')).toBe('min(500px, 94vw)'); expect(w.findComponent({name:'ElDialog'}).props('closeOnClickModal')).toBe(false); expect(alarmApi.saveGroup).not.toHaveBeenCalled() })
  it('只读角色无添加或编辑入口', async () => { const w = await setup(false); expect(w.text()).toContain('值班'); expect(w.findAll('button').some(b => ['编辑', '添加通知方式'].includes(b.text()))).toBe(false) })
  it.each([['OWNER',true],['ADMIN',true],['OPERATOR',false],['VIEWER',false]] as const)('%s角色的直接启停与管理控件按原权限显示',async(role,manage)=>{const w=await setup(manage);session.user={...session.user!,projectRole:role};await flushPromises();expect(w.findComponent({name:'ElSwitch'}).props('disabled')).toBe(!manage);expect(w.findAll('button').some(b=>b.text()==='编辑')).toBe(manage);expect(w.text()).not.toContain('添加通知方式');expect(w.text()).not.toContain('确认删除')})
  it('目录真实total分页和每页条数各只触发一次请求，不注册双事件',async()=>{session.user={currentProjectId:'p',permissions:['alarm:read','alarm:manage']};vi.mocked(alarmApi.groupDirectory).mockImplementation(async(_project,page,limit)=>({items:[{id:'g',name:'值班',enabled:true,version:7}],total:'49',page,limit}));const router=createRouter({history:createMemoryHistory(),routes:[{path:'/notification-groups',component:Page},{path:'/notification-groups/:groupId',component:Page}]});await router.push('/notification-groups');await router.isReady();wrapper=mount(Page,{global:{plugins:[ElementPlus,router]}});await flushPromises();expect(wrapper.text()).toContain('通知组 (49)');expect(wrapper.find('.group-name').attributes('href')).toBe('/notification-groups/g');await wrapper.find('[aria-label="下一页"]').trigger('click');await flushPromises();expect(alarmApi.groupDirectory).toHaveBeenCalledTimes(2);expect(alarmApi.groupDirectory).toHaveBeenLastCalledWith('p',2,24,expect.any(AbortSignal));wrapper.findComponent({name:'ElSelect'}).vm.$emit('update:modelValue',48);await flushPromises();expect(alarmApi.groupDirectory).toHaveBeenCalledTimes(3);expect(alarmApi.groupDirectory).toHaveBeenLastCalledWith('p',1,48,expect.any(AbortSignal))})
  it('空目录保留真实零数量、原站学习提示与中央创建区，不显示空分页',async()=>{session.user={currentProjectId:'p',permissions:['alarm:read','alarm:manage']};vi.mocked(alarmApi.groupDirectory).mockResolvedValue({items:[],total:'0',page:1,limit:24});const router=createRouter({history:createMemoryHistory(),routes:[{path:'/notification-groups',component:Page}]});await router.push('/notification-groups');await router.isReady();wrapper=mount(Page,{global:{plugins:[ElementPlus,router]}});await flushPromises();expect(wrapper.text()).toContain('通知组 (0)');expect(wrapper.find('.tl-learning-resource').text()).toContain('什么是告警通知组？');expect(wrapper.find('.group-empty').text()).toContain('简单易用的告警通知');expect(wrapper.find('.group-empty button').text()).toBe('创建通知组');expect(wrapper.find('.tl-pager').exists()).toBe(false);expect(alarmApi.saveGroup).not.toHaveBeenCalled()})
  it('设置页原站编辑入口打开完整修改信息弹层，取消不写',async()=>{await setup(true);const settings=wrapper.findAll('[role=tab]').find(t=>t.text()==='设置')!;await settings.trigger('click');await flushPromises();const panel=wrapper.findAll('.tl-section-panel').find(p=>p.text().includes('通知组描述'))!;await panel.find('button').trigger('click');await flushPromises();expect(wrapper.find('.el-dialog').text()).toContain('修改信息');expect(wrapper.find('.el-dialog').text()).toContain('通知组描述');expect(wrapper.find('.el-dialog input').element).toHaveProperty('value','值班');await wrapper.findAll('.el-dialog button').find(b=>b.text()==='取消')!.trigger('click');expect(alarmApi.saveGroup).not.toHaveBeenCalled()})

})
