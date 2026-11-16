import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElSelect} from 'element-plus'
import ImportDefinitions from '../../src/features/device-types/DeviceTypeDefinitionImport.vue'
import {decodeImportSource,prepareDefinitionImport,decodeImportPreview,prepareDefinitionImportConfirmation,decodeImportReceipt,type DefinitionImportTransport,type ImportIntent} from '../../src/features/device-types/definition-import-api'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=uuid(1),target=uuid(2),source=uuid(3),foreign=uuid(4),property=uuid(11),event=uuid(12),command=uuid(13)
const enc=(text:string)=>new TextEncoder().encode(text),hash=(n:string)=>n.repeat(64)
const definitions={properties:[{id:property,deviceTypeId:source,propertyKey:'n',name:'精确属性',dataType:'NUMBER',defaultValue:'EXACT'}],events:[{id:event,deviceTypeId:source,eventKey:'completed',name:'完成事件',level:'SUCCESS',parameters:[]}],commands:[{id:command,deviceTypeId:source,commandKey:'restart',name:'重启命令',timeoutSeconds:47}]}
const native=(value:unknown)=>JSON.stringify(value).replace('"EXACT"','0.1234567890123456789')
const sourceBytes=(sourceStatus='DRAFT',targetStatus='DRAFT')=>enc(native({source:{id:source,projectId:project,name:'来源类型',status:sourceStatus},target:{id:target,projectId:project,name:'目标类型',status:targetStatus},definitions}))
const sourceView=(sourceStatus='DRAFT',targetStatus='DRAFT')=>decodeImportSource(sourceBytes(sourceStatus,targetStatus),project,target,source)
const selection={properties:[property],events:[event],commands:[command]}
const candidate=()=>prepareDefinitionImport(project,target,sourceView(),selection)
function preview(value= candidate(),issues:unknown[]=[]){return decodeImportPreview(enc(native({sourceDeviceTypeId:source,targetDeviceTypeId:target,selection:value.selection,definitions,sourceDigest:hash('a'),targetDigest:hash('b'),previewDigest:hash('c'),digestAlgorithm:'DEVICE_TYPE_DEFINITION_IMPORT_V1_SHA256',issues})),value)}
function receipt(intent:ImportIntent){return decodeImportReceipt(enc(JSON.stringify({sourceDeviceTypeId:source,targetDeviceTypeId:target,requestDigest:hash('d'),previewDigest:hash('c'),sourceDigest:hash('a'),targetDigest:hash('b'),items:[{kind:'PROPERTY',sourceId:property,targetId:uuid(21),key:'n'},{kind:'EVENT',sourceId:event,targetId:uuid(22),key:'completed'},{kind:'COMMAND',sourceId:command,targetId:uuid(23),key:'restart'}],createdAt:'2026-10-29T01:00:00Z'})),intent)}
const wrappers:VueWrapper[]=[]
function transport(){return{directory:vi.fn().mockResolvedValue({items:[{id:source,projectId:project,name:'来源草稿',status:'DRAFT',deviceKind:'DIRECT',deviceCount:'0'},{id:foreign,projectId:project,name:'已发布来源',status:'PUBLISHED',deviceKind:'DIRECT',deviceCount:'0'}],total:'2',page:1,limit:24}),source:vi.fn().mockResolvedValue(sourceView()),preview:vi.fn().mockImplementation(value=>Promise.resolve(preview(value))),confirm:vi.fn().mockImplementation(value=>Promise.resolve(receipt(value))),original:vi.fn().mockImplementation(value=>Promise.resolve(receipt(value)))}}
function render(value:ReturnType<typeof transport>,status='DRAFT',toolbar=false){const wrapper=mount(ImportDefinitions,{props:{typeId:target,typeStatus:status,toolbar,transport:value as unknown as DefinitionImportTransport},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);return wrapper}
function button(label:string){const node=[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()===label);expect(node,label).toBeDefined();return node!}
async function click(label:string){button(label).click();await flushPromises()}
async function selectDefinitions(showPreview=true){for(const label of ['精确属性','完成事件','重启命令']){const row=[...document.querySelectorAll<HTMLLabelElement>('label.el-checkbox')].find(node=>node.textContent?.includes(label));expect(row,label).toBeDefined();await new DOMWrapper(row!.querySelector('input')!).setValue(true)}if(showPreview)await click('预览所选功能')}
async function prepare(){await click('从其它设备类型导入');await click('选择来源');await selectDefinitions()}
beforeEach(()=>{changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]})
afterEach(()=>{for(const wrapper of wrappers.splice(0))wrapper.unmount();session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})

