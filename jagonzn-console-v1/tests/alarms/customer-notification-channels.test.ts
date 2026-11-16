import {mount} from '@vue/test-utils'
import {describe,it,expect} from 'vitest'
import ElementPlus from 'element-plus'
import Channels from '../../src/features/alarms/NotificationCustomerChannels.vue'
describe('Source规则用户通知图标',()=>{
 it('仅已选渠道按电话/短信/公众号/App顺序显示20px原始MDI路径和提示',()=>{const w=mount(Channels,{props:{channels:['APP','WECHAT','SMS','VOICE']},global:{plugins:[ElementPlus]}});expect(w.findAll('svg').map(node=>node.attributes('aria-label'))).toEqual(['电话通知','短信通知','公众号通知','App 通知']);expect(w.findAll('svg').map(node=>node.attributes('style'))).toEqual(['color: rgb(64, 158, 255);','color: rgb(230, 162, 60);','color: rgb(7, 193, 96);','color: rgb(103, 194, 58);']);expect(w.findAll('path').every(node=>!!node.attributes('d'))).toBe(true);expect(w.find('button').exists()).toBe(false);w.unmount()})
 it('只选短信不显示其它图标，不用配置状态声称实际投递成功',()=>{const w=mount(Channels,{props:{channels:['SMS']},global:{plugins:[ElementPlus]}});expect(w.findAll('svg')).toHaveLength(1);expect(w.find('svg').attributes('aria-label')).toBe('短信通知');expect(w.text()).not.toContain('成功');w.unmount()})
 it('已知无渠道与未知资料仍明确区分',()=>{for(const [channels,text] of [[[],'未设置'],[null,'—']] as const){const w=mount(Channels,{props:{channels},global:{plugins:[ElementPlus]}});expect(w.text()).toBe(text);expect(w.find('svg').exists()).toBe(false);w.unmount()}})
})
