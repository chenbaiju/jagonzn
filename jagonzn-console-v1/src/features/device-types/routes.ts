import type {RouteRecordRaw} from 'vue-router'
/** 仅声明本域路由；主控统一注册，不用占位页冒充类型创建或详情。 */
export const deviceTypeRoutes:RouteRecordRaw[]=[
 {path:'device-types',name:'device-types',component:()=>import('./DeviceTypeDirectory.vue')},
 {path:'device-types/create',name:'device-type-create',component:()=>import('./DeviceTypeCreate.vue')},
 {path:'device-types/:typeId/devices/create',name:'device-type-device-create',component:()=>import('../devices/DeviceCreate.vue'),props:route=>({fixedDeviceTypeId:String(route.params.typeId),returnDeviceTypeId:String(route.params.typeId)})},
 {path:'device-types/:typeId/panel-editor',name:'device-type-panel-editor',component:()=>import('./DeviceTypePanelEditor.vue'),props:route=>({typeId:String(route.params.typeId)})},
 {path:'device-types/:typeId',name:'device-type-detail',component:()=>import('./DeviceTypeDetail.vue'),props:route=>({typeId:String(route.params.typeId)})},
]
