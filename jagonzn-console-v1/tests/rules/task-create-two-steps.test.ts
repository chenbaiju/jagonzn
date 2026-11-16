import {configureTaskCommand} from './task-command-config-fixture'
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Form from '../../src/features/rules/DeviceTaskCreateForm.vue'
import TaskPropertyFunctionDialog from '../../src/features/rules/TaskPropertyFunctionDialog.vue'
import RuleFunctionCodeEditor from '../../src/features/rules/RuleFunctionCodeEditor.vue'
import TaskCommandContentDialog from '../../src/features/rules/TaskCommandContentDialog.vue'
import TaskDataContentDialog from '../../src/features/rules/TaskDataContentDialog.vue'
import TaskPropertyContentDialog from '../../src/features/rules/TaskPropertyContentDialog.vue'
import JsonCodeEditor from '../../src/ui/JsonCodeEditor.vue'
import {ApiError} from '../../src/core/http'
const state=vi.hoisted(()=>({project:null as any,current:null as any}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');state.project=ref('10000000-0000-4000-8000-000000000001');state.current=ref({timezone:'Asia/Shanghai'});return {session:{ready:true,transitioning:false,user:{accountId:'00000000-0000-4000-8000-0000000000aa'},projects:[],menus:[]},projectId:state.project,currentProject:state.current,can:()=>true}})
const project='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000001',job='30000000-0000-4000-8000-000000000001';let view:VueWrapper|undefined,port:any,saved:any
function button(label:string){const value=view!.findAll('button').find(x=>x.text()===label||x.attributes('aria-label')===label);expect(value,label).toBeDefined();return value!}
async function setup(stepped=true){view=mount(Form,{props:{deviceId:device,deviceName:'当前设备',transport:port,stepped},global:{plugins:[ElementPlus]}});await flushPromises();return view}
async function fields(){await view!.get('[aria-label="新任务名称"]').setValue('两步任务');await configureTaskCommand(view!,'sample','{"a":1}')}
beforeEach(()=>{state.project.value=project;state.current.value={timezone:'Asia/Shanghai'};port={create:vi.fn().mockImplementation(async(_p:string,_d:string,body:any)=>{saved={tags:{},...body,id:job,status:'PAUSED',version:1};return saved}),definition:vi.fn().mockImplementation(async()=>saved),preference:vi.fn().mockResolvedValue({deviceId:device,allowed:true,version:1,definitionVersion:1}),change:vi.fn(),run:vi.fn()}})
afterEach(()=>{view?.unmount();view=undefined;document.body.innerHTML=''})
it('两步创建先配置后其它设置，下一步/上一步零写且草稿不丢，最后只一次创建',async()=>{
 const w=await setup();expect(w.find('[aria-label="新任务描述"]').exists()).toBe(false);expect(w.findAll('button').some(x=>x.text()==='创建')).toBe(false);await fields();await button('下一步').trigger('click');await flushPromises();expect(w.text()).toContain('其它设置');expect(w.text()).toContain('规则描述');await w.get('[aria-label="新任务描述"]').setValue('第二步描述');expect(port.create).not.toHaveBeenCalled();await button('上一步').trigger('click');await flushPromises();expect((w.get('[aria-label="新任务名称"]').element as HTMLInputElement).value).toBe('两步任务');expect(w.getComponent({name:'TaskCommandContentDialog'}).props('value')).toEqual({method:'sample',params:{a:1}});await button('下一步').trigger('click');await flushPromises();expect((w.get('[aria-label="新任务描述"]').element as HTMLInputElement).value).toBe('第二步描述');await button('创建').trigger('click');await flushPromises();expect(port.create).toHaveBeenCalledTimes(1);expect(port.create.mock.lastCall[2]).toMatchObject({name:'两步任务',description:'第二步描述',commandKey:'sample',input:{a:1},scheduleType:'MANUAL',enabled:false,targetDeviceIds:[device]});expect(port.create.mock.lastCall[2]).not.toHaveProperty('actionType');expect(w.emitted('created')).toEqual([[job]])
})
it('第一步非法JSON/空名不前进或写入，Enter不能绕过下一步直接创建',async()=>{
 const w=await setup();await button('下一步').trigger('click');await flushPromises();expect(w.find('[aria-label="新任务描述"]').exists()).toBe(false);await w.get('[aria-label="新任务名称"]').setValue('两步任务');const invalid=await configureTaskCommand(w,'sample','{bad');const cancel=invalid.findAllComponents({name:'ElButton'}).find(x=>x.text()==='取消')!;await cancel.trigger('click');await flushPromises();await button('下一步').trigger('click');await flushPromises();expect(w.find('[aria-label="新任务描述"]').exists()).toBe(false);await configureTaskCommand(w,'sample','{}');await w.get('form').trigger('submit');await flushPromises();expect(port.create).not.toHaveBeenCalled();expect(w.find('[aria-label="新任务描述"]').exists()).toBe(false)
})
it('第二步创建未知不能借上一步解锁重发，原草稿保持',async()=>{
 port.create.mockRejectedValue(new ApiError('结果未知',0,undefined,undefined,true));const w=await setup();await fields();await button('下一步').trigger('click');await flushPromises();await w.get('[aria-label="新任务描述"]').setValue('未知描述');await button('创建').trigger('click');await flushPromises();expect(button('上一步').attributes('disabled')).toBeDefined();await button('上一步').trigger('click');await flushPromises();expect(w.find('[aria-label="新任务描述"]').exists()).toBe(true);expect((w.get('[aria-label="新任务描述"]').element as HTMLInputElement).value).toBe('未知描述');expect(button('创建').attributes('disabled')).toBeDefined();expect(port.create).toHaveBeenCalledTimes(1)
})
it('旧dialog表单默认单步仍有原取消与描述，不要求虚构新接口',async()=>{
 const w=await setup(false);expect(w.find('[aria-label="新任务描述"]').exists()).toBe(true);expect(w.findAll('button').some(x=>x.text()==='下一步')).toBe(false);await fields();await button('创建').trigger('click');await flushPromises();expect(port.create).toHaveBeenCalledTimes(1)
})
it('固定属性配置仅本地完成，创建未知按原key核对类型和原内容且不第二POST',async()=>{
 port.creation=vi.fn().mockResolvedValue({jobId:job,initialDefinitionVersion:1,deleted:false})
 port.create.mockImplementation(async(_project:string,_device:string,body:unknown)=>{saved={tags:{},...(body as Record<string,unknown>),id:job,actionType:'PROPERTY_SET',commandKey:null,status:'PAUSED',version:1};throw new ApiError('结果未知',0,undefined,undefined,true)})
 const w=await setup();await w.get('[aria-label="新任务名称"]').setValue('固定属性')
 await w.get('input[value="PROPERTY_SET"]').setValue();await flushPromises();await button('配置属性下发').trigger('click');await flushPromises()
 let dialog=w.getComponent(TaskPropertyContentDialog)
 expect(dialog.getComponent(JsonCodeEditor).props('modelValue')).toBe('{}')
 await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='取消')!.trigger('click');await flushPromises()
 expect(port.create).not.toHaveBeenCalled();await button('配置属性下发').trigger('click');await flushPromises();dialog=w.getComponent(TaskPropertyContentDialog)
 const complete=()=>dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='完成')!
 await complete().trigger('click');expect(document.body.textContent).toContain('至少填写一个')
 dialog.getComponent(JsonCodeEditor).vm.$emit('update:modelValue','{"value":1,"value":2}');await flushPromises();await complete().trigger('click');expect(document.body.textContent).toContain('字段重复')
 dialog.getComponent(JsonCodeEditor).vm.$emit('update:modelValue','{"value":9007199254740993}');await flushPromises();await complete().trigger('click');expect(document.body.textContent).toContain('无法精确提交')
 dialog.getComponent(JsonCodeEditor).vm.$emit('update:modelValue','{"target_temp":23.5}');await flushPromises();await complete().trigger('click');await flushPromises()
 expect(port.create).not.toHaveBeenCalled();expect(port.creation).not.toHaveBeenCalled();await button('下一步').trigger('click');await flushPromises();await button('创建').trigger('click');await flushPromises()
 expect(port.create).toHaveBeenCalledTimes(1);expect(port.create.mock.lastCall[2]).toMatchObject({actionType:'PROPERTY_SET',commandKey:null,input:{target_temp:23.5},targetDeviceIds:[device],scheduleType:'MANUAL',enabled:false})
 const originalKey=port.create.mock.lastCall[3];expect(typeof originalKey).toBe('string');expect(button('创建').attributes('disabled')).toBeDefined()
 port.definition.mockResolvedValueOnce({...saved,actionType:'COMMAND',commandKey:'set'})
 await button('重新读取核对').trigger('click');await flushPromises();expect(w.text()).toContain('定义回读不一致');expect(button('创建').attributes('disabled')).toBeDefined();expect(port.create).toHaveBeenCalledTimes(1)
 await button('重新读取核对').trigger('click');await flushPromises();expect(port.creation).toHaveBeenCalledWith(project,originalKey,expect.any(AbortSignal));expect(port.create).toHaveBeenCalledTimes(1);expect(w.emitted('created')).toEqual([[job]])
})
it('固定云更新独立草稿与更新JSON叶，创建未知不能用同JSON属性下发原件确认',async()=>{
 port.creation=vi.fn().mockResolvedValue({jobId:job,initialDefinitionVersion:1,deleted:false})
 port.create.mockImplementation(async(_project:string,_device:string,body:unknown)=>{saved={tags:{},...(body as Record<string,unknown>),id:job,actionType:'CLOUD_UPDATE',commandKey:null,status:'PAUSED',version:1};throw new ApiError('结果未知',0,undefined,undefined,true)})
 const w=await setup();await w.get('[aria-label="新任务名称"]').setValue('固定云更新');expect(w.find('.task-operation-card').exists()).toBe(false)
 async function select(kind:string){await w.get('input[value="'+kind+'"]').setValue();await flushPromises()}
 async function configure(label:string,text:string){await button(label).trigger('click');await flushPromises();const dialog=w.getComponent(TaskPropertyContentDialog);dialog.getComponent(JsonCodeEditor).vm.$emit('update:modelValue',text);await flushPromises();await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='完成')!.trigger('click');await flushPromises()}
 await select('PROPERTY_SET');await configure('配置属性下发','{"target_temp":22}')
 await select('CLOUD_UPDATE');expect(w.text()).toContain('向设备更新固定的云端私有属性集合。');await button('配置属性更新').trigger('click');await flushPromises()
 let dialog=w.getComponent(TaskPropertyContentDialog);expect(dialog.props('purpose')).toBe('cloud-update');expect(dialog.getComponent(JsonCodeEditor).props('modelValue')).toBe('{}');expect(dialog.getComponent(JsonCodeEditor).props('ariaLabel')).toBe('更新属性 JSON')
 await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='取消')!.trigger('click');await flushPromises();expect(port.create).not.toHaveBeenCalled()
 await configure('配置属性更新','{"private_temp":29.5}');await select('PROPERTY_SET');await button('配置属性下发').trigger('click');await flushPromises();dialog=w.getComponent(TaskPropertyContentDialog);expect(JSON.parse(dialog.getComponent(JsonCodeEditor).props('modelValue'))).toEqual({target_temp:22});await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='取消')!.trigger('click');await flushPromises()
 await select('CLOUD_UPDATE');await button('下一步').trigger('click');await flushPromises();await button('创建').trigger('click');await flushPromises()
 expect(port.create).toHaveBeenCalledTimes(1);expect(port.create.mock.lastCall[2]).toMatchObject({actionType:'CLOUD_UPDATE',commandKey:null,input:{private_temp:29.5},targetDeviceIds:[device],scheduleType:'MANUAL',enabled:false})
 port.definition.mockResolvedValueOnce({...saved,actionType:'PROPERTY_SET'})
 await button('重新读取核对').trigger('click');await flushPromises();expect(w.text()).toContain('定义回读不一致');expect(button('创建').attributes('disabled')).toBeDefined();expect(port.create).toHaveBeenCalledTimes(1)
 await button('重新读取核对').trigger('click');await flushPromises();expect(port.create).toHaveBeenCalledTimes(1);expect(w.emitted('created')).toEqual([[job]])
})

