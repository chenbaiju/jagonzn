import {webcrypto} from 'node:crypto'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {defineComponent} from 'vue'
import {mount,flushPromises,DOMWrapper} from '@vue/test-utils'
import ElementPlus,{ElSelect,ElCheckbox} from 'element-plus'
import {createRouter,createMemoryHistory,RouterView,type Router} from 'vue-router'
import Dialog from '../../src/features/devices/DevicePropertyQueryDialog.vue'
import DeviceBatchActions from '../../src/features/devices/DeviceBatchActions.vue'
import {propertyQueryCsv,decodePropertyQueryResult,preparePropertyQuery,type PropertyQueryTransport,type PropertyQueryIntent} from '../../src/features/devices/device-property-query-api'
import {decodeSavedPropertyQuery,prepareSavedQuery,savedPropertyQueryTransport,savedQueryMatches,type SavedPropertyQueryTransport,type SavedPropertyQuery,type SavedQueryIntent} from '../../src/features/devices/device-saved-property-query-api'
import {parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'
import {session} from '../../src/core/session'
import * as http from '../../src/core/http'
const project='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',type='00000000-0000-4000-8000-000000000100',id='00000000-0000-4000-8000-000000000300'
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
const digest=async(value:string)=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex')
async function record(expression='n > 1',revision='1',name='保存条件',deleted=false,recordId=id):Promise<SavedPropertyQuery>{return decodeSavedPropertyQuery(parseDashboardRuntimeResponse(bytes({id:recordId,projectId:project,revision,currentRevision:revision,name,expression,expressionDigest:await digest(expression),grammarVersion:'DEVICE_PROPERTY_QUERY_V1',createdAt:'2026-10-29T12:00:00Z',versionCreatedAt:'2026-10-29T12:00:00Z',deleted})),project)}
function ports(){const saved={list:vi.fn<SavedPropertyQueryTransport['list']>().mockResolvedValue([]),versions:vi.fn<SavedPropertyQueryTransport['versions']>().mockResolvedValue([]),write:vi.fn<SavedPropertyQueryTransport['write']>(),recover:vi.fn<SavedPropertyQueryTransport['recover']>(),execute:vi.fn<SavedPropertyQueryTransport['execute']>()},query={validate:vi.fn<PropertyQueryTransport['validate']>(),execute:vi.fn<PropertyQueryTransport['execute']>()};return{saved,query}}
const BatchStub=defineComponent({name:'DeviceBatchActions',props:['deviceIds','disabled'],emits:['cleared','changed','locked'],template:'<div data-query-batch/>'})
let wrapper:ReturnType<typeof mount>|undefined,router:Router
function button(label:string){const el=[...document.querySelectorAll<HTMLButtonElement>('button')].find(row=>row.textContent?.trim()===label||row.getAttribute('aria-label')===label);if(!el)throw new Error('缺少按钮：'+label);return new DOMWrapper(el)}
function input(label='设备查询条件'){const el=document.querySelector<HTMLInputElement|HTMLTextAreaElement>(`input[aria-label="${label}"],textarea[aria-label="${label}"]`);if(!el)throw new Error('缺少输入：'+label);return new DOMWrapper(el)}
async function settle(){await flushPromises();await new Promise(resolve=>setTimeout(resolve,5));await flushPromises()}
async function setup(p:ReturnType<typeof ports>){router=createRouter({history:createMemoryHistory(),routes:[{path:'/devices',component:Dialog,props:{transport:p.query,savedTransport:p.saved}},{path:'/elsewhere',component:{template:'<p>其它页面</p>'}},{path:'/devices/:id',component:{template:'<p>设备详情</p>'}}]});await router.push('/devices');await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus],stubs:{DeviceBatchActions:BatchStub}}});await settle();const dialog=wrapper.getComponent(Dialog);dialog.vm.open();await settle();return dialog}
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);http.changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals()})
it('保存取消零写，创建和CAS新版本真实回读',async()=>{
 const p=ports();let rows:readonly SavedPropertyQuery[]=[];p.saved.list.mockImplementation(async()=>rows);p.saved.write.mockImplementation(async intent=>{if(intent.kind==='DELETE'){rows=[];return}const row=await record(intent.expression,intent.kind==='CREATE'?'1':String(Number(intent.expectedRevision)+1),intent.name);rows=[row];return row});p.saved.recover.mockResolvedValue(await record('n > 2','2','保存条件',true));await setup(p);await input().setValue('n > 1');await button('保存').trigger('click');await settle();await input('保存查询名称').setValue('取消草稿');await button('取消').trigger('click');expect(p.saved.write).not.toHaveBeenCalled()
 await button('保存').trigger('click');await settle();await input('保存查询名称').setValue('保存条件');await button('确认保存').trigger('click');await settle();expect(p.saved.write).toHaveBeenCalledTimes(1);expect(p.saved.write.mock.calls[0]![0]).toMatchObject({kind:'CREATE',expression:'n > 1',name:'保存条件'});expect(document.body.textContent).toContain('设备查询已保存')
 await input().setValue('n > 2');await button('保存').trigger('click');await settle();expect(p.saved.write.mock.calls[1]![0]).toMatchObject({kind:'CHANGE',id,expectedRevision:'1',expression:'n > 2'});expect(document.body.textContent).toContain('设备查询已保存')
})
it('POST成功后的GET400仍保原键未知，关闭不解导航，恢复原件不重POST',async()=>{
 const p=ports(),saved=await record();p.saved.list.mockResolvedValueOnce([]).mockRejectedValueOnce(new http.ApiError('后续读取失败',400)).mockResolvedValue([saved]);p.saved.write.mockResolvedValue(saved);p.saved.recover.mockResolvedValue(saved);const dialog=await setup(p);await input().setValue('n > 1');await button('保存').trigger('click');await settle();await input('保存查询名称').setValue('保存条件');await button('确认保存').trigger('click');await settle();expect(document.body.textContent).toContain('原写结果尚未确认');const original=p.saved.write.mock.calls[0]![0];expect(original.key).toMatch(/^[0-9a-f-]{36}$/);await button('取消').trigger('click');await router.push('/elsewhere');expect(router.currentRoute.value.path).toBe('/devices');await button('按原键核对').trigger('click');await settle();expect(p.saved.recover).toHaveBeenCalledWith(original,expect.any(AbortSignal));expect(p.saved.write).toHaveBeenCalledTimes(1);expect(document.body.textContent).toContain('设备查询已保存');expect(dialog.emitted('locked')?.at(-1)).toEqual([true])
})
it('CAS409和原键404不重发，scope清未知私有草稿；正式transport保键及精确原文',async()=>{
 const p=ports(),saved=await record();p.saved.list.mockResolvedValue([saved]);p.saved.versions.mockResolvedValue([saved]);p.saved.write.mockRejectedValue(new http.ApiError('版本冲突',409));p.saved.recover.mockRejectedValue(new http.ApiError('原键未读到',404));const dialog=await setup(p);dialog.findAllComponents(ElSelect).find(node=>node.props('ariaLabel')==='读取设备查询')!.vm.$emit('update:modelValue',id);await settle();await input().setValue('n > 9007199254740993.0000000001');await button('保存').trigger('click');await settle();await button('按原键核对').trigger('click');await settle();expect(document.body.textContent).toContain('原写结果仍未确认');expect(p.saved.write).toHaveBeenCalledTimes(1);session.projects=[...session.projects,{id:other,myRole:'OWNER',status:'ACTIVE'}];session.user={...session.user!,currentProjectId:other};await settle();dialog.vm.open();await settle();expect(input().element.value).toBe('');expect(document.body.textContent).not.toContain('原写结果尚未确认')
 const original=await prepareSavedQuery(project,'CHANGE','保存条件','n > 9007199254740993.0000000001',saved),returned=await record(original.expression,'2');expect(savedQueryMatches(returned,original)).toBe(true);const spy=vi.spyOn(http,'api').mockResolvedValue(bytes(returned));await savedPropertyQueryTransport.write(original,new AbortController().signal);expect(spy.mock.calls[0]![1]).toMatchObject({method:'put',headers:{'Idempotency-Key':original.key},body:{name:'保存条件',expression:'n > 9007199254740993.0000000001',expectedRevision:'1'}});await savedPropertyQueryTransport.recover(original,new AbortController().signal);expect(spy.mock.calls[1]![1]).toMatchObject({headers:{'Original-Request-Key':original.key},query:{operation:'CHANGE'}})
})
it('完整100匹配CSV防公式且固定时刻不重查，批量仅固定UUID最多96且scope清选',async()=>{
 const p=ports();let result!:ReturnType<typeof decodePropertyQueryResult>;p.query.execute.mockImplementation(async(intent:PropertyQueryIntent)=>{result=decodePropertyQueryResult(bytes({grammarVersion:'DEVICE_PROPERTY_QUERY_V1',expressionDigest:intent.digest,evaluatedAt:'2026-10-29T12:34:56Z',candidateCount:'100',matchedCount:'100',unknownCount:'0',items:Array.from({length:100},(_,i)=>({deviceId:`00000000-0000-4000-8000-${String(i+500).padStart(12,'0')}`,deviceTypeId:type,name:i?'设备'+i:'=SUM(1,2)',status:'OFFLINE',modelVersionId:null}))}),intent);return result});await setup(p);await input().setValue('n > 0');await button('查询').trigger('click');await settle();expect(button('选择全部匹配').attributes('disabled')).toBeDefined();expect(document.body.textContent).toContain('最多96台');const checkbox=wrapper!.getComponent(Dialog).findAllComponents(ElCheckbox)[0]!;checkbox.vm.$emit('update:modelValue',true);await settle();expect(wrapper!.getComponent(DeviceBatchActions).props('deviceIds')).toEqual(['00000000-0000-4000-8000-000000000500']);const csv=propertyQueryCsv(result);expect(csv.split('\r\n')).toHaveLength(101);expect(csv).toContain('"\'=SUM(1,2)"');expect(csv.match(/2026-10-29T12:34:56Z/g)).toHaveLength(100);expect(csv).toContain('00000000-0000-4000-8000-000000000599');expect(p.query.execute).toHaveBeenCalledTimes(1);session.user={...session.user!,permissions:[]};await settle();expect(wrapper!.findComponent(DeviceBatchActions).exists()).toBe(false)
})

