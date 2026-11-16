import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Input from '../../src/features/devices/HistoryRemovalDateTimeInput.vue'
import {formatTime} from '../../src/core/time'
const wrappers:ReturnType<typeof mount>[]=[]
function render(value?:string){const w=mount(Input,{props:{modelValue:value,placeholder:'选择起始时间','onUpdate:modelValue':v=>w.setProps({modelValue:v})},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);return w}
describe('东八区日历与时分秒独立输入',()=>{
 beforeEach(()=>{vi.useRealTimers()})
 afterEach(()=>{for(const w of wrappers.splice(0))w.unmount();document.body.innerHTML='';vi.useRealTimers()})
 it('民用02:30文字保持原样，不交给浏览器DST时刻解析',async()=>{const w=render();await w.get('.history-civil-input input').setValue('2026-03-08 02:30:00');expect(w.props('modelValue')).toBe('2026-03-08 02:30:00');expect((w.get('.history-civil-input input').element as HTMLInputElement).value).toBe('2026-03-08 02:30:00')})
 it('真实日期面板只修改年月日，独立time字段只修改时分秒',async()=>{const w=render('2026-03-07 02:30:00');await w.get('.history-civil-input').trigger('click');await flushPromises();const panel=w.findComponent({name:'ElDatePickerPanel'});expect(panel.exists()).toBe(true);expect(panel.props('type')).toBe('date');expect(document.querySelector('button[aria-label="前一年"]')).toBeTruthy();panel.vm.$emit('update:modelValue','2026-03-08');await flushPromises();expect(w.props('modelValue')).toBe('2026-03-08 02:30:00');const input=document.querySelector<HTMLInputElement>('input[aria-label="东八区时分秒"]')!;expect(input).toBeTruthy();input.value='23:15:42';input.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises();expect(w.props('modelValue')).toBe('2026-03-08 23:15:42')})
 it('此刻取真实时刻的东八区文字，禁用后关闭面板',async()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-23T23:59:30Z'));const w=render();await w.get('.history-civil-input').trigger('click');await flushPromises();const now=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()==='此刻')!;expect(now).toBeTruthy();now.click();await flushPromises();expect(w.props('modelValue')).toBe(formatTime(new Date()));expect(w.props('modelValue')).toBe('2026-10-24 07:59:30');await w.setProps({disabled:true});expect(w.findComponent({name:'ElPopover'}).props('visible')).toBe(false)})
 it('Enter只确认当前文字一次，不冒泡提交外层表单',async()=>{const w=render('2026-03-08 02:30:00');const input=w.get('.history-civil-input input');await input.trigger('keydown',{key:'Enter'});expect(w.emitted('change')).toHaveLength(1);expect(w.props('modelValue')).toBe('2026-03-08 02:30:00')})

})
