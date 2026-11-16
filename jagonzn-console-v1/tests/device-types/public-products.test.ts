import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper,DOMWrapper} from '@vue/test-utils'
import ElementPlus,{ElCheckbox} from 'element-plus'
import Importer from '../../src/features/device-types/DeviceTypeProductImport.vue'
import Publisher from '../../src/features/device-types/DeviceTypeProductPublisher.vue'
import {session} from '../../src/core/session'
import * as http from '../../src/core/http'
import {decodePrivateTemplateVersion,type PrivateTemplateTransport} from '../../src/features/device-types/private-template-api'
import {productTransport,decodeSharedProduct,decodeProductPublication,decodeOwnedProducts,prepareProductImport,prepareProductPublish,type ProductTransport,type SharedTypeProduct,type OwnedProduct,type ProductPublication,type ProductImportReceipt} from '../../src/features/device-types/public-product-api'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=id(1),typeId=id(2),productId=id(3),v1=id(4),v2=id(5),target=id(6),privateV1=id(7),family=id(8),other=id(9),privateV2=id(10),digest='a'.repeat(64),modelDigest='b'.repeat(64),at='2026-10-29T01:00:00Z'
const exact='0.12345678901234567890123456789',packageJson=`{"contract":"thingslink.device-type-template.v1","type":{"name":"模板来源","description":"分享说明","tags":{"区域":"华南"},"deviceKind":"DIRECT","payloadProtocol":"STANDARD","networkType":"WIFI"},"properties":[],"events":[],"commands":[],"modelSnapshot":{"properties":{"number":{"defaultValue":${exact}}},"events":{},"commands":{}}}`
function product(seq=1,changes:Partial<SharedTypeProduct>={}):SharedTypeProduct{return decodeSharedProduct({productId,versionId:seq===1?v1:v2,sequence:seq,name:'模板来源',publisherLabel:'合成署名',sourceMode:'DRAFT_TEMPLATE_CAPTURE',packageJson,packageDigest:digest,modelDigest,publishedAt:at,currentVersionId:seq===1?v1:v2,revision:String(seq),state:'PUBLISHED',withdrawnAt:null,...changes},productId)}
function own(seq=1,changes:Partial<SharedTypeProduct>={}):OwnedProduct{const value=product(seq,changes),{sourceMode,packageJson:body,modelDigest:hash,currentVersionId,...summary}=value;return decodeOwnedProducts({items:[{product:summary,sourceTemplateVersionId:seq===1?privateV1:privateV2,sourceDeviceTypeId:typeId}],total:'1',available:true}).items[0]!}
function fixed(seq=1){return decodePrivateTemplateVersion({templateId:family,templateName:'私有模板',versionId:seq===1?privateV1:privateV2,sequence:seq,sourceDeviceTypeId:typeId,sourceMode:'DRAFT_CAPTURE',packageJson,packageDigest:digest,sourceSchemaDigest:modelDigest,createdAt:at})}
const receipt=():ProductImportReceipt=>({deviceTypeId:target,productId,productVersionId:v1,packageDigest:digest,requestedName:'产品副本',createdAt:at,deleted:false})
function ports(){const p={lookup:vi.fn<ProductTransport['lookup']>().mockResolvedValue(product()),owned:vi.fn<ProductTransport['owned']>().mockResolvedValue({items:[],total:'0',available:true}),current:vi.fn<ProductTransport['current']>().mockResolvedValue({product:product(),sourceTemplateVersionId:privateV1}),publish:vi.fn<ProductTransport['publish']>().mockResolvedValue({product:product(),sourceTemplateVersionId:privateV1}),published:vi.fn<ProductTransport['published']>().mockResolvedValue({product:product(),sourceTemplateVersionId:privateV1}),withdraw:vi.fn<ProductTransport['withdraw']>().mockResolvedValue({productId,revision:'2',withdrawnAt:at}),create:vi.fn<ProductTransport['create']>().mockResolvedValue(receipt()),imported:vi.fn<ProductTransport['imported']>().mockResolvedValue(receipt())};const templates={directory:vi.fn<PrivateTemplateTransport['directory']>().mockResolvedValue({items:[{id:family,name:'私有模板',headVersionId:privateV1,headSequence:1,createdAt:at}],total:'1'}),versions:vi.fn<PrivateTemplateTransport['versions']>().mockResolvedValue({templateId:family,items:[{versionId:privateV1,sequence:1,packageDigest:digest,sourceDeviceTypeId:typeId,createdAt:at}]}),version:vi.fn<PrivateTemplateTransport['version']>().mockResolvedValue(fixed())} as unknown as PrivateTemplateTransport;return{p,templates}}
const wrappers:VueWrapper[]=[]
function owner(role='OWNER',status='ACTIVE'){session.user={accountId:project,currentProjectId:project,projectRole:role,permissions:['device:read','device:update','device:create']} as never;session.projects=[{id:project,myRole:role,status}]}
function button(label:string){const node=[...document.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent?.trim()===label);expect(node,label).toBeDefined();return new DOMWrapper(node!)}
async function click(label:string){await button(label).trigger('click');await flushPromises()}
async function input(label:string,value:string){const node=document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);expect(node,label).toBeDefined();await new DOMWrapper(node!).setValue(value)}
async function render(kind:'import'|'publisher',p:ProductTransport,templates?:PrivateTemplateTransport){const wrapper=mount(kind==='import'?Importer:Publisher,{props:kind==='import'?{transport:p}:{typeId,transport:p,templates},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);await flushPromises();return wrapper}
async function lookup(){await click('输入产品ID');await input('分享产品ID',productId);await click('读取当前发布版本');await input('产品导入新类型名称','产品副本')}
async function source(){await click('发布固定版本');await click('选择模板来源');await click('选择此固定版本');await input('产品分享署名','合成署名')}
beforeEach(()=>{vi.clearAllMocks();http.changeIdentity();session.ready=true;session.transitioning=false;owner()})
afterEach(()=>{wrappers.splice(0).forEach(x=>x.unmount());session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})
it('从已预览版本授权产品自动建型，读回当前授权且不手动建型',async()=>{
 const {p}=ports(),code='brand.sensor-v1'
 const path=`/api/v1/projects/${project}/type-product-enrollments/${code}`
 const approved={productIdentifier:code,productId,versionId:v1,packageDigest:digest,enabled:true,deviceTypeId:null}
 const api=vi.spyOn(http,'api').mockResolvedValueOnce(approved).mockResolvedValueOnce(approved)
 await render('import',p);await lookup();await input('自动建型产品识别码',code)
 await click('授权当前固定版本')
 expect(api).toHaveBeenNthCalledWith(1,path,expect.objectContaining({method:'put',body:{productId,versionId:v1,packageDigest:digest}}))
 expect(api).toHaveBeenNthCalledWith(2,path,{signal:expect.any(AbortSignal)})
 expect(document.body.textContent).toContain('待首启创建')
 expect(p.create).not.toHaveBeenCalled()
})
it('按用户提供ID读取当前版本，取消零写，确认一次携带精确version与digest创建',async()=>{const{p}=ports(),wrapper=await render('import',p);await click('输入产品ID');await click('读取当前发布版本');expect(p.lookup).not.toHaveBeenCalled();await click('取消');await lookup();expect(document.body.textContent).toContain(exact);expect(p.create).not.toHaveBeenCalled();await click('取消');expect(p.create).not.toHaveBeenCalled();await lookup();await click('确认按此发布版本创建');expect(p.create).toHaveBeenCalledTimes(1);const original=p.create.mock.calls[0]![0];expect(original.body).toEqual({productId,productVersionId:v1,expectedPackageDigest:digest,name:'产品副本'});expect(p.imported.mock.calls[0]![0]).toBe(original);expect(wrapper.emitted('created')).toEqual([[target]]);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])})
it('发布必须完整预览并确认范围，原回执v1与后来当前头v2分开，不隐式公开或跟新',async()=>{const{p,templates}=ports(),wrapper=await render('publisher',p,templates);expect(p.publish).not.toHaveBeenCalled();await source();await click('确认发布此固定版本');expect(p.publish).not.toHaveBeenCalled();expect(document.body.textContent).toContain('规则、任务、数据流、Modbus和App配置未携带');wrapper.getComponent(ElCheckbox).vm.$emit('update:modelValue',true);await flushPromises();p.published.mockResolvedValue({product:product(1,{currentVersionId:v2,revision:'2'}),sourceTemplateVersionId:privateV1});await click('确认发布此固定版本');expect(p.publish).toHaveBeenCalledTimes(1);expect(p.publish.mock.calls[0]![0].body).toEqual({sourceTemplateVersionId:privateV1,productId:null,revision:null,expectedPackageDigest:digest,publisherLabel:'合成署名'});expect(wrapper.text()).toContain('本次发布第 1 版已确认');expect(p.published.mock.calls[0]![0]).toBe(p.publish.mock.calls[0]![0]);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])})
it('撤回后再发保同ID和CAS；未知撤回仅看当前事实，降权归档/同值会话不清意图',async()=>{const{p,templates}=ports();const withdrawn=own(1,{state:'WITHDRAWN',withdrawnAt:at,revision:'2'});p.owned.mockResolvedValue({items:[withdrawn],total:'1',available:true});(templates.version as ReturnType<typeof vi.fn>).mockResolvedValue(fixed(2));(templates.versions as ReturnType<typeof vi.fn>).mockResolvedValue({templateId:family,items:[{versionId:privateV2,sequence:2,packageDigest:digest,sourceDeviceTypeId:typeId,createdAt:at}]});p.publish.mockResolvedValue({product:product(2,{revision:'3'}),sourceTemplateVersionId:privateV2});p.published.mockResolvedValue({product:product(2,{revision:'3'}),sourceTemplateVersionId:privateV2});const wrapper=await render('publisher',p,templates);await click('更新或重新发布');await click('选择模板来源');await click('选择此固定版本');wrapper.getComponent(ElCheckbox).vm.$emit('update:modelValue',true);await flushPromises();p.owned.mockResolvedValue({items:[own(2,{revision:'3'})],total:'1',available:true});await click('确认发布此固定版本');expect(p.publish.mock.calls[0]![0].body).toMatchObject({productId,revision:'2',sourceTemplateVersionId:privateV2});p.withdraw.mockRejectedValue(new http.ApiError('响应未知',0,undefined,undefined,true));await click('撤回产品分享');wrapper.getComponent(ElCheckbox).vm.$emit('update:modelValue',true);await flushPromises();await click('确认撤回产品分享');const original=p.withdraw.mock.calls[0]![0];session.user={...session.user!};session.projects=[{...session.projects[0]!}];await flushPromises();owner('VIEWER','ARCHIVED');await wrapper.setProps({disabled:true});p.current.mockResolvedValue({product:product(2,{revision:'4',state:'WITHDRAWN',withdrawnAt:at}),sourceTemplateVersionId:privateV2});await click('读取当前产品核对');expect(document.body.textContent).toContain('不能证明原撤回请求结果');expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);expect(document.body.textContent).toContain(original.key);expect(p.withdraw).toHaveBeenCalledTimes(1);await click('结束本次产品操作核对');expect(wrapper.text()).toContain('原操作仍未确认');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])})
it('未知导入404保原键禁重发；项目切换隐藏迟到原回执，不误跳旧目标',async()=>{const{p}=ports();p.create.mockRejectedValue(new http.ApiError('未知',0,undefined,undefined,true));p.imported.mockRejectedValueOnce(new http.ApiError('未读到原件',404));const wrapper=await render('import',p);await lookup();await click('确认按此发布版本创建');const original=p.create.mock.calls[0]![0];session.user={...session.user!};session.projects=[{...session.projects[0]!}];await flushPromises();owner('VIEWER','ARCHIVED');await wrapper.setProps({disabled:true});await click('读取原产品导入回执');expect(document.body.textContent).toContain('仍保持未知');let release!:(value:ProductImportReceipt)=>void;p.imported.mockReturnValueOnce(new Promise(resolve=>{release=resolve}));await button('读取原产品导入回执').trigger('click');session.projects=[{id:other,myRole:'VIEWER',status:'ACTIVE'}];session.user={...session.user!,currentProjectId:other};await flushPromises();release(receipt());await flushPromises();expect(wrapper.emitted('created')).toBeUndefined();expect(wrapper.text()).not.toContain(original.key);expect(p.create).toHaveBeenCalledTimes(1);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])})
it('正式合同消费者无全局listing请求，当前头不符拒绝，原请求GET恢复携带同键',async()=>{const spy=vi.spyOn(http,'api'),source=fixed(),publish=prepareProductPublish(project,source,null,'合成署名'),create=prepareProductImport(project,product(),'产品副本'),signal=new AbortController().signal;spy.mockResolvedValueOnce(product()).mockResolvedValueOnce(receipt()).mockResolvedValueOnce({product:product(),sourceTemplateVersionId:privateV1});await productTransport.lookup(project,productId,signal);await productTransport.imported(create,signal);await productTransport.published(publish,signal);expect(spy.mock.calls.map(([path])=>path)).toEqual([`/api/v1/projects/${project}/type-products/${productId}`,`/api/v1/projects/${project}/type-products/imports/by-key`,`/api/v1/projects/${project}/type-product-publications/requests/by-key`]);expect(spy.mock.calls[1]![1]?.headers).toEqual({'Original-Request-Key':create.key});expect(()=>decodeSharedProduct(product(1,{currentVersionId:v2}),productId,true)).toThrow();expect(()=>decodeOwnedProducts({items:[],total:'1',available:true})).toThrow();expect(()=>prepareProductPublish(project,source,{...own(),sourceDeviceTypeId:other},'合成署名')).toThrow();const{p,templates}=ports();p.owned.mockResolvedValue({items:[],total:'0',available:false});await render('publisher',p,templates);expect(button('发布固定版本').attributes('disabled')).toBeDefined();await click('发布固定版本');expect(templates.directory).not.toHaveBeenCalled();expect(p.publish).not.toHaveBeenCalled()})