it('正式版本transport保原文，未编辑历史版本由服务端执行，草稿走临时且scope丢弃晚回',async()=>{
 const expression='n > 9007199254740993.0000000001',latest=await record(expression,'2'),original={...await record('n > 1'),currentRevision:'2'}
 const spy=vi.spyOn(http,'api').mockResolvedValue(bytes([latest,original])),signal=new AbortController().signal
 const rows=await savedPropertyQueryTransport.versions(project,id,signal)
 expect(rows).toEqual([latest,original]);expect(rows[0]!.expression).toBe(expression)
 expect(spy).toHaveBeenCalledWith(`/api/v1/projects/${project}/device-property-queries/${id}/versions`,{signal,responseType:'bytes',maxResponseBytes:4*1024*1024})
 spy.mockResolvedValueOnce(bytes([latest,latest]));await expect(savedPropertyQueryTransport.versions(project,id,signal)).rejects.toThrow('保存查询版本集合不完整')
 const device='00000000-0000-4000-8000-000000000500',intent=await preparePropertyQuery(project,original.expression,type,[device])
 const result=(query:PropertyQueryIntent)=>({grammarVersion:'DEVICE_PROPERTY_QUERY_V1',expressionDigest:query.digest,evaluatedAt:'2026-10-29T12:34:56Z',candidateCount:'1',matchedCount:'1',unknownCount:'0',items:[{deviceId:device,deviceTypeId:type,name:'设备',status:'OFFLINE',modelVersionId:null}]})
 spy.mockResolvedValueOnce(bytes({savedQuery:{...original,currentRevision:'3'},result:result(intent)}))
 expect((await savedPropertyQueryTransport.execute(original,intent,signal)).items).toHaveLength(1)
 expect(spy.mock.calls.at(-1)).toEqual([`/api/v1/projects/${project}/device-property-queries/${id}/versions/1/execute`,{method:'post',body:{deviceTypeId:type,deviceIds:[device]},signal,responseType:'bytes',maxResponseBytes:4*1024*1024}])
 spy.mockResolvedValueOnce(bytes({savedQuery:latest,result:result(intent)}));await expect(savedPropertyQueryTransport.execute(original,intent,signal)).rejects.toThrow('执行响应与保存查询原版本不一致')
 spy.mockResolvedValueOnce(bytes({savedQuery:original,result:{...result(intent),expressionDigest:'f'.repeat(64)}}));await expect(savedPropertyQueryTransport.execute(original,intent,signal)).rejects.toThrow('查询响应与当前条件不一致')
 spy.mockResolvedValueOnce(bytes({savedQuery:original,result:result(intent),extra:true}));await expect(savedPropertyQueryTransport.execute(original,intent,signal)).rejects.toThrow('保存查询执行响应不完整')
 spy.mockRestore()
 const p=ports();p.saved.list.mockResolvedValue([latest]);p.saved.execute.mockImplementation(async(_saved,query)=>decodePropertyQueryResult(bytes(result(query)),query));p.query.execute.mockImplementation(async query=>decodePropertyQueryResult(bytes(result(query)),query))
 const dialog=await setup(p);dialog.findAllComponents(ElSelect).find(node=>node.props('ariaLabel')==='读取设备查询')!.vm.$emit('update:modelValue',id);await settle()
 await button('查询').trigger('click');await settle();expect(p.saved.execute).toHaveBeenCalledTimes(1);expect(p.saved.execute.mock.calls[0]![0]).toMatchObject({id,revision:'2',currentRevision:'2',expression});expect(p.query.execute).not.toHaveBeenCalled()
 await input().setValue('n > 9');await button('查询').trigger('click');await settle();expect(p.query.execute).toHaveBeenCalledTimes(1);expect(p.saved.execute).toHaveBeenCalledTimes(1)
 p.saved.execute.mockRejectedValueOnce(new http.ApiError('原保存版本当前不可读',404));await input().setValue(latest.expression);await button('查询').trigger('click');await settle();expect(document.body.textContent).toContain('保存查询或指定版本当前不可读');expect(p.query.execute).toHaveBeenCalledTimes(1)
 let finish!:(value:Awaited<ReturnType<SavedPropertyQueryTransport['execute']>>)=>void;p.saved.execute.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));await input().setValue(latest.expression);await button('查询').trigger('click');await settle();const pending=p.saved.execute.mock.calls.at(-1)![1]
 session.projects=[...session.projects,{id:other,myRole:'OWNER',status:'ACTIVE'}];session.user={...session.user!,currentProjectId:other};await settle();finish(decodePropertyQueryResult(bytes(result(pending)),pending));await settle();dialog.vm.open();await settle();expect(input().element.value).toBe('');expect(document.body.textContent).not.toContain('匹配 1');expect(p.saved.execute).toHaveBeenCalledTimes(3);expect(p.saved.write).not.toHaveBeenCalled()
})

