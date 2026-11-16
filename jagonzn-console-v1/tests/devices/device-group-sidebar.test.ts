import {it,expect,vi} from 'vitest'
import {mount} from '@vue/test-utils'
import {createMemoryHistory,createRouter} from 'vue-router'
import Sidebar from '../../src/features/devices/DeviceGroupSidebar.vue'

it('父子组展开收起、颜色与详情入口互不影响筛选',async()=>{
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/device-groups/:groupId',name:'device-groups',component:{template:'<div />'}}]})
 const base={description:null,type:'STATIC' as const,rule:null,createdAt:'2026-01-01T00:00:00Z',tags:{},sortOrder:0,revision:'0'}
 const wrapper=mount(Sidebar,{props:{selected:'',groups:[{...base,id:'parent',name:'父组',parentId:null,color:'#008888'},{...base,id:'child',name:'子组',parentId:'parent',color:'#cc0088'}]},global:{plugins:[router]}})
 expect(wrapper.text()).toContain('子组')
 expect(wrapper.findAll('.group-row .group-color').map(node=>node.attributes('style'))).toEqual(['background-color: rgb(0, 136, 136);','background-color: rgb(204, 0, 136);'])
 expect(wrapper.findAll('.sidebar-filter .group-color')).toHaveLength(2)
 await wrapper.get('[aria-label="收起 父组"]').trigger('click')
 expect(wrapper.text()).not.toContain('子组');expect(wrapper.emitted('select')).toBeUndefined()
 await wrapper.get('[aria-label="展开 父组"]').trigger('click')
 await wrapper.findAll('.group-name')[1]!.trigger('click');expect(wrapper.emitted('select')).toEqual([['child']])
 expect(wrapper.get('[aria-label="查看设备组 父组 详情"]').attributes('href')).toBe('/device-groups/parent')
 wrapper.unmount()
})
it('分割线支持拖动及键盘调整，卸载后释放监听',async()=>{
 const router=createRouter({history:createMemoryHistory(),routes:[]})
 const wrapper=mount(Sidebar,{props:{selected:'',groups:[]},global:{plugins:[router]}})
 const sidebar=wrapper.get('aside'),separator=wrapper.get('[role="separator"]')
 vi.spyOn(sidebar.element,'getBoundingClientRect').mockReturnValue({width:200} as DOMRect)
 const pointer=(type:string,x:number)=>{const event=new MouseEvent(type,{clientX:x,button:0,bubbles:true});Object.defineProperty(event,'pointerId',{value:7});return event}
 separator.element.dispatchEvent(pointer('pointerdown',200));window.dispatchEvent(pointer('pointermove',310));await wrapper.vm.$nextTick()
 expect(sidebar.attributes('style')).toContain('310px')
 window.dispatchEvent(pointer('pointerup',310));window.dispatchEvent(pointer('pointermove',400));await wrapper.vm.$nextTick();expect(sidebar.attributes('style')).toContain('310px')
 await separator.trigger('keydown',{key:'ArrowLeft'});expect(sidebar.attributes('style')).toContain('300px')
 wrapper.unmount()
})