it('10014产品创建保留原键，只读原回执且不再次创建',async()=>{
 const {p}=ports();p.create.mockRejectedValue(new http.ApiError('原结果不可回放',409,10014));
 p.imported.mockRejectedValueOnce(new http.ApiError('尚未读到原件',404));
 const wrapper=await render('import',p);await lookup();await click('确认按此发布版本创建');
 const original=p.create.mock.calls[0]![0],snapshot=JSON.stringify(original);
 expect(document.body.textContent).toContain(original.key);expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);
 expect([...document.querySelectorAll('button')].some(x=>x.textContent?.trim()==='确认按此发布版本创建')).toBe(false);
 await click('读取原产品导入回执');expect(p.imported.mock.calls[0]![0]).toBe(original);
 expect(document.body.textContent).toContain(original.key);expect(wrapper.emitted('created')).toBeUndefined();
 await click('读取原产品导入回执');expect(p.imported.mock.calls[1]![0]).toBe(original);
 expect(JSON.stringify(original)).toBe(snapshot);expect(p.create).toHaveBeenCalledTimes(1);
 expect(wrapper.emitted('created')).toEqual([[target]]);
})
it('10014产品发布保留固定版本与原键，只读发布原件',async()=>{
 const {p,templates}=ports();p.publish.mockRejectedValue(new http.ApiError('原结果不可回放',409,10014));
 p.published.mockRejectedValueOnce(new http.ApiError('尚未读到原件',404));
 const wrapper=await render('publisher',p,templates);await source();wrapper.getComponent(ElCheckbox).vm.$emit('update:modelValue',true);await flushPromises();
 await click('确认发布此固定版本');const original=p.publish.mock.calls[0]![0],snapshot=JSON.stringify(original);
 expect(document.body.textContent).toContain(original.key);expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);
 expect([...document.querySelectorAll('button')].some(x=>x.textContent?.trim()==='确认发布此固定版本')).toBe(false);
 await click('读取原发布回执');expect(p.published.mock.calls[0]![0]).toBe(original);expect(document.body.textContent).toContain(original.key);
 await click('读取原发布回执');expect(p.published.mock.calls[1]![0]).toBe(original);
 expect(JSON.stringify(original)).toBe(snapshot);expect(p.publish).toHaveBeenCalledTimes(1);expect(wrapper.text()).toContain('本次发布第 1 版已确认');
})
it('10014产品撤回保留原CAS，仅当前事实不能确认原请求',async()=>{
 const {p,templates}=ports();p.owned.mockResolvedValue({items:[own()],total:'1',available:true});
 p.withdraw.mockRejectedValue(new http.ApiError('原结果不可回放',409,10014));
 const wrapper=await render('publisher',p,templates);await click('撤回产品分享');wrapper.getComponent(ElCheckbox).vm.$emit('update:modelValue',true);await flushPromises();
 await click('确认撤回产品分享');const original=p.withdraw.mock.calls[0]![0],snapshot=JSON.stringify(original);
 expect(document.body.textContent).toContain(original.key);expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);
 expect([...document.querySelectorAll('button')].some(x=>x.textContent?.trim()==='确认撤回产品分享')).toBe(false);
 p.current.mockResolvedValue({product:product(1,{revision:'2',state:'WITHDRAWN',withdrawnAt:at}),sourceTemplateVersionId:privateV1});
 await click('读取当前产品核对');expect(p.current).toHaveBeenCalledExactlyOnceWith(project,productId,expect.any(AbortSignal));
 expect(JSON.stringify(original)).toBe(snapshot);expect(document.body.textContent).toContain(original.key);
 expect(document.body.textContent).toContain('不能证明原撤回请求结果');expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);
 expect(p.withdraw).toHaveBeenCalledTimes(1);await click('结束本次产品操作核对');expect(wrapper.text()).toContain('原操作仍未确认');
})