it('保存已选查询直接追加版本，另存为创建新查询，保存结果在读取下拉框回显',async()=>{
 const p=ports(),otherId='00000000-0000-4000-8000-000000000301'
 const first=await record('n > 1','1','保存条件'),second=await record('n > 2','1','另存条件',false,otherId)
 let rows:readonly SavedPropertyQuery[]=[]
 p.saved.list.mockImplementation(async()=>rows)
 p.saved.write.mockImplementation(async intent=>{
  if(intent.kind==='CREATE'){const row=intent.name==='保存条件'?first:second;rows=[first,second];return row}
  return await record(intent.expression,'2',intent.name)
 })
 const dialog=await setup(p)
 await input().setValue('n > 1')
 await button('保存').trigger('click');await settle()
 await input('保存查询名称').setValue('保存条件');await button('确认保存').trigger('click');await settle()
 expect(p.saved.write.mock.calls[0]![0]).toMatchObject({kind:'CREATE',name:'保存条件',expression:'n > 1'})
 const select=()=>dialog.findAllComponents(ElSelect).find(node=>node.props('ariaLabel')==='读取设备查询')!
 expect(select().props('modelValue')).toBe(id)
 expect(document.body.textContent).toContain('保存条件')

 await input().setValue('n > 2')
 await button('另存为…').trigger('click');await settle()
 expect(input('保存查询名称').element.value).toBe('保存条件 副本')
 await input('保存查询名称').setValue('另存条件');await button('确认保存').trigger('click');await settle()
 expect(p.saved.write.mock.calls[1]![0]).toMatchObject({kind:'CREATE',name:'另存条件',expression:'n > 2'})
 expect(select().props('modelValue')).toBe(otherId)
 expect(document.body.textContent).toContain('另存条件')
})

