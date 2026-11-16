import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { session } from '../../src/core/session'
import { changeIdentity } from '../../src/core/http'
const { list, automation, scene } = vi.hoisted(() => ({ list: vi.fn(), automation: vi.fn(), scene: vi.fn() }))
vi.mock('../../src/features/rules/api', () => ({ listRuleDirectory: list, listRules: list, listAutomations: automation, listScenes: scene, getRule: vi.fn(), activateRule: vi.fn(), pauseRule: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: {}, query: {} }), useRouter: () => ({ push: vi.fn() }), onBeforeRouteLeave:()=>undefined, onBeforeRouteUpdate:()=>undefined }))
import RulesPage from '../../src/features/rules/RulesPage.vue'
import Orchestration from '../../src/features/rules/OrchestrationPage.vue'
let wrapper: ReturnType<typeof shallowMount> | undefined
function identity(permissions: string[], project = 'project-one') { session.ready = true; session.user = JSON.parse(JSON.stringify({ currentProjectId: project, projectRole: 'OWNER', permissions })); session.projects = [{ id: project, status: 'ACTIVE', myRole: 'OWNER' }] }
beforeEach(() => { list.mockReset(); identity(['rule:manage']) })
afterEach(() => { wrapper?.unmount(); session.user = null })
it('失去管理权限立即清空目录，迟到响应不能恢复旧数据', async () => {
  let resolve!: (value: unknown) => void
  list.mockImplementation(() => new Promise(done => { resolve = done }))
  wrapper = shallowMount(RulesPage); await nextTick()
  identity(['rule:read']); await nextTick(); resolve({ items: [{ name: '旧项目规则' }] }); await flushPromises()
  expect(wrapper.findComponent({ name: 'AsyncState' }).props('forbidden')).toBe(true)
  expect(wrapper.html()).not.toContain('旧项目规则')
  expect(list).toHaveBeenCalledTimes(2)
})
it('切项目取消旧请求，后到旧结果不覆盖当前项目', async () => {
  let resolve!: (value: unknown) => void
  list.mockImplementationOnce(() => new Promise(done => { resolve = done })).mockResolvedValueOnce({ items: [{ id: 'new', name: '新项目规则' }] })
  wrapper = shallowMount(RulesPage); await nextTick()
  changeIdentity(); identity(['rule:manage'], 'project-two'); await flushPromises()
  resolve({ items: [{ id: 'old', name: '旧项目规则' }] }); await flushPromises()
  expect(list).toHaveBeenCalled()
  expect(list.mock.calls[0][2].aborted).toBe(true)
})
it('只有运行事实读取权限时不调用源码管理接口', async () => {
  identity(['rule:read']); wrapper = shallowMount(RulesPage); await flushPromises()
  expect(list).not.toHaveBeenCalled()
})

it('自动化与场景切换清空原目录，分别读取原合同', async () => {
  automation.mockResolvedValue({ items: [] }); scene.mockResolvedValue({ items: [] })
  wrapper = shallowMount(Orchestration, { props: { kind: 'automation' } }); await flushPromises(); expect(automation).toHaveBeenCalledTimes(1); expect(scene).not.toHaveBeenCalled()
  await wrapper.setProps({ kind: 'scene' }); await flushPromises(); expect(scene).toHaveBeenCalledWith('project-one', expect.objectContaining({ cursor: undefined, limit: 24 }), expect.any(AbortSignal))
})
it('成员运行事实权限不能取得自动化/场景管理目录', async () => {
  automation.mockReset(); scene.mockReset(); identity(['rule:read']); wrapper = shallowMount(Orchestration, { props: { kind: 'automation' } }); await flushPromises(); expect(automation).not.toHaveBeenCalled(); expect(scene).not.toHaveBeenCalled()
})

