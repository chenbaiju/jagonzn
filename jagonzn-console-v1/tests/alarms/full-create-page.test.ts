import {afterEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import Page from '../../src/features/alarms/NotificationGroupCreatePage.vue'
import {session} from '../../src/core/session'
import {changeIdentity,setAccessToken} from '../../src/core/http'
import {fullCreationServer} from './full-creation-server'
import {creationFixtureProject as project,creationFixtureAccount as account,creationFixtureGroup as group} from './ordinary-creation-server'
import {notificationGroupRoutes} from '../../src/features/alarms/notification-group-routes'
let wrapper:ReturnType<typeof mount>
afterEach(()=>{wrapper?.unmount();session.user=null;changeIdentity();vi.unstubAllGlobals()})
async function setup(manage=true){const server=fullCreationServer();vi.stubGlobal('fetch',server.fetcher);setAccessToken('fixture-only');session.user={accountId:account,currentProjectId:project,permissions:manage?['alarm:read','alarm:manage']:['alarm:read']};const router=createRouter({history:createMemoryHistory(),routes:[{path:'/notification-groups/create',component:Page},{path:'/notification-groups/:groupId',component:{template:'<p>通知组详情</p>'}},{path:'/notification-groups',component:{template:'<p>通知组</p>'}}]});await router.push('/notification-groups/create');await router.isReady();wrapper=mount(Page,{global:{plugins:[ElementPlus,router]}});await flushPromises();return {server,router}}
describe('完整八方式真实创建页接线（真实静态创建路由）',()=>{
 it('从公开成员资格目录读取当前成员，通过正式用例创建后导航真实组ID',async()=>{const {server,router}=await setup();expect(wrapper.text()).toContain('member@example.invalid');expect(wrapper.findAll('[role=radio]').length||wrapper.findAll('input[type=radio]').length).toBeGreaterThanOrEqual(8);await wrapper.find('input[aria-label="通知组名称"]').setValue('成员组');await wrapper.find('input[type=checkbox]').setValue(true);await wrapper.findAll('button').find(button=>button.text()==='创建')!.trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe('/notification-groups/'+group);expect(server.calls.filter(row=>row.method==='POST')).toHaveLength(1);expect(server.calls.some(row=>row.path.endsWith('/console/notification-members'))).toBe(true)})
 it('只读成员不读取原始成员联系方式、不显示创建表单和保存操作',async()=>{const {server}=await setup(false);expect(wrapper.find('form').exists()).toBe(false);expect(server.calls).toHaveLength(0)})
 it('目录原站创建入口走真实静态八方式路由，不匹配组详情或generic写',async()=>{const server=fullCreationServer();vi.stubGlobal('fetch',server.fetcher);setAccessToken('fixture-only');session.user={accountId:account,currentProjectId:project,permissions:['alarm:read','alarm:manage']};const router=createRouter({history:createMemoryHistory(),routes:notificationGroupRoutes});await router.push('/notification-groups');await router.isReady();wrapper=mount(RouterView,{global:{plugins:[ElementPlus,router]}});await flushPromises();await wrapper.find('.group-empty button').trigger('click');await flushPromises();expect(router.currentRoute.value.name).toBe('alarm-notification-group-create');expect(wrapper.findAll('input[type=radio]')).toHaveLength(8);expect(server.calls.filter(call=>call.method==='POST')).toHaveLength(0);expect(router.currentRoute.value.meta.permission).toBe('alarm:manage')})
})
