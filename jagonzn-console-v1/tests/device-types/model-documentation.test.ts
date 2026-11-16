import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Documentation from '../../src/features/device-types/DeviceTypeModelDocumentation.vue'
import {createModelDocumentation,modelDocumentationFile} from '../../src/features/device-types/model-documentation'
import {decodeModelSnapshot,type ModelVersionTransport} from '../../src/features/device-types/model-version-api'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=uuid(100),type=uuid(200),other=uuid(300),version=uuid(1),older=uuid(2)
const metadata=(typeId=type,id=version)=>({id,deviceTypeId:typeId,versionNumber:id===older?'0.9.0':'1.0.0',changeLevel:'MAJOR',schemaDigest:'a'.repeat(64),digestAlgorithm:'PG_JSONB_TEXT_V1_SHA256',publishedAt:'2026-10-28T01:00:00.123456Z'})
function snapshot(typeId=type,id=version,model='{"properties":{"temperature":{"dataType":"NUMBER","accessType":"REPORT","minimum":0.10000000000000000001,"maximum":9007199254740993,"defaultValue":9007199254740993.1234567890123456789,"description":"冻结说明"}},"events":{"warning":{"level":"WARN","parameters":{"code":{"dataType":"NUMBER","required":true}}}},"commands":{"set":{"inputSchema":{"type":"object","properties":{"value":{"type":"number"}}},"outputSchema":{"type":"object"}}}}'){
 return decodeModelSnapshot(new TextEncoder().encode('{"version":'+JSON.stringify(metadata(typeId,id))+',"modelSnapshot":'+model+'}'),typeId,id)
}
const wrappers:VueWrapper[]=[]
function transport():ModelVersionTransport{return{latest:vi.fn(async(_project,typeId)=>snapshot(typeId).version),snapshot:vi.fn(async(_project,typeId,id)=>snapshot(typeId,id))}}
function render(client=transport(),status='PUBLISHED',disabled=false){const wrapper=mount(Documentation,{props:{typeId:type,typeStatus:status,transport:client,disabled},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);return wrapper}
function button(wrapper:VueWrapper,label:string){const found=wrapper.findAll('button').find(node=>node.text()===label);expect(found,label).toBeDefined();return found!}
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]})
afterEach(()=>{wrappers.splice(0).forEach(wrapper=>wrapper.unmount());session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})

