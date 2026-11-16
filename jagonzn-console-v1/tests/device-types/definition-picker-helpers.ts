import {DOMWrapper,flushPromises} from '@vue/test-utils'
import {expect,vi} from 'vitest'
function visible(selector:string){return [...document.querySelectorAll<HTMLElement>(selector)].find(node=>new DOMWrapper(node).isVisible())}
export async function openIcon(label:string){const trigger=visible(`[aria-label="${label}样式"]`);expect(trigger).toBeDefined();await new DOMWrapper(trigger!).trigger('click');await flushPromises();await vi.waitFor(()=>expect(visible('.definition-icon-drawer [aria-label="关闭图标选择"]')).toBeDefined())}
export async function closeIcon(){await new DOMWrapper(visible('.definition-icon-drawer [aria-label="关闭图标选择"]')!).trigger('click');await flushPromises()}
export async function chooseIcon(label:string,id:string){await openIcon(label);const target=visible(`.definition-icon-drawer button[title="${id}"]`);expect(target).toBeDefined();await new DOMWrapper(target!).trigger('click');await flushPromises()}
export async function expectIcon(label:string,id:string){await openIcon(label);expect(visible(`.definition-icon-drawer button[title="${id}"]`)?.getAttribute('aria-pressed')).toBe('true');await closeIcon()}
export async function openColor(label:string){const trigger=visible(`[aria-label="选择${label}颜色"]`);expect(trigger).toBeDefined();await new DOMWrapper(trigger!).trigger('click');await flushPromises();await vi.waitFor(()=>expect(visible(`.definition-color-drawer input[aria-label="${label}颜色"]`)).toBeDefined())}
export async function closeColor(){await new DOMWrapper(visible('.definition-color-drawer .el-drawer__close-btn')!).trigger('click');await flushPromises()}
export async function setColor(label:string,value:string){await openColor(label);await new DOMWrapper(visible(`.definition-color-drawer input[aria-label="${label}颜色"]`)!).setValue(value);await closeColor()}
export async function expectColor(label:string,value:string){await openColor(label);expect((visible(`.definition-color-drawer input[aria-label="${label}颜色"]`) as HTMLInputElement).value).toBe(value);await closeColor()}
