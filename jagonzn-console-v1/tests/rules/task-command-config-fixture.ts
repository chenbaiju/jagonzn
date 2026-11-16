import {flushPromises,type VueWrapper} from '@vue/test-utils'
import TaskCommandContentDialog from '../../src/features/rules/TaskCommandContentDialog.vue'
import JsonCodeEditor from '../../src/ui/JsonCodeEditor.vue'

/** 旧创建测试沿真实配置入口与编辑器事件配置命令，保留原计划/原键测试目标。 */
export async function configureTaskCommand(view:VueWrapper,key='sample',inputJson='{}'){
 const choice=view.find('input[value="COMMAND"]')
 if(!choice.exists())throw new Error('缺少真实命令任务类型')
 await choice.setValue();await flushPromises()
 const card=view.findAll('button').find(button=>button.attributes('aria-label')==='配置命令下发')
 if(!card)throw new Error('缺少命令配置入口')
 await card.trigger('click');await flushPromises()
 const dialog=view.getComponent(TaskCommandContentDialog)
 dialog.getComponent(JsonCodeEditor).vm.$emit('update:modelValue','{"method":'+JSON.stringify(key)+',"params":'+inputJson+'}')
 await flushPromises()
 const done=dialog.findAllComponents({name:'ElButton'}).find(button=>button.text()==='完成')
 if(!done)throw new Error('缺少命令配置完成按钮')
 await done.trigger('click');await flushPromises()
 return dialog
}
