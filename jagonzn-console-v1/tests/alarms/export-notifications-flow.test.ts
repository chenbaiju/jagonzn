import {afterEach,describe,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {createMemoryHistory,createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import Page from '../../src/features/alarms/AlarmTransitionLogsView.vue'
import {session} from '../../src/core/session'
import {changeIdentity,setAccessToken} from '../../src/core/http'
import {transitionMaintenanceServer,maintenanceProject as project} from './transition-maintenance-server'
let wrapper:ReturnType<typeof mount>|undefined
async function setup(){const server=transitionMaintenanceServer('notifications');vi.stubGlobal('fetch',server.fetcher);setAccessToken('fixture');session.user={currentProjectId:project,permissions:['alarm:read']};const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Page}]});await router.push('/');await router.isReady();const download=vi.fn();wrapper=mount(Page,{props:{exportDownload:download},global:{plugins:[ElementPlus,router],stubs:{ElDialog:{props:['modelValue','title'],template:'<div v-if="modelValue" class="dialog"><h2>{{title}}</h2><slot/><slot name="footer"/></div>'}}}});await flushPromises();return {w:wrapper,server,download}}
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;changeIdentity();vi.unstubAllGlobals()})
describe('正式HTTP封装下通知与当前筛选文件旅程',()=>{
 it('一页同快照显示三渠道入口，点击打开本事件详情内通知，无独立通知端点',async()=>{const {w,server}=await setup();expect(w.findAll('.notification-summary button')).toHaveLength(3);expect(server.calls).toHaveLength(1);await w.get('[aria-label="Webhook，查看告警详情"]').trigger('click');await flushPromises();expect(w.find('.dialog h2').text()).toBe('查看告警详情');expect(w.find('.notification-detail').text()).toContain('***');expect(w.findAll('.notification-detail .failed-text')).toHaveLength(1);expect(w.find('.notification-detail').text()).not.toContain('成功');expect(server.calls.every(call=>call.method==='GET')).toBe(true);expect(server.calls.some(call=>/notification|delivery/.test(call.path))).toBe(false)})
 it('打开导出不会请求，提交仅一次新GET并编码后交给当前宿主，不创建任务或外发',async()=>{const {w,server,download}=await setup();await w.findAll('button').find(button=>button.text()==='导出')!.trigger('click');await flushPromises();expect(server.calls).toHaveLength(1);const buttons=w.findAll('.dialog button');await buttons.find(button=>button.text()==='导出')!.trigger('click');await flushPromises();expect(server.calls.filter(call=>call.path.endsWith('/alarm-log-export'))).toEqual([{method:'GET',path:`/api/v1/projects/${project}/console/alarm-log-export`}]);expect(download).toHaveBeenCalledOnce();expect(download.mock.calls[0]![0].text).toContain('温湿度传感器');expect(w.find('.dialog').exists()).toBe(false);expect(server.calls.every(call=>call.method==='GET')).toBe(true)})
})
