import { expect, it } from 'vitest'
import { debugOperationLabel, debugResultLabel } from '../../src/features/rules/rule-debug-labels'
it('只展示五种真实动作的业务名称，未知种类保持未知',()=>{
 expect(['notification','device-command','device-property-set','alarm-create','alarm-clear'].map(debugOperationLabel)).toEqual(['发送通知','下发命令','属性下发','创建告警','解除告警'])
 for(const value of [undefined,null,'FUTURE_KIND','<script>payload</script>'])expect(debugOperationLabel(value)).toBe('—')
})
it('动作提交不能显示为设备回复/最终成功，失败尝试不暴露异常正文或重试码',()=>{
 expect(debugResultLabel('ACTION','ACTION_COMMITTED')).toEqual({label:'已提交',failed:false})
 expect(debugResultLabel('ATTEMPT','RULE_SCRIPT_ERROR')).toEqual({label:'执行失败',failed:true})
 expect(debugResultLabel('ATTEMPT','FUTURE_CLOSED_FAILURE')).toEqual({label:'执行失败',failed:true})
 for(const [kind,code] of [['ACTION','SUCCESS'],['ACTION','RULE_SCRIPT_ERROR'],['FUTURE','ACK'],[undefined,undefined],['FUTURE','secret exception body']])expect(debugResultLabel(kind,code)).toEqual({label:'—',failed:false})
})
it('只将真实后置输出就绪码显示为中性结果，不冒动作或设备成功',()=>{
 expect(debugResultLabel('ATTEMPT','POSTPROCESS_OUTPUT_READY')).toEqual({label:'输出已就绪',failed:false})
 expect(debugResultLabel('ATTEMPT','POSTPROCESS_REJECTED')).toEqual({label:'执行失败',failed:true})
 expect(debugResultLabel('ACTION','POSTPROCESS_OUTPUT_READY')).toEqual({label:'—',failed:false})
})