it('固定DATA三格式保原文和独立草稿，创建未知按完整四字段核对且不重复POST',async()=>{
 port.creation=vi.fn().mockResolvedValue({jobId:job,initialDefinitionVersion:1,deleted:false})
 port.create.mockImplementation(async(_project:string,_device:string,body:unknown)=>{saved={tags:{},...(body as Record<string,unknown>),id:job,actionType:'DATA_DOWNLINK',commandKey:null,status:'PAUSED',version:1};throw new ApiError('结果未知',0,undefined,undefined,true)})
 const w=await setup();await w.get('[aria-label="新任务名称"]').setValue('固定数据');expect(w.find('.task-operation-card').exists()).toBe(false)
 await w.get('input[value="DATA_DOWNLINK"]').setValue();await flushPromises();expect(w.get('input[value="MQTT"]').element).toHaveProperty('checked',true)
 expect(w.getComponent({name:'RuleDataStreamIdentifier'}).find('[role="combobox"]').exists()).toBe(true);expect(w.getComponent({name:'RuleDataStreamIdentifier'}).props('choices')).toEqual([]);expect((w.get('[aria-label="自定义数据流标识符"]').element as HTMLInputElement).value).toBe('');await w.get('[aria-label="自定义数据流标识符"]').setValue('hex-b_2');await w.get('input[value="TCP"]').setValue()
 await button('配置自定义下发').trigger('click');await flushPromises();let dialog=w.getComponent(TaskDataContentDialog)
 const complete=()=>dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='完成')!
 expect(dialog.getComponent(JsonCodeEditor).props('modelValue')).toBe('');await complete().trigger('click');expect(document.body.textContent).toContain('1至65504')
 for(const bad of ['{"a":1,"\\u0061":2}','true false','['.repeat(33)+'0'+']'.repeat(33),'{"n":'+ '1'.repeat(1001)+'}']){
  dialog.getComponent(JsonCodeEditor).vm.$emit('update:modelValue',bad);await flushPromises();await complete().trigger('click');expect(document.body.textContent).toContain('格式限制')
 }
 await dialog.findAllComponents({name:'ElRadio'}).find(x=>x.props('value')==='HEX')!.get('input').setValue();dialog.getComponent(JsonCodeEditor).vm.$emit('update:modelValue','01 02');await flushPromises();await complete().trigger('click');expect(document.body.textContent).toContain('不含空白')
 dialog.getComponent(JsonCodeEditor).vm.$emit('update:modelValue','0aFF00');await flushPromises();await complete().trigger('click');await flushPromises();expect(port.create).not.toHaveBeenCalled()
 await button('配置自定义下发').trigger('click');await flushPromises();dialog=w.getComponent(TaskDataContentDialog);expect(dialog.getComponent(JsonCodeEditor).props('modelValue')).toBe('0aFF00')
 await dialog.findAllComponents({name:'ElRadio'}).find(x=>x.props('value')==='TEXT')!.get('input').setValue();dialog.getComponent(JsonCodeEditor).vm.$emit('update:modelValue','before\u0000after');await flushPromises();await complete().trigger('click');expect(document.body.textContent).toContain('Unicode');expect(port.create).not.toHaveBeenCalled();const plaintext='  中文\r\n0102  ';dialog.getComponent(JsonCodeEditor).vm.$emit('update:modelValue',plaintext);await flushPromises();await complete().trigger('click');await flushPromises()
 await button('配置自定义下发').trigger('click');await flushPromises();dialog=w.getComponent(TaskDataContentDialog);expect(dialog.getComponent(JsonCodeEditor).props('modelValue')).toBe(plaintext)
 await dialog.findAllComponents({name:'ElRadio'}).find(x=>x.props('value')==='JSON')!.get('input').setValue();const raw=' \r\n[900719925474099312345,1.2300e+3,null]\t';dialog.getComponent(JsonCodeEditor).vm.$emit('update:modelValue',raw);await flushPromises();await complete().trigger('click');await flushPromises()
 await w.get('input[value="CLOUD_UPDATE"]').setValue();await flushPromises();await w.get('input[value="DATA_DOWNLINK"]').setValue();await flushPromises();await button('配置自定义下发').trigger('click');await flushPromises();dialog=w.getComponent(TaskDataContentDialog);expect(dialog.getComponent(JsonCodeEditor).props('modelValue')).toBe(raw);await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='取消')!.trigger('click');await flushPromises()
 await button('下一步').trigger('click');await flushPromises();await button('创建').trigger('click');await flushPromises()
 const input={protocol:'TCP',streamIdentifier:'hex-b_2',format:'JSON',message:raw};expect(port.create).toHaveBeenCalledTimes(1);expect(port.create.mock.lastCall[2]).toMatchObject({actionType:'DATA_DOWNLINK',commandKey:null,input,scheduleType:'MANUAL',enabled:false,targetDeviceIds:[device]})
 for(const changed of [{...saved,actionType:'CLOUD_UPDATE'},{...saved,input:{...input,protocol:'MQTT'}},{...saved,input:{...input,message:raw.trim()}}]){
  port.definition.mockResolvedValueOnce(changed);await button('重新读取核对').trigger('click');await flushPromises();expect(w.text()).toContain('定义回读不一致');expect(button('创建').attributes('disabled')).toBeDefined();expect(port.create).toHaveBeenCalledTimes(1)
 }
 await button('重新读取核对').trigger('click');await flushPromises();expect(w.emitted('created')).toEqual([[job]]);expect(port.create).toHaveBeenCalledTimes(1)
})

