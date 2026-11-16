import {afterEach,beforeEach,expect,it,vi} from 'vitest'
vi.mock('../../src/features/rules/RuleFunctionCodeEditor.vue',()=>({default:{props:['modelValue','ariaLabel','disabled','readonly'],emits:['update:modelValue','busy'],template:'<el-input :model-value="modelValue" :aria-label="ariaLabel" :disabled="disabled" :readonly="readonly" type="textarea" @update:model-value="$emit(\'update:modelValue\',$event)"/>'}}))
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {computed,shallowRef} from 'vue'
import ElementPlus from 'element-plus'
import {changeIdentity,setAccessToken} from '../../src/core/http'
import {session} from '../../src/core/session'
import DataPropertyFunctionDialog from '../../src/features/rules/DataPropertyFunctionDialog.vue'
import DataDownlinkFunctionDialog from '../../src/features/rules/DataDownlinkFunctionDialog.vue'
import {deviceDataSourceContextKey,type DeviceDataSourceContext} from '../../src/features/rules/device-data-source-context'
import type {DeviceDataPreviewSelection} from '../../src/features/rules/use-device-data-preview-sample'
import {decodeTypeProfile} from '../../src/features/device-types/profile-api'
import type {DataStreamItem} from '../../src/features/device-types/data-stream-publication-api'
import {previewDataPropertyFunction} from '../../src/features/rules/data-property-preview-api'
import {previewDataDownlinkFunction} from '../../src/features/rules/data-downlink-function-api'
import {previewGatewayDataParser} from '../../src/features/rules/gateway-data-parser-api'
import {previewModbusRtuParser,normalizeModbusRtuParser} from '../../src/features/rules/modbus-rtu-parser-api'
import {previewSubdeviceModbusRtuParser,normalizeSubdeviceModbusRtuParser} from '../../src/features/rules/subdevice-modbus-rtu-parser-api'

const project='20000000-0000-4000-8000-000000000001',first='10000000-0000-4000-8000-000000000001',second='10000000-0000-4000-8000-000000000002',foreign='10000000-0000-4000-8000-000000000099',typeA='30000000-0000-4000-8000-000000000001',typeB='30000000-0000-4000-8000-000000000002'
const input:DataStreamItem={identifier:'raw',name:'输入',format:'HEX'},output:DataStreamItem={identifier:'out',name:'输出',format:'TEXT'}
const code='module.exports = function(identifier, data) { return {temperature:25.5}; };'
const native=normalizeModbusRtuParser({slaveAddress:1,functionCode:3,dataBytes:4,crc:'CRC16_MODBUS',useSubdeviceAddress:false,fields:[{propertyKey:'temperature',offset:0,dataType:'FLOAT32_BE',coefficient:'1'}]})
function context(streamA:DataStreamItem=input,streamB:DataStreamItem=input):DeviceDataSourceContext{
 const profile=(id:string)=>decodeTypeProfile({type:{id,projectId:project,name:id,deviceKind:'DIRECT',networkType:'WIFI',payloadProtocol:'STANDARD',status:'PUBLISHED'},description:null,tags:{},revision:'1',profileToken:'a'.repeat(64)},project,id)
 return{deviceSource:{kind:'DEVICE',referenceId:null,referenceIds:[first,second]},members:[{deviceId:first,name:'设备甲',deviceTypeId:typeA,profile:profile(typeA),streams:[streamA,output]},{deviceId:second,name:'设备乙',deviceTypeId:typeB,profile:profile(typeB),streams:[streamB,output]}]}
}
let wrapper:VueWrapper|undefined
beforeEach(()=>{changeIdentity();setAccessToken('preview-fixture');session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['rule:manage']};session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}]})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];vi.unstubAllGlobals();changeIdentity();document.body.innerHTML=''})