it('来源和预览保留精确数字，选择只带原UUID；坏范围/重复ID/回执错原件拒绝',()=>{
 const value=candidate();expect(value.body).toEqual({sourceDeviceTypeId:source,selection});expect(value.source.definitions.text).toContain('0.1234567890123456789');const prepared=prepareDefinitionImportConfirmation(value,preview(value));expect(receipt(prepared).items).toHaveLength(3)
 expect(()=>decodeImportSource(sourceBytes(),project,foreign,source)).toThrow();expect(()=>prepareDefinitionImport(project,target,sourceView(),{...selection,properties:[property,property]})).toThrow()
 const bad=enc(JSON.stringify({sourceDeviceTypeId:source,targetDeviceTypeId:foreign,requestDigest:hash('d'),previewDigest:hash('c'),sourceDigest:hash('a'),targetDigest:hash('b'),items:[],createdAt:'2026-10-29T01:00:00Z'}));expect(()=>decodeImportReceipt(bad,prepared)).toThrow()
})
it('三编码导入来源保完整字段并拒非开关或未知值类型，不把编码从预览原件丢弃',()=>{
 const encoded=(encoding:string,dataType='SWITCH')=>enc(native({source:{id:source,projectId:project,name:'来源',status:'DRAFT'},target:{id:target,projectId:project,name:'目标',status:'DRAFT'},definitions:{...definitions,properties:[{...definitions.properties[0],dataType,switchEncoding:encoding}]}}))
 for(const encoding of ['BOOLEAN','NUMBER','TEXT'])expect(decodeImportSource(encoded(encoding),project,target,source).definitions.text).toMatch(new RegExp(`"switchEncoding":\\s*"${encoding}"`))
 expect(()=>decodeImportSource(encoded('BOGUS'),project,target,source)).toThrow();expect(()=>decodeImportSource(encoded('NUMBER','NUMBER'),project,target,source)).toThrow()
})
it('命令样式导入来源保两字段原件，任意URL或未知展示字段整体拒绝',()=>{
 const styled=(presentation:unknown)=>enc(native({source:{id:source,projectId:project,name:'来源',status:'DRAFT'},target:{id:target,projectId:project,name:'目标',status:'DRAFT'},definitions:{...definitions,commands:[{...definitions.commands[0],presentation}]}}))
 expect(decodeImportSource(styled({iconId:'power',color:'#123456'}),project,target,source).definitions.text).toContain('"presentation"')
 expect(()=>decodeImportSource(styled({iconId:'https://invalid/icon.svg',color:null}),project,target,source)).toThrow();expect(()=>decodeImportSource(styled({iconId:'power',color:null,style:'x'}),project,target,source)).toThrow()
})
it('取消导入零写，三类完整预览后一次confirm并按原键回读才成功',async()=>{
 const api=transport(),wrapper=render(api);await prepare();expect(document.body.textContent).toContain('0.1234567890123456789');expect(api.confirm).not.toHaveBeenCalled();expect(button('选择来源').disabled).toBe(false)
 const publishedRow=[...document.querySelectorAll('tr')].find(row=>row.textContent?.includes('已发布来源'));expect(publishedRow?.querySelector('button')?.disabled).toBe(false)
 await click('取消导入');expect(api.confirm).not.toHaveBeenCalled();await prepare();await click('确认全部导入');expect(api.confirm).toHaveBeenCalledTimes(1);expect(api.original).toHaveBeenCalledTimes(1);expect(api.confirm.mock.calls[0]![0].body).toEqual({sourceDeviceTypeId:source,selection,expectedPreviewDigest:hash('c')});expect(wrapper.emitted('changed')).toHaveLength(1);expect(wrapper.text()).toContain('已原子导入 3 项功能')
})
it('冲突预览明确整批不导入且禁止确认，不把部分条目当成功',async()=>{
 const api=transport();api.preview.mockImplementation(value=>Promise.resolve(preview(value,[{path:`$.properties[${property}]`,code:'IDENTIFIER_CONFLICT'}])));const wrapper=render(api);await prepare();expect(document.body.textContent).toContain('同类标识已存在');expect(button('确认全部导入').disabled).toBe(true);await click('确认全部导入');expect(api.confirm).not.toHaveBeenCalled();expect(wrapper.emitted('changed')).toBeUndefined()
})
it('未知保留原键，404仍未知；同值会话替换/降权/归档/已发布后只GET原件可确认',async()=>{
 const api=transport();api.confirm.mockRejectedValue(new ApiError('网络结果未知',0,undefined,undefined,true));const wrapper=render(api);await prepare();await click('确认全部导入');expect(api.confirm).toHaveBeenCalledTimes(1);const original=api.confirm.mock.calls[0]![0] as ImportIntent;expect(wrapper.emitted('locked')?.at(-1)).toEqual([true])
 session.user={...session.user!,projectRole:'VIEWER',permissions:['device:read']};session.projects=[{id:project,myRole:'VIEWER',status:'ARCHIVED'}];await wrapper.setProps({disabled:true,typeStatus:'PUBLISHED'});await flushPromises();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);api.original.mockRejectedValueOnce(new ApiError('暂未找到',404));await click('读取原导入结果');expect(document.body.textContent).toContain('不能确认原请求未执行');expect(wrapper.emitted('changed')).toBeUndefined();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);await click('关闭核对');await click('查看原导入核对');await click('读取原导入结果');expect(api.confirm).toHaveBeenCalledTimes(1);expect(api.original).toHaveBeenCalledTimes(2);expect(api.original.mock.calls.every(call=>call[0]===original)).toBe(true);expect(wrapper.emitted('changed')).toHaveLength(1);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})
