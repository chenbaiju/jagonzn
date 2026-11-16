import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus,{ElMessage} from 'element-plus'
import Component from '../../src/features/devices/DeviceExtensionValues.vue'
import {ApiError,changeIdentity} from '../../src/core/http'
const state=vi.hoisted(()=>({project:null as any,current:null as any,session:null as any,permissions:null as any,row:null as any,api:vi.fn(),read:vi.fn(),write:vi.fn()}))
vi.mock('@/core/session',async()=>{const {ref,reactive}=await import('vue');state.project=ref('00000000-0000-4000-8000-000000000010');state.current=ref({status:'ACTIVE'});state.session=reactive({user:{accountId:'actor',projectRole:'OWNER'}});state.permissions=ref([]);return {projectId:state.project,currentProject:state.current,session:state.session,can:(p:string)=>state.permissions.value.includes(p)}})
vi.mock('@/core/http',async()=>({...await vi.importActual('@/core/http'),api:state.api}))
const project='00000000-0000-4000-8000-000000000010',device='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',type='00000000-0000-4000-8000-000000000003',fieldId='00000000-0000-4000-8000-000000000004'
const encode=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v))
function value(actual:string|null=null,kind='TEXT'){return {deviceId:device,deviceTypeId:type,definitionRevision:1,valueRevision:actual===null?0:1,fields:[{definition:{id:fieldId,name:'维护人',description:'维护负责人',kind,enabled:true,options:[],defaultValue:kind==='NUMBER'?'0':'默认人',onLabel:null,offLabel:null},value:actual,effectiveValue:actual??(kind==='NUMBER'?'0':'默认人')}]}}
const deferred=()=>{let resolve!:(value:Uint8Array)=>void;const promise=new Promise<Uint8Array>(done=>resolve=done);return {promise,resolve}}
let wrapper:ReturnType<typeof mount>|undefined
const button=(text:string)=>wrapper!.findAll('button').find(b=>b.text()===text)
async function click(text:string){expect(button(text)).toBeDefined();await button(text)!.trigger('click');await flushPromises()}
async function render(){wrapper=mount(Component,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises()}
const writes=()=>state.api.mock.calls.filter((call:any[])=>call[1]?.method==='put')
beforeEach(()=>{
 vi.clearAllMocks();state.project.value=project;state.current.value={status:'ACTIVE'};state.session.user={accountId:'actor',projectRole:'OWNER'};state.permissions.value=['device:read','device:update'];state.row=value()
 state.read.mockImplementation((target:string)=>Promise.resolve(encode({...state.row,deviceId:target})))
 state.write.mockImplementation((target:string,options:any)=>{const next=options.body.values.find((entry:any)=>entry.fieldId===fieldId)?.value??null;const previous=state.row.fields[0].value;state.row={...state.row,deviceId:target,valueRevision:state.row.valueRevision+(next===previous?0:1),fields:[{...state.row.fields[0],value:next,effectiveValue:next??state.row.fields[0].definition.defaultValue}]};return Promise.resolve(encode(state.row))})
 state.api.mockImplementation((path:string,options:any)=>{const target=path.match(/\/devices\/([^/]+)/)![1];return options?.method==='put'?state.write(target,options):state.read(target)})
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;ElMessage.closeAll();document.body.innerHTML=''})
describe('设备人工扩展信息编辑',()=>{
 it('Source空定义仍有编辑入口且仅提示先添加扩展信息，不打开表单或发写请求',async()=>{state.row={deviceId:device,deviceTypeId:type,definitionRevision:0,valueRevision:0,fields:[]};await render();expect(button('编辑')).toBeDefined();expect(wrapper!.text()).not.toContain('请在设备类型中添加并启用扩展信息。');await click('编辑');expect(document.body.textContent).toContain('请在设备类型中添加扩展信息');expect(button('保存')).toBeUndefined();expect(writes()).toHaveLength(0);expect(state.read).toHaveBeenCalledTimes(1)})
 it('初次读取显示默认值但不写入，未绑定和空定义不产生假的编辑出口',async()=>{
  await render();expect(wrapper!.text()).toContain('默认人');expect(wrapper!.text()).toContain('默认值');expect(writes()).toHaveLength(0)
  wrapper!.unmount();state.row={deviceId:device,deviceTypeId:null,definitionRevision:0,valueRevision:0,fields:[]};await render();expect(wrapper!.text()).toContain('当前设备未绑定类型');expect(button('编辑')).toBeUndefined();expect(writes()).toHaveLength(0)
 })
 it.each(['OPERATOR','VIEWER'])('%s即使残留更新权限也只读',async role=>{state.session.user.projectRole=role;await render();expect(wrapper!.text()).toContain('默认人');expect(button('编辑')).toBeUndefined();expect(writes()).toHaveLength(0)})
 it('编辑先读取新快照，取消不写，精确大数以文本保存一次且无乐观显示',async()=>{
  state.row=value('1','NUMBER');await render();await click('编辑');expect(state.read).toHaveBeenCalledTimes(2);await click('取消');expect(writes()).toHaveLength(0)
  await click('编辑');const exact='9007199254740993.12345678901234567890';await wrapper!.get('input[aria-label="维护人"]').setValue(exact)
  const wait=deferred();state.write.mockReturnValueOnce(wait.promise);void click('保存');await flushPromises();expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toMatchObject({expectedDefinitionRevision:1,expectedValueRevision:1,values:[{fieldId,value:exact}]});expect(wrapper!.find('.extension-field-value').exists()).toBe(false)
  wait.resolve(encode({...value(exact,'NUMBER'),valueRevision:2}));await flushPromises();expect(wrapper!.get('.extension-field-value').text()).toContain(exact);expect(button('编辑')).toBeDefined()
 })
 it('空文本和恢复默认值是不同意图，验证失败时输入仍保留',async()=>{
  state.row=value('自填');await render();await click('编辑');await wrapper!.get('input[aria-label="维护人"]').setValue('');await click('保存');expect(writes()[0]![1].body.values).toEqual([{fieldId,value:''}]);expect(wrapper!.text()).toContain('空文本')
  await click('编辑');await click('恢复默认值');await click('保存');expect(writes()[1]![1].body.values).toEqual([]);expect(wrapper!.text()).toContain('默认人')
 })
 it.each([new ApiError('冲突',409),new ApiError('未知',500,undefined,undefined,true),new Error('连接中断')])('冲突或未知只能显式GET采用后重新编辑，不能再次提交旧版本',async cause=>{
  state.write.mockRejectedValueOnce(cause);await render();await click('编辑');await wrapper!.get('input[aria-label="维护人"]').setValue('新值');await click('保存');expect(writes()).toHaveLength(1)
  const reads=state.read.mock.calls.length;await button('保存')!.trigger('click');await flushPromises();expect(writes()).toHaveLength(1);expect(state.read).toHaveBeenCalledTimes(reads)
  state.row={...value('后来值'),valueRevision:2};await click('读取当前信息');expect(writes()).toHaveLength(1);await click('采用当前信息');expect(wrapper!.get('input[aria-label="维护人"]').element).toHaveProperty('value','后来值')
  await wrapper!.get('input[aria-label="维护人"]').setValue('新意图');await click('保存');expect(writes()[1]![1].body.expectedValueRevision).toBe(2)
 })
 it('400不隐藏编辑输入，用户可以修正；403写拒绝后不会恢复保存',async()=>{
  state.write.mockRejectedValueOnce(new ApiError('字段无效',400));await render();await click('编辑');await wrapper!.get('input[aria-label="维护人"]').setValue('保留输入');await click('保存');expect(wrapper!.get('input[aria-label="维护人"]').element).toHaveProperty('value','保留输入')
  state.write.mockRejectedValueOnce(new ApiError('写权撤销',403));await click('保存');await click('读取当前信息');await click('采用当前信息');expect(button('保存')).toBeUndefined();expect(button('编辑')).toBeUndefined();expect(writes()).toHaveLength(2)
 })
 it('归档或权限撤销清理旧编辑，身份变化和设备切换后迟到响应不恢复私有值',async()=>{
  await render();await click('编辑');state.current.value={status:'ARCHIVED'};await flushPromises();expect(button('保存')).toBeUndefined();expect(button('编辑')).toBeUndefined();expect(writes()).toHaveLength(0)
  state.current.value={status:'ACTIVE'};await flushPromises();await click('编辑');const wait=deferred();state.write.mockReturnValueOnce(wait.promise);void click('保存');await flushPromises();await wrapper!.setProps({deviceId:other});await flushPromises();wait.resolve(encode({...value('旧设备私密'),valueRevision:1}));await flushPromises();expect(wrapper!.text()).not.toContain('旧设备私密')
  changeIdentity();await flushPromises();expect(wrapper!.text()).not.toContain('默认人')
 })
 it('初次读取403清私有内容，MAX存值版本只读且不产生自动重试',async()=>{
  state.read.mockRejectedValueOnce(new ApiError('失权',403));await render();expect(wrapper!.text()).not.toContain('默认人');expect(state.read).toHaveBeenCalledTimes(1);expect(button('编辑')).toBeUndefined()
  wrapper!.unmount();state.row={...value(),valueRevision:2147483647};await render();expect(wrapper!.text()).toContain('默认人');expect(button('编辑')).toBeUndefined()
 })
 it('人工电话使用电话输入并保存原文，不触发号码绑定或附加请求',async()=>{
  state.row=value('010-12345678','PHONE');await render();await click('编辑');const input=wrapper!.get('input[aria-label="维护人"]');expect(input.attributes('type')).toBe('tel')
  const original='+86 (755) 1234-5678 转 12';await input.setValue(original);await click('保存');expect(writes()).toHaveLength(1);expect(writes()[0]![1].body.values).toEqual([{fieldId,value:original}]);expect(state.api.mock.calls.every((call:any[])=>call[0].endsWith('/extension-values'))).toBe(true)
 })
 it('原站数值步进保持超大十进制精度，开关显式关与清除设置分离',async()=>{
  state.row=value('9007199254740993.12345678901234567890','NUMBER');await render();await click('编辑')
  await wrapper!.get('button[aria-label="增加维护人"]').trigger('click');await click('保存')
  expect(writes()[0]![1].body.values[0].value).toBe('9007199254740994.12345678901234567890')
  wrapper!.unmount();state.row=value('true','SWITCH');state.row.fields[0].definition.defaultValue=null;state.row.fields[0].definition.onLabel='是';state.row.fields[0].definition.offLabel='否';await render();await click('编辑')
  await wrapper!.getComponent({name:'ElSwitch'}).vm.$emit('update:modelValue',false);await flushPromises();await click('保存');expect(writes().at(-1)![1].body.values[0].value).toBe('false')
 })

})