it('任务标签第二步往返保原文，创建UNKNOWN按完整标签核对且原key只一次POST',async()=>{
 port.creation=vi.fn().mockResolvedValue({jobId:job,initialDefinitionVersion:1,deleted:false})
 port.create.mockImplementation(async(_project:string,_device:string,body:unknown)=>{saved={tags:{},...(body as Record<string,unknown>),id:job,status:'PAUSED',version:1};throw new ApiError('结果未知',0,undefined,undefined,true)})
 const w=await setup();await fields();await button('下一步').trigger('click');await flushPromises();expect(w.find('[aria-label="任务标签"]').exists()).toBe(true)
 await w.get('[aria-label="标签 1 名称"]').setValue('部门');await w.get('[aria-label="标签 1 值"]').setValue('  研发  ');await button('添加标签').trigger('click');await w.get('[aria-label="标签 2 名称"]').setValue('空值')
 await button('上一步').trigger('click');await flushPromises();await button('下一步').trigger('click');await flushPromises();expect((w.get('[aria-label="标签 1 值"]').element as HTMLInputElement).value).toBe('  研发  ');expect((w.get('[aria-label="标签 2 值"]').element as HTMLInputElement).value).toBe('');expect(port.create).not.toHaveBeenCalled()
 await button('创建').trigger('click');await flushPromises();expect(port.create).toHaveBeenCalledTimes(1);const body=port.create.mock.lastCall[2];expect(body).toMatchObject({commandKey:'sample',input:{a:1},tags:{部门:'  研发  ',空值:''},scheduleType:'MANUAL',enabled:false,targetDeviceIds:[device]});expect(body).not.toHaveProperty('actionType');const key=port.create.mock.lastCall[3];expect(w.get('[aria-label="标签 1 名称"]').attributes('disabled')).toBeDefined();expect(button('添加标签').attributes('disabled')).toBeDefined()
 port.definition.mockResolvedValueOnce({...saved,tags:{部门:'研发',空值:''}});await button('重新读取核对').trigger('click');await flushPromises();expect(w.text()).toContain('定义回读不一致');expect(button('创建').attributes('disabled')).toBeDefined();expect(port.create).toHaveBeenCalledTimes(1)
 await button('重新读取核对').trigger('click');await flushPromises();expect(port.creation).toHaveBeenCalledWith(project,key,expect.any(AbortSignal));expect(w.emitted('created')).toEqual([[job]]);expect(port.create).toHaveBeenCalledTimes(1)
})

