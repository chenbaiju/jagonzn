import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {ApiError} from '../../src/core/http'
import DeviceRuleCreateDialog from '../../src/features/rules/DeviceRuleCreateDialog.vue'
const state=vi.hoisted(()=>({project:null as any,manage:null as any}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');state.project=ref('10000000-0000-4000-8000-000000000001');state.manage=ref(true);return {projectId:state.project,can:()=>state.manage.value}})
const project='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000001',rule='30000000-0000-4000-8000-000000000001',version='40000000-0000-4000-8000-000000000001',source='function transform(message) { return message; }'
let w:VueWrapper|undefined,port:any
const definition=()=>({id:rule,name:'设备规则',description:'说明',status:'DRAFT',version:1,activeVersionId:null})
const history=()=>({items:[{id:version,versionNumber:1,source,actions:[],deviceSource:{kind:'DEVICE',referenceId:device}}],nextCursor:null})
const button=(text:string)=>new DOMWrapper([...document.querySelectorAll('button')].find(item=>item.textContent?.trim()===text)!)
async function setup(){w=mount(DeviceRuleCreateDialog,{attachTo:document.body,props:{deviceId:device,deviceName:'温度设备',transport:port},global:{plugins:[ElementPlus]}});await flushPromises();await w.get('[aria-label="新规则名称"]').setValue(' 设备规则 ');await w.get('[aria-label="新规则描述"]').setValue('说明');await w.get('[aria-label="新规则源码"]').setValue(source);return w}
describe('单次创建设备来源草稿后的权威核对',()=>{
 beforeEach(()=>{state.project.value=project;state.manage.value=true;port={read:vi.fn(),preference:vi.fn(),change:vi.fn(),create:vi.fn().mockResolvedValue(definition()),definition:vi.fn().mockResolvedValue(definition()),history:vi.fn().mockResolvedValue(history())}})
 afterEach(()=>{w?.unmount();w=undefined;document.body.innerHTML=''})
 it('一次创建后精确父GET和首版本GET确认设备/源码/动作，再交给详情发布',async()=>{
  const view=await setup();await button('创建').trigger('click');await flushPromises();expect(port.create).toHaveBeenCalledExactlyOnceWith(project,device,{name:'设备规则',description:'说明',source,actions:[]});expect(port.definition).toHaveBeenCalledExactlyOnceWith(project,rule,expect.any(AbortSignal));expect(port.history).toHaveBeenCalledExactlyOnceWith(project,rule,expect.any(AbortSignal));expect(view.emitted('created')).toEqual([[rule]]);expect(port.change).not.toHaveBeenCalled();expect(port.preference).not.toHaveBeenCalled()
 })
 it.each(['source','deviceSource','actions','nextCursor'])('创建成功后%s回读不一致保持表单锁，零第二POST/补偿写/发布',async field=>{
  const value=history();if(field==='source')value.items[0]!.source='other';if(field==='deviceSource')value.items[0]!.deviceSource.referenceId=rule;if(field==='actions')(value.items[0]!.actions as any)=[{nodeType:'other',config:{}}];if(field==='nextCursor')(value as any).nextCursor='unexpected';port.history.mockResolvedValue(value);const view=await setup();await button('创建').trigger('click');await flushPromises();expect(view.emitted('created')).toBeUndefined();expect(document.body.textContent).toContain('不要重复创建');expect(button('创建').attributes('disabled')).toBeDefined();await button('创建').trigger('click');expect(port.create).toHaveBeenCalledTimes(1);await button('取消').trigger('click');expect(view.emitted('close')).toBeUndefined()
 })
 it('父回读错ID时不读取其它规则版本，也不关闭或导航',async()=>{
  port.definition.mockResolvedValue({...definition(),id:version});const view=await setup();await button('创建').trigger('click');await flushPromises();expect(port.history).not.toHaveBeenCalled();expect(view.emitted('created')).toBeUndefined();expect(button('创建').attributes('disabled')).toBeDefined()
 })
 it('动作包含不安全数字或不完整配置时本地拒绝，尚未发POST可修正',async()=>{
  const view=await setup();await view.get('[aria-label="新规则动作"]').setValue('[{"nodeType":"device.command","config":{"n":9007199254740993}}]');await button('创建').trigger('click');await flushPromises();expect(port.create).not.toHaveBeenCalled();expect(button('创建').attributes('disabled')).toBeUndefined();await view.get('[aria-label="新规则动作"]').setValue('[]');await button('创建').trigger('click');await flushPromises();expect(port.create).toHaveBeenCalledTimes(1);expect(view.emitted('created')).toEqual([[rule]])
 })
 it('创建在途切设备，旧回执不读取旧版本或发出完成',async()=>{
  let resolve!:(value:unknown)=>void;port.create.mockReturnValue(new Promise(yes=>{resolve=yes}));const view=await setup();await button('创建').trigger('click');await flushPromises();await view.setProps({deviceId:rule});resolve(definition());await flushPromises();expect(port.definition).not.toHaveBeenCalled();expect(view.emitted('created')).toBeUndefined();expect(view.emitted('close')).toHaveLength(1)
 })
 it('POST网络结果未知保持输入和单次写入锁，不发猜测GET或再次提交',async()=>{
  port.create.mockRejectedValue(new ApiError('连接中断',0,undefined,undefined,true));const view=await setup();await button('创建').trigger('click');await flushPromises();expect((view.get('[aria-label="新规则源码"]').element as HTMLTextAreaElement).value).toBe(source);expect(port.definition).not.toHaveBeenCalled();expect(port.history).not.toHaveBeenCalled();expect(button('创建').attributes('disabled')).toBeDefined();await button('创建').trigger('click');expect(port.create).toHaveBeenCalledTimes(1);expect(view.emitted('created')).toBeUndefined()
 })

})
