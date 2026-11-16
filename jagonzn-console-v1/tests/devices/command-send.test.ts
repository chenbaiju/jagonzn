import {beforeEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus,{ElDialog,ElAutocomplete,ElSwitch} from 'element-plus'
import Send from '@/features/devices/DeviceCommandSend.vue'
import {ApiError,changeIdentity} from '@/core/http'
const state=vi.hoisted(()=>({choices:vi.fn(),submit:vi.fn(),wait:vi.fn(),lookup:vi.fn(),status:null as any,permission:null as any,project:null as any}))
vi.mock('@/core/session',async()=>{const{ref}=await import('vue');state.permission=ref(true);state.project=ref('project');state.status=ref('ACTIVE');return{projectId:state.project,currentProject:ref({get status(){return state.status.value}}),can:()=>state.permission.value}})
vi.mock('@/features/devices/command-send-api',async()=>({...await vi.importActual('@/features/devices/command-send-api'),commandChoices:state.choices,submitCommand:state.submit,waitCommandReply:state.wait,readCommandSubmission:state.lookup}))
const device='22222222-2222-4222-8222-222222222222'
function deferred(){let resolve!:(value:any)=>void;const promise=new Promise<any>(r=>resolve=r);return{promise,resolve}}
function render(){return mount(Send,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{JsonCodeEditor:{props:['modelValue','ariaLabel','height','disabled','readonly'],emits:['update:modelValue'],template:'<textarea data-editor :aria-label="ariaLabel" :value="modelValue" :disabled="disabled" :readonly="readonly" @input="$emit(\'update:modelValue\',$event.target.value)"/>'}}}})}
function button(w:ReturnType<typeof render>,label:string){return w.findAll('button').find(b=>b.text().trim()===label)!}
async function open(w:ReturnType<typeof render>){await button(w,'下发命令').trigger('click');await flushPromises()}
async function fill(w:ReturnType<typeof render>){await w.find('input[placeholder="填写命令标识符"]').setValue('reboot');await w.find('textarea[data-editor]').setValue('{"exact":9007199254740993}')}
beforeEach(()=>{state.choices.mockReset().mockResolvedValue([{value:'reboot',name:'重启',defaults:'{"preset":false}'}]);state.submit.mockReset().mockResolvedValue({id:'command',deviceId:device,commandKey:'reboot',status:'ACCEPTED'});state.wait.mockReset().mockResolvedValue({status:'SUCCEEDED',outputText:'{\n    "exact": 9007199254740993\n}'});state.lookup.mockReset();state.status.value='ACTIVE';state.permission.value=true;state.project.value='project'})
describe('Source下发命令交互',()=>{
 it('默认异步，标识符可手输，选择建议填真实默认值，普通发送只提交一次并关闭',async()=>{
  const w=render();await open(w);expect(w.findComponent(ElDialog).props('width')).toBe('min(500px,94vw)');expect(w.findComponent(ElSwitch).props('modelValue')).toBe(false)
  w.findComponent(ElAutocomplete).vm.$emit('select',{value:'reboot'});await flushPromises();expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('{"preset":false}')
  await fill(w);await button(w,'发送').trigger('click');await flushPromises();expect(state.submit).toHaveBeenCalledTimes(1);expect(state.submit.mock.calls[0]!.slice(0,4)).toEqual(['project',device,'reboot','{"exact":9007199254740993}']);expect(state.wait).not.toHaveBeenCalled();expect(w.findComponent(ElDialog).props('modelValue')).toBe(false);w.unmount()
 })
 it('同步等待真实GET结果并只展示回复JSON，隐藏TL原始诊断对象',async()=>{
  const w=render();await open(w);await fill(w);w.findComponent(ElSwitch).vm.$emit('update:modelValue',true);await button(w,'发送').trigger('click');await flushPromises()
  expect(state.submit).toHaveBeenCalledTimes(1);expect(state.wait).toHaveBeenCalledTimes(1);expect(w.findComponent(ElDialog).props('modelValue')).toBe(true);expect(w.text()).toContain('设备回复参数 JSON');expect(w.findAll('textarea').at(-1)!.element.value).toContain('9007199254740993');expect(w.text()).not.toContain('attemptCount');expect(w.text()).not.toContain('timeoutSeconds');w.unmount()
 })
 it('ACK等待截止不伪成功、不自动重发，保留可核对的错误',async()=>{
  state.wait.mockResolvedValue({status:'ACKNOWLEDGED',outputText:null});const w=render();await open(w);await fill(w);w.findComponent(ElSwitch).vm.$emit('update:modelValue',true);await button(w,'发送').trigger('click');await flushPromises();expect(w.text()).toContain('等待超时，设备未回复命令');expect(w.text()).not.toContain('设备回复参数 JSON');expect(state.submit).toHaveBeenCalledTimes(1);w.unmount()
 })
 it('取消等待立即abort，迟到回复不能重新显示或刷新设备',async()=>{
  const late=deferred();state.wait.mockReturnValue(late.promise);const w=render();await open(w);await fill(w);w.findComponent(ElSwitch).vm.$emit('update:modelValue',true);await button(w,'发送').trigger('click');await flushPromises();const signal=state.wait.mock.calls[0]![2] as AbortSignal
  await button(w,'取消').trigger('click');expect(signal.aborted).toBe(true);late.resolve({status:'SUCCEEDED',outputText:'{"late":true}'});await flushPromises();expect(w.findComponent(ElDialog).props('modelValue')).toBe(false);expect(w.emitted('saved')).toHaveLength(1);w.unmount()
 })
 it('切设备使旧POST回执失效，不能开始旧命令等待或清新设备状态',async()=>{
  const late=deferred();state.submit.mockReturnValue(late.promise);const w=render();await open(w);await fill(w);w.findComponent(ElSwitch).vm.$emit('update:modelValue',true);await button(w,'发送').trigger('click');await w.setProps({deviceId:'33333333-3333-4333-8333-333333333333'});late.resolve({id:'old',status:'ACCEPTED'});await flushPromises();expect(state.wait).not.toHaveBeenCalled();expect(w.emitted('saved')).toBeUndefined();expect(w.findComponent(ElDialog).props('modelValue')).toBe(false);w.unmount()
 })
 it('未知写结果关闭重开仍持原key，404只GET再读成功前绝不再次POST',async()=>{
  state.submit.mockRejectedValue(new ApiError('请求未完成',0,undefined,undefined,true));state.lookup.mockRejectedValueOnce(new ApiError('未找到',404)).mockResolvedValue({id:'command',deviceId:device,commandKey:'reboot',status:'ACCEPTED'});const w=render();await open(w);await fill(w);await button(w,'发送').trigger('click');await flushPromises();const key=state.submit.mock.calls[0]![4];expect(w.text()).toContain('结果未知');expect(button(w,'发送')).toBeUndefined();await button(w,'取消').trigger('click');await open(w);expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('{"exact":9007199254740993}');await button(w,'核对原请求').trigger('click');await flushPromises();expect(w.text()).toContain('暂未定位原请求回执');await button(w,'核对原请求').trigger('click');await flushPromises();expect(state.lookup.mock.calls.map(call=>call.slice(0,5))).toEqual([['project',device,'reboot','{"exact":9007199254740993}',key],['project',device,'reboot','{"exact":9007199254740993}',key]]);expect(state.submit).toHaveBeenCalledTimes(1);expect(w.findComponent(ElDialog).props('modelValue')).toBe(false);expect(w.emitted('busy')!.at(-1)).toEqual([false]);w.unmount()
 })
 it('同步POST已受理后GET失败和取消重开只读原命令，不能生成新POST',async()=>{
  state.wait.mockRejectedValueOnce(new ApiError('读取失败',500)).mockResolvedValue({status:'SUCCEEDED',outputText:'{"safe":true}'});const w=render();await open(w);await fill(w);w.findComponent(ElSwitch).vm.$emit('update:modelValue',true);await button(w,'发送').trigger('click');await flushPromises();expect(w.text()).toContain('命令已受理');await button(w,'取消').trigger('click');await open(w);expect(button(w,'发送')).toBeUndefined();expect(state.choices).toHaveBeenCalledTimes(1);await button(w,'读取命令结果').trigger('click');await flushPromises();expect(state.wait.mock.calls.map(call=>call[1].id)).toEqual(['command','command']);expect(state.submit).toHaveBeenCalledTimes(1);expect(state.lookup).not.toHaveBeenCalled();expect(w.findAll('textarea').at(-1)!.element.value).toBe('{"safe":true}');expect(w.emitted('busy')!.at(-1)).toEqual([false]);w.unmount()
 })
 it('同步等待取消保留已知身份，迟到结果不能解除新核对状态',async()=>{
  const late=deferred();state.wait.mockReturnValueOnce(late.promise).mockRejectedValue(new ApiError('仍未返回',404));const w=render();await open(w);await fill(w);w.findComponent(ElSwitch).vm.$emit('update:modelValue',true);await button(w,'发送').trigger('click');await flushPromises();await button(w,'取消').trigger('click');await open(w);late.resolve({status:'SUCCEEDED',outputText:'{"late":true}'});await flushPromises();expect(w.text()).not.toContain('late');expect(w.emitted('busy')!.at(-1)).toEqual([true]);await button(w,'读取命令结果').trigger('click');await flushPromises();expect(state.submit).toHaveBeenCalledTimes(1);expect(state.wait).toHaveBeenCalledTimes(2);expect(w.text()).toContain('命令已受理');w.unmount()
 })
 it('归档期间可核对原unknown但不能新发，撤销control和身份变化清私有状态',async()=>{
  state.submit.mockRejectedValue(new ApiError('断线',0,undefined,undefined,true));const w=render();await open(w);await fill(w);await button(w,'发送').trigger('click');await flushPromises();state.status.value='ARCHIVED';await button(w,'取消').trigger('click');await open(w);expect(button(w,'核对原请求')).toBeDefined();state.permission.value=false;await flushPromises();expect(w.findComponent(ElDialog).props('modelValue')).toBe(false);expect(w.emitted('busy')!.at(-1)).toEqual([false]);state.permission.value=true;state.status.value='ACTIVE';await flushPromises();await open(w);expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('');await fill(w);await button(w,'发送').trigger('click');await flushPromises();changeIdentity();await flushPromises();expect(w.findComponent(ElDialog).props('modelValue')).toBe(false);expect(state.lookup).not.toHaveBeenCalled();w.unmount()
 })
 it('坏JSON在新键和POST之前拒绝，普通明确拒绝可以修正但服务未知code仍锁定',async()=>{
  const w=render();await open(w);await fill(w);await w.find('textarea').setValue('{bad}');await button(w,'发送').trigger('click');await flushPromises();expect(state.submit).not.toHaveBeenCalled();await fill(w);state.submit.mockRejectedValueOnce(new ApiError('参数拒绝',422));await button(w,'发送').trigger('click');await flushPromises();expect(button(w,'发送').attributes('disabled')).toBeUndefined();state.submit.mockRejectedValueOnce(new ApiError('结果未知',409,10010));await button(w,'发送').trigger('click');await flushPromises();expect(w.text()).toContain('结果未知');expect(button(w,'核对原请求')).toBeDefined();w.unmount()
 })
 it('无control权限无写入口和建议读取',()=>{state.permission.value=false;const w=render();expect(w.findAll('button')).toHaveLength(0);expect(state.choices).not.toHaveBeenCalled();expect(state.submit).not.toHaveBeenCalled();w.unmount()})
})