it('属性下发两卡显式完成才选函数，原源码标签及UNKNOWN原key完整回读不第二POST',async()=>{
 port.creation=vi.fn().mockResolvedValue({jobId:job,initialDefinitionVersion:1,deleted:false})
 port.create.mockImplementation(async(_project:string,_device:string,body:unknown)=>{saved={tags:{},...(body as Record<string,unknown>),id:job,status:'PAUSED',version:1};throw new ApiError('结果未知',0,undefined,undefined,true)})
 const w=await setup();await w.get('[aria-label="新任务名称"]').setValue('属性下发函数');await w.get('input[value="PROPERTY_SET"]').setValue();await flushPromises();expect(w.findAll('.task-operation-card')).toHaveLength(2);expect(w.text()).toContain('编写 Javascript 云函数，动态生成向设备下发的属性集合。')
 await button('配置属性下发').trigger('click');await flushPromises();let fixed=w.getComponent(TaskPropertyContentDialog);fixed.getComponent(JsonCodeEditor).vm.$emit('update:modelValue','{"target_temp":20}');await flushPromises();await fixed.findAllComponents({name:'ElButton'}).find(x=>x.text()==='完成')!.trigger('click');await flushPromises()
 await button('配置云函数属性下发').trigger('click');await flushPromises();let dialog=w.getComponent(TaskPropertyFunctionDialog);expect(dialog.getComponent(RuleFunctionCodeEditor).props('modelValue')).toContain('push_attributes');expect(document.body.textContent).not.toContain('params');await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='取消')!.trigger('click');await flushPromises();expect(w.findComponent(TaskPropertyFunctionDialog).exists()).toBe(false);expect(w.getComponent(TaskPropertyContentDialog).props('value')).toEqual({target_temp:20});expect(port.create).not.toHaveBeenCalled()
 await button('配置云函数属性下发').trigger('click');await flushPromises();dialog=w.getComponent(TaskPropertyFunctionDialog);const editor=dialog.getComponent(RuleFunctionCodeEditor);editor.vm.$emit('busy',true);await flushPromises();expect(editor.props('disabled')).toBe(false);expect(dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='完成')!.attributes('disabled')).toBeDefined();expect(button('下一步').attributes('disabled')).toBeDefined();editor.vm.$emit('busy',false)
 const source='// 原函数注释\r\nmodule.exports = function () { return {target_temp:23.5}; };\r\n';editor.vm.$emit('update:modelValue',source);await flushPromises();await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='完成')!.trigger('click');await flushPromises();expect(w.find('input[value="PROPERTY_SET_FUNCTION"]').exists()).toBe(false);expect(w.get('input[value="PROPERTY_SET"]').element).toHaveProperty('checked',true)
 await button('下一步').trigger('click');await flushPromises();await w.get('[aria-label="标签 1 名称"]').setValue('函数标签');await button('上一步').trigger('click');await flushPromises();await button('配置云函数属性下发').trigger('click');await flushPromises();dialog=w.getComponent(TaskPropertyFunctionDialog);expect(dialog.getComponent(RuleFunctionCodeEditor).props('modelValue')).toBe(source);await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='取消')!.trigger('click');await flushPromises();await button('下一步').trigger('click');await flushPromises();await button('创建').trigger('click');await flushPromises()
 expect(port.create).toHaveBeenCalledTimes(1);expect(port.create.mock.lastCall[2]).toMatchObject({actionType:'PROPERTY_SET_FUNCTION',commandKey:null,input:{format:'COMMON_JS',source},tags:{函数标签:''},scheduleType:'MANUAL',enabled:false,targetDeviceIds:[device]});const key=port.create.mock.lastCall[3]
 for(const changed of [{...saved,actionType:'PROPERTY_SET'},{...saved,input:{format:'COMMON_JS',source:source.replaceAll('\r\n','\n')}}]){port.definition.mockResolvedValueOnce(changed);await button('重新读取核对').trigger('click');await flushPromises();expect(w.text()).toContain('定义回读不一致');expect(port.create).toHaveBeenCalledTimes(1)}
 await button('重新读取核对').trigger('click');await flushPromises();expect(port.creation).toHaveBeenCalledWith(project,key,expect.any(AbortSignal));expect(w.emitted('created')).toEqual([[job]]);expect(port.create).toHaveBeenCalledTimes(1)
})