/** HTTP为明确合成响应，只核整来源和实际样例传输，真实codec/权限资格由后台定向验证承接。 */
it('五类DEVICE预览携带完整来源和非首成员，子设备内外样例一致，旧TYPE请求保持',async()=>{
 const calls:{path:string;body:Record<string,unknown>}[]=[]
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
  const path=String(url);calls.push({path,body:JSON.parse(String(init?.body))})
  if(path.endsWith('/subdevice-modbus-rtu'))return Response.json({matched:true,reason:'MATCHED',attributesJson:'{"temperature":25.5}',binding:{bindingId:foreign,gatewayDeviceId:project,subDeviceId:second,subDeviceTypeId:typeB,subDeviceAddress:'1',addressRevision:'9007199254740993'},effectiveSlaveAddress:1})
  if(path.endsWith('/modbus-rtu'))return Response.json({matched:true,reason:'MATCHED',attributesJson:'{"temperature":25.5}'})
  if(path.endsWith('/gateway'))return Response.json({outputJson:'{"01":{"temperature":25.5}}',targetCount:1})
  if(path.endsWith('/downlink'))return Response.json({outputJson:'{"type":"text","msg":"ON"}',format:'TEXT',payloadBase64:'T04=',payloadBytes:2})
  return Response.json({attributesJson:'{"temperature":25.5}'})
 }))
 const ctx=context(),selection:DeviceDataPreviewSelection={context:ctx,member:ctx.members[1]!},scope={projectId:project,deviceTypeId:typeB,scopeKey:'members'},bytes=Uint8Array.of(1)
 await previewDataPropertyFunction(scope,'DATA_OPERATIONS_V1',input,code,bytes,undefined,()=>true,undefined,undefined,selection)
 await previewDataDownlinkFunction(scope,'raw',code,bytes,()=>true,undefined,{input,target:output},selection)
 await previewGatewayDataParser(scope,input,code,bytes,undefined,()=>true,undefined,selection)
 await previewModbusRtuParser(scope,'raw',native,'01 03 04 00 00 00 00 00 00',()=>true,undefined,selection)
 await previewSubdeviceModbusRtuParser(scope,'raw',normalizeSubdeviceModbusRtuParser({...native,useSubdeviceAddress:true}),'01 03 04 00 00 00 00 00 00',second,()=>true,undefined,selection)
 expect(calls).toHaveLength(5)
 for(const call of calls){expect(call.path).toContain('/message-rules/data-parser-previews/');expect(call.body.deviceSource).toEqual(ctx.deviceSource);expect(call.body.sampleDeviceId).toBe(second);expect(call.body).not.toHaveProperty('deviceTypeId')}
 expect((calls[1]!.body.content as Record<string,unknown>).targetStreamIdentifier).toBe('out');expect((calls[4]!.body.content as Record<string,unknown>).subDeviceId).toBe(second)
 const wrong={context:ctx,member:{...ctx.members[1]!,deviceId:foreign}}
 await expect(previewGatewayDataParser(scope,input,code,bytes,undefined,()=>true,undefined,wrong)).rejects.toThrow()
 await expect(previewSubdeviceModbusRtuParser(scope,'raw',normalizeSubdeviceModbusRtuParser({...native,useSubdeviceAddress:true}),'01',first,()=>true,undefined,selection)).rejects.toThrow();expect(calls).toHaveLength(5)
 await previewDataPropertyFunction(scope,'DATA_OPERATIONS_V1',input,code,bytes,undefined,()=>true)
 expect(calls[5]!.path).toContain(`/device-types/${typeB}/data-parser-previews/property`);expect(calls[5]!.body).not.toHaveProperty('deviceSource');expect(calls[5]!.body.streamIdentifier).toBe('raw')
})

