import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import View from '../../src/features/alarms/AlarmEventEvaluationView.vue'

describe('原始事件属性的只读显示', () => {
  it('大数/未知与不同平台时间依据显示，HTML原文只作文本', () => {
    const w = mount(View,{props:{display:{ruleName:'原规则',checkedAt:'2026-10-24T00:01:00.123456Z',raw:'{"x":"<script>bad()</script>"}',properties:[
      {key:'temperature',known:true,value:'9007199254740993.123456789',acceptedAt:'2026-10-24T00:00:00.123456Z',timeBasis:'ALARM_INTAKE'},
      {key:'<img src=x onerror=bad()>',known:false,value:'未知',acceptedAt:null,timeBasis:'UNKNOWN'},
      {key:'platform',known:true,value:'true',acceptedAt:'2026-10-24T00:00:00.123456Z',timeBasis:'PLATFORM_ACCEPTED'},
    ]}},global:{plugins:[ElementPlus]}})
    expect(w.findAll('dd').map(n=>n.text())).toEqual(['9007199254740993.123456789','未知','true'])
    expect(w.findAll('img,script')).toHaveLength(0)
    expect(w.findAll('.property-time').map(n=>n.text())).toEqual(['告警平台接纳时间：2026-10-24 08:00:00','平台属性接纳时间：2026-10-24 08:00:00'])
    expect(w.find('.evaluation-time').attributes('title')).toBe('2026-10-24T00:01:00.123456Z')
    w.unmount()
  })
})
