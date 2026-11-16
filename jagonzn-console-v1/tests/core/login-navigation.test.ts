import {afterEach,describe,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {createMemoryHistory,createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import Login from '@/pages/auth/LoginPage.vue'
import {login} from '@/core/session'

vi.mock('@/core/session',()=>({login:vi.fn()}))
let wrapper:ReturnType<typeof mount>|undefined
async function setup(target:string){
 const router=createRouter({history:createMemoryHistory(),routes:[
  {path:'/login',component:Login},{path:'/:pathMatch(.*)*',component:{template:'<p>站内目标</p>'}}
 ]})
 await router.push({path:'/login',query:{redirect:target}});await router.isReady()
 vi.mocked(login).mockResolvedValue(undefined)
 wrapper=mount({template:'<RouterView/>'},{global:{plugins:[router,ElementPlus]}})
 await wrapper.find('input[type="email"]').setValue('login-navigation@example.test')
 await wrapper.find('input[type="password"]').setValue('fixture-only-password')
 return {router,w:wrapper}
}
afterEach(()=>{wrapper?.unmount();wrapper=undefined;vi.clearAllMocks()})

describe('真实登录表单的站内返回地址',()=>{
 it.each([
  '/devices/00000000-0000-4000-8000-000000000002?tab=events#history',
  '/projects?search=%E6%B8%A9%E5%BA%A6%20%2F%5C'
 ])('保持正常站内深链 %s',async target=>{
  const {router,w}=await setup(target);await w.find('form').trigger('submit');await flushPromises()
  expect(login).toHaveBeenCalledExactlyOnceWith('login-navigation@example.test','fixture-only-password')
  // 路由允许等价的查询编码规范化，核对实际路径、参数与锚点而非编码字节。
  const expected=new URL(target,'https://console.example.test')
  expect(router.currentRoute.value).toMatchObject({path:expected.pathname,hash:expected.hash,query:Object.fromEntries(expected.searchParams)})
 })
 it.each([
  '//outside.example.test/path','https://outside.example.test/path',
  '/\\outside.example.test/path','/\t/outside.example.test/path',
  '/\r/outside.example.test/path','/\n/outside.example.test/path'
 ])('拒绝外站及浏览器可规范化为外站的返回地址 %j',async target=>{
  expect(new URL(target,'https://console.example.test').origin).toBe('https://outside.example.test')
  const {router,w}=await setup(target);await w.find('form').trigger('submit');await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/projects')
 })
 it('认证失败停留登录页，保留必要错误反馈且不跳目标',async()=>{
  const {router,w}=await setup('/devices');vi.mocked(login).mockRejectedValue(new Error('登录未完成'))
  await w.find('form').trigger('submit');await flushPromises()
  expect(router.currentRoute.value.path).toBe('/login');expect(w.get('[role="alert"]').text()).toBe('登录未完成')
 })
})
