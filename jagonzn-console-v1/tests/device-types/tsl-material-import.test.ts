import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {webcrypto} from 'node:crypto'
import ElementPlus from 'element-plus'
import Panel from '../../src/features/device-types/DeviceTypeTslPreview.vue'
import {prepareTslMaterial,tslMaterialFormat,standardMaterialFormat} from '../../src/features/device-types/tsl-material-import-api'
import {functionStandardMaterialFormat,sourceLibraryStandardMaterialFormat,sourceLibraryMaterialDigestAlgorithm} from '../../src/features/device-types/function-material-values'
import {session} from '../../src/core/session'
import {changeIdentity,setAccessToken} from '../../src/core/http'
const project='10000000-0000-4000-8000-000000000001',type='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',property='30000000-0000-4000-8000-000000000001'
const source=JSON.stringify({name:'TSL来源',descr:'来源说明',icon:'mdi-cube-outline',attributes:[{identifier:'tsl_temperature',name:'TSL温度',descr:'',attributeType:'report',dataType:'number',options:{}}],events:[],commands:[]})
let view:VueWrapper|undefined,conflict:boolean,postLost:boolean,lookupMissing:boolean,publishedTarget:boolean,holdPreview:((response:Response)=>Promise<Response>)|undefined,preview:any,receipt:any,calls:{path:string;method:string;headers:Headers;body?:any}[]
const catalog={sourceFormat:standardMaterialFormat,catalogDigest:'d'.repeat(64),entries:[{id:'environment.co2',category:'环境监测',propertyKey:'co2',name:'二氧化碳',accessType:'REPORT',dataType:'NUMBER',unit:'ppm',decimalPlaces:1,minimumValue:0,maximumValue:5000,description:'二氧化碳浓度上报，范围0至5000'}]}
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
async function fetcher(input:RequestInfo|URL,init?:RequestInit){const url=new URL(String(input)),method=init?.method||'GET',body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({path:url.pathname+url.search,method,headers:new Headers(init?.headers),body});const root=`/api/v1/projects/${project}/device-types/${type}`
 if(url.pathname===`/api/v1/projects/${project}/device-standard-functions/library`&&method==='GET')return json({sourceFormat:sourceLibraryStandardMaterialFormat,catalogDigest:catalog.catalogDigest,entries:catalog.entries.map(({id,category,...property})=>({id,category,kind:'PROPERTY',property:{...property,sourcePointer:'$.attributes[0]',sortOrder:0}}))})
 if(url.pathname===`/api/v1/projects/${project}/device-standard-functions`&&method==='GET')return json(catalog)
 if(url.pathname===root+'/definition-material-import-previews'&&method==='POST'){
  const candidate=await prepareTslMaterial(project,type,body.sourceText,body.sourceFormat);preview={targetDeviceTypeId:type,sourceFormat:tslMaterialFormat,sourceName:'TSL来源',sourceDescription:'来源说明',sourceIcon:'mdi-cube-outline',properties:conflict?[]:[{sourcePointer:'$.attributes[0]',propertyKey:'tsl_temperature',name:'TSL温度',description:null,accessType:'REPORT',dataType:'NUMBER',sortOrder:0}],issues:conflict?[{path:'$.attributes[0].identifier',code:'IDENTIFIER_CONFLICT',message:'目标已有同类标识，不会覆盖'}]:[],sourceDigest:candidate.sourceDigest,targetDigest:(publishedTarget?'e':'b').repeat(64),previewDigest:(publishedTarget?'f':'c').repeat(64),digestAlgorithm:'DEVICE_TYPE_DEFINITION_MATERIAL_IMPORT_V1_SHA256'};if([standardMaterialFormat,functionStandardMaterialFormat,sourceLibraryStandardMaterialFormat].includes(body.sourceFormat)){preview.sourceFormat=body.sourceFormat;preview.sourceName='ThingsLink标准功能';if(!conflict)preview.properties=[{sourcePointer:'$.attributes[0]',propertyKey:'co2',name:'二氧化碳',description:catalog.entries[0]!.description,accessType:'REPORT',dataType:'NUMBER',sortOrder:0,unit:'ppm',decimalPlaces:1,minimumValue:0,maximumValue:5000}]}if(body.sourceFormat===functionStandardMaterialFormat)Object.assign(preview,{events:[],commands:[],adaptationDecisions:[],digestAlgorithm:'DEVICE_TYPE_DEFINITION_MATERIAL_IMPORT_V3_SHA256'});if(body.sourceFormat===sourceLibraryStandardMaterialFormat)Object.assign(preview,{events:[],commands:[],adaptationDecisions:[],digestAlgorithm:sourceLibraryMaterialDigestAlgorithm});const response=json(preview);return holdPreview?holdPreview(response):response
 }
 if(url.pathname===root+'/definition-material-imports'&&method==='POST'){receipt={targetDeviceTypeId:type,sourceFormat:preview.sourceFormat,sourceDigest:preview.sourceDigest,targetDigest:preview.targetDigest,previewDigest:preview.previewDigest,items:[{kind:'PROPERTY',sourcePointer:'$.attributes[0]',targetId:property,key:preview.properties[0].propertyKey}],createdAt:'2026-10-29T04:00:00.123456Z',...([functionStandardMaterialFormat,sourceLibraryStandardMaterialFormat].includes(preview.sourceFormat)?{properties:preview.properties,events:[],commands:[],adaptationDecisions:[]}:{})};return postLost?json({message:'回执不可用'},502):json(receipt,201)}
 if(url.pathname===root+'/definition-material-imports/by-key'&&method==='GET')return lookupMissing?json({message:'尚未找到'},404):json(receipt)
 throw new Error('夹具拒绝未定义请求 '+method+' '+url.pathname)
}
async function setup(status='DRAFT'){publishedTarget=status==='PUBLISHED';view=mount(Panel,{props:{typeId:type,typeStatus:status},attachTo:document.body,global:{plugins:[ElementPlus]}});await button('预览 ThingsCloud TSL 转换').trigger('click');await view.get('[aria-label="ThingsCloud TSL原文"]').setValue(source);await button('转换预览').trigger('click');return view}
function button(label:string){const found=view!.findAll('button').find(x=>x.text()===label);if(found)return found;const node=[...document.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent?.trim()===label);expect(node,label).toBeDefined();return new DOMWrapper(node!)}
async function authority(){await button('读取权威导入预览').trigger('click');await vi.waitFor(()=>expect(view!.find('.authority-preview').exists()).toBe(true))}
const writes=()=>calls.filter(x=>x.method==='POST'&&x.path.endsWith('/definition-material-imports'))
beforeEach(()=>{changeIdentity();setAccessToken('tsl-material-fixture');session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']};session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}];calls=[];conflict=false;postLost=false;lookupMissing=false;publishedTarget=false;holdPreview=undefined;preview=undefined;receipt=undefined;vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('fetch',vi.fn(fetcher))})
afterEach(()=>{view?.unmount();view=undefined;session.user=null;session.projects=[];vi.unstubAllGlobals();changeIdentity();document.body.innerHTML=''})
it('正式515材料API源摘要长度编码一致，权威预览后单次原子确认及真实ID原件，不发布或补写',async()=>{
 expect((await prepareTslMaterial(project,type,'{"name":"中"}')).sourceDigest).toBe('6c4a8b54166a357b5372305e620f606924e621e975f2aea7f0d7af28f8922fe7');const w=await setup();await authority();expect(writes()).toHaveLength(0);await button('确认原子导入').trigger('click');await vi.waitFor(()=>expect(w.text()).toContain('已原子导入 1 项功能'));expect(writes()).toHaveLength(1);expect(writes()[0]!.body).toEqual({sourceFormat:tslMaterialFormat,sourceText:source,expectedPreviewDigest:'c'.repeat(64)});expect(writes()[0]!.headers.get('Idempotency-Key')).toBeTruthy();expect(w.emitted('changed')).toHaveLength(1);expect(w.emitted('locked')?.at(-1)).toEqual([false]);expect(calls).toHaveLength(2)
})
it('目标冲突权威路径可见且不能确认，取消只读预览零业务写',async()=>{
 conflict=true;const w=await setup();await authority();expect(w.text()).toContain('$.attributes[0].identifier');expect(w.text()).toContain('目标已有同类标识');expect(button('确认原子导入').attributes('disabled')).toBeDefined();await button('确认原子导入').trigger('click');await button('关闭并清除').trigger('click');expect(writes()).toHaveLength(0);expect(w.emitted('changed')).toBeUndefined()
})
it('已受理丢回执仅原键GET恢复，404仍未知；失写权VIEWER可读取本人原件且不重POST',async()=>{
 postLost=true;lookupMissing=true;const w=await setup('PUBLISHED');await authority();await button('确认原子导入').trigger('click');await vi.waitFor(()=>expect(w.text()).toContain('回执不可用'));await vi.waitFor(()=>expect(button('按原键读取导入结果').attributes('disabled')).toBeUndefined());const key=writes()[0]!.headers.get('Idempotency-Key');expect(button('确认原子导入').attributes('disabled')).toBeDefined();await button('确认原子导入').trigger('click');await button('按原键读取导入结果').trigger('click');await vi.waitFor(()=>expect(w.text()).toContain('尚未找到同次导入原件'));expect(writes()).toHaveLength(1)
 session.user={...session.user!,projectRole:'VIEWER',permissions:['device:read']};session.projects=[{id:project,status:'ACTIVE',myRole:'VIEWER'}];await flushPromises();lookupMissing=false;await button('按原键读取导入结果').trigger('click');await vi.waitFor(()=>expect(w.text()).toContain('已原子导入 1 项功能'));expect(writes()).toHaveLength(1);expect(w.emitted('changed')).toHaveLength(1);for(const call of calls.filter(x=>x.method==='GET')){expect(call.headers.get('Original-Request-Key')).toBe(key);expect(call.headers.has('Idempotency-Key')).toBe(false);expect(call.path).not.toContain('?')}
})
it('大于256KiB只读预览无提交资格，换类型清原材料且丢弃权威晚回，不改新范围',async()=>{
 const w=await setup();await w.get('[aria-label="ThingsCloud TSL原文"]').setValue(' '.repeat(256*1024)+source);await button('转换预览').trigger('click');expect(w.text()).toContain('此材料只可本地预览');expect(button('读取权威导入预览').attributes('disabled')).toBeDefined();expect(calls).toHaveLength(0);await w.get('[aria-label="ThingsCloud TSL原文"]').setValue(source);await button('转换预览').trigger('click');let release!:()=>void;holdPreview=response=>new Promise(resolve=>{release=()=>resolve(response)});await button('读取权威导入预览').trigger('click');await vi.waitFor(()=>expect(release).toBeDefined());await w.setProps({typeId:other});release();await flushPromises();expect(w.find('[aria-label="ThingsCloud TSL原文"]').exists()).toBe(false);expect(w.text()).not.toContain('目标已核对');expect(writes()).toHaveLength(0);expect(w.emitted('changed')).toBeUndefined();expect(w.emitted('locked')?.at(-1)).toEqual([false])
})

it('标准目录先选择只读、取消零写，权威字段预览后只交版本和ID并原子导入',async()=>{
 const w=view=mount(Panel,{props:{typeId:type,typeStatus:'DRAFT'},attachTo:document.body,global:{plugins:[ElementPlus]}})
 await button('添加标准功能').trigger('click');await vi.waitFor(()=>expect(w.text()).toContain('二氧化碳（co2）'))
 expect(w.text()).toContain('ppm');expect(w.text()).toContain('5000');await w.find('.standard-entry input[type="checkbox"]').setValue(true)
 await button('取消标准选择').trigger('click');expect(writes()).toHaveLength(0)
 await button('添加标准功能').trigger('click');await vi.waitFor(()=>expect(w.find('.standard-entry').exists()).toBe(true));await vi.waitFor(()=>expect(w.find('.standard-entry input').attributes('disabled')).toBeUndefined())
 await w.find('.standard-entry input[type="checkbox"]').setValue(true);await button('预览标准功能导入').trigger('click');await vi.waitFor(()=>expect(w.find('.authority-preview').exists()).toBe(true))
 expect(w.find('.authority-preview').text()).toContain('ppm');expect(w.find('.authority-preview').text()).toContain('5000');expect(writes()).toHaveLength(0)
 await button('确认原子导入').trigger('click');await vi.waitFor(()=>expect(w.text()).toContain('已原子导入 1 项功能'))
 expect(writes()).toHaveLength(1);expect(writes()[0]!.body.sourceFormat).toBe(sourceLibraryStandardMaterialFormat);expect(JSON.parse(writes()[0]!.body.sourceText)).toEqual({catalogDigest:catalog.catalogDigest,entries:['environment.co2']});expect(w.emitted('changed')).toHaveLength(1)
})


it.each(['tsl','standard'] as const)('已发布目标可将既有%s材料实际确认保存，权威targetDigest和目录摘要不变形',async format=>{
 publishedTarget=true;let w:VueWrapper
 if(format==='tsl'){w=await setup('PUBLISHED');await authority()}else{w=view=mount(Panel,{props:{typeId:type,typeStatus:'PUBLISHED'},attachTo:document.body,global:{plugins:[ElementPlus]}});await button('添加标准功能').trigger('click');await vi.waitFor(()=>expect(w.find('.standard-entry input').exists()).toBe(true));await w.find('.standard-entry input[type="checkbox"]').setValue(true);await button('预览标准功能导入').trigger('click');await vi.waitFor(()=>expect(w.find('.authority-preview').exists()).toBe(true));expect(w.text()).toContain('当前提供 1 项标准功能')}
 expect(button('确认原子导入').attributes('disabled')).toBeUndefined();expect(w.text()).toContain('已发布目标会生成一个后继模型');expect(writes()).toHaveLength(0);await button('确认原子导入').trigger('click');await vi.waitFor(()=>expect(w.text()).toContain('已原子导入 1 项功能'));expect(writes()).toHaveLength(1);expect(writes()[0]!.body.expectedPreviewDigest).toBe('f'.repeat(64));expect(w.text()).not.toContain('尚未发布模型');expect(w.text()).toContain('现有设备绑定保持');expect(w.emitted('changed')).toHaveLength(1)
 if(format==='standard')expect(JSON.parse(writes()[0]!.body.sourceText)).toEqual({catalogDigest:catalog.catalogDigest,entries:['environment.co2']})
})

it('目标状态变化清除旧权威预览，重新读取后只确认新目标digest',async()=>{
 const w=await setup();await authority();expect(preview.targetDigest).toBe('b'.repeat(64));publishedTarget=true;await w.setProps({typeStatus:'PUBLISHED'});await flushPromises();expect(w.find('.authority-preview').exists()).toBe(false);expect(writes()).toHaveLength(0);expect(w.text()).toContain('重新读取材料和权威预览');await button('预览 ThingsCloud TSL 转换').trigger('click');await w.get('[aria-label="ThingsCloud TSL原文"]').setValue(source);await button('转换预览').trigger('click');await authority();expect(preview.targetDigest).toBe('e'.repeat(64));await button('确认原子导入').trigger('click');await vi.waitFor(()=>expect(writes()).toHaveLength(1));expect(writes()[0]!.body.expectedPreviewDigest).toBe('f'.repeat(64))
})


async function toolbarStandard(){publishedTarget=true;const w=view=mount(Panel,{props:{typeId:type,typeStatus:'PUBLISHED',toolbar:true},attachTo:document.body,global:{plugins:[ElementPlus]}});await button('添加标准功能').trigger('click');await vi.waitFor(()=>expect(document.querySelector('.standard-entry input')).not.toBeNull());await new DOMWrapper(document.querySelector<HTMLInputElement>('.standard-entry input')!).setValue(true);return w}
it('工具栏标准功能取消零写，确定内部预览确认且双击不双发',async()=>{
 let w=await toolbarStandard();expect(document.body.textContent).not.toContain('权威导入预览');await button('取消').trigger('click');expect(writes()).toHaveLength(0);await button('添加标准功能').trigger('click');await vi.waitFor(()=>expect(document.querySelector('.standard-entry input')).not.toBeNull());await new DOMWrapper(document.querySelector<HTMLInputElement>('.standard-entry input')!).setValue(true);let release!:()=>void;holdPreview=response=>new Promise(resolve=>{release=()=>resolve(response)});const lockMark=w.emitted('locked')?.length||0,ok=button('确定');ok.element.click();ok.element.click();await vi.waitFor(()=>expect(release).toBeDefined());expect(calls.filter(call=>call.path.endsWith('previews'))).toHaveLength(1);release();await vi.waitFor(()=>expect(w.text()).toContain('已添加 1 项标准功能'));expect(writes()).toHaveLength(1);expect(w.emitted('locked')!.slice(lockMark).map(event=>event[0])).toEqual([true,false]);expect(w.text()).not.toContain('原子导入');expect(document.body.textContent).not.toContain('权威导入预览');expect(JSON.parse(writes()[0]!.body.sourceText)).toEqual({catalogDigest:catalog.catalogDigest,entries:['environment.co2']})
})
it('工具栏标准预览冲突不确认，后继明确点击未知只GET原件',async()=>{
 conflict=true;const w=await toolbarStandard();await button('确定').trigger('click');await vi.waitFor(()=>expect(document.querySelector('[role="dialog"]')?.textContent).toContain('目标已有同类标识'));expect(writes()).toHaveLength(0);expect(document.body.textContent).not.toContain('权威导入预览');conflict=false;postLost=true;await button('确定').trigger('click');await vi.waitFor(()=>expect(document.querySelector('[role="dialog"]')?.textContent).toContain('回执不可用'));expect(writes()).toHaveLength(1);const key=writes()[0]!.headers.get('Idempotency-Key');await button('按原键读取导入结果').trigger('click');await vi.waitFor(()=>expect(w.text()).toContain('已添加 1 项标准功能'));expect(writes()).toHaveLength(1);expect(calls.find(call=>call.path.endsWith('/by-key'))!.headers.get('Original-Request-Key')).toBe(key)
})
it('工具栏TSL材料改用入口预览权威后单次原子导入',async()=>{
 publishedTarget=true;const w=view=mount(Panel,{props:{typeId:type,typeStatus:'PUBLISHED',toolbar:true},attachTo:document.body,global:{plugins:[ElementPlus]}})
 await button('添加标准功能').trigger('click');await flushPromises();await button('改用 ThingsCloud TSL 材料').trigger('click');await flushPromises()
 expect(document.body.textContent).toContain('导入 ThingsCloud TSL 材料');expect([...document.querySelectorAll('button')].some(node=>node.textContent?.trim()==='确定')).toBe(false)
 await w.get('[aria-label="ThingsCloud TSL原文"]').setValue(source);await button('转换预览').trigger('click');await flushPromises()
 await button('读取权威导入预览').trigger('click');await vi.waitFor(()=>expect([...document.querySelectorAll('button')].some(node=>node.textContent?.trim()==='确认原子导入')).toBe(true));expect(document.body.textContent).toContain('目标已核对')
 await button('确认原子导入').trigger('click');await vi.waitFor(()=>expect(w.text()).toContain('已原子导入 1 项功能'))
 expect(writes()).toHaveLength(1);expect(writes()[0]!.body.sourceFormat).toBe(tslMaterialFormat);expect(w.emitted('changed')).toHaveLength(1)
})
it('工具栏标准内部预览遇目标切换取消后续确认',async()=>{
 const w=await toolbarStandard();let release!:()=>void;holdPreview=response=>new Promise(resolve=>{release=()=>resolve(response)});await button('确定').trigger('click');await vi.waitFor(()=>expect(release).toBeDefined());await w.setProps({typeId:other});release();await flushPromises();expect(writes()).toHaveLength(0);expect(w.emitted('changed')).toBeUndefined()
})

it('同标识不同品类保留目录，选择时保留原条目且不双导入',async()=>{
 const size=catalog.entries.length;catalog.entries.push({...catalog.entries[0]!,id:'other.co2',category:'另一品类'})
 try{
  await toolbarStandard();const inputs=[...document.querySelectorAll<HTMLInputElement>('.standard-entry input')];expect(inputs).toHaveLength(2)
  await new DOMWrapper(inputs[1]!).setValue(true);await flushPromises();expect(document.body.textContent).toContain('已选择同标识的功能')
  expect(inputs[0]!.checked).toBe(true);expect(inputs[1]!.checked).toBe(false)
  await button('确定').trigger('click');await vi.waitFor(()=>expect(writes()).toHaveLength(1))
  expect(JSON.parse(writes()[0]!.body.sourceText).entries).toEqual(['environment.co2'])
 }finally{catalog.entries.splice(size)}
})