it('从固定快照投影真实字段与精确数值，缺历史名称不回查当前定义',()=>{
 const document=createModelDocumentation(snapshot(),type)
 expect(document.markdown).toContain('9007199254740993.1234567890123456789');expect(document.html).toContain('9007199254740993.1234567890123456789');expect(document.html).toContain('0.10000000000000000001')
 expect(document.sections[0]!.items[0]!.fields).toContainEqual({label:'属性名称',value:'此版本未保存',missing:true});expect(document.sections[0]!.items[0]!.fields).toContainEqual({label:'流向',value:'REPORT（设备上报）'})
 expect(document.sections[1]!.items[0]!.fields).toContainEqual({label:'事件级别',value:'WARN'});expect(document.sections[1]!.items[0]!.parameters[0]!.fields).toContainEqual({label:'必填',value:'true'});expect(document.sections[2]!.items[0]!.fields.find(row=>row.label==='输入Schema')!.value).toContain('"value"')
 expect(document.html).toContain('默认值是模型声明，不代表设备当前值');expect(document.facts).toContainEqual({label:'版本ID',value:version});expect(()=>createModelDocumentation(snapshot(),other)).toThrow()
 expect(document.sections[0]!.items[0]!.fields).toContainEqual({label:'数值步进',value:'此版本未保存',missing:true})
 const declarations=createModelDocumentation(snapshot(type,version,'{"properties":{"n":{"dataType":"NUMBER","decimalPlaces":3,"numericStep":0.123456789012345678901},"text":{"dataType":"TEXT","textDefaultValue":"  hello  "}},"events":{},"commands":{}}'),type),fields=declarations.sections[0]!.items.flatMap(row=>row.fields)
 expect(fields).toContainEqual({label:'小数位数',value:'3'});expect(fields).toContainEqual({label:'数值步进',value:'0.123456789012345678901'});expect(fields).toContainEqual({label:'文本默认声明',value:'"  hello  "'});expect(declarations.html).toContain('0.123456789012345678901')
 expect(modelDocumentationFile(document,'markdown').name).toContain(`${type}-1.0.0-${version}.md`);expect(modelDocumentationFile(document,'html').mime).toBe('text/html;charset=utf-8')
 const historical=createModelDocumentation(snapshot(type,version,'{"properties":{},"events":{"old":{"level":"INFO"}},"commands":{}}'),type)
 expect(historical.html).toContain('此版本未保存事件参数');expect(historical.html).not.toContain('此版本未定义事件参数')
})
it('HTML和Markdown将注入内容只作文本，未知凭据字段不导出',()=>{
 const model=JSON.stringify({properties:{'<script>key</script>':{dataType:'TEXT',name:'<img src=x onerror="alert(1)">',description:'</pre><script>alert(2)</script> [x](javascript:alert(3))',deviceSecret:'not-a-document-field'}},events:{},commands:{}})
 const document=createModelDocumentation(snapshot(type,version,model),type),page=new DOMParser().parseFromString(document.html,'text/html')
 expect(page.querySelectorAll('script,img,iframe,a,link,form')).toHaveLength(0);expect(page.body.textContent).toContain('<img src=x onerror="alert(1)">');expect(page.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content')).toContain("default-src 'none'")
 expect(document.markdown).not.toContain('<script>');expect(document.markdown).not.toContain('[x](javascript:');expect(document.html+document.markdown).not.toContain('not-a-document-field')
})
it('逐字段展示冻结图标颜色枚举与子字段说明，不导出未知展示资料或未定义键',()=>{
 const model=JSON.stringify({properties:{mode:{dataType:'ENUM',enum:['ready','stop'],presentation:{iconId:'alarm',color:'#123abc',enumDescriptions:{ready:'待机状态',stop:'停止状态',credential:'unknown-enum-secret'},objectFields:{},productSecret:'unknown-presentation-secret'}},details:{dataType:'OBJECT',schema:{type:'object',properties:{temperature:{type:'number'}}},presentation:{iconId:'device',color:null,enumDescriptions:{},objectFields:{temperature:{name:'温度名称',description:'冻结子字段备注',deviceSecret:'unknown-child-secret'},credential:{name:'unknown-object-secret',description:'not-defined'}}}}},events:{},commands:{}})
 const document=createModelDocumentation(snapshot(type,version,model),type),fields=document.sections[0]!.items.flatMap(row=>row.fields)
 expect(fields).toContainEqual({label:'图标标识',value:'alarm'});expect(fields).toContainEqual({label:'颜色',value:'#123abc'});expect(fields).toContainEqual({label:'枚举说明 · ready',value:'待机状态'});expect(fields).toContainEqual({label:'子字段 temperature 名称',value:'温度名称'});expect(fields).toContainEqual({label:'子字段 temperature 说明',value:'冻结子字段备注'})
 expect(document.html).toContain('冻结子字段备注');expect(document.markdown).toContain('待机状态');for(const secret of ['unknown-enum-secret','unknown-presentation-secret','unknown-child-secret','unknown-object-secret'])expect(document.html+document.markdown).not.toContain(secret)
})
it('先读最新身份再精确读取，支持已知ID且不会构造版本列表或自动下载',async()=>{
 const client=transport(),wrapper=render(client);await flushPromises()
 expect(client.latest).toHaveBeenCalledTimes(1);expect(client.snapshot).toHaveBeenCalledWith(project,type,version,expect.any(AbortSignal),snapshot().version);expect(wrapper.text()).toContain('9007199254740993.1234567890123456789');expect(wrapper.text()).toContain('服务端快照摘要')
 await wrapper.find('input').setValue('invalid');await wrapper.find('form').trigger('submit');expect(client.snapshot).toHaveBeenCalledTimes(1);expect(wrapper.text()).toContain('请输入完整的小写版本 UUID')
 await wrapper.find('input').setValue(older);await wrapper.find('form').trigger('submit');await flushPromises();expect(client.snapshot).toHaveBeenLastCalledWith(project,type,older,expect.any(AbortSignal));expect(client.latest).toHaveBeenCalledTimes(1);expect(wrapper.text()).toContain('按指定版本ID读取的历史文档');expect(wrapper.text()).toContain('0.9.0');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})
it('草稿明确无版本与已发布读取失败分开，已发布空模型仍有可核版本',async()=>{
 const client=transport();vi.mocked(client.latest).mockRejectedValue(new ApiError('版本不存在',404,30052));const wrapper=render(client,'DRAFT');await flushPromises();expect(wrapper.text()).toContain('此草稿尚无冻结版本');expect(wrapper.findAll('button').some(node=>node.text()==='导出 Markdown')).toBe(false)
 await wrapper.setProps({typeStatus:'PUBLISHED'});await flushPromises();expect(wrapper.find('[role="alert"]').text()).toContain('版本不存在');expect(wrapper.text()).not.toContain('此草稿尚无冻结版本')
 vi.mocked(client.latest).mockResolvedValue(snapshot().version);vi.mocked(client.snapshot).mockResolvedValue(snapshot(type,version,'{"properties":{},"events":{},"commands":{}}'));await button(wrapper,'读取最新文档').trigger('click');await flushPromises();expect(wrapper.text()).toContain('属性（0 项）');expect(wrapper.text()).toContain('此版本未定义事件');expect(wrapper.text()).toContain(version)
})
it('类型、项目与身份变更清除文档并拒绝旧范围迟到快照',async()=>{
 let resolve!:(value:ReturnType<typeof snapshot>)=>void;const client=transport();vi.mocked(client.snapshot).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));const wrapper=render(client);await flushPromises()
 await wrapper.setProps({typeId:other});await flushPromises();resolve(snapshot());await flushPromises();expect(wrapper.text()).toContain(other);expect(wrapper.text()).not.toContain(type)
 let late!:(value:ReturnType<typeof snapshot>)=>void;vi.mocked(client.snapshot).mockImplementationOnce(()=>new Promise(done=>{late=done}));await button(wrapper,'读取最新文档').trigger('click');await flushPromises();changeIdentity();session.user=null;late(snapshot(other));await flushPromises();expect(wrapper.text()).not.toContain('服务端快照摘要');expect(wrapper.text()).toContain('没有此内容的读取权限')
 session.user={accountId:project,currentProjectId:uuid(400),projectRole:'VIEWER',permissions:['device:read']} as never;session.projects=[{id:uuid(400),myRole:'VIEWER',status:'ACTIVE'}];await flushPromises();expect(client.latest).toHaveBeenLastCalledWith(uuid(400),other,expect.any(AbortSignal))
})
it('禁用和失权不生成下载，403不降为空文档',async()=>{
 const client=transport(),wrapper=render(client,'PUBLISHED',true);await flushPromises();expect(client.latest).not.toHaveBeenCalled();await wrapper.setProps({disabled:false});await flushPromises();expect(button(wrapper,'导出 Markdown').attributes('disabled')).toBeUndefined()
 await wrapper.setProps({disabled:true});await flushPromises();expect(wrapper.text()).not.toContain('服务端快照摘要');expect(button(wrapper,'读取最新文档').attributes('disabled')).toBeDefined()
 vi.mocked(client.latest).mockRejectedValue(new ApiError('无权读取',403,30024));await wrapper.setProps({disabled:false});await flushPromises();expect(wrapper.text()).toContain('没有此内容的读取权限');expect(wrapper.text()).not.toContain('此草稿尚无冻结版本');session.user={...session.user!,permissions:[]};await flushPromises();expect(wrapper.find('form').exists()).toBe(false)
})