it('云函数属性更新两卡与下发草稿独立，保原文和UNKNOWN原key不重复创建',async()=>{
 port.creation=vi.fn().mockResolvedValue({jobId:job,initialDefinitionVersion:1,deleted:false})
 port.create.mockImplementation(async(_project:string,_device:string,body:unknown)=>{saved={tags:{},...(body as Record<string,unknown>),id:job,status:'PAUSED',version:1};throw new ApiError('结果未知',0,undefined,undefined,true)})
 const w=await setup();await w.get('[aria-label="新任务名称"]').setValue('云函数属性更新');await w.get('input[value="CLOUD_UPDATE"]').setValue();await flushPromises()
 expect(w.findAll('.task-operation-card')).toHaveLength(2);expect(w.text()).toContain('编写 Javascript 云函数，动态生成更新的云端私有属性集合。')
 await button('配置云函数属性更新').trigger('click');await flushPromises();let dialog=w.getComponent(TaskPropertyFunctionDialog);expect(dialog.props('purpose')).toBe('cloud-update');expect(document.body.textContent).toContain('使用云函数构造更新属性');expect(dialog.getComponent(RuleFunctionCodeEditor).props('modelValue')).toContain('update_attributes')
 const source='// 原云函数\r\nmodule.exports = function(){ return {cloud_value:7.5}; };\r\n';dialog.getComponent(RuleFunctionCodeEditor).vm.$emit('update:modelValue',source);await flushPromises();await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='完成')!.trigger('click');await flushPromises();expect(w.get('input[value="CLOUD_UPDATE"]').element).toHaveProperty('checked',true)
 await w.get('input[value="PROPERTY_SET"]').setValue();await button('配置云函数属性下发').trigger('click');await flushPromises();dialog=w.getComponent(TaskPropertyFunctionDialog);expect(dialog.props('purpose')).toBe('downlink');expect(dialog.getComponent(RuleFunctionCodeEditor).props('modelValue')).toContain('push_attributes');await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='取消')!.trigger('click');await flushPromises()
 await w.get('input[value="CLOUD_UPDATE"]').setValue();await button('配置云函数属性更新').trigger('click');await flushPromises();dialog=w.getComponent(TaskPropertyFunctionDialog);expect(dialog.getComponent(RuleFunctionCodeEditor).props('modelValue')).toBe(source);await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='完成')!.trigger('click');await flushPromises()
 await button('下一步').trigger('click');await flushPromises();await button('创建').trigger('click');await flushPromises();expect(port.create).toHaveBeenCalledTimes(1);expect(port.create.mock.lastCall[2]).toMatchObject({actionType:'CLOUD_UPDATE_FUNCTION',commandKey:null,input:{format:'COMMON_JS',source},targetDeviceIds:[device]});expect(port.create.mock.lastCall[2].input).not.toHaveProperty('sampleDeviceId');const key=port.create.mock.lastCall[3]
 port.definition.mockResolvedValueOnce({...saved,actionType:'PROPERTY_SET_FUNCTION'});await button('重新读取核对').trigger('click');await flushPromises();expect(w.text()).toContain('定义回读不一致');expect(port.create).toHaveBeenCalledTimes(1)
 await button('重新读取核对').trigger('click');await flushPromises();expect(port.creation).toHaveBeenCalledWith(project,key,expect.any(AbortSignal));expect(w.emitted('created')).toEqual([[job]]);expect(port.create).toHaveBeenCalledTimes(1)
})