it('DEVICE弹窗不默认选样例，使用所选成员的真实Topic参数，来源变化抛弃晚到输出',async()=>{
 const a:DataStreamItem={...input,mqttTopics:{profile:'TL_TEMPLATE_TOPIC_PAIR_V1',publishTopic:'data/source/{first_id}',subscribeTopic:'data/target/{first_id}'}},b:DataStreamItem={...input,mqttTopics:{profile:'TL_TEMPLATE_TOPIC_PAIR_V1',publishTopic:'data/source/{second_id}',subscribeTopic:'data/target/{second_id}'}}
 const state=shallowRef(context(a,b)),calls:Record<string,unknown>[]=[];let complete:(value:Response)=>void=()=>undefined
 vi.stubGlobal('fetch',vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{calls.push(JSON.parse(String(init?.body)));return new Promise<Response>(resolve=>{complete=resolve})}))
 wrapper=mount(DataPropertyFunctionDialog,{props:{projectId:project,typeId:'',scopeKey:'members',stream:a,inputProfile:'DATA_OPERATIONS_V1'},attachTo:document.body,global:{plugins:[ElementPlus],provide:{[deviceDataSourceContextKey as symbol]:computed(()=>state.value)}}})
 await flushPromises()
 const click=async(text:string)=>{const button=Array.from(document.body.querySelectorAll('button')).find(node=>node.textContent?.trim()===text);expect(button).toBeDefined();button!.click();await flushPromises()}
 await click('测试云函数');expect(calls).toHaveLength(0)
 const picker=wrapper.findAllComponents({name:'ElSelect'}).find(node=>node.attributes('aria-label')==='选择模拟的设备'||node.props('ariaLabel')==='选择模拟的设备')!;expect(picker).toBeDefined();expect(picker.props('modelValue')).toBe('')
 picker.vm.$emit('update:modelValue',second);await flushPromises()
 const field=document.body.querySelector('[aria-label="属性模拟Topic参数 second_id"]') as HTMLInputElement;expect(field).not.toBeNull();expect(document.body.querySelector('[aria-label="属性模拟Topic参数 first_id"]')).toBeNull();field.value='chosen';field.dispatchEvent(new Event('input',{bubbles:true}))
 const sample=document.body.querySelector('[aria-label="属性模拟上报数据"]') as HTMLTextAreaElement;sample.value='01';sample.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises();await click('测试');expect(calls).toHaveLength(1)
 expect(calls[0]!.deviceSource).toEqual(state.value.deviceSource);expect(calls[0]!.sampleDeviceId).toBe(second);expect((calls[0]!.content as Record<string,unknown>).params).toEqual({second_id:'chosen'})
 state.value=context(a,b);await flushPromises();complete(Response.json({attributesJson:'{"private":"late"}'}));await flushPromises()
 expect(document.body.querySelector('[aria-label="属性模拟输出"]')).toBeNull();expect(picker.props('modelValue')).toBe('');expect(calls).toHaveLength(1)
})

it('配置下行流不依赖模拟设备，原站输入建议可直接手填且blur不丢，保存不发送预览请求',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const state=shallowRef(context())
 wrapper=mount(DataDownlinkFunctionDialog,{props:{projectId:project,typeId:'',scopeKey:'members-config',streamIdentifier:'raw',streams:[input,output]},attachTo:document.body,global:{plugins:[ElementPlus],provide:{[deviceDataSourceContextKey as symbol]:computed(()=>state.value)}}})
 await flushPromises()
 const field=document.body.querySelector('[aria-label="下行目标数据流"]') as HTMLInputElement;expect(field).not.toBeNull();field.focus()
 await vi.waitFor(()=>expect(Array.from(document.body.querySelectorAll('.el-autocomplete-suggestion li')).some(row=>row.textContent?.includes('out'))).toBe(true))
 field.value='p3_source_reply_1101';field.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises();field.blur();await flushPromises();expect(field.value).toBe('p3_source_reply_1101')
 const click=async(text:string)=>{const node=Array.from(document.body.querySelectorAll('button')).find(button=>button.textContent?.trim()===text);expect(node).toBeDefined();node!.click();await flushPromises()}
 await click('测试云函数');expect(field.value).toBe('p3_source_reply_1101')
 const picker=wrapper.findAllComponents({name:'ElSelect'}).find(node=>node.attributes('aria-label')==='选择模拟的设备'||node.props('ariaLabel')==='选择模拟的设备')!;expect(picker.props('modelValue')).toBe('');picker.vm.$emit('update:modelValue',second);await flushPromises();expect(field.value).toBe('p3_source_reply_1101');picker.vm.$emit('update:modelValue','');await flushPromises()
 const mqtt=document.body.querySelector('input[type="radio"][value="MQTT"]') as HTMLInputElement;expect(mqtt).not.toBeNull();mqtt.click();await flushPromises();await click('保存')
 expect(wrapper.emitted('save')).toHaveLength(1);expect(wrapper.emitted('save')![0]![0]).toMatchObject({protocol:'MQTT',streamIdentifier:'p3_source_reply_1101'});expect(fetch).not.toHaveBeenCalled()
})

