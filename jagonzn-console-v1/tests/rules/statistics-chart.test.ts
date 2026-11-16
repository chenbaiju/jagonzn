import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Chart from '../../src/features/rules/UsageChart.vue'
import { invalidateIdentity } from '../../src/core/http'
it('未知动作断线与索引提示保真，响应式留白和点锚定不跟随鼠标上下', async () => {
  const wrapper = mount(Chart, { props: { labels: ['规则调用次数', '操作执行次数'], points: [
    { time: '2026-10-24T00:00:00Z', values: [1, 1] }, { time: '2026-10-24T01:00:00Z', values: [2, null] }, { time: '2026-10-24T02:00:00Z', values: [3, 4] }
  ] } }); expect(wrapper.findAll('polyline[data-series="0"]')).toHaveLength(1); expect(wrapper.findAll('polyline[data-series="1"]')).toHaveLength(2); expect(wrapper.text()).toContain('10-24 08:00')
  await wrapper.vm.$nextTick() // 等初次DOM ref/几何post watcher完成，再模拟真实页面事件。
  const svg = wrapper.get('svg'), tooltip = wrapper.get('[role=tooltip]')
  let width = 500, left = 100, height = 230
  svg.element.getBoundingClientRect = () => ({ left, top: 20, width, height, right: left + width, bottom: 20 + height, x: left, y: 20, toJSON() {} })
  wrapper.get('figure').element.getBoundingClientRect = () => ({ left, top: 20, width, height: 250, right: left + width, bottom: 270, x: left, y: 20, toJSON() {} })
  tooltip.element.getBoundingClientRect = () => { const position = left + parseFloat((tooltip.element as HTMLElement).style.left); return { left: position - 70, right: position + 70, top: 0, bottom: 60, width: 140, height: 60, x: position - 70, y: 0, toJSON() {} } }
  // 500×230的SVG默认meet，上下各57.5留白；中间小时的已知2与null保原值。
  await svg.trigger('mousemove', { clientX: 351.5, clientY: 127.5 })
  expect(tooltip.get('.tooltip-title').text()).toBe('10-24 09:00')
  expect(tooltip.findAll('.tooltip-value').map(value => value.text())).toEqual(['2', '未统计'])
  const top = (tooltip.element as HTMLElement).style.top
  expect(parseFloat(top)).toBeCloseTo(151.9)
  expect(wrapper.get('.hover-band').attributes('fill')).toBe('rgba(19, 33, 68, 0.045)')
  expect(wrapper.find('.hover-point').exists()).toBe(false)
  await svg.trigger('mousemove', { clientX: 351.5, clientY: 171.9 })
  expect((tooltip.element as HTMLElement).style.top).toBe(top)
  expect(wrapper.get('.hover-point').attributes('r')).toBe('8')
  expect(wrapper.get('.hover-point').attributes('fill')).toBe('#ffffff')
  await svg.trigger('click', { clientX: 351.5, clientY: 117.5 })
  expect((tooltip.element as HTMLElement).style.top).toBe(top)
  expect(wrapper.find('.hover-point').exists()).toBe(false)
  await svg.trigger('mousemove', { clientX: 351.5, clientY: 30 })
  expect(tooltip.text()).toBe(''); expect(wrapper.find('.hover-band').exists()).toBe(false)
  // 用真实缩放后的plot坐标触摸，不能把未知项算成0参与平均。
  await svg.trigger('touchstart', { touches: [{ clientX: 351.5, clientY: 127.5 }] })
  expect((tooltip.element as HTMLElement).style.top).toBe(top)
  await svg.trigger('touchmove', { touches: [{ clientX: 351.5, clientY: 117.5 }] })
  expect((tooltip.element as HTMLElement).style.top).toBe(top)
  await svg.trigger('mouseout', { relatedTarget: null })
  expect(tooltip.text()).toBe('')
  width = 1000; left = 0
  await svg.trigger('mousemove', { clientX: 958, clientY: 100 })
  expect(parseFloat((tooltip.element as HTMLElement).style.left) + 70).toBeLessThanOrEqual(window.innerWidth - 4)
  await wrapper.setProps({ points: [{ time: '2026-10-24T00:00:00Z', values: [1, null] }] })
  expect(tooltip.text()).toBe('')
  await svg.trigger('mousemove', { clientX: 48, clientY: 100 })
  expect(tooltip.findAll('.tooltip-value').map(value => value.text())).toEqual(['1', '未统计'])
  expect(parseFloat((tooltip.element as HTMLElement).style.left) - 70).toBeGreaterThanOrEqual(4)
  invalidateIdentity(); await wrapper.vm.$nextTick(); expect(tooltip.text()).toBe('')
  await wrapper.setProps({ labels: ['<img src=x>', '未知'], points: [{ time: '2026-10-24T00:00:00Z', values: [0, null] }] })
  await svg.trigger('click', { clientX: 48, clientY: 100 })
  expect(tooltip.findAll('.tooltip-value').map(value => value.text())).toEqual(['0', '未统计'])
  expect(tooltip.text()).toContain('<img src=x>'); expect(tooltip.find('img').exists()).toBe(false)
  await wrapper.setProps({ points: [{ time: '2026-10-24T00:00:00Z', values: [null, null] }] })
  await svg.trigger('mousemove', { clientX: 48, clientY: 100 })
  expect(tooltip.text()).toBe(''); expect(wrapper.find('.hover-band').exists()).toBe(false)
  // 固定规则图只观察SVG实际剩余视口，legend自高由grid保留；不拉伸旧1000:230内容。
  let observed: Element | undefined, resize: (() => void) | undefined, disconnected = 0
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = () => callback([], this as unknown as ResizeObserver) }
    observe(element: Element) { observed = element }
    disconnect() { disconnected++ }
  })
  width = 900; height = 282; left = 0
  await wrapper.setProps({ totalHeight: 300, labels: ['规则调用次数', '操作执行次数'], points: [
    { time: '2026-10-24T00:00:00Z', values: [1, null] }, { time: '2026-10-24T01:00:00Z', values: [2, null] }, { time: '2026-10-24T02:00:00Z', values: [3, null] }
  ] })
  expect(observed).toBe(svg.element); expect(svg.attributes('viewBox')).toBe('0 0 900 282')
  expect(wrapper.findAll('line')[0]!.attributes('x2')).toBe('858')
  await svg.trigger('mousemove', { clientX: 453, clientY: 120 })
  expect(tooltip.get('.tooltip-title').text()).toBe('10-24 09:00')
  expect(tooltip.findAll('.tooltip-value').map(value => value.text())).toEqual(['2', '未统计'])
  expect(parseFloat((tooltip.element as HTMLElement).style.top)).toBeCloseTo(239.76)
  await svg.trigger('mousemove', { clientX: 20, clientY: 120 }); expect(tooltip.text()).toBe('')
  width = 2200; resize!(); await wrapper.vm.$nextTick()
  expect(tooltip.text()).toBe(''); expect(svg.attributes('viewBox')).toBe('0 0 2200 282')
  expect(wrapper.findAll('line')[0]!.attributes('x2')).toBe('2158')
  await svg.trigger('mousemove', { clientX: 1103, clientY: 259.76 })
  expect(tooltip.get('.tooltip-title').text()).toBe('10-24 09:00')
  expect(wrapper.get('.hover-point').attributes('cx')).toBe('1103')
  expect(wrapper.get('.hover-point').attributes('r')).toBe('4')
  expect(parseFloat((tooltip.element as HTMLElement).style.top)).toBeCloseTo(239.76)
  width = 900; resize!(); await wrapper.vm.$nextTick()
  await wrapper.setProps({ points: [
    { time: '2026-10-24T00:00:00Z', values: [0, null] }, { time: '2026-10-24T01:00:00Z', values: [100, null] }, { time: '2026-10-24T02:00:00Z', values: [0, null] }
  ] })
  const numbers = () => wrapper.get('path[data-series="0"]').attributes('d')!.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number)
  const expected = [48, 244, 169.5, 180.4, 331.5, 32, 453, 32, 574.5, 32, 736.5, 180.4, 858, 244]
  expect(numbers()).toHaveLength(expected.length); expected.forEach((value, index) => expect(numbers()[index]).toBeCloseTo(value, 8))
  expect(wrapper.get('path[data-series="0"]').attributes('d')!.match(/C/g)).toHaveLength(2)
  expect(wrapper.find('polyline').exists()).toBe(false); expect(wrapper.find('path[data-series="1"]').exists()).toBe(false)
  await svg.trigger('click', { clientX: 453, clientY: 52 })
  expect(tooltip.findAll('.tooltip-value').map(value => value.text())).toEqual(['100', '未统计'])
  expect(parseFloat((tooltip.element as HTMLElement).style.top)).toBe(32); expect(wrapper.get('.hover-point').attributes('cy')).toBe('32')
  await wrapper.setProps({ points: [
    { time: '2026-10-24T00:00:00Z', values: [0, null] }, { time: '2026-10-24T01:00:00Z', values: [0, null] }, { time: '2026-10-24T02:00:00Z', values: [100, null] }
  ] })
  // 中间点的原始previous控制Y会越出底部，按原capBezierPoints封到244。
  expect(numbers()[5]).toBe(244); for (const index of [3, 5, 9, 11]) { expect(numbers()[index]).toBeGreaterThanOrEqual(32); expect(numbers()[index]).toBeLessThanOrEqual(244) }
  await wrapper.setProps({ points: [
    { time: '2026-10-24T00:00:00Z', values: [0, null] }, { time: '2026-10-24T01:00:00Z', values: [null, null] }, { time: '2026-10-24T02:00:00Z', values: [100, null] }
  ] })
  expect(wrapper.findAll('path[data-series="0"]').map(path => path.attributes('d'))).toEqual(['M48,244', 'M858,32'])
  await svg.trigger('mousemove', { clientX: 453, clientY: 120 }); expect(tooltip.text()).toBe('')
  await wrapper.setProps({ points: [{ time: '2026-10-24T00:00:00Z', values: [50, null] }] })
  expect(wrapper.get('path[data-series="0"]').attributes('d')).toBe('M48,138')
  await svg.trigger('click', { clientX: 48, clientY: 158 }); expect(wrapper.get('.hover-point').attributes('cy')).toBe('138')
  await wrapper.setProps({ points: [{ time: '2026-10-24T00:00:00Z', values: [null, null] }] })
  await svg.trigger('mousemove', { clientX: 48, clientY: 120 })
  expect(tooltip.text()).toBe(''); expect(wrapper.find('.hover-point').exists()).toBe(false)
  width = 1000; height = 230
  // 共用任务图仍是一条真实计数系列，身份/窗口变更不保留上个scope提示。
  await wrapper.setProps({ totalHeight: undefined, labels: ['任务运行次数'], points: [{ time: '2026-10-24T00:00:00Z', values: [1] }] })
  await svg.trigger('click', { clientX: 48, clientY: 100 })
  expect(tooltip.findAll('.tooltip-value').map(value => value.text())).toEqual(['1'])
  expect(tooltip.text()).toContain('任务运行次数'); expect(svg.attributes('viewBox')).toBe('0 0 1000 230'); expect(wrapper.find('path[data-series]').exists()).toBe(false); expect(disconnected).toBe(1)
  window.dispatchEvent(new Event('resize')); await wrapper.vm.$nextTick(); expect(tooltip.text()).toBe('')
  expect(wrapper.findAll('line')[5]!.attributes('y1')).toBe('32')
  expect(wrapper.findAll('polyline')[0]!.attributes('stroke-width')).toBe('1.5')
  await wrapper.setProps({ totalHeight: 300 }); wrapper.unmount(); expect(disconnected).toBe(2); vi.unstubAllGlobals()
})
it('无数据和非法数据不渲染看似成功的零线', () => {
  const empty = mount(Chart, { props: { labels: ['调用', '操作'], points: [] }, global: { stubs: { ElEmpty: true } } }); expect(empty.find('svg').exists()).toBe(false); empty.unmount()
  const invalid = mount(Chart, { props: { labels: ['调用', '操作'], points: [{ time: '2026-10-24T00:00:00', values: [-1, 2] }] } }); expect(invalid.find('[role=alert]').exists()).toBe(true); expect(invalid.find('polyline').exists()).toBe(false); invalid.unmount()
})