it('DATA云函数两卡保独立原文和冻结路由，UNKNOWN按四字段原key核对不重复创建',async()=>{
 port.creation=vi.fn().mockResolvedValue({jobId:job,initialDefinitionVersion:1,deleted:false})
 port.create.mockImplementation(async(_project:string,_device:string,body:unknown)=>{saved={tags:{},...(body as Record<string,unknown>),id:job,status:'PAUSED',version:1};throw new ApiError('结果未知',0,undefined,undefined,true)})
 const w=await setup();await w.get('[aria-label="新任务名称"]').setValue('DATA函数')
 await w.get('input[value="DATA_DOWNLINK"]').setValue();await flushPromises();expect(w.findAll('.task-operation-card')).toHaveLength(4)
 await w.get('[aria-label="自定义数据流标识符"]').setValue('fixed-a')
 await button('配置自定义下发').trigger('click');await flushPromises();const fixed=w.getComponent(TaskDataContentDialog);fixed.getComponent(JsonCodeEditor).vm.$emit('update:modelValue','{"fixed":1}');await flushPromises();await fixed.findAllComponents({name:'ElButton'}).find(x=>x.text()==='完成')!.trigger('click');await flushPromises()
 await button('配置云函数自定义下发').trigger('click');await flushPromises();let dialog=w.getComponent(TaskPropertyFunctionDialog)
 expect(dialog.props('purpose')).toBe('data');expect(dialog.getComponent(RuleFunctionCodeEditor).props('modelValue')).toContain('msg: "010300ff8312"');expect(dialog.getComponent(RuleFunctionCodeEditor).props('ariaLabel')).toBe('自定义数据下发函数源码');expect(document.body.querySelector('a[href="https://www.thingscloud.xyz/docs/guide/tasks/data-set.html"]')?.textContent).toContain('学习自定义数据下发的云函数示例')
 dialog.getComponent(RuleFunctionCodeEditor).vm.$emit('update:modelValue','取消的源码');await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='取消')!.trigger('click');await flushPromises();expect(port.create).not.toHaveBeenCalled()
 await button('配置云函数自定义下发').trigger('click');await flushPromises();dialog=w.getComponent(TaskPropertyFunctionDialog);expect(dialog.getComponent(RuleFunctionCodeEditor).props('modelValue')).toContain('010300ff8312')
 const source='// DATA原文\r\nmodule.exports = function () { return {type:"json",msg:{}}; };\r\n';dialog.getComponent(RuleFunctionCodeEditor).vm.$emit('update:modelValue',source);await flushPromises();await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='完成')!.trigger('click');await flushPromises()
 await w.get('input[value="TCP"]').setValue();await w.get('[aria-label="自定义数据流标识符"]').setValue('function-b')
 await button('配置自定义下发').trigger('click');await flushPromises();expect(w.getComponent(TaskDataContentDialog).props('value')).toEqual({protocol:'MQTT',streamIdentifier:'fixed-a',format:'JSON',message:'{"fixed":1}'});await w.getComponent(TaskDataContentDialog).findAllComponents({name:'ElButton'}).find(x=>x.text()==='取消')!.trigger('click');await flushPromises()
 await button('配置云函数自定义下发').trigger('click');await flushPromises();dialog=w.getComponent(TaskPropertyFunctionDialog);expect(dialog.props('value')).toEqual({format:'COMMON_JS',source});await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='取消')!.trigger('click');await flushPromises();expect(port.create).not.toHaveBeenCalled()
 await button('下一步').trigger('click');await flushPromises();await button('创建').trigger('click');await flushPromises()
 const input={protocol:'TCP',streamIdentifier:'function-b',format:'COMMON_JS',source};expect(port.create).toHaveBeenCalledTimes(1);expect(port.create.mock.lastCall[2]).toMatchObject({actionType:'DATA_DOWNLINK_FUNCTION',commandKey:null,input,scheduleType:'MANUAL',enabled:false,targetDeviceIds:[device]});expect(port.create.mock.lastCall[2].input).not.toHaveProperty('message');const key=port.create.mock.lastCall[3]
 for(const changed of [{...saved,actionType:'DATA_DOWNLINK'},{...saved,input:{...input,protocol:'MQTT'}},{...saved,input:{...input,source:source.replaceAll('\r\n','\n')}}]){port.definition.mockResolvedValueOnce(changed);await button('重新读取核对').trigger('click');await flushPromises();expect(w.text()).toContain('定义回读不一致');expect(port.create).toHaveBeenCalledTimes(1)}
 await button('重新读取核对').trigger('click');await flushPromises();expect(port.creation).toHaveBeenCalledWith(project,key,expect.any(AbortSignal));expect(w.emitted('created')).toEqual([[job]]);expect(port.create).toHaveBeenCalledTimes(1)
})

