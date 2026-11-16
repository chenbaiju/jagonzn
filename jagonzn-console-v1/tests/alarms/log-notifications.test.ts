import {describe,expect,it} from 'vitest'
import {mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Notifications,{type AlarmLogNotificationDisplay} from '../../src/features/alarms/AlarmLogNotifications.vue'
const rows:AlarmLogNotificationDisplay[]=[{key:'email',kind:'EMAIL',recipient:'***',failureCode:null},{key:'hook',kind:'WEBHOOK',recipient:'',failureCode:'DEAD_LETTER'},{key:'push',kind:'PUSH',recipient:'',failureCode:null}]
const setup=(items=rows,truncated=false)=>mount(Notifications,{props:{items,truncated},global:{plugins:[ElementPlus]}})
describe('告警详情内嵌通知展示',()=>{
 it('缺记录时整块隐藏，不制造成功、无通知结论或空表',()=>{const w=setup([]);expect(w.find('section').exists()).toBe(false);w.unmount()})
 it('只显示实际渠道与已脱敏目标，不将非失败状态标为发送成功',()=>{const w=setup();expect(w.text()).toContain('邮件');expect(w.text()).toContain('Webhook');expect(w.text()).toContain('App通知');expect(w.text()).toContain('***');expect(w.text()).not.toMatch(/成功|配额|暂无/);expect(w.findAll('.notify-log-item')).toHaveLength(3);expect(w.findAll('.notify-log-recipients')).toHaveLength(1);w.unmount()})
 it('失败动作只向宿主输出公开错误码，键盘可聚焦且不复制目标资料',async()=>{const w=setup();const button=w.get('button');expect(button.attributes('type')).toBe('button');expect(button.attributes('aria-label')).toContain('DEAD_LETTER');await button.trigger('click');expect(w.emitted('copyError')).toEqual([['DEAD_LETTER']]);expect(w.findAll('.notify-log-icon.failed')).toHaveLength(1);w.unmount()})
 it('文字保持纯文本，截断明确可见且不能误作全部记录',()=>{const w=setup([{...rows[0]!,recipient:'<img src=x onerror=alert(1)>'}],true);expect(w.find('img').exists()).toBe(false);expect(w.text()).toContain('<img src=x onerror=alert(1)>');expect(w.get('[role=status]').text()).toBe('仅显示前 100 条告警通知');w.unmount()})
})
