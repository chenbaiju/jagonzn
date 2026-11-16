import {afterEach,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Dialog from '../../src/features/device-groups/DeviceGroupSortDialog.vue'
import {ApiError} from '../../src/core/http'
import type {DeviceGroup,GroupTransport} from '../../src/features/device-groups/device-group-api'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const group=(n:number,parentId:string|null=null):DeviceGroup=>({id:id(n),name:`组${n}`,parentId,color:null,description:null,type:'STATIC',rule:null,createdAt:'2026-10-29T00:00:00Z',tags:{},sortOrder:n===2?1:0,revision:'0'})
let wrapper:ReturnType<typeof mount>
afterEach(()=>{wrapper?.unmount();document.body.innerHTML=''})
function button(text:string){return [...document.body.querySelectorAll('button')].find(node=>node.textContent?.trim()===text)!}
function open(){
 const values=[group(1),group(2),group(3,id(1))]
 const order=vi.fn().mockResolvedValue(values),sort=vi.fn().mockImplementation(async(_project,items)=>items.map((item:any)=>{const old=values.find(group=>group.id===item.id)!;return {...old,parentId:item.parentId,sortOrder:item.sortOrder,revision:old.parentId===item.parentId&&old.sortOrder===item.sortOrder?'0':'1'}}))
 const transport={order,sort,list:vi.fn(),write:vi.fn(),read:vi.fn()} as unknown as GroupTransport
 wrapper=mount(Dialog,{attachTo:document.body,props:{modelValue:true,project:id(9),writable:true,transport},global:{plugins:[ElementPlus]}})
 return {order,sort,transport}
}
it('父组带子组整体排序，保存一次并回传新位置',async()=>{
 const {sort}=open();await flushPromises()
 const rows=wrapper.findAll('.sort-row');expect(rows[1]!.attributes('draggable')).toBe('false')
 await rows[0]!.trigger('dragstart');await rows[2]!.trigger('drop',{clientY:100});await flushPromises()
 expect(wrapper.findAll('.sort-root').map(row=>row.text())).toEqual(['组2','组1组3'])
 button('保存').click();await flushPromises()
 expect(sort).toHaveBeenCalledTimes(1);expect(sort.mock.calls[0]![1]).toEqual([
  {id:id(2),parentId:null,sortOrder:0,revision:'0'}, {id:id(1),parentId:null,sortOrder:1,revision:'0'}, {id:id(3),parentId:id(1),sortOrder:0,revision:'0'}])
 expect(wrapper.emitted('saved')).toHaveLength(1);expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
})
it('取消不写入；版本冲突后只允许重新读取，不自动重放',async()=>{
 const {sort,order}=open();await flushPromises();button('取消').click();expect(sort).not.toHaveBeenCalled()
 sort.mockRejectedValueOnce(new ApiError('设备组已经变化',409));button('保存').click();await flushPromises()
 expect(document.body.textContent).toContain('设备组已经变化');expect(button('保存').disabled).toBe(true)
 button('重新读取核对').click();await flushPromises();expect(order).toHaveBeenCalledTimes(2);expect(sort).toHaveBeenCalledTimes(1)
})
it('无子组的根组可放入另一根组，带子组的根组不可放入',async()=>{
 const {sort}=open();await flushPromises()
 await wrapper.findAll('.sort-root-row')[0]!.trigger('dragstart');await wrapper.findAll('.sort-children')[1]!.trigger('drop');await flushPromises()
 expect(wrapper.findAll('.sort-root')).toHaveLength(2)
 await wrapper.findAll('.sort-root-row')[1]!.trigger('dragstart');await wrapper.findAll('.sort-children')[0]!.trigger('drop');await flushPromises()
 expect(wrapper.findAll('.sort-root')).toHaveLength(1)
 button('保存').click();await flushPromises()
 expect(sort.mock.calls[0]![1]).toEqual([{id:id(1),parentId:null,sortOrder:0,revision:'0'},{id:id(3),parentId:id(1),sortOrder:0,revision:'0'},{id:id(2),parentId:id(1),sortOrder:1,revision:'0'}])
})
it('历史深层组随父组整体展示，排序意图保留所有后代与原序号',async()=>{
 const {order,sort}=open();order.mockResolvedValue([group(1),group(2),group(3,id(1)),{...group(4,id(3)),sortOrder:7}])
 sort.mockResolvedValue([{...group(2),sortOrder:0,revision:'1'},{...group(1),sortOrder:1,revision:'1'},group(3,id(1)),{...group(4,id(3)),sortOrder:7}])
 await wrapper.setProps({modelValue:false});await wrapper.setProps({modelValue:true});await flushPromises()
 expect(wrapper.text()).toContain('组4');expect(wrapper.findAll('.sort-row')[2]!.attributes('draggable')).toBe('false')
 await wrapper.findAll('.sort-root-row')[0]!.trigger('keydown',{key:'ArrowDown'});button('保存').click();await flushPromises()
 expect(sort.mock.calls[0]![1]).toContainEqual({id:id(4),parentId:id(3),sortOrder:7,revision:'0'})
})
it('子组可提升为一级组并保存',async()=>{
 const {sort}=open();await flushPromises()
 await wrapper.find('.sort-child-row').trigger('dragstart');expect(wrapper.findAll('.root-drop-slot')).toHaveLength(4)
 await wrapper.findAll('.root-drop-slot')[3]!.trigger('dragover');await wrapper.findAll('.root-drop-slot')[3]!.trigger('drop')
 expect(wrapper.findAll('.sort-root').map(row=>row.text())).toEqual(['组1','组2','组3'])
 button('保存').click();await flushPromises()
 expect(sort.mock.calls[0]![1]).toContainEqual({id:id(3),parentId:null,sortOrder:2,revision:'0'})
})
it('子组可转移到另一个一级组并保存',async()=>{
 const {sort}=open();await flushPromises()
 await wrapper.find('.sort-child-row').trigger('dragstart');await wrapper.findAll('.sort-children')[1]!.trigger('drop',{clientX:100})
 expect(wrapper.findAll('.sort-root').map(row=>row.text())).toEqual(['组1','组2组3'])
 button('保存').click();await flushPromises()
 expect(sort.mock.calls[0]![1]).toContainEqual({id:id(3),parentId:id(2),sortOrder:0,revision:'0'})
})
it('拖动时父组整体作为拖影，经过目标即让出位置并保存新顺序',async()=>{
 const {sort}=open();await flushPromises();const rows=wrapper.findAll('.sort-root-row'),dragImage=vi.fn(),setData=vi.fn()
 await rows[0]!.trigger('dragstart',{dataTransfer:{setData,setDragImage:dragImage,effectAllowed:''}})
 expect(dragImage.mock.calls[0]![0]).toBe(wrapper.findAll('.sort-root')[0]!.element)
 await rows[1]!.trigger('dragover',{clientY:100});expect(wrapper.findAll('.sort-root').map(row=>row.text())).toEqual(['组2','组1组3'])
 expect(wrapper.findAll('.sort-root')[0]!.classes()).toContain('is-drop-target')
 await rows[1]!.trigger('drop',{clientY:100});expect(wrapper.findAll('.sort-root')[0]!.classes()).not.toContain('is-drop-target')
 button('保存').click();await flushPromises();expect(sort.mock.calls[0]![1].map((item:any)=>item.id)).toEqual([id(2),id(1),id(3)])
 expect(wrapper.findAll('.sort-root-row')).toHaveLength(2)
 expect(wrapper.find('[aria-label^="上移"]').exists()).toBe(false)
})
it('取消拖动时恢复拖动前的顺序',async()=>{
 open();await flushPromises();const rows=wrapper.findAll('.sort-root-row')
 await rows[0]!.trigger('dragstart');await rows[1]!.trigger('dragover',{clientY:100})
 expect(wrapper.findAll('.sort-root').map(row=>row.text())).toEqual(['组2','组1组3'])
 await rows[0]!.trigger('dragend');expect(wrapper.findAll('.sort-root').map(row=>row.text())).toEqual(['组1组3','组2'])
})
it('鼠标松开提交实时预览顺序，后续保存保留父组及子组位置',async()=>{
 const {sort}=open();await flushPromises();const rows=wrapper.findAll('.sort-root-row')
 const previous=Object.getOwnPropertyDescriptor(document,'elementFromPoint')
 Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>rows[1]!.element})
 try{
  rows[0]!.element.dispatchEvent(new MouseEvent('pointerdown',{button:0,clientX:10,clientY:0,bubbles:true}))
  window.dispatchEvent(new MouseEvent('pointermove',{clientX:10,clientY:100}));await flushPromises()
  expect(document.querySelector('.sort-drag-preview')?.textContent).toContain('组1组3')
  window.dispatchEvent(new MouseEvent('pointerup',{clientX:10,clientY:100}));await flushPromises()
  expect(document.querySelector('.sort-drag-preview')).toBeNull()
  expect(wrapper.findAll('.sort-root').map(row=>row.text())).toEqual(['组2','组1组3'])
  button('保存').click();await flushPromises()
  expect(sort.mock.calls[0]![1].map((item:any)=>item.id)).toEqual([id(2),id(1),id(3)])
 }finally{if(previous)Object.defineProperty(document,'elementFromPoint',previous);else delete (document as any).elementFromPoint}
})
it('拖动期间关闭弹窗会清除拖影和全局监听，重新打开不沿用旧拖动',async()=>{
 open();await flushPromises();const row=wrapper.find('.sort-root-row')
 const previous=Object.getOwnPropertyDescriptor(document,'elementFromPoint')
 Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>row.element})
 try{
 row.element.dispatchEvent(new MouseEvent('pointerdown',{button:0,clientX:10,clientY:0,bubbles:true}))
 window.dispatchEvent(new MouseEvent('pointermove',{clientX:20,clientY:20}));await flushPromises()
 expect(document.querySelector('.sort-drag-preview')).not.toBeNull()
 await wrapper.setProps({modelValue:false});await flushPromises()
 expect(document.querySelector('.sort-drag-preview')).toBeNull()
 await wrapper.setProps({modelValue:true});await flushPromises()
 window.dispatchEvent(new MouseEvent('pointermove',{clientX:50,clientY:50}));await flushPromises()
 expect(document.querySelector('.sort-drag-preview')).toBeNull()
 }finally{if(previous)Object.defineProperty(document,'elementFromPoint',previous);else delete (document as any).elementFromPoint}
})