it('命令云函数两卡独立草稿，原始id源码和UNKNOWN只核对不重复创建',async()=>{
 port.creation=vi.fn().mockResolvedValue({jobId:job,initialDefinitionVersion:1,deleted:false})
 port.create.mockImplementation(async(_p:string,_d:string,body:unknown)=>{saved={tags:{},...(body as Record<string,unknown>),id:job,status:'PAUSED',version:1};throw new ApiError('结果未知',0,undefined,undefined,true)})
 const w=await setup();await w.get('[aria-label="新任务名称"]').setValue('命令函数');await w.get('input[value="COMMAND"]').setValue();await flushPromises();expect(w.findAll('.task-operation-card')).toHaveLength(3)
 await button('配置云函数命令下发').trigger('click');await flushPromises();let dialog=w.getComponent(TaskPropertyFunctionDialog);expect(dialog.props('purpose')).toBe('command');expect(dialog.getComponent(RuleFunctionCodeEditor).props('modelValue')).toContain('id: 1000')
 dialog.getComponent(RuleFunctionCodeEditor).vm.$emit('update:modelValue','取消草稿');await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='取消')!.trigger('click');await flushPromises();expect(port.create).not.toHaveBeenCalled()
 await button('配置云函数命令下发').trigger('click');await flushPromises();dialog=w.getComponent(TaskPropertyFunctionDialog);expect(dialog.getComponent(RuleFunctionCodeEditor).props('modelValue')).toContain('id: 1000')
 const source='// 命令原文\r\nmodule.exports=function(){return {method:"write_tag",params:{data:23.5},id:1000};};\r\n';dialog.getComponent(RuleFunctionCodeEditor).vm.$emit('update:modelValue',source);await flushPromises();await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='完成')!.trigger('click');await flushPromises()
 await button('配置命令下发').trigger('click');await flushPromises();await w.getComponent({name:'TaskCommandContentDialog'}).findAllComponents({name:'ElButton'}).find(x=>x.text()==='取消')!.trigger('click');await flushPromises()
 await button('下一步').trigger('click');await flushPromises();await button('创建').trigger('click');await flushPromises();expect(port.create).toHaveBeenCalledTimes(1);expect(port.create.mock.lastCall[2]).toMatchObject({actionType:'COMMAND_FUNCTION',commandKey:null,input:{format:'COMMON_JS',source},enabled:false,targetDeviceIds:[device]})
 port.definition.mockResolvedValueOnce({...saved,input:{format:'COMMON_JS',source:source.replace('1000','1001')}});await button('重新读取核对').trigger('click');await flushPromises();expect(w.text()).toContain('定义回读不一致');expect(port.create).toHaveBeenCalledTimes(1)
 await button('重新读取核对').trigger('click');await flushPromises();expect(w.emitted('created')).toEqual([[job]]);expect(port.create).toHaveBeenCalledTimes(1)
})