it('未修改条件直接保存不写数据库并提示未修改',async()=>{
 const p=ports(),saved=await record()
 p.saved.list.mockResolvedValue([saved]);p.saved.versions.mockResolvedValue([saved])
 const dialog=await setup(p)
 dialog.findAllComponents(ElSelect).find(node=>node.props('ariaLabel')==='读取设备查询')!.vm.$emit('update:modelValue',id);await settle()
 await button('保存').trigger('click');await settle()
 expect(p.saved.write).not.toHaveBeenCalled()
 expect(document.body.textContent).toContain('查询条件未修改')
})

it('弹窗只保留原站控件并使用黑色高亮条件编辑器',async()=>{
 const p=ports()
 await setup(p)
 await input().setValue('temperature > 25 and alarm_state = true')
 const highlight=wrapper!.get('.tc-code-highlight').html()
 expect(highlight).toContain('tok-property')
 expect(highlight).toContain('tok-operator')
 expect(highlight).toContain('tok-number')
 expect(highlight).toContain('tok-logical')
 expect(document.querySelector('.device-query-dialog .el-dialog__title')?.textContent).toBe('设备查询')
 for(const label of ['保存','另存为…','清空','查询'])expect(()=>button(label)).not.toThrow()
 for(const label of ['校验','关闭','保存查询版本','删除保存查询'])expect(()=>button(label)).toThrow()
})
