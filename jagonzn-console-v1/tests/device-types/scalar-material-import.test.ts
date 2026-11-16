import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import sourceText from './fixtures/things-cloud-ac-template.json?raw'
import {webcrypto} from 'node:crypto'
import {flushPromises,mount,DOMWrapper,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Panel from '../../src/features/device-types/DeviceTypeTslPreview.vue'
import {convertThingsCloudTsl,convertThingsCloudScalarTsl} from '../../src/features/device-types/things-cloud-tsl'
import {prepareTslMaterial,decodeTslMaterialPreview,prepareTslMaterialConfirmation,decodeTslMaterialReceipt,scalarTslMaterialFormat,scalarStandardMaterialFormat,type MaterialProperty,type TslMaterialCandidate} from '../../src/features/device-types/tsl-material-import-api'
import {decodeStandardFunctionCatalog,prepareStandardFunctionSelection} from '../../src/features/device-types/standard-function-catalog-api'
import {functionStandardMaterialFormat,sourceLibraryStandardMaterialFormat,sourceLibraryMaterialDigestAlgorithm,functionMaterialFormat} from '../../src/features/device-types/function-material-values'
import {session} from '../../src/core/session'
import * as http from '../../src/core/http'
const project='10000000-0000-4000-8000-000000000001',type='20000000-0000-4000-8000-000000000001'
const source=()=>JSON.parse(sourceText),bytes=(text:string)=>new TextEncoder().encode(text)
const numeric=new Set(['minimumValue','maximumValue','defaultValue','numericStep'])
function propertyWire(property:object){return'{'+Object.entries(property).filter(([,value])=>value!==undefined).map(([key,value])=>JSON.stringify(key)+':'+(numeric.has(key)&&typeof value==='string'?value:JSON.stringify(value))).join(',')+'}'}
const converted=()=>convertThingsCloudScalarTsl(bytes(sourceText)).properties
function properties(){return converted().map((row,index)=>({...row,sourcePointer:`$.attributes[${index}]`})) as MaterialProperty[]}
function previewBytes(candidate:TslMaterialCandidate,rows=properties()){
 const core={targetDeviceTypeId:type,sourceFormat:candidate.body.sourceFormat,sourceName:'空调',sourceDescription:'实取AC标量模板',sourceIcon:'mdi-cube-outline',properties:[],issues:[],sourceDigest:candidate.sourceDigest,targetDigest:'b'.repeat(64),previewDigest:'c'.repeat(64),digestAlgorithm:candidate.body.sourceFormat===sourceLibraryStandardMaterialFormat?sourceLibraryMaterialDigestAlgorithm:functionMaterialFormat(candidate.body.sourceFormat!)?'DEVICE_TYPE_DEFINITION_MATERIAL_IMPORT_V3_SHA256':'DEVICE_TYPE_DEFINITION_MATERIAL_IMPORT_V2_SHA256',...(functionMaterialFormat(candidate.body.sourceFormat!)?{events:[],commands:[],adaptationDecisions:[]}:{})}
 return bytes(JSON.stringify(core).replace('"properties":[]','"properties":['+rows.map(propertyWire).join(',')+']'))
}
function receiptBytes(candidate:TslMaterialCandidate,rows=properties()){
 const core={targetDeviceTypeId:type,sourceFormat:candidate.body.sourceFormat,sourceDigest:candidate.sourceDigest,targetDigest:'b'.repeat(64),previewDigest:'c'.repeat(64),items:rows.map((row,index)=>({kind:'PROPERTY',sourcePointer:row.sourcePointer,targetId:`30000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,key:row.propertyKey})),createdAt:'2026-10-29T04:00:00Z',properties:[],...(functionMaterialFormat(candidate.body.sourceFormat!)?{events:[],commands:[],adaptationDecisions:[]}:{})}
 return bytes(JSON.stringify(core).replace('"properties":[]','"properties":['+rows.map(propertyWire).join(',')+']'))
}
function catalogBytes(){return bytes('{"sourceFormat":"'+scalarStandardMaterialFormat+'","catalogDigest":"'+'d'.repeat(64)+'","entries":['+properties().map((row,index)=>propertyWire({id:'air-conditioning.'+row.propertyKey,category:'空调',...Object.fromEntries(Object.entries(row).filter(([key])=>!['sourcePointer','sortOrder'].includes(key))),description:row.description||'',unit:row.unit??null,decimalPlaces:row.decimalPlaces??null,minimumValue:row.minimumValue??null,maximumValue:row.maximumValue??null})).join(',')+']}')}
let wrapper:VueWrapper|undefined
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);http.changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']};session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}]})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];vi.restoreAllMocks();vi.unstubAllGlobals();document.body.innerHTML=''})
it('Source完整AC六属性可转新v2，四流向三编码与精确声明保留，旧v1和未知分支仍整份拒绝',()=>{
 const result=convertThingsCloudScalarTsl(bytes(sourceText));expect(result.issues).toEqual([]);expect(result.properties).toHaveLength(6);expect(convertThingsCloudTsl(bytes(sourceText)).properties).toEqual([])
 expect(result.properties[2]).toMatchObject({propertyKey:'target_temp',accessType:'SHARED',dataType:'NUMBER',minimumValue:'16',maximumValue:'30',numericStep:'0.5'});expect(result.properties[1]).toMatchObject({dataType:'ENUM',enumOptions:['cool','heat','fan','dry','auto'],presentation:{enumDescriptions:{cool:'制冷',heat:'制热'}}})
 for(const[valueType,switchEncoding]of[['boolean','BOOLEAN'],['number','NUMBER'],['text','TEXT']]){const raw=source();raw.attributes[0].options.valueType=valueType;expect(convertThingsCloudScalarTsl(bytes(JSON.stringify(raw))).properties[0]).toMatchObject({switchEncoding})}
 const raw=source();raw.attributes.push({identifier:'text',name:'文本',descr:'',attributeType:'push',dataType:'string',options:{default:'  hello\n中文  '}},{identifier:'exact',name:'精确',descr:'',attributeType:'cloud',dataType:'number',options:{step:'0.123456789012345678901',default:'9007199254740993.1234567890123456789'}})
 const complete=convertThingsCloudScalarTsl(bytes(JSON.stringify(raw)));expect(complete.issues).toEqual([]);expect(complete.properties[6]).toMatchObject({accessType:'DOWNLINK',textDefaultValue:'  hello\n中文  '});expect(complete.properties[7]).toMatchObject({accessType:'CLOUD_PRIVATE',numericStep:'0.123456789012345678901',defaultValue:'9007199254740993.1234567890123456789'})
 for(const mutate of [(v:any)=>v.attributes[0].options.unknown=true,(v:any)=>v.attributes[2].options.step=null,(v:any)=>v.attributes[2].options.step='0',(v:any)=>v.attributes[2].options.min='31',(v:any)=>v.attributes[2].options.default='31',(v:any)=>v.attributes[2].options.min=' 16',(v:any)=>v.attributes[2].options.min=16,(v:any)=>v.attributes[2].options.default='0e999999999999999999',(v:any)=>v.attributes[0].attributeType='toString',(v:any)=>v.attributes[0].dataType='object',(v:any)=>v.attributes[0].dataType='list',(v:any)=>v.events.push({identifier:'e'}),(v:any)=>v.commands.push({identifier:'c'})]){const bad=source();mutate(bad);const rejected=convertThingsCloudScalarTsl(bytes(JSON.stringify(bad)));expect(rejected.issues.length).toBeGreaterThan(0);expect(rejected.properties).toEqual([])}
})
it('新v2权威字段与原键完整回执严格核对，旧摘要不冒v2且标准选择仅传目录摘要和ID',async()=>{
 const candidate=await prepareTslMaterial(project,type,sourceText,scalarTslMaterialFormat),preview=decodeTslMaterialPreview(previewBytes(candidate),candidate),intent=prepareTslMaterialConfirmation(candidate,preview),receipt=decodeTslMaterialReceipt(receiptBytes(candidate),intent)
 expect(preview.properties[2]?.numericStep).toBe('0.5');expect(receipt.properties).toEqual(preview.properties)
 const changed=properties();changed[0]={...changed[0]!,switchEncoding:'TEXT'};expect(()=>decodeTslMaterialReceipt(receiptBytes(candidate,changed),intent)).toThrow();expect(()=>decodeTslMaterialPreview(bytes(new TextDecoder().decode(previewBytes(candidate)).replace('MATERIAL_IMPORT_V2','MATERIAL_IMPORT_V1')),candidate)).toThrow()
 const absent=JSON.parse(new TextDecoder().decode(receiptBytes(candidate)));delete absent.properties;expect(()=>decodeTslMaterialReceipt(bytes(JSON.stringify(absent)),intent)).toThrow()
 const catalog=decodeStandardFunctionCatalog(catalogBytes());expect(catalog.entries[0]).toMatchObject({dataType:'SWITCH',switchEncoding:'BOOLEAN',unit:null,decimalPlaces:null});expect(catalog.entries[1]?.presentation?.enumDescriptions?.cool).toBe('制冷')
 const selected=await prepareStandardFunctionSelection(project,type,catalog,catalog.entries.map(row=>row.id!));expect(selected.body.sourceFormat).toBe(scalarStandardMaterialFormat);expect(JSON.parse(selected.body.sourceText!)).toEqual({catalogDigest:'d'.repeat(64),entries:catalog.entries.map(row=>row.id)})
})
it('标准功能原弹窗展示真实类型和全部扩展选项，取消零写，再一次确定传全候选与回执',async()=>{
 vi.spyOn(http,'api').mockImplementation(async path=>{if(String(path).endsWith('/library')){return bytes('{"sourceFormat":"'+sourceLibraryStandardMaterialFormat+'","catalogDigest":"'+'d'.repeat(64)+'","entries":['+properties().map(row=>'{"id":"air-conditioning.'+row.propertyKey+'","category":"空调","kind":"PROPERTY","property":'+propertyWire(row)+'}').join(',')+']}')}return catalogBytes()})
 const preview=vi.fn(async(candidate:TslMaterialCandidate)=>decodeTslMaterialPreview(previewBytes(candidate),candidate)),confirm=vi.fn(async(intent:ReturnType<typeof prepareTslMaterialConfirmation>)=>decodeTslMaterialReceipt(receiptBytes(intent.candidate),intent)),original=vi.fn()
 wrapper=mount(Panel,{props:{typeId:type,typeStatus:'PUBLISHED',toolbar:true,transport:{preview,confirm,original}},attachTo:document.body,global:{plugins:[ElementPlus]}})
 const button=(label:string)=>new DOMWrapper([...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()===label)!)
 await button('添加标准功能').trigger('click');await flushPromises();expect(document.body.textContent).toContain('电源开关');expect(document.body.textContent).toContain('运行模式');expect(wrapper.find('[aria-label="ThingsCloud TSL原文"]').exists()).toBe(false)
 await button('取消').trigger('click');expect(confirm).not.toHaveBeenCalled();await button('添加标准功能').trigger('click');await flushPromises();for(const box of wrapper.findAll('.standard-entry input[type="checkbox"]'))await box.setValue(true)
 await button('确定').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('已添加 6 项标准功能'));expect(preview).toHaveBeenCalledTimes(1);expect(confirm).toHaveBeenCalledTimes(1);expect(confirm.mock.calls[0]![0].preview.properties[1]?.presentation?.enumDescriptions?.cool).toBe('制冷');expect(original).not.toHaveBeenCalled()
})