it('切换真实目标后迟到回执不能刷新新范围或发成功事件',async()=>{
 const api=transport();let resolve!:(value:ReturnType<typeof receipt>)=>void;api.confirm.mockImplementation(()=>new Promise(done=>{resolve=done}));const wrapper=render(api);await prepare();button('确认全部导入').click();await flushPromises();const original=api.confirm.mock.calls[0]![0] as ImportIntent;await wrapper.setProps({typeId:foreign});resolve(receipt(original));await flushPromises();expect(api.original).not.toHaveBeenCalled();expect(wrapper.emitted('changed')).toBeUndefined();expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})

it('混合List导入来源保留明确能力，非List与未知能力整体拒绝',()=>{
 const sourceValue=(profile:string,dataType='LIST')=>enc(native({source:{id:source,projectId:project,name:'来源',status:'DRAFT'},target:{id:target,projectId:project,name:'目标',status:'DRAFT'},definitions:{...definitions,properties:[{...definitions.properties[0],dataType,compositeProfile:profile,schema:'{"type":"array","maxItems":256}'}]}}))
 expect(decodeImportSource(sourceValue('BASIC_MIXED_LIST_V1'),project,target,source).definitions.text).toContain('BASIC_MIXED_LIST_V1')
 expect(()=>decodeImportSource(sourceValue('UNKNOWN'),project,target,source)).toThrow();expect(()=>decodeImportSource(sourceValue('BASIC_MIXED_LIST_V1','NUMBER'),project,target,source)).toThrow()
})


it('来源和目标DRAFT/PUBLISHED四种组合保真实状态，未知生命周期拒绝',()=>{
 for(const sourceStatus of ['DRAFT','PUBLISHED'])for(const targetStatus of ['DRAFT','PUBLISHED']){const current=sourceView(sourceStatus,targetStatus),value=prepareDefinitionImport(project,target,current,selection);expect(value.source.source.status).toBe(sourceStatus);expect(value.source.target.status).toBe(targetStatus);expect(value.source.definitions.text).toContain('0.1234567890123456789')}
 expect(()=>sourceView('ARCHIVED','PUBLISHED')).toThrow();expect(()=>sourceView('PUBLISHED','UNKNOWN')).toThrow()
})

it('工具栏已发布来源选择后一次导入，内部预览且取消零写',async()=>{
 const api=transport();api.directory.mockResolvedValue({items:[{id:source,projectId:project,name:'已发布来源',status:'PUBLISHED',deviceKind:'DIRECT',deviceCount:'0'},{id:target,projectId:project,name:'当前目标',status:'PUBLISHED',deviceKind:'DIRECT',deviceCount:'0'}],total:'2',page:1,limit:24});api.source.mockResolvedValue(sourceView('PUBLISHED','PUBLISHED'));const wrapper=render(api,'PUBLISHED',true)
 async function preparePublished(){await click('导入功能');const select=wrapper.getComponent(ElSelect);expect(select.attributes('disabled')).toBeUndefined();select.vm.$emit('update:modelValue',source);select.vm.$emit('change',source);await flushPromises();await selectDefinitions(false)}
 await preparePublished();expect(document.body.textContent).not.toContain('预览摘要');expect(document.body.textContent).not.toContain('确认全部导入');await click('取消');expect(api.confirm).not.toHaveBeenCalled();expect(api.preview).not.toHaveBeenCalled();await preparePublished();await click('导入');expect(api.confirm).toHaveBeenCalledTimes(1);expect(api.original).toHaveBeenCalledTimes(1);expect(api.confirm.mock.calls[0]![0].candidate.source.target.status).toBe('PUBLISHED');expect(wrapper.emitted('changed')).toHaveLength(1);expect(api.preview).toHaveBeenCalledTimes(1);expect(wrapper.text()).toContain('已导入 3 项功能');expect(wrapper.text()).not.toContain('原子导入')
})

