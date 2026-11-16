import {mount,flushPromises} from '@vue/test-utils'
import {describe,it,expect} from 'vitest'
import ElementPlus from 'element-plus'
import Table,{type AlarmRuleTableRow} from '../../src/features/alarms/AlarmRuleDirectoryTable.vue'
const row:AlarmRuleTableRow={identity:'rule-identity',name:'温度规则',severityLabel:'重要',severityTone:'warning',sourceLabel:'设备类型',enabledLabel:'可用',notificationGroupLabels:[],customerChannels:[]}
describe('Source规则表的展示模型',()=>{
 it('空表仍显示全部六个有名表头及空数据文字',async()=>{const w=mount(Table,{props:{rows:[],canManage:true},global:{plugins:[ElementPlus]}});await flushPromises();expect(w.findAll('thead th').map(th=>th.text())).toEqual(['规则名称','严重级别','设备源类型','规则可用','通知组','用户通知','']);expect(w.text()).toContain('暂无数据');w.unmount()})
 it('未知路由标签与已知未设置分开，不显示UUID冒充名称',async()=>{const w=mount(Table,{props:{rows:[row,{...row,identity:'other',notificationGroupLabels:null,customerChannels:null}],canManage:false},global:{plugins:[ElementPlus]}});await flushPromises();expect(w.findAll('.rule-unset').map(node=>node.text())).toEqual(['未设置','未设置','—','—']);expect(w.text()).not.toContain('rule-identity');expect(w.findAll('tbody button').filter(button=>button.text()==='编辑').every(button=>button.attributes('disabled')!==undefined)).toBe(true);w.unmount()})
 it('点击只输出精确行身份，不调用保存或伪造历史内容',async()=>{const w=mount(Table,{props:{rows:[row],canManage:true},global:{plugins:[ElementPlus]}});await flushPromises();await w.findAll('tbody button')[0]!.trigger('click');await w.findAll('tbody button')[1]!.trigger('click');expect(w.emitted('edit')).toEqual([['rule-identity']]);expect(w.emitted('history')).toEqual([['rule-identity']]);w.unmount()})
})
