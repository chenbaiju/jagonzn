import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Reference from '../../src/features/devices/DeviceCameraReference.vue'
import {decodeCameraReference,prepareCameraReference,type CameraReference} from '../../src/features/devices/device-camera-reference-api'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=id(1),device=id(2),type=id(3),wrappers:VueWrapper[]=[]
let fact:CameraReference
const writes=()=>state.api.mock.calls.filter(([,o])=>o?.method==='put')
async function click(label:string){const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent?.trim()===label);expect(b,label).toBeDefined();b!.click();await flushPromises()}
async function render(){const w=mount(Reference,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);await flushPromises();return w}
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}];fact={deviceId:device,currentDeviceTypeId:type,provider:'EZVIZ',state:'ENABLED',storedSerial:'CAMERA_TEST',storedChannel:1,referenceVersion:'9007199254740993',effectiveSerial:'CAMERA_TEST',effectiveChannel:1};state.api.mockImplementation((_p,o)=>{if(o?.method==='put'){const changed=o.body.serial!==fact.storedSerial||o.body.channel!==fact.storedChannel;fact={...fact,storedSerial:o.body.serial,storedChannel:o.body.channel,effectiveSerial:o.body.serial,effectiveChannel:o.body.channel,referenceVersion:String(BigInt(fact.referenceVersion)+(changed?1n:0n))}}return Promise.resolve({...fact})})})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})
it('保存取消零写、整数字段和同值版本正确，关闭保留后显式清除',async()=>{
 expect(prepareCameraReference(project,device,fact,'CAMERA_TEST','1').expectedVersion).toBe(fact.referenceVersion);expect(()=>prepareCameraReference(project,device,fact,'CAMERA_TEST','1.5')).toThrow();expect(()=>decodeCameraReference({...fact,storedChannel:'1'},device)).toThrow();expect(()=>decodeCameraReference({...fact,state:'DISABLED'},device)).toThrow()
 const w=await render();await click('编辑摄像头关联');await click('取消');expect(writes()).toHaveLength(0);await click('编辑摄像头关联');await w.find('input[aria-label="摄像头序列号"]').setValue('CAMERA_NEXT');await w.find('input[aria-label="摄像头通道号"]').setValue('2');await click('保存摄像头关联');expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toEqual({serial:'CAMERA_NEXT',channel:2,expectedDeviceTypeId:type,version:'9007199254740993'});expect(w.text()).toContain('已保存并回读')
 fact={...fact,state:'DISABLED',effectiveSerial:null,effectiveChannel:null};await click('刷新摄像头资料');expect(w.text()).toContain('原关联仍保留');await click('编辑摄像头关联');await click('清除摄像头关联');expect(writes()).toHaveLength(2);expect(writes()[1]![1].body.serial).toBeNull();expect(writes()[1]![1].body.channel).toBeNull();expect(w.text()).toContain('关联已清除');expect(w.emitted('locked')?.at(-1)).toEqual([false])
})
it('未知写保原键且降写权只读核对，失去读权清除私有资料',async()=>{
 state.api.mockImplementation((_p,o)=>o?.method==='put'?Promise.reject(new ApiError('未知',0,undefined,undefined,true)):Promise.resolve({...fact}));const w=await render();await click('编辑摄像头关联');await click('保存摄像头关联');const key=writes()[0]![1].headers['Idempotency-Key'];session.user={...session.user!,projectRole:'VIEWER'};session.projects=[{id:project,myRole:'VIEWER',status:'ARCHIVED'}];await flushPromises();expect(w.text()).toContain(key);await click('读取当前摄像头资料核对');expect(writes()).toHaveLength(1);await click('采用当前资料并结束核对');expect(w.text()).toContain('原保存结果仍未确认');session.user={...session.user!,permissions:[]};await flushPromises();expect(w.text()).not.toContain('CAMERA_TEST');expect(w.text()).not.toContain(key)
})
