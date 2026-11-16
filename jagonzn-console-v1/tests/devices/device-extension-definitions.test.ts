import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Component from '../../src/features/devices/DeviceExtensionDefinitions.vue'
import {ApiError} from '../../src/core/http'
const state=vi.hoisted(()=>({project:null as any,current:null as any,session:null as any,permissions:null as any,row:null as any,api:vi.fn(),read:vi.fn(),write:vi.fn()}))
vi.mock('@/core/session',async()=>{const {ref,reactive}=await import('vue');state.project=ref('00000000-0000-4000-8000-000000000010');state.current=ref({status:'ACTIVE'});state.session=reactive({user:{accountId:'actor',projectRole:'OWNER'}});state.permissions=ref([]);return {projectId:state.project,currentProject:state.current,session:state.session,can:(p:string)=>state.permissions.value.includes(p)}})
vi.mock('@/core/http',async()=>({...await vi.importActual('@/core/http'),api:state.api}))
const project='00000000-0000-4000-8000-000000000010',type='00000000-0000-4000-8000-000000000003',fieldId='00000000-0000-4000-8000-000000000004'
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
const field=()=>({id:fieldId,name:'私有维护信息甲',description:'人员信息',kind:'TEXT',enabled:true,options:[],defaultValue:null,onLabel:null,offLabel:null})
let wrapper:ReturnType<typeof mount>|undefined
const writes=()=>state.api.mock.calls.filter((call:any[])=>call[1]?.method==='put')
const buttons=(text:string)=>wrapper!.findAll('button').filter(button=>button.text()===text)
async function click(text:string){expect(buttons(text).length).toBeGreaterThan(0);await buttons(text).at(-1)!.trigger('click');await flushPromises()}
async function render(){wrapper=mount(Component,{props:{deviceTypeId:type},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises()}
async function add(kind='PHONE'){wrapper!.findComponent({name:'ElDropdown'}).vm.$emit('command',kind);await flushPromises()}
beforeEach(()=>{
 vi.clearAllMocks();state.project.value=project;state.current.value={status:'ACTIVE'};state.session.user={accountId:'actor',projectRole:'OWNER'};state.permissions.value=['device:read','device:update'];state.row={deviceTypeId:type,revision:1,fields:[field()]}
 state.read.mockImplementation(()=>Promise.resolve(encode(state.row)))
 state.write.mockImplementation((options:any)=>{const changed=JSON.stringify(options.body.fields)!==JSON.stringify(state.row.fields);state.row={...state.row,revision:state.row.revision+(changed?1:0),fields:options.body.fields};return Promise.resolve(encode(state.row))})
 state.api.mockImplementation((_url:string,options:any)=>options?.method==='put'?state.write(options):state.read())
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;document.body.innerHTML=''})
describe('类型扩展信息定义编辑',()=>{
 it('读取显示完整四列和原值，新增八类菜单只开放人工字段',async()=>{
  await render();expect(wrapper!.findAll('th .cell').slice(0,4).map(cell=>cell.text())).toEqual(['名称','类型','默认值','启用']);expect(writes()).toHaveLength(0)
  const items=wrapper!.findAllComponents({name:'ElDropdownItem'});expect(items.map(item=>item.props('command'))).toEqual(['TEXT','NUMBER','SWITCH','SELECT','DATE','TIME','PHONE','URL'])
  await add();expect(state.read).toHaveBeenCalledTimes(2);expect(document.body.textContent).not.toContain('允许用户编辑');await click('取消');expect(writes()).toHaveLength(0)
 })
 it('新增电话保留前缀和分机，多行描述与一次完整版本保存',async()=>{
  await render();await add();await wrapper!.get('input[aria-label="扩展信息名称"]').setValue('安装电话');await wrapper!.get('input[aria-label="扩展信息默认值"]').setValue('+86 (755) 1234-5678 转 12');await wrapper!.get('textarea[aria-label="扩展信息描述"]').setValue('安装信息\n维护信息');await click('保存')
  expect(writes()).toHaveLength(1);expect(writes()[0]![1].body.expectedRevision).toBe(1);expect(writes()[0]![1].body.fields[1]).toMatchObject({kind:'PHONE',defaultValue:'+86 (755) 1234-5678 转 12',description:'安装信息\n维护信息',enabled:true});expect(wrapper!.text()).toContain('安装电话')
 })
 it('编辑校验期间保留列表和工具栏，弹窗使用新读取的定义',async()=>{
  await render()
  const table=wrapper!.get('.extension-definition-table').element
  const addButton=buttons('添加扩展信息')[0]!.element
  let finishRead!:(value:ReturnType<typeof encode>)=>void
  state.read.mockReturnValueOnce(new Promise(resolve=>{finishRead=resolve}))
  await click('编辑')
  expect(wrapper!.get('.extension-definition-table').element).toBe(table)
  expect(buttons('添加扩展信息')[0]!.element).toBe(addButton)
  expect(buttons('编辑')[0]!.attributes('disabled')).toBeDefined()
  expect(wrapper!.find('input[aria-label="扩展信息名称"]').exists()).toBe(false)
  state.row={...state.row,revision:2,fields:[{...field(),name:'新读到的名称'}]}
  finishRead(encode(state.row));await flushPromises()
  expect(wrapper!.get('input[aria-label="扩展信息名称"]').element).toHaveProperty('value','新读到的名称')
  await click('保存');expect(writes()[0]![1].body.expectedRevision).toBe(2)
 })
 it('开关弹窗编辑是与否的文案时保留已有默认值',async()=>{
  state.row.fields=[{...field(),kind:'SWITCH',defaultValue:'false',onLabel:'是',offLabel:'否'}]
  await render();await click('编辑')
  expect(wrapper!.find('[aria-label="扩展信息默认值"]').exists()).toBe(false)
  await wrapper!.get('input[aria-label="否显示文字"]').setValue('关闭')
  await click('保存');expect(writes()[0]![1].body.fields[0]).toMatchObject({offLabel:'关闭',defaultValue:'false'})
 })
 it('展示开启后才可设置编辑，关闭展示同时撤销编辑',async()=>{
  const display='[role="switch"][aria-label="显示在用户 App"]', edit='[role="switch"][aria-label="允许用户编辑"]'
  await render();await click('编辑');expect(wrapper!.find(edit).exists()).toBe(false)
  await wrapper!.get(display).trigger('click');expect(wrapper!.get(edit).attributes('aria-checked')).toBe('false')
  await wrapper!.get(edit).trigger('click');await click('保存')
  expect(writes()[0]![1].body.fields[0]).toMatchObject({showInUserApp:true,userAppEditable:true})
  await click('编辑');expect(wrapper!.get(edit).attributes('aria-checked')).toBe('true')
  await wrapper!.get(display).trigger('click');expect(wrapper!.find(edit).exists()).toBe(false);await click('保存')
  expect(writes()[1]![1].body.fields[0]).toMatchObject({showInUserApp:false,userAppEditable:false})
 })
 it('400后修正同一新增字段不会重复追加同一身份',async()=>{
  state.write.mockRejectedValueOnce(new ApiError('暂不能保存',400));await render();await add('TEXT');await wrapper!.get('input[aria-label="扩展信息名称"]').setValue('新字段');await click('保存');const id=writes()[0]![1].body.fields[1].id;expect(wrapper!.get('input[aria-label="扩展信息名称"]').element).toHaveProperty('value','新字段')
  await wrapper!.get('input[aria-label="扩展信息名称"]').setValue('已修正字段');await click('保存');expect(writes()).toHaveLength(2);expect(writes()[1]![1].body.fields).toHaveLength(2);expect(writes()[1]![1].body.fields[1].id).toBe(id)
 })
 it('列表和编辑弹窗没有删除入口，关闭开关后仍保留定义并可重新启用',async()=>{
  await render();wrapper!.findComponent({name:'ElSwitch'}).vm.$emit('change',false);await flushPromises();expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toMatchObject({expectedRevision:1,fields:[{id:fieldId,enabled:false}]})
  expect(wrapper!.text()).toContain(field().name);expect(buttons('删除')).toHaveLength(0)
  await click('编辑');expect(wrapper!.get('input[aria-label="扩展信息名称"]').element).toHaveProperty('value',field().name);expect(buttons('删除')).toHaveLength(0)
  await click('取消');expect(writes()).toHaveLength(1)
  wrapper!.findComponent({name:'ElSwitch'}).vm.$emit('change',true);await flushPromises();expect(writes()).toHaveLength(2);expect(writes()[1]![1].body).toEqual({expectedRevision:2,fields:[field()]})
 })
 it.each([new ApiError('冲突',409),new ApiError('结果未知',500,undefined,undefined,true)])('定义冲突或未知保存不能重新提交旧全集，显式采用后再发新意图',async cause=>{
  state.write.mockRejectedValueOnce(cause);await render();await click('编辑');await wrapper!.get('input[aria-label="扩展信息名称"]').setValue('旧草稿');await click('保存');expect(writes()).toHaveLength(1);await click('取消');expect(writes()).toHaveLength(1)
  state.row={...state.row,revision:4,fields:[{...field(),name:'后来标题'}]};await click('读取当前定义');expect(writes()).toHaveLength(1);await click('采用当前定义');expect(wrapper!.text()).toContain('后来标题');await click('编辑');await wrapper!.get('input[aria-label="扩展信息名称"]').setValue('新意图');await click('保存');expect(writes()[1]![1].body.expectedRevision).toBe(4)
 })
 it.each(['OPERATOR','VIEWER'])('%s保留读取但无新增编辑删除或启用请求',async role=>{
  state.session.user.projectRole=role;await render();expect(wrapper!.text()).toContain('私有维护信息甲');expect(buttons('编辑')).toHaveLength(0);expect(buttons('删除')).toHaveLength(0);expect(wrapper!.findComponent({name:'ElSwitch'}).props('disabled')).toBe(true);wrapper!.findComponent({name:'ElSwitch'}).vm.$emit('change',false);await flushPromises();expect(writes()).toHaveLength(0)
 })
 it('已有选择项不能重命名或删除，新增选项允许默认值引用',async()=>{
  state.row.fields=[{...field(),kind:'SELECT',options:['安装','维护'],defaultValue:'安装'}];await render();await click('编辑');expect(wrapper!.get('input[aria-label="选项1"]').attributes('disabled')).toBeDefined();expect(wrapper!.get('input[aria-label="选项2"]').attributes('disabled')).toBeDefined();await click('添加选项');await wrapper!.get('input[aria-label="选项3"]').setValue('回收');await click('保存');expect(writes()[0]![1].body.fields[0].options).toEqual(['安装','维护','回收'])
 })
 it('归档或失去读取关闭旧窗口并清除私有字段，MAX定义版本只读',async()=>{
  await render();await click('编辑');const previousSave=buttons('保存')[0]!;state.current.value={status:'ARCHIVED'};await flushPromises();expect(wrapper!.findAllComponents({name:'ElDialog'}).filter(dialog=>dialog.props('modelValue'))).toHaveLength(0);await previousSave.trigger('click');await flushPromises();expect(buttons('编辑')).toHaveLength(0);expect(writes()).toHaveLength(0)
  state.permissions.value=[];await flushPromises();expect(wrapper!.text()).not.toContain('私有维护信息甲');expect(writes()).toHaveLength(0)
  wrapper!.unmount();state.permissions.value=['device:read','device:update'];state.current.value={status:'ACTIVE'};state.row.revision=2147483647;await render();expect(wrapper!.text()).toContain('私有维护信息甲');expect(buttons('编辑')).toHaveLength(0)
 })
 it('宿主disabled阻止新动作，编辑与保存锁正确传播，明确成功才发changed',async()=>{
  await render();await wrapper!.setProps({disabled:true});const reads=state.read.mock.calls.length;await add('TEXT');wrapper!.findComponent({name:'ElSwitch'}).vm.$emit('change',false);await flushPromises();expect(writes()).toHaveLength(0);expect(state.read).toHaveBeenCalledTimes(reads);expect(wrapper!.emitted('locked')?.at(-1)).toEqual([false]);expect(wrapper!.emitted('changed')).toBeUndefined()
  await wrapper!.setProps({disabled:false});await click('编辑');expect(wrapper!.emitted('locked')?.at(-1)).toEqual([true]);await wrapper!.get('input[aria-label="扩展信息名称"]').setValue('已保存的定义');await click('保存');expect(writes()).toHaveLength(1);expect(wrapper!.emitted('locked')?.at(-1)).toEqual([false]);expect(wrapper!.emitted('changed')).toHaveLength(1);expect(wrapper!.text()).toContain('扩展信息定义已保存')
 })
 it('未知原意图经同值会话和disabled反馈、失写权及归档仍保留，只GET核对且读失权真清理',async()=>{
  state.write.mockRejectedValueOnce(new ApiError('未知',500,undefined,undefined,true));await render();await click('编辑');await wrapper!.get('input[aria-label="扩展信息名称"]').setValue('原意图名称');await click('保存');const original=writes()[0]![1].body;expect(wrapper!.emitted('locked')?.at(-1)).toEqual([true]);const reads=state.read.mock.calls.length
  state.session.user={...state.session.user};state.permissions.value=[...state.permissions.value];state.current.value={...state.current.value};await wrapper!.setProps({disabled:true});await flushPromises();expect(state.read).toHaveBeenCalledTimes(reads);expect(wrapper!.get('input[aria-label="扩展信息名称"]').element).toHaveProperty('value','原意图名称');state.permissions.value=['device:read'];state.current.value={status:'ARCHIVED'};state.session.user={...state.session.user,projectRole:'VIEWER'};await flushPromises();expect(wrapper!.emitted('locked')?.at(-1)).toEqual([true]);expect(wrapper!.emitted('changed')).toBeUndefined();await click('取消');await click('读取当前定义');expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toEqual(original);expect(wrapper!.emitted('changed')).toBeUndefined();state.read.mockRejectedValueOnce(new ApiError('读取权已撤销',403));await click('读取当前定义');expect(wrapper!.text()).not.toContain('私有维护信息甲');expect(wrapper!.emitted('locked')?.at(-1)).toEqual([false]);expect(wrapper!.emitted('changed')).toBeUndefined();expect(writes()).toHaveLength(1);state.permissions.value=[];await flushPromises();expect(wrapper!.text()).not.toContain('私有维护信息甲')
 })
})
