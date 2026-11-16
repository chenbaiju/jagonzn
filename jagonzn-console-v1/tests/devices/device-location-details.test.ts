import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DeviceLocation from '../../src/features/devices/DeviceLocation.vue'
import {ApiError} from '../../src/core/http'
import {decodeLocationDetails} from '../../src/features/devices/device-location-details-api'
const state=vi.hoisted(()=>({api:vi.fn(),locate:vi.fn()}))
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');return {projectId:ref('00000000-0000-4000-8000-000000000001'),currentProject:ref({status:'ACTIVE'}),session:{user:{accountId:'actor'}},can:()=>true}})
const device='00000000-0000-4000-8000-000000000002',bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v))
const initial={longitude:113.942682,latitude:22.539812,version:'9007199254740993',address:'测试地址',province:'广东省',city:'深圳市',district:'南山区',street:null,building:'A栋',unit:null,floor:'2',room:null,addressToken:'a'.repeat(64)}
let current={...initial},wrapper:ReturnType<typeof mount>|undefined
const writes=()=>state.api.mock.calls.filter(([,o])=>o?.method==='put')
async function click(label:string){const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label);expect(b,label).toBeDefined();b!.click();await flushPromises()}
async function render(){wrapper=mount(DeviceLocation,{props:{deviceId:device,reference:true,editLabel:'编辑'},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{DevicePositionMap:{template:'<div class="map-stub"/>',methods:{cancel(){},focusPoint(){},locateName(value:string){state.locate(value)}}}}}});await flushPromises()}
beforeEach(()=>{vi.clearAllMocks();current={...initial};state.api.mockImplementation((_p:string,o:any={})=>{if(o.method==='put'){const {expectedAddressToken,...rest}=o.body;current={...rest,version:String(BigInt(rest.version)+1n),addressToken:'b'.repeat(64)}}return Promise.resolve(bytes(current))})})
afterEach(()=>{wrapper?.unmount();document.body.innerHTML=''})
it('位置资料严格保留空值和大版本，拒绝地址数值及不完整回执',()=>{
 expect(decodeLocationDetails(bytes(initial))).toEqual(initial)
 expect(()=>decodeLocationDetails(bytes({...initial,building:5}))).toThrow()
 const {addressToken,...missing}=initial;expect(()=>decodeLocationDetails(bytes(missing))).toThrow()
})
it('有值位置地址与坐标显示；取消零写，保存地址与点只发一个PUT并权威回读',async()=>{
 await render();expect(wrapper!.text()).toContain('测试地址');expect(wrapper!.text()).toContain('建筑: A栋');expect(wrapper!.text()).toContain('22.539812, 113.942682')
 await click('编辑');const input=document.querySelector<HTMLInputElement>('input[aria-label="建筑"]')!;input.value='B栋';input.dispatchEvent(new Event('input',{bubbles:true}));await click('取消');expect(writes()).toHaveLength(0)
 await click('编辑');const building=wrapper!.get('input[aria-label="建筑"]');await building.setValue('C栋');await click('保存')
 expect(writes()).toHaveLength(1);expect(writes()[0]![0]).toContain('/location-details');expect(writes()[0]![1].body).toMatchObject({building:'C栋',longitude:113.942682,latitude:22.539812,version:initial.version,expectedAddressToken:initial.addressToken});expect(state.api.mock.lastCall![1].method).toBeUndefined();expect(wrapper!.text()).toContain('建筑: C栋')
})
it('完整移除清地址分项和坐标，旧版本与原件仍随同一请求提交',async()=>{
 await render();await click('编辑');await click('移除位置');const body=writes()[0]![1].body;expect(body).toMatchObject({longitude:null,latitude:null,address:null,building:null,floor:null,expectedAddressToken:initial.addressToken,version:initial.version});expect(wrapper!.text()).not.toContain('测试地址')
})
it('未知写只核对完整地址和原点，不自动重放或把旧草稿当作成功',async()=>{
 await render();await click('编辑');state.api.mockRejectedValueOnce(new ApiError('连接中断',0,undefined,undefined,true));await click('保存');expect(writes()).toHaveLength(1);expect(document.body.textContent).toContain('保存结果尚未确认');await click('读取当前坐标');expect(writes()).toHaveLength(1);await click('使用当前坐标继续编辑');expect(wrapper!.get('input[aria-label="建筑"]').element).toHaveProperty('value','A栋')
})

it('仅用户改过地址后的失焦才定位，打开表单和未修改失焦不触发地理编码',async()=>{
 await render();await click('编辑');const address=wrapper!.get('input[aria-label="地址"]');await address.trigger('blur');expect(state.locate).not.toHaveBeenCalled();await address.setValue('深圳大学');await address.trigger('blur');expect(state.locate).toHaveBeenCalledExactlyOnceWith('深圳大学');await address.trigger('blur');expect(state.locate).toHaveBeenCalledTimes(1);await click('取消');expect(writes()).toHaveLength(0)
})
it('新资料接口失权不回退旧读取掩盖拒绝，也不残留地址',async()=>{
 state.api.mockRejectedValueOnce(new ApiError('访问撤销',403));await render();expect(wrapper!.text()).not.toContain('测试地址');expect(state.api).toHaveBeenCalledTimes(1);expect(writes()).toHaveLength(0)
})
