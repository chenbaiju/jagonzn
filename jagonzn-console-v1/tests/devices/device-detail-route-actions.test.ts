import {defineComponent} from 'vue'
import {mount,flushPromises} from '@vue/test-utils'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import {describe,it,expect,vi} from 'vitest'
import {deviceRoutes} from '../../src/features/devices/routes'

vi.mock('../../src/features/devices/DeviceDetail.vue',()=>({default:defineComponent({
  emits:['create-user','open-user','open-users','manage-apps'],
  template:`<div><button data-action="create" @click="$emit('create-user')">创建新用户</button><button data-action="detail" @click="$emit('open-user','00000000-0000-0000-0000-000000000007')">用户名称</button><button data-action="all" @click="$emit('open-users')">所有用户</button><button data-action="apps" @click="$emit('manage-apps')">管理应用</button></div>`,
})}))

describe('设备详情路由宿主的跨模块入口',()=>{
  it.each([
    ['create','/end-users/create'],
    ['detail','/end-users/00000000-0000-0000-0000-000000000007'],
    ['all','/end-users'],
    ['apps','/applications'],
  ])('%s 事件到达真实路由而非静默丢失',async(action,target)=>{
    const destination={template:'<p>路由验收目标</p>'}
    const router=createRouter({history:createMemoryHistory(),routes:[
      {path:'/',component:{template:'<router-view/>'},children:deviceRoutes},
      {path:'/end-users/create',component:destination},
      {path:'/end-users/:id',component:destination},
      {path:'/end-users',component:destination},
      {path:'/applications',component:destination},
    ]})
    await router.push('/devices/00000000-0000-0000-0000-000000000003?tab=users')
    const view=mount(RouterView,{global:{plugins:[router]}})
    try{
      await router.isReady();await flushPromises()
      await view.get(`[data-action="${action}"]`).trigger('click');await flushPromises()
      expect(router.currentRoute.value.path).toBe(target)
      expect(view.text()).toContain('路由验收目标')
    }finally{view.unmount()}
  })
})
