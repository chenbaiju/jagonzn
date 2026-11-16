import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Panel from '../../src/features/device-types/DeviceTypeTslPreview.vue'
import {session} from '../../src/core/session'
import {changeIdentity,setAccessToken} from '../../src/core/http'
import * as http from '../../src/core/http'
import {decodeStandardLibraryCatalog,prepareStandardLibrarySelection} from '../../src/features/device-types/standard-function-catalog-api'
import {sourceLibraryStandardMaterialFormat,sourceLibraryMaterialDigestAlgorithm} from '../../src/features/device-types/function-material-values'
const project='10000000-0000-4000-8000-000000000001',type='20000000-0000-4000-8000-000000000001',digest='a'.repeat(64)
function propertyEntry(index:number){return{id:`thingscloud.type${index}.source${index}`,category:'环境监测',kind:'PROPERTY',property:{sourcePointer:'$.attributes[0]',propertyKey:`p${index}`,name:`属性${index}`,accessType:'REPORT',dataType:'NUMBER',description:'',sortOrder:0,unit:'ppm',decimalPlaces:1}}}
function wire(count:number,format=sourceLibraryStandardMaterialFormat){return{sourceFormat:format,catalogDigest:digest,entries:Array.from({length:count},(_,index)=>propertyEntry(index))}}
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
let view:VueWrapper|undefined
beforeEach(()=>{changeIdentity();setAccessToken('source-library-fixture');session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']};session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}]})
afterEach(()=>{view?.unmount();view=undefined;session.user=null;session.projects=[];vi.restoreAllMocks();changeIdentity();document.body.innerHTML=''})
it('全库V10只接受自身格式与预算，重复身份整体拒绝',()=>{
 expect(decodeStandardLibraryCatalog(bytes(wire(60))).entries).toHaveLength(60)
 expect(()=>decodeStandardLibraryCatalog(bytes(wire(60,'THINGS_LINK_STANDARD_FUNCTIONS_V8')))).toThrow()
 expect(()=>decodeStandardLibraryCatalog(bytes(wire(2001)))).toThrow()
 expect(()=>decodeStandardLibraryCatalog(bytes({...wire(2),entries:[propertyEntry(1),propertyEntry(1)]}))).toThrow()
 expect(()=>decodeStandardLibraryCatalog(bytes({...wire(1),catalogDigest:'short'}))).toThrow()
})
it('全库选择绑定V10摘要并拒绝同域同标识',async()=>{
 const catalog=decodeStandardLibraryCatalog(bytes(wire(3)))
 const candidate=await prepareStandardLibrarySelection(project,type,catalog,['thingscloud.type0.source0','thingscloud.type1.source1'])
 expect(candidate.body.sourceFormat).toBe(sourceLibraryStandardMaterialFormat)
 expect(JSON.parse(candidate.body.sourceText!)).toEqual({catalogDigest:digest,entries:['thingscloud.type0.source0','thingscloud.type1.source1']})
 const duplicate={...catalog,entries:[catalog.entries[0]!,{...catalog.entries[1]!,property:{...catalog.entries[1]!.property!,propertyKey:'p0'}}]}
 expect(()=>prepareStandardLibrarySelection(project,type,duplicate,['thingscloud.type0.source0','thingscloud.type1.source1'])).toThrow('同一标识只能选择一个标准功能')
 expect(()=>prepareStandardLibrarySelection(project,type,catalog,['thingscloud.unknown.source'])).toThrow()
})
it('全库目录按五十项分页且跨页选择保留',async()=>{
 vi.spyOn(http,'api').mockResolvedValue(bytes(wire(60)))
 view=mount(Panel,{props:{typeId:type,typeStatus:'DRAFT',toolbar:true},attachTo:document.body,global:{plugins:[ElementPlus]}})
 const button=(label:string)=>new DOMWrapper([...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()===label&&new DOMWrapper(node).isVisible())!)
 await button('添加标准功能').trigger('click')
 await vi.waitFor(()=>expect(document.querySelectorAll('.standard-entry').length).toBe(50))
 expect(document.body.textContent).toContain('共 60 项')
 const first=document.querySelector<HTMLInputElement>('.standard-entry input')!
 await new DOMWrapper(first).setValue(true)
 const pager=[...document.querySelectorAll<HTMLElement>('.el-pager li')].find(node=>node.textContent?.trim()==='2')!
 pager.click();await flushPromises()
 await vi.waitFor(()=>expect(document.querySelectorAll('.standard-entry').length).toBe(10))
 expect(document.body.textContent).toContain('属性50')
 expect(document.querySelector<HTMLInputElement>('.standard-entry input')!.checked).toBe(false)
 const second=document.querySelector<HTMLInputElement>('.standard-entry input')!
 await new DOMWrapper(second).setValue(true)
 const firstPage=[...document.querySelectorAll<HTMLElement>('.el-pager li')].find(node=>node.textContent?.trim()==='1')!
 firstPage.click();await flushPromises()
 await vi.waitFor(()=>expect(document.querySelectorAll('.standard-entry').length).toBe(50))
 expect(document.querySelector<HTMLInputElement>('.standard-entry input')!.checked).toBe(true)
 expect(document.querySelectorAll('.standard-chosen-entry').length).toBe(2)
})
