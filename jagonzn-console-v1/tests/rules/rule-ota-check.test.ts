import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {setAccessToken,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
import {readRuleOtaVersionProperties} from '../../src/features/rules/rule-ota-version-properties'
import RuleOtaCheckDialog from '../../src/features/rules/RuleOtaCheckDialog.vue'
const project='10000000-0000-4000-8000-000000000001',one='20000000-0000-4000-8000-000000000001',two='20000000-0000-4000-8000-000000000002',typeOne='30000000-0000-4000-8000-000000000001',typeTwo='30000000-0000-4000-8000-000000000002',vOne='40000000-0000-4000-8000-000000000001',vTwo='40000000-0000-4000-8000-000000000002',vLatest='40000000-0000-4000-8000-000000000003'
const source={kind:'DEVICE' as const,referenceId:null,referenceIds:[one,two]},typeSource={kind:'DEVICE_TYPE' as const,referenceId:typeOne}
const version=(type:string,id:string)=>({id,deviceTypeId:type,versionNumber:'1.0.0',changeLevel:'MINOR',schemaDigest:'a'.repeat(64),digestAlgorithm:'PG_JSONB_TEXT_V1_SHA256',publishedAt:'2026-11-01T00:00:00Z'})
const definition=(dataType='TEXT',accessType='REPORT')=>({dataType,accessType})
const model=(properties:Record<string,unknown>)=>({properties,events:{},commands:{}})
let wrapper:VueWrapper|undefined,calls:string[],deny=false,badBinding=false,resolveLatest:((value:Response)=>void)|undefined,holdLatest=false
async function fetcher(input:RequestInfo|URL){
 const path=new URL(String(input),'http://localhost').pathname;calls.push(path)
 if(path.endsWith('/thing-model-versions/latest')){if(holdLatest)return new Promise<Response>(resolve=>{resolveLatest=resolve});if(deny)return Response.json({message:'物模型读取已失权'},{status:403});return Response.json(version(typeOne,vLatest))}
 if(path.endsWith('/devices/'+one+'/thing-model-binding'))return Response.json({deviceId:badBinding?two:one,deviceTypeId:typeOne,version:version(typeOne,vOne)})
 if(path.endsWith('/devices/'+two+'/thing-model-binding'))return Response.json({deviceId:two,deviceTypeId:typeTwo,version:version(typeTwo,vTwo)})
 if(path.endsWith('/thing-model-versions/'+vOne))return Response.json({version:version(typeOne,vOne),modelSnapshot:model({'-version_1':definition(),onlyOne:definition(),downOnly:definition('TEXT','PUSH'),numberVersion:definition('NUMBER'),withoutAccess:{dataType:'TEXT'}})})
 if(path.endsWith('/thing-model-versions/'+vTwo))return Response.json({version:version(typeTwo,vTwo),modelSnapshot:model({'-version_1':definition('TEXT','SHARED'),onlyTwo:definition()})})
 if(path.endsWith('/thing-model-versions/'+vLatest))return Response.json({version:version(typeOne,vLatest),modelSnapshot:model({latestVersion:definition('TEXT','UNDEFINED')})})
 throw new Error('不允许候选读取扫描其它接口 '+path)
}
beforeEach(()=>{changeIdentity();setAccessToken('ota-candidate-fixture');session.user={accountId:project,currentProjectId:project,permissions:['rule:manage']};session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}];calls=[];deny=false;badBinding=false;holdLatest=false;resolveLatest=undefined;vi.stubGlobal('fetch',vi.fn(fetcher))})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;setAccessToken('');vi.unstubAllGlobals();document.body.innerHTML=''})
it('OTA候选逐DEVICE固定CURRENT快照取交集，TYPE只读最新发布，不扫描shadow或首设备替代全集',async()=>{
 const keys=await readRuleOtaVersionProperties(project,source,new AbortController().signal);expect(keys).toEqual(['-version_1']);expect(calls.filter(path=>path.endsWith('/thing-model-binding'))).toHaveLength(2);expect(calls.some(path=>path.endsWith('/latest'))).toBe(false)
 calls=[];expect(await readRuleOtaVersionProperties(project,typeSource,new AbortController().signal)).toEqual(['latestVersion']);expect(calls).toHaveLength(2);expect(calls.some(path=>path.includes('/devices/'))).toBe(false)
 badBinding=true;await expect(readRuleOtaVersionProperties(project,source,new AbortController().signal)).rejects.toThrow('当前物模型绑定不可用');expect(calls.some(path=>/shadow|devices\/search/.test(path))).toBe(false)
})
it('OTA两字段允许候选失权后手填，非main明确拒绝，来源切换abort并拒绝晚到候选',async()=>{
 deny=true;wrapper=mount(RuleOtaCheckDialog,{props:{action:{id:'ota-one',nodeType:'event-ota-check-action',config:{versionProperty:'old',module:'main'}},source:typeSource},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises();expect(document.body.textContent).toContain('物模型读取已失权');expect(document.body.textContent).toContain('可手动填写版本属性')
 const input=(label:string)=>document.body.querySelector<HTMLInputElement>('input[aria-label="'+label+'"]')!
 const set=async(label:string,value:string)=>{const target=input(label);expect(target).toBeTruthy();target.value=value;target.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises()}
 const save=()=>Array.from(document.body.querySelectorAll('button')).find(button=>button.textContent?.trim()==='保存')!
 await set('版本属性','-version_1');await set('模块','other');save().click();await flushPromises();expect(wrapper.emitted('save')).toBeUndefined();expect(document.body.textContent).toContain('当前仅支持 main')
 await set('模块','main');save().click();await flushPromises();expect(wrapper.emitted('save')![0]).toEqual([{id:'ota-one',nodeType:'event-ota-check-action',config:{versionProperty:'-version_1',module:'main'}}])
 holdLatest=true;await wrapper.setProps({action:{id:'ota-two',nodeType:'event-ota-check-action',config:{versionProperty:'',module:'main'}}});await flushPromises();expect(resolveLatest).toBeTypeOf('function');await wrapper.setProps({source});await flushPromises();const autocomplete=wrapper.findComponent({name:'ElAutocomplete'}),suggest=autocomplete.props('fetchSuggestions') as (query:string,done:(values:{value:string}[])=>void)=>void;let choices:{value:string}[]=[];suggest('',values=>choices=values);expect(choices).toEqual([{value:'-version_1'}]);resolveLatest!(Response.json(version(typeOne,vLatest)));await flushPromises();suggest('',values=>choices=values);expect(choices).toEqual([{value:'-version_1'}]);changeIdentity();await flushPromises();suggest('',values=>choices=values);expect(choices).toEqual([]);expect(input('版本属性').value).toBe('');expect(wrapper.emitted('busy')?.at(-1)).toEqual([false])
})
