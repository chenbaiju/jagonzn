import type {InjectionKey} from 'vue'
import type {RuleDeviceSourceContract} from './rule-source-api'
/** 来源改变后由真实详情入口重新选当前格式和来源，不把旧URL上下文当新范围。 */
export const refreshRuleSourceEntry:InjectionKey<(source:RuleDeviceSourceContract)=>Promise<void>>=Symbol('refreshRuleSourceEntry')