it('显式导出所选固定版本为Markdown和静态HTML，本地Blob保精度且不额外读网络',async()=>{
 const blobs:Blob[]=[],downloads:string[]=[],OriginalURL=URL;const revoke=vi.fn();vi.stubGlobal('URL',class extends OriginalURL{static createObjectURL(blob:Blob){blobs.push(blob);return `blob:local-document-${blobs.length}`}static revokeObjectURL=revoke})
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){downloads.push(this.download)})
 try{const client=transport(),wrapper=render(client);await flushPromises();await wrapper.find('input').setValue(older);await wrapper.find('form').trigger('submit');await flushPromises();const reads=vi.mocked(client.snapshot).mock.calls.length
  await button(wrapper,'导出 Markdown').trigger('click');await button(wrapper,'导出静态 HTML').trigger('click');await new Promise(resolve=>setTimeout(resolve,0));expect(client.snapshot).toHaveBeenCalledTimes(reads);expect(downloads).toEqual([`thingslink-model-${type}-0.9.0-${older}.md`,`thingslink-model-${type}-0.9.0-${older}.html`]);expect(blobs.map(blob=>blob.type)).toEqual(['text/markdown;charset=utf-8','text/html;charset=utf-8']);expect(revoke).toHaveBeenCalledTimes(2)
  const texts=await Promise.all(blobs.map(blob=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(blob)})));for(const text of texts){expect(text).toContain(older);expect(text).toContain('9007199254740993.1234567890123456789')}expect(new DOMParser().parseFromString(texts[1]!,'text/html').querySelector('script')).toBeNull()
 }finally{vi.unstubAllGlobals()}
})
