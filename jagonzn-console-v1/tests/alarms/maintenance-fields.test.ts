import {describe,it,expect} from 'vitest'
import {mount} from '@vue/test-utils'
import Fields from '../../src/features/alarms/AlarmLogMaintenanceFields.vue'
describe('不发请求的维护正文展示',()=>{
 it('详情显示维护操作者账号，卡片模式不追加署名',()=>{const account='00000000-0000-4000-8000-000000000009';const detail=mount(Fields,{props:{content:{alarmReason:'原因',solution:'',remark:'',updatedBy:account},detail:true}});expect(detail.text()).toContain('操作者');expect(detail.text()).toContain(account);detail.unmount();const card=mount(Fields,{props:{content:{alarmReason:'原因',solution:'',remark:'',updatedBy:account}}});expect(card.text()).not.toContain('操作者');card.unmount()})
 it('只有实际非空字段可见，保留正文中的空白与换行',()=>{const w=mount(Fields,{props:{content:{alarmReason:' 原因\n下一行 ',solution:'',remark:'备注'}}});expect(w.findAll('p')).toHaveLength(2);expect(w.findAll('p')[0].element.textContent).toBe('告警原因： 原因\n下一行 ');expect(w.text()).not.toContain('解决方案');w.unmount()})
 it('缺注释和已保存全空都不产生空白维护块',()=>{for(const content of [null,{alarmReason:'',solution:'',remark:''}]){const w=mount(Fields,{props:{content}});expect(w.find('.alarm-maintain').exists()).toBe(false);w.unmount()}})
 it('原文按文本转义，不能作为HTML执行或插入外部图片',()=>{const text='<img src="https://example.invalid/x" onerror="alert(1)"><script>alert(1)</script>';const w=mount(Fields,{props:{content:{alarmReason:text,solution:'',remark:''}}});expect(w.find('p').element.textContent).toBe('告警原因：'+text);expect(w.find('img').exists()).toBe(false);expect(w.find('script').exists()).toBe(false);w.unmount()})
})
