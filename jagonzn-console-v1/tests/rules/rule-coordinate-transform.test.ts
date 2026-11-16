import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {setAccessToken,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
import {readRuleCoordinateProperties,type CoordinateTransformDraft} from '../../src/features/rules/coordinate-transform-draft'
import RuleCoordinateTransformDialog from '../../src/features/rules/RuleCoordinateTransformDialog.vue'
const project='10000000-0000-4000-8000-000000000001',one='20000000-0000-4000-8000-000000000001',two='20000000-0000-4000-8000-000000000002',typeOne='30000000-0000-4000-8000-000000000001',vOne='40000000-0000-4000-8000-000000000001',vTwo='40000000-0000-4000-8000-000000000002',vLatest='40000000-0000-4000-8000-000000000003'
const source={kind:'DEVICE' as const,referenceId:null,referenceIds:[one,two]},typeSource={kind:'DEVICE_TYPE' as const,referenceId:typeOne}
const catalog=(kind:'DEVICE'|'DEVICE_TYPE',ids:string[])=>({kind,sourceIds:ids,bindings:ids.map((sourceId,index)=>({sourceId,modelVersionId:kind==='DEVICE_TYPE'?vLatest:index===0?vOne:vTwo,name:'来源'+index})),properties:kind==='DEVICE'?[{key:'location',dataType:'OBJECT',label:'坐标'},{key:'converted',dataType:'OBJECT',label:'生成坐标'},{key:'baidu_point',dataType:'OBJECT',label:'百度坐标'},{key:'text',dataType:'TEXT',label:'文本'},{key:'x'.repeat(33),dataType:'OBJECT',label:'较长属性'}]:[{key:'latestPoint',dataType:'OBJECT',label:'发布坐标'}]})
let wrapper:VueWrapper|undefined,calls:{path:string;method:string;body:{kind:'DEVICE'|'DEVICE_TYPE';ids:string[]}}[],status=200,holdCatalog=false,resolveCatalog:((value:Response)=>void)|undefined
async function fetcher(input:RequestInfo|URL,options?:RequestInit){
 const path=new URL(String(input),'http://localhost').pathname,method=options?.method??'GET',body=JSON.parse(String(options?.body??'null'));calls.push({path,method,body})
 if(path===`/api/v1/projects/${project}/console/alarm-rule-source-properties/query`&&method.toUpperCase()==='POST'){
  if(body.kind==='DEVICE_TYPE'&&holdCatalog)return new Promise<Response>(resolve=>{resolveCatalog=resolve})
  if(body.kind==='DEVICE_TYPE'&&status!==200)return Response.json({message:status===403?'属性读取已失权':'模型暂时读取失败'},{status})
  return Response.json(catalog(body.kind,body.ids))
 }
 throw new Error('不允许候选读取扫描其它接口 '+path)
}
beforeEach(()=>{changeIdentity();setAccessToken('coordinate-candidate-fixture');session.user={accountId:project,currentProjectId:project,permissions:['rule:manage']};session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}];calls=[];status=200;holdCatalog=false;resolveCatalog=undefined;vi.stubGlobal('fetch',vi.fn(fetcher))})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;setAccessToken('');vi.unstubAllGlobals();document.body.innerHTML=''})
const input=(label:string)=>document.body.querySelector<HTMLInputElement>('input[aria-label="'+label+'"]')!
async function set(label:string,value:string){const target=input(label);expect(target).toBeTruthy();target.value=value;target.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises()}
const button=(name:string)=>Array.from(document.body.querySelectorAll('button')).find(value=>value.textContent?.trim()===name)!
function suggestions(){let result:{value:string}[]=[];const fetch=wrapper!.findComponent({name:'ElAutocomplete'}).props('fetchSuggestions') as (query:string,done:(values:{value:string}[])=>void)=>void;fetch('',values=>result=values);return result}
it('坐标转换三字段按完整来源OBJECT交集提供候选，取消保原草稿，保存只返回所选转换的本地草稿',async()=>{
 expect(await readRuleCoordinateProperties(project,source,new AbortController().signal)).toEqual(['baidu_point','converted','location']);expect(calls).toHaveLength(1);expect(calls[0]?.body).toEqual({kind:'DEVICE',ids:[one,two]})
 calls=[];expect(await readRuleCoordinateProperties(project,typeSource,new AbortController().signal)).toEqual(['latestPoint']);expect(calls).toHaveLength(1);expect(calls[0]?.body).toEqual({kind:'DEVICE_TYPE',ids:[typeOne]})
 const draft=Object.freeze<CoordinateTransformDraft>({inputProperty:'original',conversion:'WGS84_TO_GCJ02',outputProperty:'converted'})
 wrapper=mount(RuleCoordinateTransformDialog,{props:{projectId:project,source,draft},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises();expect(suggestions()).toEqual([{value:'baidu_point'},{value:'converted'},{value:'location'}]);expect(document.body.textContent).toContain('原始坐标属性');expect(document.body.textContent).toContain('生成坐标属性')
 await set('原始坐标属性','location');button('取消').click();await flushPromises();expect(wrapper.emitted('cancel')).toHaveLength(1);expect(wrapper.emitted('save')).toBeUndefined();expect(draft.inputProperty).toBe('original');wrapper.unmount();document.body.innerHTML=''
 wrapper=mount(RuleCoordinateTransformDialog,{props:{projectId:project,source,draft},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises();await set('原始坐标属性','location');await set('生成坐标属性','not_in_source');button('保存').click();await flushPromises();expect(wrapper.emitted('save')).toBeUndefined();expect(document.body.textContent).toContain('请选择当前设备来源共有的坐标属性');await set('生成坐标属性','baidu_point');document.body.querySelector<HTMLElement>('.el-select__wrapper')!.click();await flushPromises();const option=Array.from(document.body.querySelectorAll<HTMLElement>('.el-select-dropdown__item')).find(value=>value.textContent?.trim()==='GPS 转 百度坐标系')!;expect(option).toBeTruthy();option.click();await flushPromises();button('保存').click();await flushPromises();expect(wrapper.emitted('save')).toEqual([[{inputProperty:'location',conversion:'WGS84_TO_BD09',outputProperty:'baidu_point'}]]);expect(draft).toEqual({inputProperty:'original',conversion:'WGS84_TO_GCJ02',outputProperty:'converted'})
})
it('普通模型读取错误允许手填，来源变动拒绝晚到，403清私有并锁保存，身份变动不可解锁',async()=>{
 status=500;wrapper=mount(RuleCoordinateTransformDialog,{props:{projectId:project,source:typeSource},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises();expect(document.body.textContent).toContain('可手动填写属性');await set('原始坐标属性','raw');await set('生成坐标属性','point');button('保存').click();await flushPromises();expect(wrapper.emitted('save')).toHaveLength(1)
 status=200;holdCatalog=true;await wrapper.setProps({draft:{inputProperty:'pending',conversion:'WGS84_TO_GCJ02',outputProperty:'converted'}});await flushPromises();expect(resolveCatalog).toBeTypeOf('function');await wrapper.setProps({source});await flushPromises();expect(suggestions()).toEqual([{value:'baidu_point'},{value:'converted'},{value:'location'}]);expect(input('原始坐标属性').value).toBe('');resolveCatalog!(Response.json(catalog('DEVICE_TYPE',[typeOne])));await flushPromises();expect(suggestions()).toEqual([{value:'baidu_point'},{value:'converted'},{value:'location'}])
 holdCatalog=false;status=403;await wrapper.setProps({source:typeSource});await flushPromises();expect(document.body.textContent).toContain('属性读取已失权');expect(wrapper.emitted('denied')).toHaveLength(1);expect(suggestions()).toEqual([]);expect(input('原始坐标属性').value).toBe('');expect(input('生成坐标属性').value).toBe('');expect(button('保存').disabled).toBe(true);expect(wrapper.emitted('save')).toHaveLength(1);changeIdentity();await flushPromises();expect(button('保存').disabled).toBe(true);expect(wrapper.emitted('busy')?.at(-1)).toEqual([false]);button('取消').click();await flushPromises();expect(wrapper.emitted('cancel')).toHaveLength(1)
})
