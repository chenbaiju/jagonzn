import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Policy from '../../src/features/device-types/DeviceTypeLocationPolicy.vue'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
import {decodeLocationPolicy,eligibleReportedLocationKey} from '../../src/features/device-types/location-policy-api'
import {decodeLocationObservation} from '../../src/features/devices/device-location-observation-api'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=id(1),type=id(2),other=id(3)
const wrappers:VueWrapper[]=[];let fact={deviceTypeId:type,mode:'LEGACY_MANUAL',revision:'0'}
function owner(){session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]}
async function render(){const wrapper=mount(Policy,{props:{typeId:type},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);await flushPromises();return wrapper}
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent?.trim()===label);expect(found,label).toBeDefined();return found!}
async function click(label:string){button(label).click();await flushPromises()}
const writes=()=>state.api.mock.calls.filter(([,options])=>options?.method==='put')
async function chooseOff(){await click('设置地理坐标扩展');(document.querySelector('[role="switch"]') as HTMLElement).click();await flushPromises()}
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;owner();fact={deviceTypeId:type,mode:'LEGACY_MANUAL',revision:'0'};state.api.mockImplementation((_path,options)=>{if(options?.method==='put')fact={deviceTypeId:type,mode:options.body.mode,revision:String(BigInt(fact.revision)+(fact.mode===options.body.mode?0n:1n))};return Promise.resolve({...fact})})})
afterEach(()=>{wrappers.splice(0).forEach(x=>x.unmount());session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})
it('兼容人工模式取消零写，OFF和MANUAL各一次保存，不清除设备点',async()=>{
 const wrapper=await render();expect(wrapper.text()).toContain('沿用人工坐标');await chooseOff();await click('取消');expect(writes()).toHaveLength(0);await chooseOff();await click('保存地理坐标策略');expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toEqual({revision:'0',mode:'DISABLED'});expect(wrapper.text()).toContain('已关闭');await click('设置地理坐标扩展');(document.querySelector('[role="switch"]') as HTMLElement).click();await flushPromises();await click('保存地理坐标策略');expect(writes()).toHaveLength(2);expect(writes()[1]![1].body).toEqual({revision:'1',mode:'MANUAL'});expect(wrapper.text()).toContain('已启用人工坐标');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(()=>decodeLocationPolicy({...fact,mode:'REPORTED_PROPERTY'},type)).toThrow()
})
it('策略未知只GET，同值会话和归档保锁，不以当前MANUAL冒原保存成功',async()=>{
 const wrapper=await render();state.api.mockImplementation((_path,options)=>options?.method==='put'?Promise.reject(new ApiError('网络结果未知',0,undefined,undefined,true)):Promise.resolve({...fact}));await chooseOff();await click('保存地理坐标策略');expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);session.user={...session.user!};session.projects=[{id:project,myRole:'OWNER',status:'ARCHIVED'}];await wrapper.setProps({disabled:true});state.api.mockResolvedValue({...fact,mode:'DISABLED',revision:'1'});await click('读取当前地理坐标策略核对');await click('采用当前配置并结束核对');expect(writes()).toHaveLength(1);expect(wrapper.text()).toContain('原保存结果仍未确认');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})

