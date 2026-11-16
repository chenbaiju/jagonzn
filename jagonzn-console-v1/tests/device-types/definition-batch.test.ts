import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Batch from '../../src/features/device-types/DeviceTypeDefinitionBatch.vue'
import {type DefinitionBatchTransport,type DefinitionBatchRow} from '../../src/features/device-types/model-definition-batch'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=uuid(100),type=uuid(200)
const definitions:DefinitionBatchRow[]=(['property','event','command']as const).map((kind,i)=>({id:uuid(i+1),kind,name:kind+'定义',identifier:kind+'Key',fingerprint:kind+'原正文'}))
const wrappers:VueWrapper[]=[]
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()===label);expect(found,label).toBeDefined();return found!}
async function click(label:string){button(label).click();await flushPromises()}
async function selectAll(){for(const el of document.querySelectorAll<HTMLInputElement>('input[type=checkbox]'))await new DOMWrapper(el).setValue(true)}
function transport(){
 let remaining=[...definitions];const writes:string[]=[],keys:string[]=[];const read=vi.fn(async()=>remaining)
 const port:DefinitionBatchTransport={load:async()=>remaining,prepare:(_project,_type,row)=>{const key=crypto.randomUUID();keys.push(key);return{row,key,read,remove:async()=>{writes.push(row.id);remaining=remaining.filter(item=>item.id!==row.id)}}}}
 return{port,writes,keys,read,setRemaining:(value:DefinitionBatchRow[])=>{remaining=value}}
}
function render(port:DefinitionBatchTransport){const w=mount(Batch,{props:{typeId:type,typeStatus:'DRAFT',transport:port},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);return w}
beforeEach(()=>{changeIdentity('batch-fixture');Object.assign(session,{ready:true,transitioning:false,user:{accountId:uuid(99),currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']},projects:[{id:project,myRole:'OWNER',status:'ACTIVE'}]})})
afterEach(()=>{wrappers.forEach(w=>w.unmount());wrappers.length=0;document.body.innerHTML='';vi.restoreAllMocks()})
it('明确选择三类逐项删除，取消零写，双击不启动第二批，成功后才刷新宿主',async()=>{
 const t=transport(),w=render(t.port);await click('批量删除功能定义');await selectAll();await click('取消');expect(t.writes).toEqual([])
 await click('批量删除功能定义');await selectAll();const confirm=button('确认逐项删除');confirm.click();confirm.click();await flushPromises()
 expect(t.writes).toEqual(definitions.map(row=>row.id));expect(new Set(t.keys).size).toBe(3);expect(document.body.textContent).toContain('成功项不会回滚');expect(document.body.textContent?.match(/已删除/g)).toHaveLength(3);expect(w.emitted('changed')).toBeUndefined();await click('关闭结果');expect(w.emitted('changed')).toHaveLength(1)
})
it('第二项未知立即停止第三项，保留原键只读核对，不把当前缺失当原删除成功',async()=>{
 const t=transport(),original=t.port.prepare;let readUnknown=false
 t.port.prepare=(p,y,row)=>{const intent=original(p,y,row);if(row.kind==='event')return{...intent,remove:async()=>{t.writes.push(row.id);throw new ApiError('结果未知',0,undefined,undefined,true)},read:async signal=>readUnknown?[]:intent.read(signal)};return intent}
 const w=render(t.port);await click('批量删除功能定义');await selectAll();await click('确认逐项删除');expect(t.writes).toEqual(definitions.slice(0,2).map(row=>row.id));expect(document.body.textContent).toContain(t.keys[1]);expect(document.body.textContent).toContain('未执行');expect(w.emitted('locked')?.at(-1)).toEqual([true])
 session.user={...session.user!,projectRole:'VIEWER',permissions:['device:read']};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];await w.setProps({disabled:true});readUnknown=true;await click('只读核对当前定义');expect(document.body.textContent).toContain('当前列表中未见');expect(document.body.textContent).toContain('不能证明原请求结果');expect(t.writes).toHaveLength(2);await click('结束核对，保留原结果未知');expect(w.emitted('locked')?.at(-1)).toEqual([false]);expect(t.writes).toHaveLength(2)
})
it('选择后的内容漂移零删除；执行中停止只完成在途一项；切范围清旧结果',async()=>{
 const t=transport(),w=render(t.port);await click('批量删除功能定义');await selectAll();t.setRemaining([{...definitions[0]!,fingerprint:'已变化'},...definitions.slice(1)]);await click('确认逐项删除');expect(t.writes).toEqual([]);expect(document.body.textContent).toContain('未发送删除');await click('关闭结果')
 t.setRemaining([...definitions]);let finish!:()=>void;const original=t.port.prepare;t.port.prepare=(p,y,row)=>{const intent=original(p,y,row);return{...intent,remove:async signal=>{await new Promise<void>(done=>{finish=done});return intent.remove(signal)}}}
 await click('批量删除功能定义');await selectAll();button('确认逐项删除').click();await flushPromises();await click('当前项完成后停止');finish();await flushPromises();expect(t.writes).toEqual([definitions[0]!.id]);expect(document.body.textContent).toContain('未执行');await w.setProps({typeId:uuid(300)});expect(document.body.textContent).not.toContain('property定义');expect(w.emitted('locked')?.at(-1)).toEqual([false])
})

it('未知结果核对时服务端拒绝读取，清除旧定义和原键且不追加删除',async()=>{
 const t=transport(),original=t.port.prepare;let denied=false
 t.port.prepare=(p,y,row)=>{const intent=original(p,y,row);return{...intent,remove:async()=>{t.writes.push(row.id);throw new ApiError('结果未知',0,undefined,undefined,true)},read:async signal=>{if(denied)throw new ApiError('无读取权限',403);return intent.read(signal)}}}
 const w=render(t.port);await click('批量删除功能定义');await selectAll();await click('确认逐项删除');denied=true;await click('只读核对当前定义');expect(document.body.textContent).not.toContain(t.keys[0]);expect(document.body.textContent).not.toContain('property定义');expect(t.writes).toHaveLength(1);expect(w.emitted('locked')?.at(-1)).toEqual([false])
})