// 只为本次目录读侧交互提供既有组件契约的轻量控件，不复写查询SQL或编排行为。
const SearchInput = defineComponent({props:['modelValue'],emits:['update:modelValue','clear'],template:`<div><input :value="modelValue" @input="$emit('update:modelValue',$event.target.value)"/><button aria-label="清除搜索" @click="$emit('update:modelValue','');$emit('clear')">清除</button></div>`})
const StatusSelect = defineComponent({props:['modelValue'],emits:['update:modelValue','change'],template:`<select :value="modelValue" @change="$emit('update:modelValue',$event.target.value);$emit('change',$event.target.value)"><slot/></select>`})
const Choice = defineComponent({props:['value','label'],template:'<option :value="value">{{label}}</option>'})
const ActionButton = defineComponent({props:['disabled','loading'],template:'<button :disabled="disabled || loading"><slot/></button>'})
const Content = defineComponent({template:'<section><slot/></section>'})
it.each(['automation','scene'] as const)('%s目录名称描述搜索保持字面查询，清除/状态回首游标，范围失效清私有并拒迟到', async kind => {
  automation.mockReset();scene.mockReset();const read=kind==='automation'?automation:scene
  read.mockResolvedValue({items:[{id:'second',name:'当前结果'}],nextCursor:null}).mockResolvedValueOnce({items:[{id:'first',name:'首屏'}],nextCursor:'cursor-first'})
  wrapper=shallowMount(Orchestration,{props:{kind},global:{stubs:{ElInput:SearchInput,ElSelect:StatusSelect,ElOption:Choice,ElButton:ActionButton,AsyncState:Content,CursorPager:false,ElTable:true,ElTableColumn:true,ElIcon:true}}});await flushPromises()
  await wrapper.find('button[aria-label="下一页"]').trigger('click');await flushPromises();expect(read.mock.calls[1][1].cursor).toBe('cursor-first')
  const input=()=>wrapper!.find('input'),status=()=>wrapper!.find<HTMLSelectElement>('select[aria-label="状态"]')
  await input().setValue('描述独有%_\\');await input().trigger('keyup.enter');await flushPromises();expect(read.mock.calls[2][1]).toEqual({name:'描述独有%_\\',status:'',cursor:undefined,limit:24})
  await status().setValue('PAUSED');await flushPromises();expect(read.mock.calls[3][1]).toEqual({name:'描述独有%_\\',status:'PAUSED',cursor:undefined,limit:24})
  await wrapper.find('button[aria-label="清除搜索"]').trigger('click');await flushPromises();expect(read.mock.calls[4][1]).toEqual({name:'',status:'PAUSED',cursor:undefined,limit:24})
  identity(['rule:manage'],'project-two');await flushPromises();expect(read.mock.calls[5][0]).toBe('project-two');expect(read.mock.calls[5][1]).toEqual({name:'',status:'',cursor:undefined,limit:24});expect(status().element.value).toBe('')
  let resolve!:(value:unknown)=>void;read.mockImplementationOnce(()=>new Promise(done=>{resolve=done}));await input().setValue('私有旧范围');await input().trigger('keyup.enter');await flushPromises();const pendingSignal=read.mock.calls[6][2]
  identity(['rule:read'],'project-two');await nextTick();resolve({items:[{id:'late',name:'失权旧内容'}]});await flushPromises();expect(pendingSignal.aborted).toBe(true);expect(wrapper.find('input').exists()).toBe(false)
  const resource=(wrapper.vm as unknown as {resource:{data:{value:unknown}}}).resource;expect(resource.data.value).toBeUndefined();expect(read).toHaveBeenCalledTimes(7)
  identity(['rule:manage'],'project-two');await flushPromises();expect(read.mock.calls[7][1]).toEqual({name:'',status:'',cursor:undefined,limit:24});expect(input().element.value).toBe('');expect(automation.mock.calls.length+scene.mock.calls.length).toBe(8)
})


it('场景数量只在首游标明确末页时显示，分页与失权不冒完整总量', async () => {
  scene.mockReset(); identity(['rule:manage'])
  scene.mockResolvedValueOnce({items:[{id:'first'}],nextCursor:'next-page'})
    .mockResolvedValueOnce({items:[{id:'last'}],nextCursor:null})
    .mockResolvedValueOnce({items:[{id:'one'},{id:'two'}],nextCursor:null})
  wrapper=shallowMount(Orchestration,{props:{kind:'scene'},global:{stubs:{AsyncState:Content,ElTable:true,ElTableColumn:true,ElInput:SearchInput,ElSelect:StatusSelect,ElOption:Choice,ElButton:ActionButton}}}); await flushPromises()
  const header=()=>wrapper!.findComponent({name:'PageHeader'})
  expect(header().props('count')).toBeUndefined()
  wrapper.findComponent({name:'CursorPager'}).vm.$emit('next'); await flushPromises()
  expect(header().props('count')).toBeUndefined()
  const state=wrapper.vm as unknown as {reset:()=>void}; state.reset(); await flushPromises()
  expect(header().props('count')).toBe(2)
  identity(['rule:read']); await flushPromises(); expect(header().props('count')).toBeUndefined()
})
