import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {h} from 'vue'
import {createMemoryHistory,createRouter,RouterView,type Router} from 'vue-router'
import {createHash,webcrypto} from 'node:crypto'
import ElementPlus from 'element-plus'
import {session} from '../../src/core/session'
import {changeIdentity,setAccessToken} from '../../src/core/http'
import {ruleRoutes} from '../../src/features/rules/routes'
import {normalizeModbusRtuParser,modbusRtuSourceFormat,validModbusCoefficient} from '../../src/features/rules/modbus-rtu-parser-api'
import {readRawRuleJson} from '../../src/features/rules/raw-rule-json'
import {controlFixture,project,device,rule} from '../rules/preprocess-control.fixture'
const type='70000000-0000-4000-8000-000000000001'
/** Official Source doc screenshot/receipt, source-normal-readonly/official-rtu-material-receipt.json.
 * These are public example frame/config values. HTTP below is synthetic; it does not run the production codec. */
const coilFrame='01 01 01 85 90 2b',inputFrame='01 02 01 85 60 2b',inputBadCrc='01 02 01 85 60 2c'
const coilAttributes='{"coil0":true,"coil2":true,"coil3":false,"coil7":true}',inputAttributes='{"input0":true,"input2":true,"input3":false,"input7":true}'
const frame='05 03 18 43 62 66 66 3E 15 81 06 3C 8B 43 96 00 00 00 00 3D 07 2B 02 3F 03 D7 0A FB B6'
// Mixed integer/float UI response uses the same public frame; synthetic HTTP, not codec qualification.
const mixedAttributes='{"U":0,"I":55050,"P":0,"Q":0,"S":0.033,"PF":0.515}'
const attributes='{"U":226.4,"I":0.146,"P":0.017,"Q":0,"S":0.033,"PF":0.515}'
const streams=[{identifier:'raw_hex',name:'原HEX',format:'HEX'},{identifier:'raw_json',name:'原JSON',format:'JSON'},{identifier:'sensor_text',name:'文本',format:'TEXT'}]
let w:VueWrapper|undefined,router:Router,fixture:ReturnType<typeof controlFixture>,nativeParser:unknown,followupFailure:boolean,active:boolean,formatOverride:string|undefined
let previewCalls:{body:string;signal?:AbortSignal}[],holdPreview:((response:Response)=>Promise<Response>)|undefined,observed:{path:string;method:string}[]
const dom=()=>new DOMWrapper(document.body)
function version(){const source=JSON.stringify(nativeParser),sha=createHash('sha256').update(source).digest('hex');return JSON.stringify({id:fixture.state.versionId,versionNumber:Number(fixture.state.versionNumber),source,sourceSha256:sha,createdBy:project,createdAt:'2026-10-30T00:00:00Z',actions:[],deviceSource:{kind:'DEVICE_TYPE',referenceId:type},preprocessing:null,sourceFormat:formatOverride??modbusRtuSourceFormat(normalizeModbusRtuParser(nativeParser)),streamIdentifier:'raw_hex',nativeParser})}
async function fetcher(input:RequestInfo|URL,init?:RequestInit){
 const url=new URL(String(input)),path=url.pathname,method=init?.method??'GET';observed.push({path,method})
 if(path===`/api/v1/projects/${project}/device-types/${type}`)return fixture.response(JSON.stringify({id:type,projectId:project,name:'RTU验收类型'}))
 if(path===`/api/v1/projects/${project}/device-types/${type}/profile`)return fixture.response(JSON.stringify({type:{id:type,projectId:project,name:'RTU验收类型',deviceKind:'DIRECT',networkType:'WIFI',payloadProtocol:'STANDARD',status:'DRAFT'},description:null,tags:{},revision:'0',profileToken:'a'.repeat(64)}))
 if(path.endsWith('/data-stream-publication'))return fixture.response(JSON.stringify({revision:'1',publication:{publicationId:device,schemaProfile:'TL_DATA_STREAM_DEFINITION_V1',digestAlgorithm:'PG_JSONB_TEXT_V1_SHA256',definitionDigest:'c'.repeat(64),definition:{streams,tcpStreamIdentifier:null},publishedAt:'2026-10-30T00:00:00Z',activation:'NEXT_CONNECTION',managementDetails:streams.map(s=>({identifier:s.identifier,description:null,createdAt:null}))}}))
 if(method==='POST'&&path.endsWith('/data-parser-previews/modbus-rtu')){
  previewCalls.push({body:String(init?.body),signal:init?.signal??undefined});const body=JSON.parse(String(init?.body)),coil=body.nativeParser.functionCode===1&&body.hex===coilFrame,inputState=body.nativeParser.functionCode===2&&(body.hex===inputFrame||body.nativeParser.crc==='NONE'&&body.hex===inputBadCrc),numeric=body.nativeParser.functionCode>=3&&body.hex===frame,matched=coil||inputState||numeric;const response=fixture.response(JSON.stringify({matched,reason:matched?'MATCHED':'REJECTED',attributesJson:coil?coilAttributes:inputState?inputAttributes:numeric?(body.nativeParser.fields.some((row:{dataType:string})=>row.dataType!=='FLOAT32_BE')?mixedAttributes:attributes):'{}'}));return holdPreview?holdPreview(response):response
 }
 if(method==='POST'&&path.endsWith('/preprocessors')){
  fixture.state.calls.push({path,method,body:String(init?.body),headers:new Headers(init?.headers)});const body=JSON.parse(String(init?.body));expect(body.functions).toBeUndefined();nativeParser=body.nativeParser;fixture.state.created=true;fixture.state.name=body.name;fixture.state.description=body.description||null;fixture.state.tags=body.tags;fixture.state.preprocessing='null';if(followupFailure)fixture.state.readError=503;return fixture.response(fixture.header(),201)
 }
 if(method==='POST'&&path.endsWith('/activate')){fixture.state.calls.push({path:path+url.search,method,body:String(init?.body??''),headers:new Headers(init?.headers)});expect(url.searchParams.get('expectedVersion')).toBe('1');active=true;fixture.state.version='2';return fixture.response(fixture.header().replace('"status":"PAUSED"','"status":"ACTIVE"'))}
 if(method==='GET'&&fixture.state.readError)return fixture.response('{"message":"后继读取失败"}',fixture.state.readError)
 if(nativeParser&&path.endsWith('/version-history'))return fixture.response('{"items":['+version()+'],"nextCursor":null}')
 if(nativeParser&&path.includes('/versions/'))return fixture.response(version())
 let response=await fixture.fetcher(input,init)
 if(active&&path===`/api/v1/projects/${project}/message-rules/${rule}`)response=fixture.response((await response.text()).replace('"status":"PAUSED"','"status":"ACTIVE"'))
 return response
}
async function render(){router=createRouter({history:createMemoryHistory(),routes:[...ruleRoutes,{path:'/device-types/:id',component:{render:()=>h('p','类型消息规则页')}},{path:'/away',component:{render:()=>h('p','已离开')}}]});await router.push(`/rules/messages/create?source=device-type&deviceTypeId=${type}`);await router.isReady();w=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await flushPromises();return w}
function button(label:string){const dialogs=[...document.querySelectorAll<HTMLElement>('.el-dialog')].filter(node=>node.closest<HTMLElement>('.el-overlay')?.style.display!=='none'),dialog=dialogs[dialogs.length-1],all=new DOMWrapper(dialog??document.body).findAll('button');const found=all.find(b=>b.text()===label||b.attributes('aria-label')===label);expect(found,label).toBeDefined();return found!}
async function start(identifier='raw_hex'){await dom().get('[aria-label="规则名称"]').setValue('原生RTU解析');await dom().get('[role="radio"][aria-label="自定义上报"]').trigger('click');await dom().get('[aria-label="自定义数据流标识符"]').setValue(identifier);await flushPromises();await button('下一步').trigger('click');await flushPromises()}
async function open(){await button('添加操作').trigger('click');await flushPromises();await button('Modbus RTU解析').trigger('click');await flushPromises();await vi.waitFor(()=>expect(dom().find('[aria-label="RTU从机地址"]').exists()).toBe(true))}
async function official(){await dom().get('[aria-label="RTU从机地址"]').setValue('5');await dom().get('[aria-label="RTU数据字节数"]').setValue('24');for(let i=0;i<6;i++){if(i)await button('添加数据').trigger('click');await dom().get(`[aria-label="RTU起始字节位 ${i+1}"]`).setValue(String(i*4));await dom().get(`[aria-label="RTU生成属性 ${i+1}"]`).setValue(['U','I','P','Q','S','PF'][i]!)}await button('测试规则').trigger('click');await dom().get('[aria-label="RTU上报消息"]').setValue(frame)}
async function changeFunction(code:number){const select=w!.findAllComponents({name:'ElSelect'}).find(c=>c.props('ariaLabel')==='RTU功能码')!;select.vm.$emit('update:modelValue',code);await flushPromises()}
async function coils(prefix:'coil'|'input'){for(const [index,offset] of [0,2,3,7].entries()){if(index)await button('添加数据').trigger('click');await dom().get(`[aria-label="RTU线圈地址 ${index+1}"]`).setValue(String(offset));await dom().get(`[aria-label="RTU生成属性 ${index+1}"]`).setValue(prefix+offset)}}
const writes=()=>fixture.state.calls.filter(c=>c.method!=='GET')
beforeEach(()=>{changeIdentity();setAccessToken('native-rtu-fixture');session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','rule:manage']};session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}];fixture=controlFixture();nativeParser=undefined;followupFailure=false;active=false;formatOverride=undefined;previewCalls=[];observed=[];holdPreview=undefined;vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('fetch',vi.fn(fetcher))})
afterEach(()=>{w?.unmount();w=undefined;session.user=null;session.projects=[];vi.unstubAllGlobals();changeIdentity();document.body.innerHTML=''})
it('Native RTU创建未知后继续启用并回到类型详情',async()=>{
 await render();await start();await open();await official();await button('模拟解析').trigger('click');await flushPromises();await button('保存').trigger('click');await vi.waitFor(()=>expect(dom().text()).toContain('Modbus RTU 解析'))
 followupFailure=true;await button('创建').trigger('click');await vi.waitFor(()=>expect(dom().text()).toContain('创建结果尚未完整核对'));expect(writes()).toHaveLength(1)
 fixture.state.readError=0;await button('读取原规则核对').trigger('click');await vi.waitFor(()=>expect(button('继续完成启用')).toBeDefined());await button('继续完成启用').trigger('click');await vi.waitFor(()=>expect(router.currentRoute.value.path).toBe(`/device-types/${type}`));expect(writes()).toHaveLength(2)
})
it('Native RTU仅HEX互斥CommonJS，非法系数本地拒，预览在途锁父导航并在身份晚回清空',async()=>{
 for(const value of ['1\n','1\r\n'])expect(validModbusCoefficient(value)).toBe(false)
 await render();await start('raw_json');expect(dom().findAll('button').some(b=>b.text()==='Modbus RTU解析')).toBe(false);await button('添加操作').trigger('click');await flushPromises();expect(dom().findAll('button').some(b=>b.attributes('aria-label')==='Modbus RTU解析')).toBe(false);await button('属性解析函数').trigger('click');await flushPromises();expect((dom().get('[aria-label="属性解析函数"]').element as HTMLTextAreaElement).value).toContain('function(identifier, data)');{const ds=document.querySelectorAll('.el-dialog'),d=ds[ds.length-1];[...d.querySelectorAll('button')].find(x=>x.textContent?.trim()==='保存')!.click()}await flushPromises();await button('移除操作').trigger('click');await button('上一步').trigger('click');await dom().get('[aria-label="自定义数据流标识符"]').setValue('raw_hex');await flushPromises();await button('下一步').trigger('click');await flushPromises();await open();await official();await dom().get('[aria-label="RTU系数 1"]').setValue('1e17');await button('模拟解析').trigger('click');await flushPromises();expect(previewCalls).toHaveLength(0);expect(dom().text()).toContain('请核对Modbus RTU解析配置');await dom().get('[aria-label="RTU系数 1"]').setValue('+1.00')
 let release!:()=>void;holdPreview=response=>new Promise(resolve=>{release=()=>resolve(response)});await button('模拟解析').trigger('click');await vi.waitFor(()=>expect(release).toBeDefined());expect(button('保存').attributes('disabled')).toBeDefined();expect(JSON.parse(previewCalls[0]!.body).nativeParser.fields[0].coefficient).toBe('+1.00');expect(await router.push('/away')).toBeTruthy();const count=observed.length;changeIdentity();release();await flushPromises();expect(observed).toHaveLength(count);expect(dom().find('[aria-label="RTU解析属性"]').exists()).toBe(false);expect(writes()).toHaveLength(0)
})
