import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import Detail from '../../src/features/device-types/DeviceTypeDetail.vue'
import Settings from '../../src/features/device-types/DeviceTypeSettings.vue'
import {decodeTypeProfile,typeProfileTransport} from '../../src/features/device-types/profile-api'
import {decodeRegistrationSettings,typeSettingsAggregateTransport} from '../../src/features/device-types/type-settings-aggregate-api'
import {productCredentialTransport} from '../../src/features/device-types/product-credentials-api'
import {currentProductPublicationTransport} from '../../src/features/device-types/current-product-publication-api'
import * as http from '../../src/core/http'
import {session} from '../../src/core/session'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const project=id(1),type=id(2),publicKey='synthetic_product'
const profile=decodeTypeProfile({
 type:{id:type,projectId:project,name:'已发布类型',typeKey:'type_1',deviceKind:'DIRECT',networkType:'WIFI',payloadProtocol:'STANDARD',status:'PUBLISHED',version:1,productKey:publicKey,createdAt:'2026-10-28T01:00:00Z'},
 description:'说明',tags:{},revision:'0',profileToken:'a'.repeat(64),
},project,type)
const registration=decodeRegistrationSettings({
 deviceTypeId:type,registration:{deviceTypeId:type,automaticCreationEnabled:false,revision:'0'},
 productIdentifier:{deviceTypeId:type,enabled:false,productIdentifier:null,revision:'0'},
},type)
let wrapper:VueWrapper|undefined

beforeEach(()=>{
 http.changeIdentity();session.ready=true;session.transitioning=false
 session.user={accountId:id(9),currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never
 session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals()})

it('序列号导入放在自动创建设置内，关闭弹窗可离开详情',async()=>{
 const read=vi.spyOn(typeSettingsAggregateTransport,'readRegistration').mockResolvedValue(registration)
 const save=vi.spyOn(typeSettingsAggregateTransport,'changeRegistration').mockRejectedValue(new Error('取消时不得保存'))
 const generate=vi.spyOn(productCredentialTransport,'generate').mockRejectedValue(new Error('弹窗不得生成凭据'))
 const readCredential=vi.spyOn(productCredentialTransport,'read').mockRejectedValue(new Error('弹窗不得读取凭据'))
 vi.spyOn(currentProductPublicationTransport,'owned').mockResolvedValue({items:[],total:'0',available:true})
 const readEnrollment=vi.spyOn(http,'api').mockResolvedValue({deviceTypeId:type,enabled:true,canEnable:true,total:3,pending:2})
 const router=createRouter({history:createMemoryHistory(),routes:[
  {path:'/type',component:Detail,props:{typeId:type,transport:{...typeProfileTransport,read:vi.fn().mockResolvedValue(profile)}}},
  {path:'/other',component:{template:'<p>其它</p>'}},
 ]})
 await router.push('/type?tab=settings')
 await router.isReady()
 wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}})
 await flushPromises()

 expect(wrapper.getComponent(Settings).text()).not.toContain('导入序列号')
 const section=wrapper.getComponent(Settings).findAll('section').find(node=>node.find('h3').exists()&&node.find('h3').text()==='自动创建设备')!
 await section.get('button').trigger('click')
 await flushPromises()
 const dialog=new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"][aria-label="配置自动创建设备"]')!)
 expect(dialog.text()).not.toContain('产品凭据')
 expect(dialog.text()).not.toContain(publicKey)
 expect(dialog.text()).not.toContain(profile.type.typeKey)
 expect(dialog.find('input[aria-label="TypeKey"]').exists()).toBe(false)
 expect(dialog.find('input[aria-label="允许设备自动创建"]').exists()).toBe(true)
 expect(dialog.find('input[aria-label="启用产品识别码"]').exists()).toBe(true)
 const rows=dialog.findAll('.el-form-item__label').map(label=>label.text())
 expect(rows).toEqual(['允许设备自动创建','启用设备白名单','启用产品识别码（PK）'])

 const writeText=vi.fn().mockResolvedValue(undefined)
 vi.stubGlobal('navigator',Object.create(navigator,{clipboard:{value:{writeText}}}))
 const button=(name:string)=>dialog.findAll('button').find(node=>node.text()===name)!
 await button('复制 TypeKey').trigger('click')
 await flushPromises()
 expect(writeText).toHaveBeenCalledWith(profile.type.typeKey)
 await button('导入序列号').trigger('click')
 await flushPromises()
 const enrollment=new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"][aria-label="导入设备序列号"]')!)
 expect(enrollment.text()).toContain('已导入 3 个，待首启 2 个')
 expect(button('保存').attributes('disabled')).toBeDefined()
 await enrollment.findAll('button').find(node=>node.text()==='关闭')!.trigger('click')
 expect(button('保存').attributes('disabled')).toBeUndefined()
 expect(readEnrollment).toHaveBeenCalledTimes(2)
 expect(readEnrollment).toHaveBeenLastCalledWith(
  `/api/v1/projects/${project}/device-types/${type}/enrollment-admission`,expect.any(Object),
 )
 await button('取消').trigger('click')
 await router.push('/other')
 expect(router.currentRoute.value.path).toBe('/other')
 expect(read).toHaveBeenCalledTimes(1)
 expect(save).not.toHaveBeenCalled()
 expect(readCredential).not.toHaveBeenCalled()
 expect(generate).not.toHaveBeenCalled()
})
