import {afterEach,expect,it,vi} from 'vitest'
import {flushPromises,mount} from '@vue/test-utils'
import ElementPlus,{ElOption,ElSelect} from 'element-plus'
import ReportFilter from '../../src/features/rules/RuleReportFilterEditor.vue'
import Conditions from '../../src/features/rules/RulePreprocessConditions.vue'
import DefinitionTypeLabel from '../../src/features/device-types/DefinitionTypeLabel.vue'
import {readTypePropertyChoices} from '../../src/features/rules/device-property-choices'
import {newConditionGroup,newCondition} from '../../src/features/rules/rule-builder-draft'
vi.mock('../../src/features/alarms/alarm-rule-source-choices-api',()=>({readAlarmRuleSourceChoicesWithVersions:vi.fn().mockResolvedValue({bindings:[{sourceId:'00000000-0000-4000-8000-000000000002',modelVersionId:'00000000-0000-4000-8000-000000000003'}],properties:[{key:'temp',label:'温度',dataType:'NUMBER'},{key:'power',label:'电源',dataType:'SWITCH'},{key:'numeric',label:'数值开关',dataType:'SWITCH'},{key:'textswitch',label:'文本开关',dataType:'SWITCH'},{key:'mode',label:'模式',dataType:'ENUM'},{key:'text',label:'文本',dataType:'TEXT'},{key:'obj',label:'对象',dataType:'OBJECT'},{key:'list',label:'列表',dataType:'LIST'}]})}))
vi.mock('../../src/features/rules/device-property-choices',()=>({readTypePropertyChoices:vi.fn().mockResolvedValue([{key:'power',name:'电源',type:'SWITCH',switchEncoding:'BOOLEAN'},{key:'numeric',name:'数值开关',type:'SWITCH',switchEncoding:'NUMBER'},{key:'textswitch',name:'文本开关',type:'SWITCH',switchEncoding:'TEXT'},{key:'mode',name:'模式',type:'ENUM',enumOptions:['auto','manual']}]),readDevicePropertyChoices:vi.fn()}))
vi.mock('../../src/features/device-types/property-definition-api',()=>({propertyTransport:{list:vi.fn().mockResolvedValue([{propertyKey:'temp',name:'功能定义温度',dataType:'NUMBER'}])}}))
afterEach(()=>{document.body.innerHTML=''})
it('属性选项显示标识符、名称和功能定义的数据类型图标，且不显示关系提示',async()=>{
 const model={...newConditionGroup(),conditions:[newCondition(),newCondition()]}
 const wrapper=mount(ReportFilter,{props:{modelValue:model,project:'00000000-0000-4000-8000-000000000001',source:{kind:'DEVICE_TYPE',referenceId:'00000000-0000-4000-8000-000000000002'}},global:{plugins:[ElementPlus]}})
 await flushPromises();const option=wrapper.findAllComponents(ElOption).find(item=>item.props('value')==='temp')!
 expect(option.text()).toContain('temp');expect(option.text()).toContain('功能定义温度');expect(option.findComponent(DefinitionTypeLabel).props('type')).toBe('NUMBER');expect(option.find('svg').exists()).toBe(true)
 expect(wrapper.text()).not.toContain('当前条件使用同一关系');wrapper.findAllComponents(ElSelect)[2]!.vm.$emit('update:modelValue','ANY');expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({operator:'ANY'});wrapper.unmount()
})
it('固定模型读取失败时不猜测开关或枚举编码',async()=>{
 vi.mocked(readTypePropertyChoices).mockRejectedValueOnce(new Error('模型不可读'))
 const wrapper=mount(ReportFilter,{props:{modelValue:newConditionGroup(),project:'00000000-0000-4000-8000-000000000001',source:{kind:'DEVICE_TYPE',referenceId:'00000000-0000-4000-8000-000000000002'}},global:{plugins:[ElementPlus]}})
 await flushPromises();const options=wrapper.findAllComponents(ElOption);expect(options.find(option=>option.props('value')==='power')?.props('disabled')).toBe(true);expect(options.find(option=>option.props('value')==='mode')?.props('disabled')).toBe(true);expect(wrapper.text()).toContain('固定模型选项不可读取');wrapper.unmount()
})
it.each([['text','EQ'],['obj','KEY_EXISTS'],['list','CONTAINS']] as const)('按来源属性类型设置 %s 的首个条件',async(key,operator)=>{
 const model=newConditionGroup(),wrapper=mount(ReportFilter,{props:{modelValue:model,project:'00000000-0000-4000-8000-000000000001',source:{kind:'DEVICE_TYPE',referenceId:'00000000-0000-4000-8000-000000000002'}},global:{plugins:[ElementPlus]}})
 await flushPromises();wrapper.findAllComponents(ElSelect)[1]!.vm.$emit('update:modelValue',key);await flushPromises()
 expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({conditions:[{path:'/'+key,operator,valueType:'string',text:''}]});wrapper.unmount()
})
it('开关须明确选择值并按固定模型的布尔编码保存',async()=>{
 const wrapper=mount(ReportFilter,{props:{modelValue:newConditionGroup(),project:'00000000-0000-4000-8000-000000000001',source:{kind:'DEVICE_TYPE',referenceId:'00000000-0000-4000-8000-000000000002'}},global:{plugins:[ElementPlus]}})
 await flushPromises();wrapper.findAllComponents(ElSelect)[1]!.vm.$emit('update:modelValue','power');await flushPromises()
 const updated=wrapper.emitted('update:modelValue')?.at(-1)?.[0] as ReturnType<typeof newConditionGroup>;await wrapper.setProps({modelValue:updated})
 expect(wrapper.vm.validate()).toBe(false);wrapper.findAllComponents(ElSelect)[3]!.vm.$emit('update:modelValue','OFF');await flushPromises()
 expect(wrapper.vm.validate()).toBe(true);expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({conditions:[{path:'/power',operator:'EQ',valueType:'boolean',booleanValue:false}]});wrapper.unmount()
})
it.each([['numeric','ON','number','1'],['textswitch','OFF','string','OFF'],['mode','manual','string','manual']] as const)('%s 按模型值类型保存所选值',async(key,value,type,text)=>{
 const wrapper=mount(ReportFilter,{props:{modelValue:newConditionGroup(),project:'00000000-0000-4000-8000-000000000001',source:{kind:'DEVICE_TYPE',referenceId:'00000000-0000-4000-8000-000000000002'}},global:{plugins:[ElementPlus]}})
 await flushPromises();wrapper.findAllComponents(ElSelect)[1]!.vm.$emit('update:modelValue',key);await flushPromises()
 const updated=wrapper.emitted('update:modelValue')?.at(-1)?.[0] as ReturnType<typeof newConditionGroup>;await wrapper.setProps({modelValue:updated});expect(wrapper.vm.validate()).toBe(false)
 wrapper.findAllComponents(ElSelect)[3]!.vm.$emit('update:modelValue',value);await flushPromises()
 expect(wrapper.vm.validate()).toBe(true);expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({conditions:[{path:'/'+key,operator:'EQ',valueType:type,text}]});wrapper.unmount()
})
it('普通条件不显示额外入口，已有嵌套条件仍可编辑',async()=>{
 const source={kind:'DEVICE_TYPE' as const,referenceId:'00000000-0000-4000-8000-000000000002'}
 const wrapper=mount(Conditions,{attachTo:document.body,props:{modelValue:newConditionGroup(),editing:true,project:'00000000-0000-4000-8000-000000000001',reportSource:source},global:{plugins:[ElementPlus]}})
 await flushPromises();expect(wrapper.text()).not.toContain('高级条件');expect(wrapper.findComponent(ReportFilter).exists()).toBe(true)
 await wrapper.setProps({modelValue:{...newConditionGroup(),groups:[newConditionGroup()]}});expect(wrapper.findComponent(ReportFilter).exists()).toBe(false);expect(wrapper.text()).toContain('添加分组');wrapper.unmount()
})
it('空条件先显示属性选择，选中后才展开运算和值，空占位不产生提交草稿',async()=>{
 const model=newConditionGroup()
 const wrapper=mount(ReportFilter,{attachTo:document.body,props:{modelValue:model,project:'00000000-0000-4000-8000-000000000001',source:{kind:'DEVICE_TYPE',referenceId:'00000000-0000-4000-8000-000000000002'}},global:{plugins:[ElementPlus]}})
 await flushPromises();expect(wrapper.find('[aria-label="选择属性 1"]').exists()).toBe(true);expect(wrapper.find('[aria-label="条件运算 1"]').exists()).toBe(false);expect(wrapper.emitted('update:modelValue')).toBeUndefined()
 wrapper.findAllComponents(ElSelect)[1]!.vm.$emit('update:modelValue','temp');await flushPromises()
 const updated=wrapper.emitted('update:modelValue')?.at(-1)?.[0] as typeof model;expect(updated.conditions[0]?.path).toBe('/temp')
 await wrapper.setProps({modelValue:updated});expect(wrapper.find('[aria-label="条件运算 1"]').exists()).toBe(true);expect(wrapper.find('[aria-label="数值比较值"]').exists()).toBe(true);wrapper.unmount()
})
it('数值条件以来源属性和逐行控件编辑，选择及删除保留原草稿语义',async()=>{
 const model={...newConditionGroup(),conditions:[{...newCondition(),path:'/temp',text:'12'}]}
 const wrapper=mount(ReportFilter,{attachTo:document.body,props:{modelValue:model,project:'00000000-0000-4000-8000-000000000001',source:{kind:'DEVICE_TYPE',referenceId:'00000000-0000-4000-8000-000000000002'}},global:{plugins:[ElementPlus]}})
 await flushPromises();expect(wrapper.find('[aria-label="条件关系 1"]').exists()).toBe(true);expect(wrapper.find('[aria-label="选择属性 1"]').exists()).toBe(true)
 await wrapper.get('[aria-label="数值比较值"]').setValue('13.0000000000000001');expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({conditions:[{path:'/temp',text:'13.0000000000000001'}]})
 await wrapper.get('[aria-label="移除条件 1"]').trigger('click');expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({conditions:[]});wrapper.unmount()
})