it('固定模板来源兼容历史和当前响应，捕获来源不伪造模板身份',()=>{
 const original=JSON.parse(JSON.stringify(product()));
 expect(decodeSharedProduct({...original,sourceMode:'FIXED_TEMPLATE_VERSION'},productId).versionId).toBe(v1);
 expect(()=>decodeSharedProduct({...original,sourceMode:'UNKNOWN'},productId)).toThrow();
 const captured={...original,sourceMode:'CURRENT_TYPE_CAPTURE',packageJson:'{"contract":"thingslink.device-type-product.v2","functions":'+packageJson+',"scopes":{"functions":true,"extensions":false,"rules":false,"tasks":false,"data":false,"thingsX":false},"sections":{"extensions":{"selected":false,"status":"NOT_CAPTURED"},"rules":{"selected":false,"status":"NOT_CAPTURED"},"tasks":{"selected":false,"status":"NOT_CAPTURED"},"data":{"selected":false,"status":"NOT_CAPTURED"},"thingsX":{"selected":false,"status":"NOT_CAPTURED"}}}'};
 expect(decodeProductPublication({product:captured,sourceKind:'CURRENT_TYPE_CAPTURE',sourceCaptureId:id(80)}).product.productId).toBe(productId);
 expect(()=>decodeProductPublication({product:captured,sourceTemplateVersionId:id(80)})).toThrow();
 expect(()=>decodeProductPublication({product:original,sourceKind:'CURRENT_TYPE_CAPTURE',sourceCaptureId:id(80)})).toThrow();
})