it('固定COMMAND创建保可选id，切类型清理且未知原键精确核对id不再POST',async()=>{
 port.creation=vi.fn().mockResolvedValue({jobId:job,initialDefinitionVersion:1,deleted:false})
 port.create.mockImplementation(async(_project:string,_device:string,body:unknown)=>{saved={tags:{},...(body as Record<string,unknown>),id:job,status:'PAUSED',version:1};throw new ApiError('结果未知',0,undefined,undefined,true)})
 const w=await setup();await fields();await button('配置命令下发').trigger('click');await flushPromises()
 let dialog=w.getComponent(TaskCommandContentDialog)
 dialog.getComponent(JsonCodeEditor).vm.$emit('update:modelValue','{"method":"sample","params":{"a":1},"id":-9}');await flushPromises();await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='完成')!.trigger('click');await flushPromises()
 expect(w.getComponent(TaskCommandContentDialog).props('value')).toEqual({method:'sample',params:{a:1},id:-9})
 await w.get('input[value="DATA_DOWNLINK"]').setValue();await flushPromises();await w.get('input[value="COMMAND"]').setValue();await flushPromises()
 expect(w.getComponent(TaskCommandContentDialog).props('value')).toEqual({method:'sample',params:{a:1}})
 await button('配置命令下发').trigger('click');await flushPromises();dialog=w.getComponent(TaskCommandContentDialog)
 dialog.getComponent(JsonCodeEditor).vm.$emit('update:modelValue','{"method":"sample","params":{"a":1},"id":1000}');await flushPromises();await dialog.findAllComponents({name:'ElButton'}).find(x=>x.text()==='完成')!.trigger('click');await flushPromises()
 await button('下一步').trigger('click');await flushPromises();await w.get('[aria-label="新任务描述"]').setValue('保留说明');await button('创建').trigger('click');await flushPromises()
 expect(port.create).toHaveBeenCalledTimes(1);expect(port.create.mock.lastCall[2]).toMatchObject({name:'两步任务',description:'保留说明',commandKey:'sample',commandRequestId:1000,input:{a:1},scheduleType:'MANUAL',enabled:false,targetDeviceIds:[device]})
 expect(port.create.mock.lastCall[2].input).not.toHaveProperty('id');expect(button('创建').attributes('disabled')).toBeDefined()
 port.definition.mockResolvedValueOnce({...saved,commandRequestId:1001});await button('重新读取核对').trigger('click');await flushPromises();expect(w.text()).toContain('定义回读不一致');expect(button('创建').attributes('disabled')).toBeDefined();expect(port.create).toHaveBeenCalledTimes(1)
 await button('重新读取核对').trigger('click');await flushPromises();expect(port.create).toHaveBeenCalledTimes(1);expect(port.creation).toHaveBeenCalledTimes(1);expect(w.emitted('created')).toEqual([[job]])
})