it('明确上报绑定只选当前合格键并一次PUT回读，不新增MapPoint类型或人工位置写',async()=>{
 let server=decodeLocationPolicy({deviceTypeId:type,mode:'LEGACY_MANUAL',revision:'0'},type)
 const port={read:vi.fn().mockImplementation(async()=>server),choices:vi.fn().mockResolvedValue(['gps']),change:vi.fn().mockImplementation(async(intent)=>{server=decodeLocationPolicy({deviceTypeId:type,mode:intent.body.mode,revision:'1',propertyKey:intent.body.propertyKey},type);return server})}
 const wrapper=mount(Policy,{props:{typeId:type,typeStatus:'PUBLISHED',transport:port},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);await flushPromises();await click('设置地理坐标扩展');await wrapper.get('input[value="REPORTED"]').setValue();await flushPromises();expect(port.choices).toHaveBeenCalledWith(project,type,'PUBLISHED',expect.any(AbortSignal));wrapper.getComponent({name:'ElSelect'}).vm.$emit('update:modelValue','gps');await flushPromises();await click('保存地理坐标策略');expect(port.change).toHaveBeenCalledTimes(1);expect(port.change.mock.calls[0]![0].body).toEqual({revision:'0',mode:'REPORTED',propertyKey:'gps'});expect(wrapper.text()).toContain('设备上报（gps）');expect(port.read).toHaveBeenCalledTimes(2);expect(writes()).toHaveLength(0);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})

it('报告位置元数据闭集且人工版本为空，严格OBJECT选项不接受云私有或文本坐标',()=>{
 const definition={dataType:'OBJECT',accessType:'REPORT',schema:{type:'object',properties:{lat:{type:'number'},lng:{type:'number'}},required:['lat','lng'],additionalProperties:false}};expect(eligibleReportedLocationKey(definition)).toBe(true);expect(eligibleReportedLocationKey({...definition,accessType:'CLOUD_PRIVATE'})).toBe(false);expect(eligibleReportedLocationKey({...definition,schema:{...definition.schema,properties:{lat:{type:'string'},lng:{type:'number'}}}})).toBe(false);const reported={source:'REPORTED_PROPERTY',longitude:0,latitude:0,manualVersion:null,reported:{propertyKey:'gps',modelVersionId:type,reportedRevision:'9007199254740993',occurredAt:'2026-10-29T00:00:00Z'}};expect(decodeLocationObservation(reported).reported?.reportedRevision).toBe('9007199254740993');for(const bad of [{...reported,manualVersion:'1'},{...reported,reported:{...reported.reported,reportedRevision:'0'}},{...reported,reported:{...reported.reported,modelVersionId:'bad'}},{...reported,reported:{...reported.reported,token:'extra'}}])expect(()=>decodeLocationObservation(bad)).toThrow()
})

it('类型统一表格开关一次保存并回读，不显示技术策略面板',async()=>{
 const wrapper=mount(Policy,{props:{typeId:type,compact:true},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);await flushPromises()
 expect(wrapper.find('header').exists()).toBe(false);expect(wrapper.text()).not.toContain('版本');expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
 await wrapper.get('[role="switch"]').trigger('click');await flushPromises()
 expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toEqual({revision:'0',mode:'DISABLED'});expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})
it('统一表格开关未知结果保锁，核对只读且不重发',async()=>{
 const wrapper=mount(Policy,{props:{typeId:type,compact:true},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);await flushPromises()
 state.api.mockImplementation((_path,options)=>options?.method==='put'?Promise.reject(new ApiError('网络结果未知',0,undefined,undefined,true)):Promise.resolve({...fact}))
 await wrapper.get('[role="switch"]').trigger('click');await flushPromises();expect(writes()).toHaveLength(1);expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);await click('读取当前配置');await click('采用当前配置');expect(writes()).toHaveLength(1);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})
it('统一表格已启用上报来源可编辑，取消保留绑定且不写',async()=>{
 const server=decodeLocationPolicy({deviceTypeId:type,mode:'REPORTED',revision:'2',propertyKey:'gps'},type)
 const port={read:vi.fn().mockResolvedValue(server),choices:vi.fn().mockResolvedValue(['gps']),change:vi.fn()}
 const host=document.createElement('div')
 document.body.append(host)
 const wrapper=mount(Policy,{props:{typeId:type,typeStatus:'PUBLISHED',compact:true,transport:port},attachTo:host,global:{plugins:[ElementPlus]}})
 wrappers.push(wrapper)
 await flushPromises()
 await click('编辑')
 const overlay=document.querySelector('.type-location-extension-dialog')?.closest('.el-overlay')
 expect(overlay?.textContent).toContain('编辑扩展信息')
 expect(host.contains(overlay!)).toBe(false)
 expect(port.choices).toHaveBeenCalledWith(project,type,'PUBLISHED',expect.any(AbortSignal))
 const reported=overlay!.querySelector<HTMLInputElement>('[aria-label="使用设备上报属性"]')!
 expect(reported.getAttribute('aria-checked')).toBe('true')
 reported.click()
 await flushPromises()
 expect(reported.getAttribute('aria-checked')).toBe('false')
 expect(overlay!.querySelector('[aria-label="位置属性标识符"]')).toBeNull()
 await click('取消')
 expect(port.change).not.toHaveBeenCalled()
 expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
})

it('上报属性不变时两个开关仍按同一版本保存，重新打开回显',async()=>{
 let server=decodeLocationPolicy({deviceTypeId:type,mode:'REPORTED',revision:'2',propertyKey:'gps'},type)
 const port={read:vi.fn(async()=>server),choices:vi.fn().mockResolvedValue(['gps']),change:vi.fn(async intent=>{
  server=decodeLocationPolicy({deviceTypeId:type,revision:'3',mode:'REPORTED',propertyKey:'gps',
   preferReported:intent.body.preferReported,showInUserApp:intent.body.showInUserApp},type)
  return server
 })}
 const wrapper=mount(Policy,{props:{typeId:type,typeStatus:'PUBLISHED',compact:true,transport:port},
  attachTo:document.body,global:{plugins:[ElementPlus]}})
 wrappers.push(wrapper)
 await flushPromises()
 await click('编辑')
 for(const label of ['优先使用上报属性','显示在用户 App']){
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!.click()
  await flushPromises()
 }
 await click('保存')
 expect(port.change.mock.calls[0]![0].body).toEqual({revision:'2',mode:'REPORTED',propertyKey:'gps',
  preferReported:true,showInUserApp:true})
 expect(port.read).toHaveBeenCalledTimes(2)
 await click('编辑')
 for(const label of ['优先使用上报属性','显示在用户 App']){
  expect(document.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-checked')).toBe('true')
 }
 await click('取消')
 expect(port.change).toHaveBeenCalledTimes(1)
})
