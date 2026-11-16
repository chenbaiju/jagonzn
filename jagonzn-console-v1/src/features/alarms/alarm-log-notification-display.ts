import type {AlarmLog} from './alarm-transition-log-api'
import type {AlarmLogNotificationDisplay} from './AlarmLogNotifications.vue'
/** 已校验的公开摘要转纯展示；不使用目标UUID、地址或供应商错误补充显示。 */
export const alarmLogNotificationsDisplay=(log:AlarmLog):AlarmLogNotificationDisplay[]=>(log.notificationLogs??[]).map(item=>({key:item.id,kind:item.channel,recipient:item.target,failureCode:item.result===false?item.errorCode:null}))
