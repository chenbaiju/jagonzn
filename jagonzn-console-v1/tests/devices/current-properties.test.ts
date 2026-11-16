import {copySucceeded,copyFailed} from '../../src/ui/copy-feedback'
import {webcrypto} from 'node:crypto'
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PlatformPropertyAction from '../../src/features/devices/PlatformPropertyAction.vue'
import {parseDashboardRuntimeResponse,type StrictJsonObject} from '@things-link/client-contracts/dashboard/v1'
import {propertyValueText} from '../../src/features/devices/property-decoder'
import DeviceProperties from '../../src/features/devices/DeviceProperties.vue'
import {ApiError,changeIdentity} from '../../src/core/http'
import type {Ref} from 'vue'
vi.mock('../../src/ui/copy-feedback',()=>({copySucceeded:vi.fn(),copyFailed:vi.fn()}))
const state=vi.hoisted(()=>({profile:vi.fn(),binding:vi.fn(),shadow:vi.fn(),api:vi.fn(),project:undefined as unknown as Ref<string>,read:undefined as unknown as Ref<boolean>,control:undefined as unknown as Ref<boolean>,status:undefined as unknown as Ref<string>}))
vi.mock('../../src/core/session',async()=>{const{ref,computed}=await import('vue');state.project=ref('project');state.read=ref(true);state.control=ref(false);state.status=ref('ACTIVE');return{projectId:state.project,currentProject:computed(()=>({id:state.project.value,status:state.status.value})),can:(permission:string)=>permission==='device:read'?state.read.value:permission==='device:control'?state.control.value:false}})
vi.mock('../../src/features/devices/api',()=>({devicesApi:{profile:state.profile,binding:state.binding,shadow:state.shadow},devicePath:(project:string,device:string)=>`/api/v1/projects/${project}/devices/${device}`}))
vi.mock('../../src/core/http',async()=>{const original=await vi.importActual('../../src/core/http');return{...original,api:state.api}})
const device='00000000-0000-4000-8000-000000000001',version='00000000-0000-4000-8000-000000000002',type='00000000-0000-4000-8000-000000000003'
function profile(deviceTypeId:string|null=type){return{deviceId:device,name:'测试设备',deviceKey:'device-key-01',businessKey:null,description:null,deviceTypeId,referenceVersion:'0',profileToken:'a'.repeat(64)}}
function render(presentation:'table'|'cards'='table'){return mount(DeviceProperties,{props:{deviceId:device,presentation},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{PropertyHistoryRemovalAction:true,PropertyHistory:true,PropertyCurve:true}}})}
async function openCardCommand(w:ReturnType<typeof render>,label:string,key:string){
 const direct=w.find(`button[aria-label="${label}：${key}"]`)
 if(direct.exists()){await direct.trigger('click');await flushPromises();return}
 const buttons=w.findAll('button[aria-label^="更多属性操作："]')
 const index=buttons.findIndex(node=>node.attributes('aria-label')===`更多属性操作：${key}`)
 expect(index).toBeGreaterThanOrEqual(0)
 const dropdowns=w.findAllComponents({name:'ElDropdown'})
 expect(dropdowns[index]).toBeDefined()
 dropdowns[index]!.vm.$emit('command',label==='查看属性 JSON'?'json':label==='更新云端属性'||label==='下发属性'?'update':'remove')
 await flushPromises()
}
function button(w:ReturnType<typeof render>,text:string){const b=w.findAll('button').find(button=>button.text()===text);expect(b).toBeDefined();return b!}
function model(count:number){return{version:{id:version,schemaDigest:'digest'},modelSnapshot:{properties:Object.fromEntries(Array.from({length:count},(_,index)=>[`p${index}`,{name:`属性${index}`,dataType:'NUMBER',accessType:'REPORT'}]))}}}
function wire(keys:string[],raw:Record<string,string>={}){return new TextEncoder().encode(`{"projectId":"project","deviceId":"${device}","modelVersionId":"${version}","values":[${keys.map(key=>`{"propertyKey":"${key}","state":"${raw[key]===undefined?'NO_VALUE':'VALUE'}","sourceKind":${raw[key]===undefined?'null':'"DEVICE_REPORT"'},"value":${raw[key]??'null'},"modelVersionId":${raw[key]===undefined?'null':`"${version}"`},"occurredAt":${raw[key]===undefined?'null':'"2026-10-24T01:00:00Z"'},"updatedAt":null,"operationId":null,"reportedRevision":${raw[key]===undefined?'null':'"1"'}}`).join(',')}]}`)}
/** 三段来源独立响应；某来源未给出时明确为 NO_VALUE。 */
function sources(keys:string[],values:Record<string,{reported?:string;downlink?:string;cloud?:string}>={}){
 const value=(source:'reported'|'platform',raw?:string)=>raw===undefined
  ? '{"state":"NO_VALUE","value":null,"modelVersionId":null,"occurredAt":null,"updatedAt":null,"operationId":null}'
  : `{"state":"VALUE","value":${raw},"modelVersionId":"${version}","occurredAt":${source==='reported'?'"2026-10-24T01:00:00Z"':'null'},"updatedAt":${source==='reported'?'null':'"2026-10-24T01:00:00Z"'},"operationId":${source==='reported'?'null':'"00000000-0000-4000-8000-000000000009"'}}`
 return new TextEncoder().encode(`{"projectId":"project","deviceId":"${device}","modelVersionId":"${version}","values":[${keys.map(key=>`{"propertyKey":"${key}","reported":${value('reported',values[key]?.reported)},"downlink":${value('platform',values[key]?.downlink)},"cloud":${value('platform',values[key]?.cloud)}}`).join(',')}]}`)
}
let clipboardDescriptor:PropertyDescriptor|undefined
function mockClipboard(value:unknown){Object.defineProperty(navigator,'clipboard',{configurable:true,value})}
describe('当前属性与JSON共用真实当前值',()=>{
 afterEach(()=>{if(clipboardDescriptor)Object.defineProperty(navigator,'clipboard',clipboardDescriptor);else Reflect.deleteProperty(navigator,'clipboard');vi.unstubAllGlobals()})
 beforeEach(()=>{clipboardDescriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');vi.stubGlobal('crypto',webcrypto);vi.clearAllMocks();state.status.value='ACTIVE';state.project.value='project';state.read.value=true;state.control.value=false;state.profile.mockResolvedValue(profile());state.binding.mockResolvedValue({deviceId:device,deviceTypeId:type,version:{id:version,schemaDigest:'digest'}});state.shadow.mockResolvedValue({reported:'{"legacy_only":"旧影子"}'})})

 it.each(['table','cards'] as const)('未绑定类型的%s明确展示状态，不读绑定或伪造空JSON',async presentation=>{
  state.profile.mockResolvedValue(profile(null));state.binding.mockRejectedValue(new ApiError('设备不存在',404))
  const w=mount(DeviceProperties,{props:{deviceId:device,presentation},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{PropertyHistoryRemovalAction:true,PropertyHistory:true,PropertyCurve:true}}});await flushPromises()
  expect(w.text()).toContain('设备尚未绑定设备类型，模型属性暂不可读取。');expect(w.text()).not.toContain('设备不存在');expect(w.text()).not.toContain('暂无数据');expect(state.binding).not.toHaveBeenCalled();expect(state.api).not.toHaveBeenCalled();expect(w.findAll('.el-table__row,.property-cards article')).toHaveLength(0)
  if(presentation==='table'){expect(button(w,'查看属性 JSON').attributes('disabled')).toBeDefined();for(const action of w.findAllComponents({name:'PlatformPropertyAction'}))expect(action.props('disabled')).toBe(true);expect(w.findComponent({name:'CurrentPropertyRemovalAction'}).props('disabled')).toBe(true)}
  w.unmount()
 })
 it.each([[404,'设备不存在'],[403,'没有访问设备的权限'],[500,'设备资料读取失败']] as const)('资料%s保留真实错误，不推断为未绑定',async(status,message)=>{
  state.profile.mockRejectedValue(new ApiError(message,status));const w=render();await flushPromises();expect(w.text()).toContain(message);expect(w.text()).not.toContain('尚未绑定');expect(state.binding).not.toHaveBeenCalled();expect(state.api).not.toHaveBeenCalled();expect(button(w,'查看属性 JSON').attributes('disabled')).toBeDefined();w.unmount()
 })
 it('已绑定设备的绑定404仍是错误，不转成未绑定状态',async()=>{
  state.binding.mockRejectedValue(new ApiError('绑定读取失败',404));const w=render();await flushPromises();expect(w.text()).toContain('绑定读取失败');expect(w.text()).not.toContain('尚未绑定');expect(state.api).not.toHaveBeenCalled();w.unmount()
 })
 it('别设备或不完整资料不能作为未绑定证明',async()=>{
  for(const value of [{...profile(null),deviceId:version},{...profile(null),profileToken:undefined}]){
   state.profile.mockResolvedValue(value);const w=render();await flushPromises();expect(w.text()).toContain('设备资料回执不完整或身份不匹配');expect(w.text()).not.toContain('尚未绑定');w.unmount()
  }
  expect(state.binding).not.toHaveBeenCalled();expect(state.api).not.toHaveBeenCalled()
 })
 it('资料和绑定类型不同则停止读取模型',async()=>{
  state.binding.mockResolvedValue({deviceId:device,deviceTypeId:version,version:{id:version,schemaDigest:'digest'}});const w=render();await flushPromises();expect(w.text()).toContain('设备绑定物模型不可用');expect(state.api).not.toHaveBeenCalled();w.unmount()
 })
 it('卸载后迟到的资料不会继续读取旧设备绑定',async()=>{
  let resolve!:(value:ReturnType<typeof profile>)=>void;state.profile.mockReturnValue(new Promise(done=>{resolve=done}));const w=render();await flushPromises();w.unmount();resolve(profile());await flushPromises();expect(state.binding).not.toHaveBeenCalled();expect(state.api).not.toHaveBeenCalled()
 })
 it('重新读取变为未绑定时关闭旧属性历史和曲线',async()=>{
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(model(1)):Promise.resolve(wire(['p0'],{p0:'7'})))
  const w=render();await flushPromises();await w.get('button[aria-label="查看历史数据"]').trigger('click');await w.get('button[aria-label="查看时序图表"]').trigger('click');await flushPromises();expect(w.findComponent({name:'PropertyHistory'}).exists()).toBe(true);expect(w.findComponent({name:'PropertyCurve'}).exists()).toBe(true)
  state.profile.mockResolvedValue(profile(null));await button(w,'刷新').trigger('click');await flushPromises();expect(w.findComponent({name:'PropertyHistory'}).exists()).toBe(false);expect(w.findComponent({name:'PropertyCurve'}).exists()).toBe(false);expect(w.text()).toContain('尚未绑定');expect(w.text()).not.toContain('属性0');w.unmount()
 })
 it('表格和JSON使用同一词法精度，不读另一个影子快照',async()=>{
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(model(1)):path.includes('/platform-properties/sources')?Promise.resolve(sources(['p0'],{p0:{reported:'9007199254740993'}})):Promise.resolve(wire(['p0'],{p0:'9007199254740993'})))
  const w=render();await flushPromises();expect(w.text()).toContain('9007199254740993');expect(state.shadow).not.toHaveBeenCalled();await button(w,'查看属性 JSON').trigger('click');await flushPromises();expect(w.find('pre').text()).toContain('9007199254740993');expect(w.find('pre').text()).not.toContain('legacy_only');w.unmount()
 })
 it('JSON 按真实来源分别展示，共享属性同时保留上报与下发值',async()=>{
  const snapshot=model(3);snapshot.modelSnapshot.properties.p1!.accessType='SHARED';snapshot.modelSnapshot.properties.p2!.accessType='CLOUD_PRIVATE'
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):path.includes('/platform-properties/sources')?Promise.resolve(sources(['p0','p1','p2'],{p0:{reported:'0'},p1:{reported:'5',downlink:'9007199254740993'},p2:{cloud:'2'}})):Promise.resolve(wire(['p0','p1','p2'],{p0:'0',p1:'5',p2:'2'})))
  const w=render();await flushPromises();await button(w,'查看属性 JSON').trigger('click');await flushPromises();const groups=w.findAll('.property-json-group');expect(groups.map(g=>g.find('div').text())).toEqual(['设备上报属性','云端下发属性','云端私有属性']);expect(groups[0]!.text()).toContain('"p0": 0');expect(groups[0]!.text()).toContain('"p1": 5');expect(groups[1]!.text()).toContain('"p1": 9007199254740993');expect(groups[2]!.text()).toContain('"p2": 2');w.unmount()
 })
 it('工厂旧快照没有name时另读当前展示名，不把定义值和类型回填冻结模型',async()=>{
  const snapshot=model(1);delete (snapshot.modelSnapshot.properties.p0 as {name?:string}).name
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):path.endsWith('/properties')?Promise.resolve([{deviceTypeId:type,propertyKey:'p0',name:'当前温度名称',dataType:'TEXT',accessType:'CLOUD_PRIVATE',value:'不可用的伪当前值'}]):Promise.resolve(wire(['p0'],{p0:'9007199254740993'})))
  const w=render();await flushPromises();const cells=w.findAll('.el-table__row .cell');expect(cells[0]!.text()).toBe('设备上报');expect(cells[2]!.text()).toBe('当前温度名称');expect(cells[3]!.text()).toBe('9007199254740993')
  expect(snapshot.modelSnapshot.properties.p0).not.toHaveProperty('name');expect(snapshot.modelSnapshot.properties.p0!.dataType).toBe('NUMBER');expect(w.text()).not.toContain('不可用的伪当前值');w.unmount()
 })
 it('没有冻结或当前名称证据时名称留空，不用标识符伪造名称',async()=>{
  const snapshot=model(1);delete (snapshot.modelSnapshot.properties.p0 as {name?:string}).name
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):path.endsWith('/properties')?Promise.resolve([]):Promise.resolve(wire(['p0'],{p0:'7'})))
  const w=render();await flushPromises();const cells=w.findAll('.el-table__row .cell');expect(cells[1]!.text()).toBe('p0');expect(cells[2]!.text()).toBe('—');expect(cells[3]!.text()).toBe('7');w.unmount()
 })
 it('当前名称目录外类型或重复key时整页失败，不展示错配名称和旧值',async()=>{
  for(const definitions of [[{deviceTypeId:'foreign',propertyKey:'p0',name:'错误名'}],[{deviceTypeId:type,propertyKey:'p0',name:'名字'},{deviceTypeId:type,propertyKey:'p0',name:'重复'}]]){
   const snapshot=model(1);delete (snapshot.modelSnapshot.properties.p0 as {name?:string}).name
   state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):path.endsWith('/properties')?Promise.resolve(definitions):Promise.resolve(wire(['p0'],{p0:'987654321'})))
   const w=render();await flushPromises();expect(w.text()).toContain('当前属性名称目录身份不匹配或重复');expect(w.text()).not.toContain('987654321');expect(button(w,'查看属性 JSON').attributes('disabled')).toBeDefined();w.unmount()
  }
 })
 it('已冻名称优先于后继当前改名且无需用当前目录重新解释旧快照',async()=>{
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(model(1)):path.endsWith('/properties')?Promise.reject(new Error('不应读取当前改名')):Promise.resolve(wire(['p0'],{p0:'7'})))
  const w=render();await flushPromises();expect(w.findAll('.el-table__row .cell')[2]!.text()).toBe('属性0');expect(state.api.mock.calls.some(([path])=>String(path).endsWith('/properties'))).toBe(false)
  const headers=w.findAll('th .cell').map(cell=>cell.text());expect(headers).toEqual(['属性类型','属性标识符','属性名称','属性值','更新时间','历史数据','图表分析','加入看板','操作']);w.unmount()
 })
 it('四种合法属性类型按冻结模型显示中文，旧未定义流向仍留缺省',async()=>{
  const snapshot=model(5)
  for(const [index,access] of ['REPORT','DOWNLINK','SHARED','CLOUD_PRIVATE','UNDEFINED'].entries())snapshot.modelSnapshot.properties[`p${index}`]!.accessType=access
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):Promise.resolve(wire(['p0','p1','p2','p3','p4'],{p0:'1',p1:'2',p2:'3',p3:'4',p4:'5'})))
  const w=render();await flushPromises();expect(w.findAll('.el-table__row').map(row=>row.findAll('.cell')[0]!.text())).toEqual(['设备上报','云端下发','设备云端共享','云端私有','—']);expect(w.text()).not.toMatch(/REPORT|DOWNLINK|SHARED|CLOUD_PRIVATE|UNDEFINED|流向/);w.unmount()
 })
 it('没有实际当前值的冻结定义不造当前行，JSON仍是同源空对象',async()=>{
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(model(2)):path.includes('/platform-properties/sources')?Promise.resolve(sources(['p0','p1'])):Promise.resolve(wire(['p0','p1'])))
  const w=render();await flushPromises();expect(w.findAll('.el-table__row')).toHaveLength(0);expect(w.text()).not.toContain('属性0');expect(w.text()).not.toContain('属性1');expect(w.findAll('th .cell').map(cell=>cell.text())).toEqual(['属性类型','属性标识符','属性名称','属性值','更新时间','历史数据','图表分析','加入看板','操作']);expect(w.find('.tl-learning-resource a').text()).toContain('什么是设备属性？');expect(w.find('.tl-learning-resource a').attributes('href')).toBe('https://www.thingscloud.xyz/docs/guide/device-manage/device-attributes.html')
  await button(w,'查看属性 JSON').trigger('click');await flushPromises();expect(w.find('pre').text()).toBe('{}');w.unmount()
 })
 it('混合VALUE与NO_VALUE仍完整读取两键，只展示实际有值的一行',async()=>{
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(model(2)):Promise.resolve(wire(['p0','p1'],{p0:'7'})))
  const w=render();await flushPromises();expect(w.findAll('.el-table__row')).toHaveLength(1);expect(w.text()).toContain('属性0');expect(w.text()).not.toContain('属性1')
  expect(state.api.mock.calls.find(([path])=>String(path).includes('platform-properties/current'))![1].query.propertyKeys).toEqual(['p0','p1']);w.unmount()
 })
 it('概览没有实际属性值时保留标题刷新而隐藏内容，零值仍显示且加载失败保留重读',async()=>{
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(model(1)):Promise.resolve(wire(['p0'])))
  const empty=render('cards');await flushPromises();expect(empty.find('.property-cards-toolbar').exists()).toBe(true);expect(empty.find('.el-empty,.property-cards,.el-table').exists()).toBe(false);expect(empty.text()).toContain('当前属性');expect(button(empty,'刷新').exists()).toBe(true);empty.unmount()
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(model(1)):Promise.resolve(wire(['p0'],{p0:'0'})))
  const zero=render('cards');await flushPromises();expect(zero.get('.property-cards strong').text()).toBe('0');expect(zero.text()).toContain('当前属性');zero.unmount()
  state.profile.mockRejectedValue(new ApiError('读取失败',500));const failed=render('cards');await flushPromises();expect(failed.get('[role="alert"]').text()).toContain('读取失败');expect(button(failed,'重新读取').exists()).toBe(true);failed.unmount()
 })
 it('空模型不发送非法空属性请求',async()=>{
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(model(0)):Promise.reject(new Error('不应发送空属性请求')))
  const w=render();await flushPromises();expect(state.api).toHaveBeenCalledTimes(1);expect(w.text()).not.toContain('不应发送空属性请求');w.unmount()
 })
 it('51个属性按正式50键限制分批，不把部分读取当完成',async()=>{
  state.api.mockImplementation((path:string,options:any)=>{
   if(path.includes('thing-model-versions'))return Promise.resolve(model(51))
   const keys=options.query.propertyKeys;expect(keys.length).toBeLessThanOrEqual(50)
   return Promise.resolve(wire(keys,Object.fromEntries(keys.map((key:string)=>[key,key==='p50'?'51':'1']))))
  })
  const w=render();await flushPromises();expect(state.api.mock.calls.filter(([path])=>String(path).includes('platform-properties/current')).map(([,options])=>options.query.propertyKeys.length)).toEqual([50,1]);expect(w.text()).toContain('属性50');w.unmount()
 })
 it('后一批失败时不展示前一批为完整当前值',async()=>{
  state.api.mockImplementation((path:string,options:any)=>{
   if(path.includes('thing-model-versions'))return Promise.resolve(model(51))
   if(options.query.propertyKeys.includes('p50'))return Promise.reject(new Error('第二批读取失败'))
   return Promise.resolve(wire(options.query.propertyKeys,{p0:'12345'}))
  })
  const w=render();await flushPromises();expect(w.text()).toContain('第二批读取失败');expect(w.text()).not.toContain('12345');expect(button(w,'查看属性 JSON').attributes('disabled')).toBeDefined();w.unmount()
 })
 it('刷新失败清除旧值与JSON入口，不能继续显示旧快照',async()=>{
  let fail=false
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(model(1)):fail?Promise.reject(new Error('当前值刷新失败')):Promise.resolve(wire(['p0'],{p0:'6789'})))
  const w=render();await flushPromises();expect(w.text()).toContain('6789');fail=true;await button(w,'刷新').trigger('click');await flushPromises();expect(w.text()).toContain('当前值刷新失败');expect(w.text()).not.toContain('6789');expect(button(w,'查看属性 JSON').attributes('disabled')).toBeDefined();w.unmount()
 })
 it('同名key已切模型，禁止用新模型值贴旧定义',async()=>{
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(model(1)):Promise.resolve(new TextEncoder().encode(new TextDecoder().decode(wire(['p0'],{p0:'987654321'})).replaceAll(version,'00000000-0000-4000-8000-000000000099'))))
  const w=render();await flushPromises();expect(w.text()).not.toContain('987654321');expect(button(w,'查看属性 JSON').attributes('disabled')).toBeDefined();w.unmount()
 })
 it('模型A到B再回A，真实来源仍为B的同名值不能当A值',async()=>{
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(model(1)):Promise.resolve(new TextEncoder().encode(new TextDecoder().decode(wire(['p0'])).replace('NO_VALUE','SOURCE_MODEL_MISMATCH'))))
  const w=render();await flushPromises();expect(button(w,'查看属性 JSON').attributes('disabled')).toBeDefined();expect(w.text()).toContain('当前属性来源或数据合同不匹配');w.unmount()
 })
 it('后一批只分配当前剩余正文预算',async()=>{
  const budgets:number[]=[]
  state.api.mockImplementation((path:string,options:any)=>{
   if(path.includes('thing-model-versions'))return Promise.resolve(model(51))
   budgets.push(options.maxResponseBytes)
   const keys=options.query.propertyKeys
   return Promise.resolve(wire(keys))
  })
  const w=render();await flushPromises();expect(budgets).toHaveLength(2);expect(budgets[0]).toBe(4194304);expect(budgets[1]).toBeLessThan(budgets[0]!);expect(budgets[1]).toBeGreaterThan(0);w.unmount()
 })
 it('曲线固定父页模型与数值目录，曲线失权后清私有当前值及所有操作入口',async()=>{
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(model(2)):Promise.resolve(wire(['p0','p1'],{p0:'987654321',p1:'3'})))
  const w=render();await flushPromises();await w.find('button[aria-label="查看时序图表"]').trigger('click');await flushPromises()
  const curve=w.findComponent({name:'PropertyCurve'});expect(curve.props('modelVersionId')).toBe(version);expect(curve.props('properties').map((item:any)=>item.key)).toEqual(['p0','p1'])
  curve.vm.$emit('unavailable',new Error('曲线当前访问已撤销'));await flushPromises();expect(w.text()).not.toContain('987654321');expect(w.findComponent({name:'PropertyCurve'}).exists()).toBe(false);expect(button(w,'查看属性 JSON').attributes('disabled')).toBeDefined();expect(w.text()).toContain('曲线当前访问已撤销');w.unmount()
 })
 it('概览卡片的图标操作保持精确值和原模型身份，不向未选属性发请求',async()=>{
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(model(1)):Promise.resolve(wire(['p0'],{p0:'9007199254740993'})))
  const w=mount(DeviceProperties,{props:{deviceId:device,presentation:'cards'},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{PropertyHistoryRemovalAction:true,PropertyHistory:true,PropertyCurve:true}}});await flushPromises();expect(w.get('.property-cards strong').text()).toBe('9007199254740993');expect(w.get('.property-card-name').attributes('title')).toBe('属性0 (p0)');await w.get('.property-card-actions [aria-label="查看历史数据"]').trigger('click');await flushPromises();expect(w.findComponent({name:'PropertyHistory'}).props()).toMatchObject({deviceId:device,propertyKey:'p0',modelVersionId:version});await w.get('.property-card-actions [aria-label="查看时序图表"]').trigger('click');await flushPromises();expect(w.findComponent({name:'PropertyCurve'}).props()).toMatchObject({deviceId:device,propertyKey:'p0',modelVersionId:version});expect(state.api).toHaveBeenCalledTimes(2);w.unmount()
 })

 it.each(['table','cards'] as const)('%s的单个复杂属性详情与复制保留大数小数词法，标识名称和值互不串用',async presentation=>{
  const snapshot=model(3);snapshot.modelSnapshot.properties.p0!.dataType='OBJECT';snapshot.modelSnapshot.properties.p1!.dataType='LIST'
  const raw='{"big":9007199254740993,"decimal":0.123456789012345678901,"html":"<img src=x onerror=alert(1)>","nested":[null,true]}'
  const expected='{"big": 9007199254740993, "decimal": 0.123456789012345678901, "html": "<img src=x onerror=alert(1)>", "nested": [null, true]}'
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):Promise.resolve(wire(['p0','p1','p2'],{p0:raw,p1:'[9007199254740995,0.0000000000000000001]',p2:'3'})))
  const writeText=vi.fn().mockResolvedValue(undefined);mockClipboard({writeText})
  const w=render(presentation);await flushPromises();
  const before=state.api.mock.calls.length;await openCardCommand(w,'查看属性 JSON','p0')
  const detail=w.get('.property-value-detail');expect(detail.text()).toContain('属性标识符');expect(detail.text()).toContain('p0');expect(detail.text()).toContain('属性0');expect(detail.get('pre').text()).toBe(expected);expect(detail.find('img').exists()).toBe(false)
  await button(w,'复制 JSON').trigger('click');await flushPromises();expect(writeText).toHaveBeenCalledExactlyOnceWith(expected);expect(copySucceeded).toHaveBeenCalledTimes(1);expect(detail.find('[role="status"]').exists()).toBe(false);expect(state.api).toHaveBeenCalledTimes(before)
  await button(w,'关闭').trigger('click');await flushPromises();await openCardCommand(w,'查看属性 JSON','p1')
  expect(w.get('.property-value-detail pre').text()).toBe('[9007199254740995, 0.0000000000000000001]');expect(w.get('.property-value-detail').text()).not.toContain('属性0');expect(w.get('.property-value-detail').text()).not.toContain('已复制');w.unmount()
 })
 it('单属性详情标明当前名称来源，打开后不被原始定义对象修改重解释',async()=>{
  const snapshot=model(1);snapshot.modelSnapshot.properties.p0!.dataType='OBJECT';delete (snapshot.modelSnapshot.properties.p0 as {name?:string}).name
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):path.endsWith('/properties')?Promise.resolve([{deviceTypeId:type,propertyKey:'p0',name:'当前对象名称'}]):Promise.resolve(wire(['p0'],{p0:'{"value":1}'})))
  const w=render();await flushPromises();await openCardCommand(w,'查看属性 JSON','p0');snapshot.modelSnapshot.properties.p0!.name='后来的名称';await flushPromises()
  expect(w.get('.property-value-detail').text()).toContain('当前对象名称');expect(w.get('.property-value-detail').text()).toContain('当前属性定义名称');expect(w.get('.property-value-detail').text()).not.toContain('后来的名称');w.unmount()
 })
 it.each(['missing','denied'] as const)('剪贴板%s时真实提示失败，不伪造复制成功',async kind=>{
  const snapshot=model(1);snapshot.modelSnapshot.properties.p0!.dataType='OBJECT';state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):Promise.resolve(wire(['p0'],{p0:'{}'})))
  const writeText=vi.fn().mockRejectedValue(new Error('Permission denied'));mockClipboard(kind==='missing'?undefined:{writeText})
  const w=render();await flushPromises();await openCardCommand(w,'查看属性 JSON','p0');await button(w,'复制 JSON').trigger('click');await flushPromises()
  expect(copyFailed).toHaveBeenCalledWith(kind==='missing'?'当前浏览器无法访问剪贴板，请手动复制 JSON。':'复制失败，请检查剪贴板权限后重试。');expect(copySucceeded).not.toHaveBeenCalled();expect(w.get('.property-value-detail').text()).not.toContain('已复制');expect(writeText).toHaveBeenCalledTimes(kind==='missing'?0:1);w.unmount()
 })
 it.each(['refresh','device','project','identity','permission','busy'] as const)('%s失效后关闭旧单值并隔离迟到复制结果',async reason=>{
  const snapshot=model(1);snapshot.modelSnapshot.properties.p0!.dataType='OBJECT';state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):Promise.resolve(wire(['p0'],{p0:'{"secret":9007199254740993}'})))
  state.control.value=true;let finish!:()=>void;const writeText=vi.fn().mockReturnValue(new Promise<void>(resolve=>{finish=resolve}));mockClipboard({writeText})
  const w=render();await flushPromises();await openCardCommand(w,'查看属性 JSON','p0');await button(w,'复制 JSON').trigger('click');expect(button(w,'复制 JSON').attributes('disabled')).toBeDefined()
  if(reason==='refresh')await button(w,'刷新').trigger('click')
  if(reason==='device')await w.setProps({deviceId:version})
  if(reason==='project')state.project.value='other-project'
  if(reason==='identity')changeIdentity()
  if(reason==='permission')state.read.value=false
  if(reason==='busy')w.findAllComponents({name:'PlatformPropertyAction'})[0]!.vm.$emit('busy',true)
  await flushPromises();expect(w.find('.property-value-detail').exists()).toBe(false);finish();await flushPromises();expect(copySucceeded).not.toHaveBeenCalled();expect(w.text()).not.toContain('已复制');expect(writeText).toHaveBeenCalledTimes(1)
  if(reason==='permission'||reason==='busy')expect(w.get('button[aria-label="查看属性 JSON：p0"]').attributes('disabled')).toBeDefined()
  w.unmount()
 })
 it('关闭重开后旧复制失败不能污染新快照，重复点击忙中不重复复制',async()=>{
  const snapshot=model(1);snapshot.modelSnapshot.properties.p0!.dataType='OBJECT';state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):Promise.resolve(wire(['p0'],{p0:'{}'})))
  let reject!:(error:Error)=>void;const writeText=vi.fn().mockReturnValue(new Promise<void>((_,fail)=>{reject=fail}));mockClipboard({writeText})
  const w=render();await flushPromises();await openCardCommand(w,'查看属性 JSON','p0');await button(w,'复制 JSON').trigger('click');await button(w,'复制 JSON').trigger('click');expect(writeText).toHaveBeenCalledTimes(1)
  await button(w,'关闭').trigger('click');await flushPromises();await openCardCommand(w,'查看属性 JSON','p0');reject(new Error('late denied'));await flushPromises();expect(copyFailed).not.toHaveBeenCalled();expect(copySucceeded).not.toHaveBeenCalled();expect(w.get('.property-value-detail').text()).not.toContain('复制失败');expect(w.get('.property-value-detail').text()).not.toContain('已复制');w.unmount()
 })

 it('OBJECT/LIST的NO_VALUE不生成当前行或JSON入口，不能复制缺值占位符',async()=>{
  const snapshot=model(2);snapshot.modelSnapshot.properties.p0!.dataType='OBJECT';snapshot.modelSnapshot.properties.p1!.dataType='LIST'
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):path.includes('/platform-properties/sources')?Promise.resolve(sources(['p0','p1'])):Promise.resolve(wire(['p0','p1'])))
  const writeText=vi.fn();mockClipboard({writeText})
  const w=render();await flushPromises();expect(w.findAll('.el-table__row')).toHaveLength(0);expect(w.findAll('button[aria-label^="查看属性 JSON："]')).toHaveLength(0);expect(w.find('.property-value-detail').exists()).toBe(false);expect(writeText).not.toHaveBeenCalled()
  await button(w,'查看属性 JSON').trigger('click');await flushPromises();expect(w.get('pre').text()).toBe('{}');w.unmount()
 })
 it('复杂属性的嵌套null是真实JSON并可复制，顶层VALUE/null按现有当前合同拒绝',async()=>{
  const snapshot=model(1);snapshot.modelSnapshot.properties.p0!.dataType='OBJECT';let raw='{"nullable":null,"list":[null]}'
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):Promise.resolve(wire(['p0'],{p0:raw})))
  const writeText=vi.fn().mockResolvedValue(undefined);mockClipboard({writeText})
  const w=render();await flushPromises();await openCardCommand(w,'查看属性 JSON','p0');await button(w,'复制 JSON').trigger('click');await flushPromises();expect(writeText).toHaveBeenCalledExactlyOnceWith('{"nullable": null, "list": [null]}');expect(copySucceeded).toHaveBeenCalledTimes(1);expect(w.get('.property-value-detail').text()).not.toContain('已复制')
  raw='null';await button(w,'刷新').trigger('click');await flushPromises();expect(w.text()).toContain('当前属性实际来源模型不匹配');expect(w.find('.property-value-detail').exists()).toBe(false);expect(w.findAll('button[aria-label^="查看属性 JSON："]')).toHaveLength(0);expect(writeText).toHaveBeenCalledTimes(1);w.unmount()
 })

 it.each(['cards'] as const)('%s单属性更新入口冻结当前精确JSON值且取消不提交',async presentation=>{
  state.control.value=true;const snapshot=model(1);snapshot.modelSnapshot.properties.p0!.dataType='OBJECT';snapshot.modelSnapshot.properties.p0!.accessType='CLOUD_PRIVATE'
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):Promise.resolve(wire(['p0'],{p0:'{"large":9007199254740993,"decimal":0.1234567890123456789}'})))
  const w=render(presentation);await flushPromises();await openCardCommand(w,'更新云端属性','p0')
  expect(w.get<HTMLTextAreaElement>('textarea[aria-label="单属性JSON值"]').element.value).toBe('{"large": 9007199254740993, "decimal": 0.1234567890123456789}');expect(w.text()).toContain('属性标识符');expect(w.findAllComponents({name:'PlatformPropertyAction'})).toHaveLength(2)
  await button(w,'取消').trigger('click');await flushPromises();expect(state.api.mock.calls.some(([,options])=>options?.method==='post'||options?.method==='put')).toBe(false);w.unmount()
 })

 it.each(['table','cards'] as const)('%s单属性只给三种合法方向入口，Viewer不见写，归档不允许新写',async presentation=>{
  state.control.value=true;const snapshot=model(5);for(const [i,access] of ['REPORT','DOWNLINK','SHARED','CLOUD_PRIVATE','UNDEFINED'].entries())snapshot.modelSnapshot.properties[`p${i}`]!.accessType=access
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):Promise.resolve(wire(['p0','p1','p2','p3','p4'],{p0:'1',p1:'0',p2:'false',p3:'3',p4:'4'})))
  const w=render(presentation);await flushPromises();if(presentation==='table'){
   expect(w.findAll('button[aria-label^="下发属性："],button[aria-label^="更新云端属性："]')).toHaveLength(3)
   expect(w.findAll('th .cell').map(cell=>cell.text()).filter(Boolean)).toEqual(['属性类型','属性标识符','属性名称','属性值','更新时间','历史数据','图表分析','加入看板','操作'])
   expect(button(w,'下发属性').exists()).toBe(true);expect(button(w,'更新云端属性').exists()).toBe(true)
  }
  state.status.value='ARCHIVED';await flushPromises();state.control.value=false;await flushPromises();w.unmount()
 })
 it.each(['cards'] as const)('%s刷新关闭idle单值，但保UNKNOWN固定实例和原键GET恢复',async presentation=>{
  state.control.value=true;const snapshot=model(2);snapshot.modelSnapshot.properties.p0!.accessType='CLOUD_PRIVATE';snapshot.modelSnapshot.properties.p1!.accessType='DOWNLINK';let accepted=false
  const operation='00000000-0000-4000-8000-000000000009',receipt={operationId:operation,projectId:'project',deviceId:device,modelVersionId:version,kind:'CLOUD_UPDATE',acceptedAt:'2026-10-27T00:00:00Z',commandId:null}
  state.api.mockImplementation((path:string,options:any)=>{
   if(options?.method==='put')return Promise.reject(new ApiError('未知',0,undefined,undefined,true))
   if(path.includes('/submissions/')){accepted=true;return Promise.resolve(receipt)}
   if(path.includes('thing-model-versions'))return Promise.resolve(snapshot)
   let data=new TextDecoder().decode(wire(options.query.propertyKeys,{p0:'9007199254740993',p1:'7'}))
   if(accepted)data=data.replaceAll('"DEVICE_REPORT"','"PLATFORM_CLOUD_UPDATE"').replaceAll('"occurredAt":"2026-10-24T01:00:00Z"','"occurredAt":null').replaceAll('"updatedAt":null','"updatedAt":"2026-10-27T00:00:00Z"').replaceAll('"operationId":null',`"operationId":"${operation}"`).replaceAll('"reportedRevision":"1"','"reportedRevision":null')
   return Promise.resolve(new TextEncoder().encode(data))
  })
  const w=render(presentation);await flushPromises();await openCardCommand(w,'更新云端属性','p0');const action=w.findAllComponents({name:'PlatformPropertyAction'}).find(c=>c.props('kind')==='CLOUD_UPDATE')!,uid=action.vm.$.uid
  await button(w,'刷新').trigger('click');await flushPromises();expect(action.findComponent({name:'ElDialog'}).props('modelValue')).toBe(false)
  await openCardCommand(w,'更新云端属性','p0');await action.findAll('button').find(b=>b.text()==='提交')!.trigger('click');await flushPromises();const sent=state.api.mock.calls.find(([,o])=>o?.method==='put')!;expect(sent[1].rawBody).toBe(`{"expectedModelVersionId":"${version}","properties":{"p0":9007199254740993}}`);expect(w.emitted('busy')?.at(-1)).toEqual([true])
  await action.findAll('button').find(b=>b.text()==='取消')!.trigger('click');await button(w,'刷新').trigger('click');await flushPromises();expect(w.findAllComponents({name:'PlatformPropertyAction'}).find(c=>c.props('kind')==='CLOUD_UPDATE')!.vm.$.uid).toBe(uid);expect(w.emitted('busy')?.at(-1)).toEqual([true])
  await action.findAll('button').find(b=>b.text()==='更新云端属性')!.trigger('click');await flushPromises();await action.findAll('button').find(b=>b.text()==='核对原请求')!.trigger('click');await flushPromises();const lookup=state.api.mock.calls.find(([path])=>String(path).includes('/submissions/'))!
  expect(lookup[1].headers['Original-Request-Key']).toBe(sent[1].headers['Idempotency-Key']);expect(lookup[1].headers['X-Request-Body-SHA256']).toMatch(/^[a-f0-9]{64}$/);expect(state.api.mock.calls.filter(([,o])=>o?.method==='put')).toHaveLength(1);expect(w.emitted('busy')?.at(-1)).toEqual([false]);w.unmount()
 })

 it.each(['cards'] as const)('%s从冻结SWITCH模型传型，false不丢且刷新关闭未提交草稿',async presentation=>{
  state.control.value=true;const snapshot=model(1);snapshot.modelSnapshot.properties.p0!.dataType='SWITCH';snapshot.modelSnapshot.properties.p0!.accessType='CLOUD_PRIVATE'
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):Promise.resolve(wire(['p0'],{p0:'false'})))
  const w=render(presentation);await flushPromises();await openCardCommand(w,'更新云端属性','p0')
  expect(w.get<HTMLInputElement>('input[type="radio"][value="false"]').element.checked).toBe(true);expect(w.find('textarea').exists()).toBe(false)
  await w.get('input[type="radio"][value="true"]').setValue(true);await button(w,'刷新').trigger('click');await flushPromises()
  expect(w.findAllComponents({name:'PlatformPropertyAction'}).find(c=>c.props('kind')==='CLOUD_UPDATE')!.findComponent({name:'ElDialog'}).props('modelValue')).toBe(false)
  expect(state.api.mock.calls.some(([,o])=>o?.method==='post'||o?.method==='put')).toBe(false);w.unmount()
 })

 it.each(['cards'] as const)('%s ENUM真实冻结候选选择器保字符串0且取消零写',async presentation=>{
  state.control.value=true;const snapshot=model(1);Object.assign(snapshot.modelSnapshot.properties.p0!,{dataType:'ENUM',accessType:'CLOUD_PRIVATE',enum:['0','false','AUTO']})
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):Promise.resolve(wire(['p0'],{p0:'"0"'})))
  const w=render(presentation)
  try{await flushPromises();await openCardCommand(w,'更新云端属性','p0')
   const select=w.findComponent({name:'ElSelect'});expect(select.exists()).toBe(true);expect(select.props('modelValue')).toBe('0');expect(select.props('filterable')).toBe(true);expect(select.props('allowCreate')).toBe(false);expect(w.find('textarea').exists()).toBe(false)
   await button(w,'取消').trigger('click');expect(state.api.mock.calls.some(([,o])=>o?.method==='post'||o?.method==='put')).toBe(false)
  }finally{w.unmount()}
 })

 it.each([
  {fields:{enum:['0'],enumOptions:['legacy']},expected:['0']},
  {fields:{enumOptions:['0']},expected:['0']},
  {fields:{enum:null,enumOptions:['0']},expected:undefined},
  {fields:{enum:['0',0]},expected:undefined}
 ])('ENUM同冻结版本候选优先级与坏行隔离 $fields',async({fields,expected})=>{
  state.control.value=true;const snapshot=model(2);Object.assign(snapshot.modelSnapshot.properties.p0!,{dataType:'ENUM',accessType:'CLOUD_PRIVATE',...fields})
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):Promise.resolve(wire(['p0','p1'],{p0:'"0"',p1:'9007199254740993'})))
  const w=render('cards');try{await flushPromises();expect(w.findAll('.property-cards article')).toHaveLength(2);expect(w.text()).toContain('9007199254740993');await openCardCommand(w,'更新云端属性','p0')
   expect(w.findAllComponents({name:'ElOption'}).map(option=>option.props('value'))).toEqual(expected||[]);expect(button(w,'提交').attributes('disabled')!==undefined).toBe(!expected)
   expect(state.api).toHaveBeenCalledTimes(2);expect(state.api.mock.calls.some(([path])=>String(path).endsWith('/properties'))).toBe(false)
  }finally{w.unmount()}
 })
 it('ENUM idle刷新关闭草稿；当前名称目录的选项不能替换冻结选项',async()=>{
  state.control.value=true;const snapshot=model(1);Object.assign(snapshot.modelSnapshot.properties.p0!,{name:undefined,dataType:'ENUM',accessType:'CLOUD_PRIVATE',enum:['0','false']})
  state.api.mockImplementation((path:string)=>path.includes('thing-model-versions')?Promise.resolve(snapshot):path.endsWith('/properties')?Promise.resolve([{deviceTypeId:type,propertyKey:'p0',name:'当前名称',enumOptions:['wrong']} ]):Promise.resolve(wire(['p0'],{p0:'"0"'})))
  const w=render('cards');try{await flushPromises();await openCardCommand(w,'更新云端属性','p0');expect(w.text()).toContain('当前名称');expect(w.findAllComponents({name:'ElOption'}).map(option=>option.props('value'))).toEqual(['0','false']);await button(w,'刷新').trigger('click');await flushPromises();expect(w.findAllComponents({name:'PlatformPropertyAction'}).find(c=>c.props('kind')==='CLOUD_UPDATE')!.findComponent({name:'ElDialog'}).props('modelValue')).toBe(false);expect(state.api.mock.calls.some(([,o])=>o?.method==='put')).toBe(false)}finally{w.unmount()}
 })

})


