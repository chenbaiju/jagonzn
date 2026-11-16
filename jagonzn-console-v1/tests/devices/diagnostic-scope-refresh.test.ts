import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DeviceDiagnostics from '../../src/features/devices/DeviceDiagnostics.vue'
import {session,can} from '../../src/core/session'
import {ApiError,changeIdentity,identityEpoch} from '../../src/core/http'

// 保留真实会话、组件、诊断状态机和字节适配器，只替换 HTTP 传输。
const transport=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:transport.api}))
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',account='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004'
const permissions=['device:read','device:update']
type Kind='toggle'|'clear'
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
const point=(enabled=false,version=7,clearGeneration=2)=>({deviceId:device,enabled,version,clearGeneration})
function deferred(){let reject!:(cause:unknown)=>void;const promise=new Promise<never>((_resolve,j)=>{reject=j});return{promise,reject}}
let wrapper:VueWrapper<any>|undefined,pending:ReturnType<typeof deferred>|undefined,current=point(),unexpected:string[]=[]
const writes=()=>transport.api.mock.calls.filter(([,options])=>['put','delete'].includes(options?.method))
const reads=()=>transport.api.mock.calls.filter(([,options])=>!options?.method)
const switcher=()=>wrapper!.findComponent({name:'ElSwitch'})
const clearDialog=()=>wrapper!.findAllComponents({name:'ElDialog'}).find(dialog=>dialog.props('title')==='清空诊断记录')!
function button(label:string){const found=wrapper!.findAll('button').find(b=>b.text()===label||b.attributes('aria-label')===label);if(!found)throw new Error('缺少按钮：'+label);return found}
async function click(label:string){await button(label).trigger('click');await flushPromises()}
async function render(){wrapper=mount(DeviceDiagnostics,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises();expect(reads()).toHaveLength(2);expect(switcher().props('disabled')).toBe(false)}
function sameScope(){const epoch=identityEpoch(),previous=session.user!;session.user={...previous,permissions:[...permissions]};expect(session.user).not.toBe(previous);expect(identityEpoch()).toBe(epoch);expect(can('device:update')).toBe(true)}
async function start(kind:Kind){if(kind==='clear'){await click('清空记录');await click('确定清空')}else{await wrapper!.find('.el-switch').trigger('click');await flushPromises()}expect(writes()).toHaveLength(1);expect(writes()[0]![0]).toBe(`/api/v1/projects/${project}/devices/${device}/${kind==='clear'?'diagnostic-messages':'diagnostic-control'}`);expect(writes()[0]![1]).toMatchObject({method:kind==='clear'?'delete':'put',body:kind==='clear'?{version:7}:{version:7,enabled:true},responseType:'bytes'})}
function assertLocked(){expect(switcher().props('disabled')).toBe(true);for(const label of ['清空记录','刷新诊断记录','自动刷新'])expect(button(label).attributes('disabled')).toBeDefined()}
beforeEach(()=>{
 changeIdentity();transport.api.mockReset();pending=undefined;unexpected=[];current=point()
 session.ready=true;session.transitioning=false;session.user={accountId:account,currentProjectId:project,projectRole:'OWNER',permissions:[...permissions]} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'},{id:other,myRole:'OWNER',status:'ACTIVE'}]
 transport.api.mockImplementation(async(url:string,options?:{method?:string})=>{
  const match=url.match(/^\/api\/v1\/projects\/([0-9a-f-]+)\/devices\/([0-9a-f-]+)(.*)$/)
  if(match){const target=match[2]!,suffix=match[3]
   if(options?.method==='put'&&suffix==='/diagnostic-control'||options?.method==='delete'&&suffix==='/diagnostic-messages'){if(pending)return pending.promise;throw new ApiError('操作响应未确认',0,undefined,undefined,true)}
   if(!options?.method){if(suffix==='/diagnostic-control')return encode({...current,deviceId:target});if(suffix==='/diagnostic-observations')return encode({items:[],nextCursor:null,hasMore:false})}
  }
  unexpected.push(url);throw new Error('未授权测试请求：'+url)
 })
})
afterEach(async()=>{pending?.reject(new ApiError('释放测试在途请求',0,undefined,undefined,true));await flushPromises();wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML='';expect(unexpected).toEqual([])})

it.each(['toggle','clear'] as const)('同scope %s UNKNOWN保原CAS意图并必须显式读取与继续',async kind=>{
 await render();await start(kind);const original=writes()[0]![1],readCount=reads().length
 expect(wrapper!.text()).toContain('操作结果尚未确认');assertLocked();sameScope();await flushPromises()
 expect(wrapper!.text()).toContain('操作结果尚未确认');assertLocked();expect(reads()).toHaveLength(readCount);expect(original.signal.aborted).toBe(false)
 await click('清空记录');await wrapper!.find('.el-switch').trigger('click');await flushPromises();expect(writes()).toHaveLength(1)
 // 当前版本是独立事实，读取本身不能自动解除原未知操作锁。
 current=kind==='clear'?point(false,8,3):point(true,8,2)
 await click('读取当前状态');expect(reads()).toHaveLength(readCount+1);expect(wrapper!.text()).toContain('版本 8');expect(wrapper!.text()).toContain('操作结果尚未确认');assertLocked()
 expect(writes()).toHaveLength(1);expect(writes()[0]![1]).toBe(original);expect(original.body).toEqual(kind==='clear'?{version:7}:{version:7,enabled:true})
 await click('继续使用当前状态');expect(wrapper!.text()).not.toContain('操作结果尚未确认');expect(switcher().props('modelValue')).toBe(current.enabled);expect(writes()).toHaveLength(1)
})

it.each(['toggle','clear'] as const)('同scope %s deferred写不被abort或解锁，晚到UNKNOWN仍保原意图',async kind=>{
 pending=deferred();await render();await start(kind);const original=writes()[0]![1],readCount=reads().length
 expect(switcher().props('loading')).toBe(true);sameScope();await flushPromises()
 expect(switcher().props('loading')).toBe(true);assertLocked();expect(original.signal.aborted).toBe(false);expect(reads()).toHaveLength(readCount)
 pending.reject(new ApiError('晚到响应未确认',0,undefined,undefined,true));await flushPromises()
 expect(switcher().props('loading')).toBe(false);expect(wrapper!.text()).toContain('操作结果尚未确认');assertLocked();expect(writes()).toHaveLength(1);expect(writes()[0]![1]).toBe(original)
})

it('同scope清空确认保原版本，取消仍零写',async()=>{
 await render();await click('清空记录');expect(clearDialog().props('modelValue')).toBe(true);const readsBefore=reads().length;sameScope();await flushPromises()
 expect(clearDialog().props('modelValue')).toBe(true);expect(reads()).toHaveLength(readsBefore);expect(writes()).toHaveLength(0)
 await click('取消');expect(clearDialog().props('modelValue')).toBe(false);expect(writes()).toHaveLength(0)
})

it.each(['account','project','device','identity','read','write','role','archive'] as const)('真实作用域或权限 %s 变化仍撤销旧在途，晚到回调不能恢复',async reason=>{
 pending=deferred();await render();await start('clear');const original=writes()[0]![1]
 if(reason==='account')session.user={...session.user!,accountId:other}
 else if(reason==='project')session.user={...session.user!,currentProjectId:other}
 else if(reason==='device')await wrapper!.setProps({deviceId:other})
 else if(reason==='identity')changeIdentity()
 else if(reason==='read')session.user={...session.user!,permissions:['device:update']}
 else if(reason==='write')session.user={...session.user!,permissions:['device:read']}
 else if(reason==='role')session.user={...session.user!,projectRole:'VIEWER'}
 else session.projects=session.projects.map(p=>p.id===project?{...p,status:'ARCHIVED'}:p)
 await flushPromises();expect(original.signal.aborted).toBe(true);expect(switcher().exists()?switcher().props('loading'):false).toBe(false)
 pending.reject(new ApiError('旧scope晚到未知',0,undefined,undefined,true));await flushPromises()
 expect(wrapper!.text()).not.toContain('操作结果尚未确认');expect(writes()).toHaveLength(1)
})
