import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import Projects from '@/pages/ProjectsPage.vue'
import Shell from '@/layout/ConsoleShell.vue'

const selected = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const state = vi.hoisted(() => ({ session: undefined as any, switchProject: vi.fn(),api:vi.fn() }))
vi.mock('@/core/http',async importOriginal=>({...await importOriginal<typeof import('@/core/http')>(),api:state.api}))
vi.mock('@/core/session', async () => {
  const { shallowReactive,computed } = await import('vue')
  state.session = shallowReactive({ user: null, projects: [], transitioning: false })
  return { session: state.session, switchProject: state.switchProject,hasMenu:()=>false,needsLogin:()=>false,logout:vi.fn(),currentProject:computed(()=>state.session.projects.find((project:any)=>project.id===state.session.user?.currentProjectId)) }
})
let view: VueWrapper | undefined
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    {path:'/',component:Shell,children:[{path:'projects',component:Projects},{path:'overview',component:{template:'<div>项目概要</div>'}},{path:'account-settings',component:{template:'<div>账号设置</div>'}},{path:'release-notes',component:{template:'<div/>'}},{path:'blog',component:{template:'<div/>'}}]}
  ] })
  await router.push('/projects')
  await router.isReady()
  view = mount({template:'<router-view/>'}, { global: { plugins: [router, ElementPlus] } })
  await flushPromises()
  return router
}
beforeEach(() => {
  state.switchProject.mockReset()
  state.api.mockReset().mockImplementation(async()=>state.session.projects)
  state.session.user = { currentProjectId: selected }
  state.session.transitioning = false
  state.session.projects = [
    { id: selected, name: '拥有的项目', myRole: 'OWNER', subscribedPlan: { name: '免费版' },deviceCount:20,memberCount:1 },
    { id: other, name: '加入的项目', myRole: 'ADMIN' }
  ]
})
afterEach(() => { view?.unmount(); view = undefined; document.body.innerHTML = '' })

describe('我的项目真实导航', () => {
  it('同选中项目直接进入概要，不轮换会话；项目分组采用原站文案且不虚构未知数量', async () => {
    const router = await render()
    const sections = view!.findAll('.project-section')
    expect(sections[0].text()).toContain('我创建的项目')
    expect(sections[0].text()).not.toContain('我拥有的项目')
    expect(sections[1].text()).toContain('加入的项目')
    expect(sections[1].find('.project-card__plan').text()).toBe('—')
    expect(view!.find('.project-card__counts').text()).toBe('20 设备1 成员')
    expect(view!.findAll('.project-card__counts')[1].text()).toBe('未统计 设备未统计 成员')
    await sections[0].find('.project-card').trigger('click')
    await flushPromises()
    expect(state.switchProject).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/overview')
  })

  it('切换期间重复点击只受理一次，失败保留列表；后续明确点击成功才进入概要', async () => {
    let reject!: (reason: Error) => void
    state.switchProject.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail }))
    const router = await render()
    const card = view!.findAll('.project-card')[1]
    await card.trigger('click')
    await card.trigger('click')
    expect(state.switchProject).toHaveBeenCalledExactlyOnceWith(other)
    reject(new Error('项目切换失败'))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/projects')
    expect(view!.get('[role="alert"]').text()).toContain('项目切换失败')
    state.switchProject.mockImplementationOnce(async (id: string) => { state.session.user = { currentProjectId: id } })
    await card.trigger('click')
    await flushPromises()
    expect(state.switchProject).toHaveBeenCalledTimes(2)
    expect(router.currentRoute.value.path).toBe('/overview')
  })

  it('真实外框在用户暂清与项目ID改变时保留列表，一次点击即可切换并进入概要',async()=>{
    let release!:()=>void
    state.switchProject.mockImplementationOnce(async(id:string)=>{
      state.session.transitioning=true;state.session.user=null
      await new Promise<void>(resolve=>{release=resolve})
      state.session.user={currentProjectId:id};state.session.transitioning=false
    })
    const router=await render(),original=view!.get('.my-projects').element
    await view!.findAll('.project-card')[1].trigger('click');await flushPromises()
    expect(view!.get('.my-projects').element).toBe(original)
    expect(view!.findAll('.project-card').every(card=>card.attributes('disabled')!==undefined)).toBe(true)
    expect(view!.find('.my-projects').attributes('aria-busy')).toBe('true')
    expect(view!.find('.el-loading-mask').exists()).toBe(true)
    expect(view!.find('.el-loading-text').exists()).toBe(false)
    release();await flushPromises()
    expect(state.switchProject).toHaveBeenCalledExactlyOnceWith(other)
    expect(router.currentRoute.value.path).toBe('/overview')
  })

  it('切换等待时主动离开列表，迟到成功不会把用户拉回概要',async()=>{
    let release!:()=>void
    state.switchProject.mockImplementationOnce(async(id:string)=>{
      state.session.transitioning=true;state.session.user=null
      await new Promise<void>(resolve=>{release=resolve})
      state.session.user={currentProjectId:id};state.session.transitioning=false
    })
    const router=await render()
    await view!.findAll('.project-card')[1].trigger('click');await flushPromises()
    await router.push('/account-settings');release();await flushPromises()
    expect(router.currentRoute.value.path).toBe('/account-settings')
  })
  it('每次进入按项目列表刷新真实数量，零显示0；失败提示保留且不编造数量',async()=>{
    state.api.mockResolvedValueOnce([{id:selected,name:'拥有的项目',myRole:'OWNER',deviceCount:0,memberCount:2}])
    await render();expect(view!.find('.project-card__counts').text()).toBe('0 设备2 成员')
    expect(state.api).toHaveBeenCalledExactlyOnceWith('/api/v1/projects',expect.objectContaining({signal:expect.any(AbortSignal)}))
    view!.unmount();view=undefined;state.api.mockRejectedValueOnce(new Error('读取项目失败'))
    await render();expect(view!.get('[role="alert"]').text()).toContain('读取项目失败');expect(view!.find('.project-card__counts').text()).toBe('0 设备2 成员')
  })
})
