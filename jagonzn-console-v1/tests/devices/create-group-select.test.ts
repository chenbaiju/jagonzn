import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {DOMWrapper,mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElCascader} from 'element-plus'
import DeviceCreate from '@/features/devices/DeviceCreate.vue'
import {invalidateIdentity} from '@/core/http'

const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000101'
const first='00000000-0000-4000-8000-000000000201',second='00000000-0000-4000-8000-000000000202',dynamic='00000000-0000-4000-8000-000000000203'
const state=vi.hoisted(()=>({project:null as any,create:vi.fn(),profile:vi.fn(),groups:vi.fn(),types:vi.fn(),groupRead:vi.fn(),push:vi.fn()}))
vi.mock('vue-router',()=>({useRouter:()=>({push:state.push})}))
vi.mock('@/core/session',async()=>{const{ref}=await import('vue');state.project=ref('00000000-0000-4000-8000-000000000001');return{session:{ready:true,transitioning:false,user:{accountId:'00000000-0000-4000-8000-0000000000aa'},projects:[],menus:[]},projectId:state.project,can:()=>true}})
vi.mock('@/features/devices/api',async original=>{const actual=await original<typeof import('@/features/devices/api')>();return{...actual,devicesApi:{...actual.devicesApi,createProfile:state.create,profile:state.profile,groups:state.groups,types:state.types}}})
vi.mock('@/features/devices/static-group-membership-api',async original=>({...await original<typeof import('@/features/devices/static-group-membership-api')>(),readStaticGroup:state.groupRead}))
vi.mock('@/features/devices/device-tag-set-api',async original=>({...await original<typeof import('@/features/devices/device-tag-set-api')>(),readDeviceTagSet:vi.fn(async()=>new TextEncoder().encode(JSON.stringify({deviceId:device,revision:'0',tags:[]})))}))
const groups=[{id:first,name:'监测组',type:'STATIC'},{id:second,name:'备用组',type:'STATIC'},{id:dynamic,name:'动态规则组',type:'DYNAMIC'}]
const saved={deviceId:device,name:'选择器测试',deviceKey:'device-key-01',businessKey:null,description:null,deviceTypeId:null,referenceVersion:'1',profileToken:'a'.repeat(64)}
let wrappers:VueWrapper[]=[]
async function render(){const w=mount(DeviceCreate,{attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);await flushPromises();return w}
async function open(w:VueWrapper){const label=w.findAll('label').find(item=>item.text()==='设备分组（选填）')!;expect(label.attributes('for')).toBeTruthy();await w.get('#'+label.attributes('for')).trigger('click');await flushPromises()}
async function pick(label:string){const node=[...document.querySelectorAll('.el-cascader-node')].find(item=>item.textContent?.trim()===label);expect(node).toBeDefined();const radio=node!.querySelector('input[type="radio"]');expect(radio).not.toBeNull();await new DOMWrapper(radio as HTMLInputElement).setValue(true);await flushPromises()}
async function submit(w:VueWrapper){await w.get('input[aria-label="设备名称"]').setValue(saved.name);await w.get('form').trigger('submit');await flushPromises()}
beforeEach(()=>{vi.clearAllMocks();state.project.value=project;state.groups.mockResolvedValue(groups);state.types.mockResolvedValue({items:[],hasMore:false,nextCursor:null});state.create.mockResolvedValue(saved);state.profile.mockResolvedValue(saved);state.groupRead.mockImplementation(async(scope:{project:string;device:string},id:string)=>new TextEncoder().encode(JSON.stringify({projectId:scope.project,deviceId:scope.device,groupId:id,name:groups.find(g=>g.id===id)!.name,member:true})))})
afterEach(()=>{for(const w of wrappers)w.unmount();wrappers=[];document.body.innerHTML='';vi.restoreAllMocks()})

describe('创建分组真实平面radio单选',()=>{
 it('radio唯一选中回填名称，创建仍传单ID并核实该组成员后导航',async()=>{
  const w=await render();await open(w);await pick('监测组')
  expect(w.findComponent(ElCascader).props('modelValue')).toBe(first)
  expect((w.findComponent(ElCascader).get('input').element as HTMLInputElement).value).toBe('监测组')
  expect(document.querySelectorAll('input[type="radio"]:checked')).toHaveLength(1)
  await submit(w)
  expect(state.create).toHaveBeenCalledTimes(1);expect(state.create.mock.calls[0]![1].groupId).toBe(first)
  expect(state.groupRead).toHaveBeenCalledWith({project,device},first,expect.any(AbortSignal))
  expect(state.push).toHaveBeenCalledWith('/devices/'+device)
 })
 it('换选仅保留后一个单ID，重复选中和草稿取消不提交',async()=>{
  const w=await render();await open(w);await pick('监测组');await pick('备用组');await pick('备用组')
  expect(w.findComponent(ElCascader).props('modelValue')).toBe(second)
  expect(document.querySelectorAll('input[type="radio"]:checked')).toHaveLength(1)
  expect((w.findComponent(ElCascader).get('input').element as HTMLInputElement).value).toBe('备用组')
  await w.findAll('button').find(button=>button.text()==='取消')!.trigger('click')
  expect(state.push).toHaveBeenCalledWith('/devices');expect(state.create).not.toHaveBeenCalled();expect(state.groupRead).not.toHaveBeenCalled()
 })
 it('本地清空真实选择后创建省略groupId，不提交数组或null',async()=>{
  const w=await render();await open(w);await pick('监测组')
  const cascader=w.findComponent(ElCascader);await cascader.get('.el-cascader').trigger('mouseenter');await flushPromises()
  await cascader.get('.icon-circle-close').trigger('click');await flushPromises()
  expect(cascader.props('modelValue')).toBe('')
  await submit(w);expect(state.create.mock.calls[0]![1].groupId).toBeUndefined();expect(state.groupRead).not.toHaveBeenCalled()
 })
 it.each([null,undefined])('clear模型值%s规范为空字符串，保原可选组合同',async value=>{
  const w=await render();w.findComponent(ElCascader).vm.$emit('update:modelValue',value);await flushPromises()
  expect(w.findComponent(ElCascader).props('modelValue')).toBe('');await submit(w)
  expect(state.create.mock.calls[0]![1].groupId).toBeUndefined();expect(state.groupRead).not.toHaveBeenCalled()
 })
 it('搜索保持可用且只呈现实际组名，不制造子层级',async()=>{
  const w=await render();await open(w);const cascader=w.findComponent(ElCascader)
  await cascader.get('input').setValue('备用')
  await vi.waitFor(()=>expect(document.querySelectorAll('.el-cascader__suggestion-item')).toHaveLength(1))
  const suggestion=document.querySelector('.el-cascader__suggestion-item')!;expect(suggestion.textContent).toContain('备用组')
  await new DOMWrapper(suggestion).trigger('click');await flushPromises();expect(cascader.props('modelValue')).toBe(second)
  expect(state.create).not.toHaveBeenCalled()
 })
 it('项目或身份变更清除旧选择和表单，不提交旧组',async()=>{
  const w=await render();await open(w);await pick('监测组')
  state.groups.mockResolvedValue([]);state.project.value='00000000-0000-4000-8000-000000000002';await flushPromises()
  const cascader=w.findComponent(ElCascader);expect(cascader.props('modelValue')).toBe('');expect(cascader.props('options')).toEqual([])
  invalidateIdentity();await flushPromises();expect(cascader.props('modelValue')).toBe('');expect(state.create).not.toHaveBeenCalled()
 })
 it('选了组也不绕过必需名称校验',async()=>{
  const w=await render();await open(w);await pick('监测组');await w.get('form').trigger('submit');await flushPromises()
  expect(state.create).not.toHaveBeenCalled();expect(w.text()).toContain('设备名称为必填项');expect(w.findComponent(ElCascader).props('modelValue')).toBe(first)
 })

 it('展开仅STATIC组的真实radio，不造子列或层级箭头',async()=>{
  const w=await render();await open(w)
  expect(document.querySelectorAll('input[type="radio"]')).toHaveLength(2)
  expect(document.body.textContent).not.toContain('动态规则组')
  expect(document.querySelectorAll('.el-cascader-menu')).toHaveLength(1)
  expect(document.querySelectorAll('.el-cascader-node__postfix')).toHaveLength(0)
  expect(w.findComponent(ElCascader).props('options')).toEqual([{value:first,label:'监测组'},{value:second,label:'备用组'}])
  expect(state.create).not.toHaveBeenCalled()
 })
})