// B3仅复用当前属性组件/原HTTP适配器；输入和回读仍使用精确JSON词法。
function mixedFixture(){
 const project='00000000-0000-4000-8000-000000000006',base=`/api/v1/projects/${project}/devices/${device}`,digest='a'.repeat(64),capabilityId='019a0a00-0000-7000-8000-000000000001',operation='00000000-0000-4000-8000-000000000007'
 let currentModel=version,accepted=false,unknownWrite=false,knownWriteFailure=false,capabilityFailure=false,hold:((value:object)=>Promise<object>)|undefined
 let declarations=[{capabilityId,connectionTicketId:'00000000-0000-4000-8000-000000000008',modelVersionId:version,schemaDigest:digest,maximumPayloadBytes:65536,declaredAt:'2026-10-29T00:00:00Z'}],sendEnabled=true
 let submitted:StrictJsonObject=Object.create(null),submittedKind:'DOWNLINK'|'CLOUD_UPDATE'='DOWNLINK'
 const meta=()=>({id:currentModel,deviceTypeId:type,schemaDigest:digest,digestAlgorithm:'PG_JSONB_TEXT_V1_SHA256'})
 const model=()=>({version:meta(),modelSnapshot:{properties:{visible:{name:'普通值',dataType:'NUMBER',accessType:'DOWNLINK'},unreported:{name:'尚未上报混合列表',dataType:'LIST',accessType:'DOWNLINK',compositeProfile:'BASIC_MIXED_LIST_V1',schema:{type:'array',maxItems:8}},private_mixed:{name:'云端混合列表',dataType:'LIST',accessType:'CLOUD_PRIVATE',compositeProfile:'BASIC_MIXED_LIST_V1',schema:{type:'array',maxItems:8}}},events:{},commands:{}}})
 const response=()=>({operationId:operation,projectId:project,deviceId:device,modelVersionId:version,kind:submittedKind,acceptedAt:'2026-10-29T00:00:00Z',commandId:submittedKind==='DOWNLINK'?operation:null})
 state.project.value=project;state.control.value=true;state.read.value=true;state.status.value='ACTIVE';state.profile.mockResolvedValue(profile());state.binding.mockImplementation(async()=>({deviceId:device,deviceTypeId:type,version:meta()}))
 state.api.mockImplementation(async(path:string,options?:{method?:string;rawBody?:string;query?:Record<string,unknown>})=>{
  if(path.includes('/thing-model-versions/'))return model()
  if(path===base+'/property-downlink-capabilities'){if(capabilityFailure)throw new Error('GET失败');const value={projectId:project,deviceId:device,modelVersionId:version,sendEnabled,capabilities:declarations};return hold?hold(value):value}
  if(path===base+'/platform-properties/downlink'||path===base+'/platform-properties/cloud'){submittedKind=path.endsWith('/cloud')?'CLOUD_UPDATE':'DOWNLINK';submitted=parseDashboardRuntimeResponse(new TextEncoder().encode(options!.rawBody!)).properties as StrictJsonObject;if(knownWriteFailure)throw new ApiError('原连接已失效',409);accepted=true;if(unknownWrite)throw new ApiError('写结果未确认',0,undefined,undefined,true);return response()}
  if(path.startsWith(base+'/platform-properties/submissions/'))return response()
  if(path===base+'/platform-properties/current'){const keys=options!.query!.propertyKeys as string[],modelId=String(options!.query!.expectedModelVersionId);return new TextEncoder().encode(`{"projectId":"${project}","deviceId":"${device}","modelVersionId":"${modelId}","values":[${keys.map(key=>{const written=accepted&&Object.hasOwn(submitted,key),present=written||key==='visible',raw=written?propertyValueText(submitted[key]!):'1';return`{"propertyKey":${JSON.stringify(key)},"state":"${present?'VALUE':'NO_VALUE'}","sourceKind":${present?JSON.stringify(written?(submittedKind==='DOWNLINK'?'PLATFORM_DOWNLINK':'PLATFORM_CLOUD_UPDATE'):'DEVICE_REPORT'):'null'},"value":${present?raw:'null'},"modelVersionId":${present?JSON.stringify(modelId):'null'},"occurredAt":${present&&!written?'"2026-10-29T00:00:00Z"':'null'},"updatedAt":${written?'"2026-10-29T00:00:00Z"':'null'},"operationId":${written?JSON.stringify(operation):'null'},"reportedRevision":${present&&!written?'"1"':'null'}}`}).join(',')}]}`)}
  throw new Error('未登记业务请求 '+path)
 })
 return{project,base,digest,capabilityId,get declarations(){return declarations},set declarations(value){declarations=value},set sendEnabled(value:boolean){sendEnabled=value},set failRead(value:boolean){capabilityFailure=value},set unknown(value:boolean){unknownWrite=value},set knownFailure(value:boolean){knownWriteFailure=value},set hold(value:typeof hold){hold=value},changeModel(){currentModel='00000000-0000-4000-8000-000000000009'}}
}
function mixedCalls(part:string){return state.api.mock.calls.filter(([path])=>String(path).includes(part))}
async function openMixed(w:ReturnType<typeof render>,kind:'DOWNLINK'|'CLOUD_UPDATE'='DOWNLINK',raw='{"unreported":[9007199254740993,0.1234567890123456789,true,"ON"]}'){
 const action=w.findAllComponents(PlatformPropertyAction).find(row=>row.props('kind')===kind)!;await action.findAll('button').find(row=>row.text()===(kind==='DOWNLINK'?'下发属性':'更新云端属性'))!.trigger('click');await flushPromises();await action.get('textarea[aria-label="属性JSON"]').setValue(raw);return action
}
describe('混合LIST原声明薄接',()=>{
 beforeEach(()=>{vi.clearAllMocks();changeIdentity();vi.stubGlobal('crypto',webcrypto)})
 afterEach(()=>{vi.unstubAllGlobals();document.body.innerHTML=''})
 it('混合下行覆盖未上报键，唯一匹配原声明与精确正文一次冻结，云更新/标量仍旧两字段',async()=>{
  const fixture=mixedFixture(),raw='{"unreported":[9007199254740993,0.1234567890123456789,true,"ON"]}',w=render();try{await flushPromises();expect(w.text()).not.toContain('尚未上报混合列表');let action=await openMixed(w,'DOWNLINK',raw);await action.findAll('button').find(row=>row.text()==='提交')!.trigger('click');await vi.waitFor(()=>expect(mixedCalls('/platform-properties/downlink')).toHaveLength(1));await flushPromises();const call=mixedCalls('/platform-properties/downlink')[0]!;expect(call[1].rawBody).toBe(`{"expectedModelVersionId":"${version}","properties":${raw},"expectedDownlinkCapabilityId":"${fixture.capabilityId}"}`);expect(mixedCalls('/property-downlink-capabilities')).toHaveLength(1);expect(w.text()).toContain('尚未上报混合列表');action=await openMixed(w,'CLOUD_UPDATE','{"private_mixed":[9007199254740993,true]}');await action.findAll('button').find(row=>row.text()==='提交')!.trigger('click');await vi.waitFor(()=>expect(mixedCalls('/platform-properties/cloud')).toHaveLength(1));expect(mixedCalls('/platform-properties/cloud')[0]![1].rawBody).toBe(`{"expectedModelVersionId":"${version}","properties":{"private_mixed":[9007199254740993,true]}}`);await flushPromises();action=await openMixed(w,'DOWNLINK','{"visible":2}');await action.findAll('button').find(row=>row.text()==='提交')!.trigger('click');await vi.waitFor(()=>expect(mixedCalls('/platform-properties/downlink')).toHaveLength(2));expect(mixedCalls('/platform-properties/downlink')[1]![1].rawBody).toBe(`{"expectedModelVersionId":"${version}","properties":{"visible":2}}`);expect(mixedCalls('/property-downlink-capabilities')).toHaveLength(1)}finally{w.unmount()}
 })
 it('混合下行关闭/零条/多条/错误摘要/读取失败均零POST，多连接提示重新连接',async()=>{
  for(const mode of ['OFF','EMPTY','MULTIPLE','DIGEST','FAILED'] as const){const fixture=mixedFixture();if(mode==='OFF')fixture.sendEnabled=false;if(mode==='EMPTY')fixture.declarations=[];if(mode==='MULTIPLE')fixture.declarations=[...fixture.declarations,{...fixture.declarations[0]!,capabilityId:'019a0a00-0000-7000-8000-000000000002',connectionTicketId:'00000000-0000-4000-8000-000000000010'}];if(mode==='DIGEST')fixture.declarations=[{...fixture.declarations[0]!,schemaDigest:'b'.repeat(64)}];if(mode==='FAILED')fixture.failRead=true;state.api.mockClear();const w=render();try{await flushPromises();const action=await openMixed(w);await action.findAll('button').find(row=>row.text()==='提交')!.trigger('click');await flushPromises();expect(mixedCalls('/platform-properties/downlink')).toHaveLength(0);expect(mixedCalls('/property-downlink-capabilities')).toHaveLength(1);expect(action.text()).toContain(mode==='MULTIPLE'?'多个连接，请重新连接':mode==='FAILED'?'暂时无法确认设备连接':'当前设备');expect(action.findAll('button').find(row=>row.text()==='提交')!.attributes('disabled')).toBeUndefined()}finally{w.unmount()}}
 })
 it('混合下行UNKNOWN固定原key/hash/声明不重查或重发，模型修订在首次POST前改变则零写',async()=>{
  const fixture=mixedFixture();fixture.unknown=true;let w=render();try{await flushPromises();const action=await openMixed(w);await action.findAll('button').find(row=>row.text()==='提交')!.trigger('click');await vi.waitFor(()=>expect(action.text()).toContain('本次操作不能再次提交'));const write=mixedCalls('/platform-properties/downlink')[0]!,rawBody=write[1].rawBody as string,key=write[1].headers['Idempotency-Key'];fixture.declarations=[{...fixture.declarations[0]!,capabilityId:'019a0a00-0000-7000-8000-000000000002'}];await action.findAll('button').find(row=>row.text()==='核对原请求')!.trigger('click');await flushPromises();expect(mixedCalls('/platform-properties/downlink')).toHaveLength(1);expect(mixedCalls('/property-downlink-capabilities')).toHaveLength(1);const lookup=mixedCalls('/platform-properties/submissions/')[0]!,digest=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(rawBody));expect(lookup[1].headers).toEqual({'Original-Request-Key':key,'X-Request-Body-SHA256':Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')});expect(rawBody).toContain(fixture.capabilityId)}finally{w.unmount()}
  const fresh=mixedFixture();let release!:()=>void;fresh.hold=value=>new Promise(resolve=>{release=()=>resolve(value)});state.api.mockClear();w=render();try{await flushPromises();const action=await openMixed(w);await action.findAll('button').find(row=>row.text()==='提交')!.trigger('click');await flushPromises();fresh.changeModel();await button(w,'刷新').trigger('click');await flushPromises();release();await flushPromises();expect(mixedCalls('/platform-properties/downlink')).toHaveLength(0);expect(action.text()).toContain('设备模型已变化')}finally{w.unmount()}
 })
 it('混合下行明确拒绝后原意图仍固定声明，用户重试不替换新连接',async()=>{
  const fixture=mixedFixture();fixture.knownFailure=true;const w=render();try{await flushPromises();const action=await openMixed(w);await action.findAll('button').find(row=>row.text()==='提交')!.trigger('click');await vi.waitFor(()=>expect(action.text()).toContain('原连接已失效'));const first=mixedCalls('/platform-properties/downlink')[0]!;fixture.declarations=[{...fixture.declarations[0]!,capabilityId:'019a0a00-0000-7000-8000-000000000002'}];await action.findAll('button').find(row=>row.text()==='提交')!.trigger('click');await vi.waitFor(()=>expect(mixedCalls('/platform-properties/downlink')).toHaveLength(2));const second=mixedCalls('/platform-properties/downlink')[1]!;expect(second[1].rawBody).toBe(first[1].rawBody);expect(second[1].headers['Idempotency-Key']).toBe(first[1].headers['Idempotency-Key']);expect(mixedCalls('/property-downlink-capabilities')).toHaveLength(1)}finally{w.unmount()}
 })
})