it('旧文本组合预览携同一输入约定，DEVICE非首样例完整来源及TYPE旧口保留，错误合同不发HTTP',async()=>{
 const plain:DataStreamItem={...input,format:'TEXT'},literal:DataStreamItem={...plain,mqttTopics:{profile:'TL_LITERAL_TOPIC_PAIR_V1',publishTopic:'data/in',subscribeTopic:'data/out'}},template:DataStreamItem={...plain,mqttTopics:{profile:'TL_TEMPLATE_TOPIC_PAIR_V1',publishTopic:'data/in/{part}',subscribeTopic:'data/out/{part}'}}
 const calls:{path:string;body:Record<string,unknown>}[]=[];vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{calls.push({path:String(url),body:JSON.parse(String(init?.body))});return Response.json({attributesJson:'{"reading":1}'})}))
 const ctx=context(plain,literal),selection:DeviceDataPreviewSelection={context:ctx,member:ctx.members[1]!},scope={projectId:project,deviceTypeId:typeB,scopeKey:'legacy-text'},bytes=new TextEncoder().encode('{"reading":1}'),source='module.exports = function(identifier,data) { return JSON.parse(data.toString("utf8")); };\r\n'
 await previewDataPropertyFunction(scope,'DATA_OPERATIONS_V1',literal,source,bytes,undefined,()=>true,undefined,undefined,selection,'LEGACY_TEXT_V1');expect(calls[0]!.body.deviceSource).toEqual(ctx.deviceSource);expect(calls[0]!.body.sampleDeviceId).toBe(second);expect(calls[0]!.body.content).toMatchObject({inputProfile:'DATA_OPERATIONS_V1',inputContract:'LEGACY_TEXT_V1',source});expect(calls[0]!.body.content).not.toHaveProperty('params')
 await previewDataPropertyFunction(scope,'DATA_OPERATIONS_V1',plain,source,bytes,undefined,()=>true,undefined,undefined,undefined,'LEGACY_TEXT_V1');expect(calls[1]!.path).toContain(`/device-types/${typeB}/data-parser-previews/property`);expect(calls[1]!.body.inputContract).toBe('LEGACY_TEXT_V1')
 await previewDataPropertyFunction(scope,'LEGACY_SINGLE',plain,source,bytes,undefined,()=>true);expect(calls[2]!.body).not.toHaveProperty('inputContract');await previewDataPropertyFunction(scope,'DATA_OPERATIONS_V1',input,source,bytes,undefined,()=>true);expect(calls[3]!.body).not.toHaveProperty('inputContract')
 for(const [inputProfile,stream,params] of [['LEGACY_SINGLE',plain,undefined],['DATA_OPERATIONS_V1',template,undefined],['DATA_OPERATIONS_V1',input,undefined],['DATA_OPERATIONS_V1',plain,{}]] as const)await expect(previewDataPropertyFunction(scope,inputProfile,stream,source,bytes,params,()=>true,undefined,undefined,undefined,'LEGACY_TEXT_V1')).rejects.toThrow();expect(calls).toHaveLength(4)
})
