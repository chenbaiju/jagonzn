import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Versions from '../../src/features/device-types/DeviceTypeModelVersions.vue'
import {decodeModelSnapshot,decodeModelVersion} from '../../src/features/device-types/model-version-api'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=uuid(100),type=uuid(200),other=uuid(300),version=uuid(1),older=uuid(2)
const metadata=(patch:Record<string,unknown>={})=>({id:version,deviceTypeId:type,versionNumber:'1.0.0',changeLevel:'MAJOR',schemaDigest:'a'.repeat(64),digestAlgorithm:'PG_JSONB_TEXT_V1_SHA256',publishedAt:'2026-10-28T01:00:00.123456Z',...patch})
const bytes=(text:string)=>new TextEncoder().encode(text)
const snapshot=(patch:Record<string,unknown>={})=>bytes('{"version":'+JSON.stringify(metadata(patch))+',"modelSnapshot":{"properties":{"temperature":{"dataType":"NUMBER","minimum":0.10000000000000000001,"maximum":9007199254740993}},"events":{},"commands":{}}}')
const wrappers:VueWrapper[]=[]
function render(status='PUBLISHED'){const wrapper=mount(Versions,{props:{typeId:type,typeStatus:status},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);return wrapper}
function button(wrapper:VueWrapper,label:string){const found=wrapper.findAll('button').find(node=>node.text()===label);expect(found,label).toBeDefined();return found!}
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}];state.api.mockImplementation((path:string)=>Promise.resolve(path.endsWith('/latest')?bytes(JSON.stringify(metadata())):snapshot()))})
afterEach(()=>{wrappers.splice(0).forEach(wrapper=>wrapper.unmount());session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})

it('读取最新身份后按精确版本读取冻结快照，大数与小数展示不舍入且全程只GET',async()=>{
 const wrapper=render();await flushPromises();expect(state.api.mock.calls.map(([path])=>path)).toEqual([`/api/v1/projects/${project}/device-types/${type}/thing-model-versions/latest`,`/api/v1/projects/${project}/device-types/${type}/thing-model-versions/${version}`]);expect(wrapper.text()).toContain('1.0.0');expect(wrapper.text()).toContain('属性 1 项');expect(wrapper.find('pre').text()).toContain('0.10000000000000000001');expect(wrapper.find('pre').text()).toContain('9007199254740993');expect(state.api.mock.calls.every(([,options])=>!options.method&&options.responseType==='bytes')).toBe(true);expect(wrapper.emitted('changed')).toBeUndefined();expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(wrapper.text()).not.toContain('确认发布')
})
it('草稿只有版本不存在的明确错误才显示未发布，已发布缺失和普通错误保留失败',async()=>{
 state.api.mockRejectedValue(new ApiError('物模型版本不存在',404,30052));const wrapper=render('DRAFT');await flushPromises();expect(wrapper.text()).toContain('此草稿尚无已发布');await wrapper.setProps({typeStatus:'PUBLISHED'});await flushPromises();expect(wrapper.find('[role="alert"]').text()).toContain('物模型版本不存在');expect(wrapper.text()).not.toContain('此草稿尚无已发布');state.api.mockRejectedValue(new ApiError('类型不存在',404,30001));await wrapper.setProps({typeStatus:'DRAFT'});await flushPromises();expect(wrapper.find('[role="alert"]').text()).toContain('类型不存在')
})
it('已知版本ID只读精确历史，非法ID不发请求，身份或摘要变动不展示快照',async()=>{
 const wrapper=render();await flushPromises();const initial=state.api.mock.calls.length;await wrapper.find('input').setValue('not-a-version');await wrapper.find('form').trigger('submit');expect(state.api).toHaveBeenCalledTimes(initial);expect(wrapper.text()).toContain('请输入完整的小写版本 UUID')
 state.api.mockResolvedValue(snapshot({id:older,versionNumber:'0.9.0'}));await wrapper.find('input').setValue(older);await wrapper.find('form').trigger('submit');await flushPromises();expect(state.api.mock.calls.at(-1)![0]).toBe(`/api/v1/projects/${project}/device-types/${type}/thing-model-versions/${older}`);expect(wrapper.text()).toContain('按指定版本ID读取的历史版本');expect(wrapper.text()).toContain('0.9.0')
 state.api.mockImplementation((path:string)=>Promise.resolve(path.endsWith('/latest')?bytes(JSON.stringify(metadata())):snapshot({schemaDigest:'b'.repeat(64)})));await button(wrapper,'读取最新版本').trigger('click');await flushPromises();expect(wrapper.find('[role="alert"]').text()).toContain('不符合读取合同');expect(wrapper.find('pre').exists()).toBe(false)
 expect(()=>decodeModelSnapshot(snapshot({deviceTypeId:other}),type,version)).toThrow();expect(()=>decodeModelSnapshot(snapshot({id:older}),type,version)).toThrow();expect(()=>decodeModelVersion(metadata({versionNumber:'01.0.0'}),type)).toThrow();expect(()=>decodeModelSnapshot(bytes('{"version":'+JSON.stringify(metadata())+',"modelSnapshot":{"properties":{},"events":[],"commands":{}}}'),type,version)).toThrow();expect(()=>decodeModelSnapshot(bytes('{"version":'+JSON.stringify(metadata())+',"version":'+JSON.stringify(metadata())+',"modelSnapshot":{"properties":{},"events":{},"commands":{}}}'),type,version)).toThrow()
})
it('只读成员可读取，失权立即清除，disabled不允许手动读取且同值会话替换不重复请求',async()=>{
 session.user={...session.user!,projectRole:'VIEWER',permissions:['device:read']};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];const wrapper=render();await flushPromises();expect(wrapper.text()).toContain('1.0.0');const count=state.api.mock.calls.length;session.user={...session.user!};session.projects=session.projects.map(item=>({...item}));await wrapper.setProps({disabled:true});await flushPromises();expect(state.api).toHaveBeenCalledTimes(count);expect(button(wrapper,'读取最新版本').attributes('disabled')).toBeDefined();session.user={...session.user!,permissions:[]};await flushPromises();expect(wrapper.text()).toContain('没有此内容的读取权限');expect(wrapper.text()).not.toContain('1.0.0');expect(state.api).toHaveBeenCalledTimes(count)
})
it('切换类型或身份后忽略旧快照迟到结果，403不降为空版本',async()=>{
 let resolve!:(value:Uint8Array)=>void;state.api.mockImplementation((path:string)=>path.endsWith('/latest')?Promise.resolve(bytes(JSON.stringify(metadata()))):new Promise(done=>{resolve=done}));const wrapper=render();await flushPromises();state.api.mockRejectedValue(new ApiError('无读取权限',403,30024));await wrapper.setProps({typeId:other});resolve(snapshot());await flushPromises();expect(wrapper.text()).not.toContain('1.0.0');expect(wrapper.text()).toContain('没有此内容的读取权限');expect(wrapper.text()).not.toContain('此草稿尚无已发布')
 changeIdentity();session.user=null;await flushPromises();expect(wrapper.find('pre').exists()).toBe(false)
})
