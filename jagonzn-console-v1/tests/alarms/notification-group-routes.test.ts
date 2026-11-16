import { describe, expect, it } from 'vitest'
import { notificationGroupRoutes } from '../../src/features/alarms/notification-group-routes'
import {createMemoryHistory,createRouter} from 'vue-router'
import CreatePage from '../../src/features/alarms/NotificationGroupCreatePage.vue'
import GroupsPage from '../../src/features/alarms/NotificationGroupsPage.vue'
import TemplatesPage from '../../src/features/alarms/NotificationTemplatesPage.vue'
describe('通知组独立接收范围',()=>{
 it('完整创建页以管理权限单独注册，目录/详情/模板页保持只读；不纳入TL内部或未成套历史深链',async()=>{
  expect(notificationGroupRoutes.map(route=>({path:route.path,permission:route.meta?.permission}))).toEqual([
   {path:'/notification-groups',permission:'alarm:read'},
   {path:'/notification-groups/create',permission:'alarm:manage'},
   {path:'/notification-groups/:groupId',permission:'alarm:read'},
   {path:'/notification-templates',permission:'alarm:read'},
  ])
  expect(notificationGroupRoutes.every(route=>!route.children?.length)).toBe(true)
  const router=createRouter({history:createMemoryHistory(),routes:notificationGroupRoutes})
  expect(router.resolve('/notification-groups/create').name).toBe('alarm-notification-group-create')
  expect(router.resolve('/notification-groups/create').params).toEqual({})
  expect(router.resolve('/notification-groups/group-id').name).toBe('alarm-notification-group')
  for(const route of notificationGroupRoutes){const loaded=await (route.component as ()=>Promise<{default:unknown}>)();expect(loaded.default).toBe(route.path.endsWith('/create')?CreatePage:route.path==='/notification-templates'?TemplatesPage:GroupsPage)}
 })
})
