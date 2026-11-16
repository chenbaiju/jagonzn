import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {h} from 'vue'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import DeviceDetail from '../../src/features/devices/DeviceDetail.vue'
import {session} from '../../src/core/session'
import {changeIdentity,setAccessToken} from '../../src/core/http'
import {device,project,informationFixture,extensions} from './device-information-fixture'
import {decodeDeviceLocation} from '../../src/features/devices/device-location-api'
import {decodeLocationObservation} from '../../src/features/devices/device-location-observation-api'
import {decodePlanarPoint} from '../../src/features/devices/device-planar-position-api'
import {decodeCameraReference} from '../../src/features/devices/device-camera-reference-api'
import {decodeIccidInformation} from '../../src/features/device-types/iccid-information-api'
let wrapper:VueWrapper|undefined
const requests=vi.fn(),json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
beforeEach(()=>{vi.clearAllMocks();changeIdentity();setAccessToken('isolated-fixture-only');session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']};session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];vi.unstubAllGlobals();document.body.innerHTML=''})
async function render(state:string){
 vi.stubGlobal('fetch',requests.mockImplementation(async(input:RequestInfo|URL,options?:RequestInit)=>{
  const path=new URL(input instanceof Request?input.url:String(input),'http://localhost').pathname
  if(options?.method&&options.method!=='GET')return json({message:'模拟预览不保存数据'},403)
  if(state==='error'&&(path.endsWith('/location-point')||path.endsWith('/location-details')))return json({message:'位置资料暂时无法读取'},503)
  return json(informationFixture(state,path))
 }))
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/devices/:deviceId',component:DeviceDetail}]});await router.push({path:'/devices/'+device,query:{tab:'info'}})
 wrapper=mount({render:()=>h(RouterView)},{attachTo:document.body,global:{plugins:[ElementPlus,router]}});await flushPromises();return wrapper
}
it('模拟资料通过现有正式解码器，保留空值、非零坐标和启用状态',()=>{
 for(const state of ['empty','full']){
  const bytes=(path:string)=>new TextEncoder().encode(JSON.stringify(informationFixture(state,path)))
  expect(decodeDeviceLocation(bytes('/location-point')).longitude).toBe(state==='empty'?null:113.942682)
  expect(decodeLocationObservation(informationFixture(state,'/location-observation')).source).toBe('MANUAL')
  expect(decodePlanarPoint(bytes('/planar-position'),device).state).toBe(state==='empty'?'DISABLED':'MANUAL')
  expect(decodeCameraReference(informationFixture(state,'/camera-reference'),device).state).toBe(state==='empty'?'DISABLED':'ENABLED')
  expect(decodeIccidInformation(informationFixture(state,'/iccid-information'),device).source).toBe(state==='empty'?'DISABLED':'MANUAL')
 }
})
it('真实父页空态只保留原站两段和小编辑入口，无禁用附加区域、空坐标或重复说明',async()=>{
 const w=await render('empty');await vi.waitFor(()=>expect(w.find('.device-information').exists()).toBe(true))
 expect(w.findAll('.device-information h2').map(x=>x.text())).toEqual(['地理位置','更多扩展信息']);expect(w.find('.planar-position').exists()).toBe(false);expect(w.find('.camera-reference').exists()).toBe(false);expect(w.find('.iccid-information').exists()).toBe(false)
 expect(w.find('.location-coordinates').exists()).toBe(false);expect(w.text()).not.toContain('刷新位置');expect(w.text()).not.toContain('请在设备类型中添加并启用扩展信息。')
 expect(w.getComponent({name:'DeviceLocation'}).props('reference')).toBe(true)
 const edit=w.findAll('button').find(b=>b.text()==='编辑'&&!!b.element.closest('.device-location'));expect(edit).toBeDefined();await edit!.trigger('click');await flushPromises();expect(document.body.textContent).toContain('编辑设备位置');expect(document.querySelector('input[aria-label="纬度"]')).not.toBeNull();expect(document.querySelector('input[aria-label="经度"]')).not.toBeNull()
 const cancel=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()==='取消');cancel!.click();await flushPromises();expect(requests.mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true)
})
it('真实父页模拟八类扩展数据与启用标准信息显示，不混入真实后端或丢失长文本',async()=>{
 const w=await render('full');await vi.waitFor(()=>expect(w.findAll('.extension-field')).toHaveLength(extensions.fields.length))
 expect(w.get('.location-coordinates').text()).toContain('113.942682');expect(w.find('.planar-position').exists()).toBe(true);expect(w.find('.camera-reference').exists()).toBe(true);expect(w.find('.iccid-information').exists()).toBe(true);expect(w.text()).toContain('00000000000000000001');expect(w.text()).not.toContain('刷新平面坐标');expect(w.text()).not.toContain('点版本')
 expect(w.getComponent({name:'DeviceExtensionValues'}).props('deviceId')).toBe(device);expect(w.getComponent({name:'DevicePlanarPosition'}).props('reference')).toBe(true)
})
it('位置读取失败仍提供真实错误与重试，不用模拟位置掩盖错误',async()=>{
 const w=await render('error');await vi.waitFor(()=>expect(w.text()).toContain('位置资料暂时无法读取'));expect(w.find('.location-coordinates').exists()).toBe(false);expect(w.findAll('button').some(b=>b.text()==='重新读取')).toBe(true)
})

it('类型禁用但留有旧资料时仍显示核对和清除入口，不把保留值冒充有效值',async()=>{
 const w=await render('retained');await vi.waitFor(()=>expect(w.find('.camera-reference').exists()).toBe(true))
 expect(w.find('.planar-position').exists()).toBe(true);expect(w.find('.iccid-information').exists()).toBe(true);expect(w.get('.camera-reference').text()).toContain('原关联仍保留');expect(w.get('.iccid-information').text()).toContain('原人工资料仍保留')
 const camera=w.getComponent({name:'DeviceCameraReference'});await camera.findAll('button').find(b=>b.text()==='编辑')!.trigger('click');await flushPromises()
 const buttons=[...document.querySelectorAll<HTMLButtonElement>('button')];expect(buttons.find(b=>b.textContent?.trim()==='清除摄像头关联')!.disabled).toBe(false);expect(buttons.find(b=>b.textContent?.trim()==='保存摄像头关联')!.disabled).toBe(true)
 buttons.find(b=>b.textContent?.trim()==='取消')!.click();await flushPromises();expect(requests.mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true)
})
