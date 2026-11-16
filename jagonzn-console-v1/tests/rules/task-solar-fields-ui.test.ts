import {defineComponent} from 'vue'
import {session} from '../../src/core/session'
import {solarLocationName} from '../../src/features/rules/task-solar-fields'
import {taskInitialScheduleRequest,taskInitialScheduleIntent} from '../../src/features/rules/task-initial-schedule'
import { mount,flushPromises } from '@vue/test-utils'
import ElementPlus,{ElSelect,ElRadioGroup} from 'element-plus'
import { expect,it,vi } from 'vitest'
import TaskSolarFields from '../../src/features/rules/TaskSolarFields.vue'
const value={event:'SUNRISE' as const,beforeMinutes:5,position:{latitude:31.2304,longitude:121.4737}}
it('缺少地点只说明状态，无默认坐标或可用地点编辑入口',()=>{const wrapper=mount(TaskSolarFields,{props:{modelValue:{event:'SUNRISE',beforeMinutes:0}},global:{plugins:[ElementPlus]}});expect(wrapper.text()).toContain('设置日出日落的地点位置，系统会自动计算不同地点的日出日落时间。');expect(wrapper.text()).toContain('编辑地点位置');expect(wrapper.get('button').attributes('disabled')).toBeDefined();expect(wrapper.findComponent(ElRadioGroup).exists()).toBe(true);wrapper.unmount()})
it('事件和提前分钟可修改，已有位置只读且未改写',async()=>{const wrapper=mount(TaskSolarFields,{props:{modelValue:value},global:{plugins:[ElementPlus]}});expect(wrapper.text()).toContain('纬度 31.2304，经度 121.4737');await wrapper.getComponent(ElRadioGroup).vm.$emit('update:modelValue','SUNSET');expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual({...value,event:'SUNSET'});await wrapper.getComponent(ElSelect).vm.$emit('update:modelValue',10);expect(wrapper.emitted('update:modelValue')?.[1]?.[0]).toEqual({...value,beforeMinutes:10});expect(value.position).toEqual({latitude:31.2304,longitude:121.4737});wrapper.unmount()})
it('在途或只读状态禁止控件更新和内部事件穿透',async()=>{const wrapper=mount(TaskSolarFields,{props:{modelValue:value,disabled:true},global:{plugins:[ElementPlus]}});for(const select of wrapper.findAllComponents(ElSelect)){expect(select.props('disabled')).toBe(true);await select.vm.$emit('update:modelValue',-360)}await wrapper.getComponent(ElRadioGroup).vm.$emit('update:modelValue','SUNSET');expect(wrapper.emitted('update:modelValue')).toBeUndefined();wrapper.unmount()})

it('太阳固定地点三列与地图共用草稿，取消零写且名称传创建和精确回读',async()=>{
 const previous=session.user;session.user=JSON.parse('{"currentProjectId":"00000000-0000-4000-8000-000000000001","permissions":["task:read","task:manage"]}')
 const query=vi.fn(()=>true),cancel=vi.fn(),Frame=defineComponent({name:'DirectoryAmapFrame',props:['picker','projectId','scopeKey'],emits:['point','pickerBusy','error'],setup(_,ctx){ctx.expose({queryPicker:query,cancelPicker:cancel});return()=>null}})
 const wrapper=mount(TaskSolarFields,{props:{modelValue:value,positionEditable:true},global:{plugins:[ElementPlus],stubs:{DirectoryAmapFrame:Frame}}})
 const click=async(label:string)=>{const item=wrapper.findAllComponents({name:'ElButton'}).find(item=>item.text()===label);expect(item,label).toBeDefined();await item!.trigger('click');await flushPromises()}
 try{
  await click('编辑地点位置');const inputs=wrapper.findAllComponents({name:'ElInput'});expect(inputs).toHaveLength(3);expect(inputs.every(input=>input.props('size')==='small')).toBe(true)
  const frame=wrapper.getComponent(Frame);expect(frame.props('picker')).toEqual(value.position)
  await inputs[0]!.get('input').setValue('北京');await inputs[0]!.get('input').trigger('blur');expect(query).toHaveBeenLastCalledWith({kind:'name',name:'北京'})
  frame.vm.$emit('point',{longitude:116.4,latitude:39.9},'北京市');await flushPromises();await click('取消');expect(wrapper.emitted('update:modelValue')).toBeUndefined();expect(value.position).toEqual({latitude:31.2304,longitude:121.4737})
  frame.vm.$emit('point',{longitude:1,latitude:1},'迟到');await flushPromises();expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  await click('编辑地点位置');const reopened=wrapper.findAllComponents({name:'ElInput'});expect(reopened[0]!.get('input').element.value).toBe('');expect(reopened[1]!.get('input').element.value).toBe('31.2304')
  await reopened[1]!.get('input').setValue('0');await reopened[2]!.get('input').setValue('0');await reopened[2]!.get('input').trigger('blur');expect(query).toHaveBeenLastCalledWith({kind:'coordinates',point:{latitude:0,longitude:0}})
  wrapper.getComponent(Frame).vm.$emit('point',{longitude:0,latitude:0},'');await flushPromises();wrapper.getComponent(Frame).vm.$emit('pickerBusy',true);await flushPromises();expect(wrapper.findAllComponents({name:'ElButton'}).find(item=>item.text()==='保存')!.props('disabled')).toBe(false);await click('保存');expect(cancel).toHaveBeenCalled()
  const saved=wrapper.emitted('update:modelValue')!.at(-1)![0] as typeof value&{locationName:string};expect(saved).toEqual({...value,position:{latitude:0,longitude:0},locationName:''})
  const raw=taskInitialScheduleRequest({kind:'SOLAR',event:'SUNRISE',before:5,position:saved.position,locationName:saved.locationName,days:[1],zoneKind:'FOLLOW_PROJECT'},'Asia/Shanghai');expect(raw.solar).toMatchObject({locationName:'',latitude:0,longitude:0});expect(taskInitialScheduleIntent(raw,'Asia/Shanghai')).toMatchObject({locationName:''})
  const old=taskInitialScheduleRequest({kind:'SOLAR',event:'SUNRISE',before:5,position:value.position,days:[1],zoneKind:'FOLLOW_PROJECT'},'Asia/Shanghai');expect(old.solar).not.toHaveProperty('locationName')
  for(const bad of ['a\n','\ud800','字'.repeat(257)])expect(()=>solarLocationName(bad)).toThrow();expect(solarLocationName(null)).toBeUndefined();expect(solarLocationName('')).toBe('')
 }finally{wrapper.unmount();session.user=previous}
})
