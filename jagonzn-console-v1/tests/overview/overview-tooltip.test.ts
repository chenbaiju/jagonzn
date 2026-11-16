import {afterEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import OverviewRingChart from '../../src/features/overview/OverviewRingChart.vue'
import OverviewTrendChart from '../../src/features/overview/OverviewTrendChart.vue'
import OverviewChartTooltip from '../../src/features/overview/OverviewChartTooltip.vue'
import {trendEntrance,trendLayout} from '../../src/features/overview/overview-trend-layout'
import {tooltipPosition} from '../../src/features/overview/overview-tooltip'
import type {OverviewChart} from '../../src/features/overview/overview-api'
import {ringSectorPath} from '../../src/features/overview/overview-ring-geometry'
let wrapper:VueWrapper|undefined
function pointer(x:number,y:number){wrapper!.find('svg').element.dispatchEvent(new MouseEvent('pointermove',{clientX:x,clientY:y,bubbles:true}));return flushPromises()}
afterEach(()=>{wrapper?.unmount();wrapper=undefined;vi.restoreAllMocks();vi.unstubAllGlobals();document.body.innerHTML=''})
it('提示沿原站环图翻边及曲线居中上移，曲线贴近视口时翻转并避让',()=>{
 const bounds={left:0,top:0,right:500,bottom:300},size={width:140,height:80}
 expect(tooltipPosition({x:100,y:100},size,bounds,'item')).toEqual({x:120,y:120})
 expect(tooltipPosition({x:480,y:280},size,bounds,'item')).toEqual({x:320,y:180})
 expect(tooltipPosition({x:180,y:180},{width:160,height:126},{left:100,top:100,right:500,bottom:260},'item')).toEqual({x:200,y:34})
 expect(tooltipPosition({x:250,y:200},size,bounds,'trend')).toEqual({x:180,y:106})
 expect(tooltipPosition({x:10,y:10},size,bounds,'trend')).toEqual({x:4,y:24})
 expect(tooltipPosition({x:499,y:200},size,bounds,'trend').x).toBe(356)
 expect(tooltipPosition({x:250,y:295},{width:140,height:280},bounds,'trend')).toEqual({x:180,y:16})
 const small=trendLayout(700,270,18,80,80),large=trendLayout(1400,270,18,80,80);expect(small.left).toBe(43);expect(large.left).toBe(small.left);expect(large.right).toBe(43);expect(large.width-small.width).toBe(700);expect(trendEntrance(0)).toBe(0);expect(trendEntrance(500)).toBe(.9375);expect(trendEntrance(1000)).toBe(1)
})
it('环图按扇区切换无原生title，活跃显示轴项；曲线按桶数据点平均定位保零与未知并随离开隐藏',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true}))
 vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{queueMicrotask(()=>callback(performance.now()+1000));return 1})
 const boundsRead=vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(this:Element){const trend=this.tagName.toLowerCase()==='svg'&&this.closest('.overview-trend');const tooltip=this.classList.contains('overview-chart-tooltip');return {left:100,top:100,width:this.hasAttribute('data-y')?18:this.hasAttribute('data-first')||this.hasAttribute('data-last')?80:tooltip?160:trend?680:this.classList.contains('ring-body')?400:160,height:tooltip?70:trend?190:160,right:tooltip?260:trend?780:this.classList.contains('ring-body')?500:260,bottom:tooltip?170:trend?290:260,x:100,y:100,toJSON(){return {}}} as DOMRect})
 wrapper=mount(OverviewRingChart,{props:{ring:{key:'online',title:'设备在线率',center:'50%',available:true,slices:[{label:'在线设备',value:1,color:'#3ba272'},{label:'离线设备',value:1,color:'#ccc'}]}},attachTo:document.body})
 expect(wrapper.find('title').exists()).toBe(false)
 await pointer(224,180);await flushPromises();expect(document.querySelector('[role=tooltip]')?.textContent).toContain('在线设备1')
 expect(wrapper.find('.ring-sector.emphasized').attributes('data-outer-radius')).toBe('61');expect(wrapper.find('.ring-sector.emphasized').attributes('d')).toContain('A 32 32')
 await pointer(238,180);expect(wrapper.find('.ring-sector.emphasized').exists()).toBe(true)
 await pointer(136,180);await flushPromises();expect(document.querySelector('[role=tooltip]')?.textContent).toContain('离线设备1')
 expect(wrapper.findAll('.ring-sector')[0]!.attributes('data-outer-radius')).toBe('56');expect(wrapper.findAll('.ring-sector.emphasized')).toHaveLength(1)
 await pointer(180,180);await flushPromises();expect(document.querySelector('[role=tooltip]')).toBeNull()
 expect(wrapper.find('.ring-sector.emphasized').exists()).toBe(false)
 await wrapper.setProps({ring:{key:'activity',title:'设备活跃率',center:'100%',available:true,slices:[{label:'5分钟内',value:1,color:'#8B5CF6'},{label:'1天以上',value:0,color:'#ccc'}]}});await pointer(180,180);await flushPromises();expect(document.querySelector('[role=tooltip]')?.textContent).toContain('1天以上0')
 const measured=boundsRead.mock.calls.length
 await pointer(180,160);expect(wrapper.findComponent(OverviewChartTooltip).props('point').y).toBe(160);await pointer(180,200);expect(wrapper.findComponent(OverviewChartTooltip).props('point').y).toBe(200);expect(document.querySelector('.overview-chart-tooltip.item.moving')).not.toBeNull();expect(wrapper.find('.activity-pointer').exists()).toBe(true)
 expect(boundsRead.mock.calls.length).toBe(measured);expect((document.querySelector('.overview-chart-tooltip') as HTMLElement).style.transform).toBe('translate3d(200px,110px,0)')
 window.dispatchEvent(new Event('resize'));await flushPromises();expect(document.querySelector('.overview-chart-tooltip')).toBeNull();await pointer(180,180);expect(boundsRead.mock.calls.length).toBeGreaterThan(measured)
 await wrapper.setProps({ring:{key:'type',title:'types',center:'20',available:true,slices:[{label:'direct',value:13,color:'#5470c6'},{label:'gateway',value:2,color:'#91cc75'},{label:'child',value:5,color:'#fac858'}]}})
 expect(wrapper.find('svg > :last-child').classes()).toContain('ring-hit-plane');expect(wrapper.find('.ring-hit-plane').attributes('pointer-events')).toBe('all')
 for(const position of [[149,149],[141,141],[139,139],[149,149]]){await pointer(position[0]!,position[1]!);expect(document.querySelector('.overview-chart-tooltip')?.textContent).toContain('child5');expect(wrapper.findAll('.ring-sector.emphasized')).toHaveLength(1)}
 wrapper.unmount();wrapper=mount(OverviewTrendChart,{props:{chart:{key:'messages',title:'设备消息数',unit:'COUNT',aggregation:'SUM',series:[{key:'up',label:'上行',values:[0,4]},{key:'down',label:'下行',values:[null,6]}]},from:'2026-10-31T09:00:00Z',stepHours:1},attachTo:document.body});await flushPromises()
 await pointer(314,150);await flushPromises()
 expect(wrapper.findComponent(OverviewChartTooltip).props('point').x).toBeCloseTo(291.5);expect(wrapper.findComponent(OverviewChartTooltip).props('point').y).toBeCloseTo(268.8);expect(document.querySelector('[role=tooltip]')?.textContent).toContain('10-31 17:00');expect(document.querySelector('[role=tooltip]')?.textContent).toContain('上行0下行未统计')
 await pointer(614,150);await flushPromises();expect(wrapper.findComponent(OverviewChartTooltip).props('point').x).toBeCloseTo(588.5);expect(wrapper.findComponent(OverviewChartTooltip).props('point').y).toBeCloseTo(260.69);expect(document.querySelector('[role=tooltip]')?.textContent).toContain('上行4下行6')
 await wrapper.find('.trend-legend button').trigger('click');expect(document.querySelector('[role=tooltip]')).toBeNull();await pointer(614,150);await flushPromises();expect(document.querySelector('[role=tooltip]')?.textContent).not.toContain('上行');await wrapper.find('svg').trigger('pointerleave');expect(document.querySelector('[role=tooltip]')).toBeNull()
})
it('真实数据进入与替换时重播绘图，环图和趋势按原缓动完成且卸载取消帧',async()=>{
 let now=0,id=0
 const frames=new Map<number,FrameRequestCallback>()
 vi.stubGlobal('matchMedia',()=>({matches:false}))
 vi.spyOn(performance,'now').mockImplementation(()=>now)
 vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{frames.set(++id,callback);return id})
 vi.spyOn(window,'cancelAnimationFrame').mockImplementation(key=>{frames.delete(key)})
 async function advance(time:number){now=time;const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(now));await flushPromises()}
 const ring={key:'online',title:'设备在线率',center:'50%',available:true,slices:[{label:'在线设备',value:1,color:'#3ba272'},{label:'离线设备',value:1,color:'#ccc'}]}
 wrapper=mount(OverviewRingChart,{props:{ring}});await flushPromises()
 expect(wrapper.find('.ring-body').attributes('data-draw-progress')).toBe('0')
 await advance(500);expect(wrapper.find('.ring-body').attributes('data-draw-progress')).toBe('0.5')
 await wrapper.setProps({ring:{...ring}});expect(wrapper.find('.ring-body').attributes('data-draw-progress')).toBe('0')
 await advance(1500);expect(wrapper.find('.ring-body').attributes('aria-busy')).toBe('false')
 vi.spyOn(Element.prototype,'getBoundingClientRect').mockReturnValue({left:100,top:100,width:160,height:160,right:260,bottom:260} as DOMRect)
 const neighbour=wrapper.findAll('.ring-sector')[1]!.attributes('d')
 await pointer(224,180);await advance(1650)
 expect(Number(wrapper.find('.ring-sector.emphasized').attributes('data-outer-radius'))).toBeCloseTo(60.375)
 expect(wrapper.findAll('.ring-sector')[1]!.attributes('d')).toBe(neighbour)
 await wrapper.setProps({ring:{...ring}});wrapper.unmount();wrapper=undefined;expect(frames.size).toBe(0)
 const chart:OverviewChart={key:'active',title:'活跃设备数',unit:'COUNT',aggregation:'SUM',series:[{key:'active',label:'总活跃设备',values:[0,4]}]}
 wrapper=mount(OverviewTrendChart,{props:{chart}});await flushPromises()
 expect(wrapper.find('.chart-canvas').attributes('data-draw-progress')).toBe('0')
 await advance(2150);expect(wrapper.find('.chart-canvas').attributes('data-draw-progress')).toBe('0.9375')
 await wrapper.setProps({chart:{...chart}});await flushPromises();expect(wrapper.find('.chart-canvas').attributes('data-draw-progress')).toBe('0')
 await advance(3150);expect(wrapper.find('.chart-canvas').attributes('aria-busy')).toBe('false')
 await wrapper.setProps({chart:{...chart}});await flushPromises();wrapper.unmount();wrapper=undefined;expect(frames.size).toBe(0)
})
it('黄色扇区放大仅改变外缘，内缘及交界射线固定，整圆与零值仍可绘制',()=>{
 expect(ringSectorPath(75,25,56)).toBe('M 24 80 A 56 56 0 0 1 80 24 L 80 48 A 32 32 0 0 0 48 80 Z')
 expect(ringSectorPath(75,25,61)).toBe('M 19 80 A 61 61 0 0 1 80 19 L 80 48 A 32 32 0 0 0 48 80 Z')
 expect(ringSectorPath(0,0,56)).toBe('');expect(ringSectorPath(0,100,56).match(/A 56 56/g)).toHaveLength(2);expect(ringSectorPath(0,100,56).match(/A 32 32/g)).toHaveLength(2)
})