it('确认前目标生命周期改变丢弃旧预览，重新打开后必须取得新当前资料',async()=>{
 const api=transport(),wrapper=render(api);await prepare();await wrapper.setProps({typeStatus:'PUBLISHED'});await flushPromises();expect(api.confirm).not.toHaveBeenCalled();expect(wrapper.text()).toContain('重新打开导入并预览');expect([...document.querySelectorAll('button')].some(node=>node.textContent==='确认全部导入')).toBe(false);api.source.mockResolvedValue(sourceView('DRAFT','PUBLISHED'));await prepare();await click('确认全部导入');expect(api.preview).toHaveBeenCalledTimes(2);expect(api.confirm).toHaveBeenCalledTimes(1);expect(api.confirm.mock.calls[0]![0].candidate.source.target.status).toBe('PUBLISHED')
})


async function chooseToolbar(wrapper:VueWrapper){await click('导入功能');const select=wrapper.getComponent(ElSelect);select.vm.$emit('update:modelValue',source);select.vm.$emit('change',source);await flushPromises();await selectDefinitions(false)}
it('工具栏内部预览冲突显示失败且零确认，没有额外预览页',async()=>{
 const api=transport();api.preview.mockImplementation(value=>Promise.resolve(preview(value,[{path:`$.properties[${property}]`,code:'IDENTIFIER_CONFLICT'}])));const wrapper=render(api,'DRAFT',true);await chooseToolbar(wrapper);await click('导入');expect(api.preview).toHaveBeenCalledTimes(1);expect(api.confirm).not.toHaveBeenCalled();expect(document.body.textContent).toContain('同类标识已存在');expect(document.body.textContent).not.toContain('预览摘要');expect(document.querySelector('.import-preview')).toBeNull()
})
it('工具栏双击只预览确认一次，未知结果仍使用原键GET恢复',async()=>{
 const api=transport();let release!:()=>void;api.preview.mockImplementation(value=>new Promise(resolve=>{release=()=>resolve(preview(value))}));api.confirm.mockRejectedValue(new ApiError('结果未知',0,undefined,undefined,true));const wrapper=render(api,'DRAFT',true);await chooseToolbar(wrapper);const lockMark=wrapper.emitted('locked')?.length||0;button('导入').click();button('导入').click();await flushPromises();expect(api.preview).toHaveBeenCalledTimes(1);release();await flushPromises();expect(api.confirm).toHaveBeenCalledTimes(1);const original=api.confirm.mock.calls[0]![0];expect(wrapper.emitted('locked')!.slice(lockMark).every(event=>event[0]===true)).toBe(true);await click('读取原导入结果');expect(api.confirm).toHaveBeenCalledTimes(1);expect(api.original.mock.calls[0]![0]).toBe(original);expect(wrapper.emitted('changed')).toHaveLength(1)
})
it('工具栏内部预览晚回遇目标切换不继续confirm',async()=>{
 const api=transport();let release!:()=>void;api.preview.mockImplementation(value=>new Promise(resolve=>{release=()=>resolve(preview(value))}));const wrapper=render(api,'DRAFT',true);await chooseToolbar(wrapper);button('导入').click();await flushPromises();await wrapper.setProps({typeId:foreign});release();await flushPromises();expect(api.confirm).not.toHaveBeenCalled();expect(wrapper.emitted('changed')).toBeUndefined()
})

it('10014类型功能导入保原键原范围，仅GET原件且不重发',async()=>{
 const api=transport();api.confirm.mockRejectedValue(new ApiError('原结果不可回放',409,10014));
 const wrapper=render(api);await prepare();await click('确认全部导入');
 const original=api.confirm.mock.calls[0]![0] as ImportIntent,snapshot=JSON.stringify(original);
 expect(original).toMatchObject({project,target,sourceId:source});expect(original.key).toBeTruthy();
 expect(document.body.textContent).toContain('原导入结果尚未确认');
 expect(document.body.textContent).toContain(source);expect(document.body.textContent).toContain(target);
 expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);expect(wrapper.emitted('changed')).toBeUndefined();
 expect([...document.querySelectorAll('button')].some(node=>node.textContent?.trim()==='确认全部导入')).toBe(false);
 session.user={...session.user!};session.projects=[{...session.projects[0]!}];await flushPromises();
 api.original.mockRejectedValueOnce(new ApiError('尚未读到原件',404));await click('读取原导入结果');
 expect(api.original.mock.calls[0]![0]).toBe(original);expect(document.body.textContent).toContain('不能确认原请求未执行');
 expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);expect(wrapper.emitted('changed')).toBeUndefined();
 await click('读取原导入结果');expect(api.original.mock.calls[1]![0]).toBe(original);
 expect(JSON.stringify(original)).toBe(snapshot);expect(api.confirm).toHaveBeenCalledTimes(1);
 expect(wrapper.emitted('changed')).toHaveLength(1);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);
})
