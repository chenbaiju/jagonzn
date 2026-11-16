import type {AlarmRuleDirectoryItem} from '../../src/features/alarms/alarm-rule-directory-api'
export const ruleProject='00000000-0000-4000-8000-000000000001',ruleIdentity='00000000-0000-4000-8000-000000000002',ruleGroup='00000000-0000-4000-8000-000000000003'
export const directoryRule=():AlarmRuleDirectoryItem=>({id:ruleIdentity,name:'冷库温度监测',version:0,enabled:true,level:'IMPORTANT',sourceKind:'DEVICE_TYPE',notificationGroupIds:[ruleGroup],notificationGroups:[{id:ruleGroup,name:'仓库值班人员通知'}],customerChannels:['APP','WECHAT','SMS','VOICE']})
