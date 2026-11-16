import {copySucceeded,copyFailed} from '../../src/ui/copy-feedback'
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import DeviceOverview from '../../src/features/devices/DeviceOverview.vue'
import DeviceDetail from '../../src/features/devices/DeviceDetail.vue'
vi.mock('../../src/ui/copy-feedback',()=>({copySucceeded:vi.fn(),copyFailed:vi.fn()}))
const state=vi.hoisted(()=>({route:null as any,core:vi.fn(),profile:vi.fn(),connections:vi.fn(),access:vi.fn(),api:vi.fn()}))
vi.mock('vue-router',async()=>{const {reactive}=await import('vue');state.route=reactive({params:{deviceId:'00000000-0000-4000-8000-000000000002'},query:{tab:'connection'}});return {useRoute:()=>state.route,useRouter:()=>({push:vi.fn(),replace:vi.fn()})}})
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');return {projectId:ref('00000000-0000-4000-8000-000000000001'),currentProject:ref({id:'00000000-0000-4000-8000-000000000001',projectCode:'park',status:'ACTIVE'}),session:{user:{accountId:'account',projectRole:'OWNER'}},can:()=>true}})
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
vi.mock('../../src/features/devices/api',()=>({devicesApi:{read:state.core,profile:state.profile,connections:state.connections,access:state.access},devicePath:(p:string,d:string)=>`/api/v1/projects/${p}/devices/${d}`}))
vi.mock('../../src/features/devices/page-alarm-status',()=>({pageAlarmStatus:vi.fn().mockResolvedValue({states:{}}),alarmLabel:()=> '无告警'}))
const device='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',wrappers:ReturnType<typeof mount>[]=[]
const child=(kind:string)=>defineComponent({props:['deviceId','presentation'],setup:p=>()=>h('div',{'data-kind':kind,'data-device':p.deviceId,'data-presentation':p.presentation})})
const children={DeviceProperties:child('properties'),DeviceActivityOverview:child('activity'),DeviceUsageOverview:child('usage'),DeviceConnectionAccess:child('connection'),DeviceDiagnostics:child('diagnostics'),DeviceDataStreamRuntime:child('connection-tools')}
function renderOverview(){const w=mount(DeviceOverview,{props:{deviceId:device},global:{plugins:[ElementPlus],stubs:children}});wrappers.push(w);return w}
describe('设备详情新组件父页接入',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.route.params.deviceId=device;state.route.query.tab='connection';state.core.mockImplementation((_p:string,id:string)=>Promise.resolve({id,name:'设备'}));state.profile.mockImplementation((_p:string,id:string)=>Promise.resolve({deviceId:id,name:'设备',deviceKey:'device-key-01',businessKey:null,description:null,deviceTypeId:null,referenceVersion:'0',profileToken:'a'.repeat(64)}))})
 afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());document.body.innerHTML=''})
 it('概览顺序为当前属性、活跃时间、使用统计，三个子组件接同一deviceId',async()=>{const w=renderOverview();await flushPromises();expect(w.findAll('[data-kind]').map(c=>c.attributes('data-kind'))).toEqual(['properties','activity','usage']);expect(w.findAll('[data-kind]').every(c=>c.attributes('data-device')===device)).toBe(true);expect(w.get('[data-kind="properties"]').attributes('data-presentation')).toBe('cards');expect(state.api).not.toHaveBeenCalled();expect(w.text()).not.toContain('接入诊断')})
 it('同一父组件切换设备同时更新三个子组件，没有保留A的deviceId',async()=>{const w=renderOverview();await w.setProps({deviceId:other});expect(w.findAll('[data-kind]').every(c=>c.attributes('data-device')===other)).toBe(true)})
 it('连接分支接管理参数组件，不再发旧连接记录GET；切页进入三段概览',async()=>{const w=mount(DeviceDetail,{attachTo:document.body,global:{plugins:[ElementPlus],stubs:{...children,DeviceCodeDialog:true}}});wrappers.push(w);await flushPromises();expect(w.get('[data-kind="connection"]').attributes('data-device')).toBe(device);expect(state.connections).not.toHaveBeenCalled();expect(state.access).not.toHaveBeenCalled();expect(w.text()).not.toContain('连接记录');expect(w.find('[data-kind="connection-tools"]').exists()).toBe(true);state.route.query.tab='debug';await flushPromises();expect(w.findAll('[data-kind]').map(c=>c.attributes('data-kind'))).toEqual(['diagnostics']);state.route.query.tab='overview';await flushPromises();expect(w.find('[data-kind="connection"]').exists()).toBe(false);expect(w.findAll('[data-kind]').map(c=>c.attributes('data-kind'))).toEqual(['properties','activity','usage']);expect(state.connections).not.toHaveBeenCalled()})
 it('尾12位ID点击复制完整身份，标识完整展示且未接入不带前缀',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard'),writeText=vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}})
  const businessKey='device-'+('0123456789'.repeat(10));state.core.mockResolvedValue({id:device,name:'设备',status:'INACTIVE'});state.profile.mockResolvedValue({deviceId:device,name:'设备',deviceKey:'device-key-01',businessKey,description:null,deviceTypeId:null,referenceVersion:'0',profileToken:'a'.repeat(64)})
  const w=mount(DeviceDetail,{attachTo:document.body,global:{plugins:[ElementPlus],stubs:{...children,DeviceCodeDialog:true}}});wrappers.push(w)
  try{await flushPromises();const copy=w.get('button[aria-label="复制完整设备 ID"]');expect(copy.text()).toBe('ID: 000000000002');expect(w.findAll('.device-business-key').map(node=>node.text())).toEqual(['设备标识: device-key-01']);expect(w.get('.device-online').text()).toBe('尚未接入');await copy.trigger('click');await flushPromises();expect(writeText).toHaveBeenCalledExactlyOnceWith(device);expect(copySucceeded).toHaveBeenCalledWith('已复制完整 ID');expect(w.find('.device-copy-status').exists()).toBe(false);writeText.mockRejectedValueOnce(new Error('denied'));await copy.trigger('click');await flushPromises();expect(copyFailed).toHaveBeenCalledWith(expect.stringContaining('复制失败'))}finally{if(descriptor)Object.defineProperty(navigator,'clipboard',descriptor);else Reflect.deleteProperty(navigator,'clipboard')}
 })
 it('复制期间切换设备不会把旧设备结果回填新头部',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');let finish!:()=>void
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise<void>(resolve=>{finish=resolve})}})
  const w=mount(DeviceDetail,{attachTo:document.body,global:{plugins:[ElementPlus],stubs:{...children,DeviceCodeDialog:true}}});wrappers.push(w)
  try{await flushPromises();await w.get('button[aria-label="复制完整设备 ID"]').trigger('click');state.route.params.deviceId=other;await flushPromises();finish();await flushPromises();expect(w.get('button[aria-label="复制完整设备 ID"]').text()).toBe('ID: 000000000003');expect(copySucceeded).not.toHaveBeenCalled();expect(w.find('.device-copy-status').exists()).toBe(false)}finally{if(descriptor)Object.defineProperty(navigator,'clipboard',descriptor);else Reflect.deleteProperty(navigator,'clipboard')}
 })

 it('未接入提示位于当前属性前，教程使用给定原站链接且已接入后隐藏',async()=>{
  const w=mount(DeviceOverview,{props:{deviceId:device,notConnected:true},global:{plugins:[ElementPlus],stubs:{...children,RouterLink:{props:['to'],template:'<a :href="to"><slot/></a>'}}}});wrappers.push(w);await flushPromises()
  expect(w.get('[role="note"]').text()).toContain('设备尚未连接或上报数据到 ThingsLink');expect(w.get('[role="note"]').findAll('a')).toHaveLength(6);expect(w.get('[role="note"]').findAll('a').slice(0,5).every(link=>link.attributes('href')?.startsWith('https://www.thingscloud.xyz/docs/'))).toBe(true);expect(w.get('[role="note"]').findAll('a').at(-1)?.attributes('href')).toBe('https://www.thingscloud.xyz/devices/');expect(w.get('[role="note"]').element.compareDocumentPosition(w.get('[data-kind="properties"]').element)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();await w.setProps({notConnected:false});expect(w.find('[role="note"]').exists()).toBe(false)
 })
 it('用户点击选区复制直接写完整ID并清理临时控件和恢复焦点',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(document,'execCommand');let copied=''
  Object.defineProperty(document,'execCommand',{configurable:true,value:()=>{copied=(document.activeElement as HTMLTextAreaElement).value;return true}})
  const w=mount(DeviceDetail,{attachTo:document.body,global:{plugins:[ElementPlus],stubs:{...children,DeviceCodeDialog:true}}});wrappers.push(w)
  try{await flushPromises();const button=w.get('button[aria-label="复制完整设备 ID"]');(button.element as HTMLElement).focus();await button.trigger('click');await flushPromises();expect(copied).toBe(device);expect(document.activeElement).toBe(button.element);expect(copySucceeded).toHaveBeenCalledWith('已复制完整 ID');expect(w.find('.device-copy-status').exists()).toBe(false);expect(document.querySelectorAll('textarea[aria-hidden="true"]')).toHaveLength(0)}finally{if(descriptor)Object.defineProperty(document,'execCommand',descriptor);else Reflect.deleteProperty(document,'execCommand')}
 })

})
