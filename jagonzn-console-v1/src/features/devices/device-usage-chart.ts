import type {UsageOverview,UsageSeries} from './device-overview-api'
export const usageCharts=[
 {key:'messages',title:'设备消息数',keys:['total','attrs_rpt','attrs_get','attrs_push','attrs_update','event_rpt','cmd_send','cmd_reply','data_rpt','data_set']},
 {key:'connections',title:'设备连接次数',keys:['mqtt_conn','mqtt_disconn','tcp_conn','tcp_disconn']},
 {key:'alarms',title:'告警状态',keys:['status_0','status_1','status_2']},
 {key:'notifications',title:'告警通知次数',keys:['email','voice','sms','wechat','app','dingding_robot','qywx_robot','feishu_robot','webhook']},
 {key:'rules',title:'规则调用量',keys:['rule_call','action_call']},
 ...['mqtt','tcp','http'].map(protocol=>({key:protocol,title:`设备${protocol.toUpperCase()}流量`,keys:[`${protocol}_total`,`${protocol}_up`,`${protocol}_down`]}))
] as const
export const usageLabels:Record<string,string>={total:'总消息',attrs_update:'云端属性更新',attrs_rpt:'属性上报',attrs_get:'属性获取',attrs_push:'属性下发',event_rpt:'事件上报',cmd_send:'命令下发',cmd_reply:'命令回复',data_rpt:'自定义上报',data_set:'自定义下发',mqtt_conn:'MQTT 连接',mqtt_disconn:'MQTT 断开',tcp_conn:'TCP 连接',tcp_disconn:'TCP 断开',status_0:'正常',status_1:'告警',status_2:'待定',email:'邮件',sms:'短信',voice:'语音',wechat:'微信',app:'App 推送',dingding_robot:'钉钉',qywx_robot:'企业微信',feishu_robot:'飞书',webhook:'Webhook',rule_call:'规则调用次数',action_call:'动作调用次数',mqtt_total:'MQTT 总流量',mqtt_up:'MQTT 上行',mqtt_down:'MQTT 下行',tcp_total:'TCP 总流量',tcp_up:'TCP 上行',tcp_down:'TCP 下行',http_total:'HTTP 总流量',http_up:'HTTP 上行',http_down:'HTTP 下行'}
const trafficColors=['rgba(54,162,235,.3)','#34D399','#FBBF24']
const chartPalettes:Readonly<Record<string,readonly string[]>>={
 messages:['rgba(54,162,235,.3)','#F87171','#FBBF24','#34D399','#60A5FA','#B91C1C','#92400E','#065F46','#818CF8','#ccc'],
 connections:['#10B981','#EF4444','#3B82F6','#F59E0B'],alarms:['#4ade80','#f87171','#facc15'],
 notifications:['#2563EB','#DC2626','#F59E0B','#10B981','#EC4899','#8B44AD','#009688','#03A9F4','#FF5722'],
 rules:['#7C3AED','#D97706'],mqtt:trafficColors,tcp:trafficColors,http:trafficColors
}
/** 原站各类统计配色；曲线、柱、图例和提示始终使用同一序列颜色。 */
export function chartColor(chartKey:string,index:number){return chartPalettes[chartKey]?.[index]||'#ccc'}
/** 只把有界比例转为绘图浮点数，原始计数始终保留十进制字符串。 */
export function chartRatio(value:string,max:bigint){return Number(BigInt(value)*1000000n/max)/1000000}
export function chartMaximum(series:readonly UsageSeries[],minimum=10n){let max=minimum;for(const s of series)for(const n of s.values)if(n!==null&&BigInt(n)>max)max=BigInt(n);return ((max+4n)/5n)*5n}
export function compactCount(value:bigint){for(const [div,suffix] of [[1000000000000n,'T'],[1000000000n,'G'],[1000000n,'M'],[1000n,'k']] as const)if(value>=div)return `${value/div}.${value%div*10n/div}${suffix}`;return value.toString()}
/** 每段未知桶都会断线，不能由零值或跨越缺口的线伪造观测。 */
export function chartSegments(series:UsageSeries,max:bigint,width=940,height=240,left=50){const segments:string[]=[];let current:string[]=[];series.values.forEach((n,i)=>{if(n===null){if(current.length)segments.push(current.join(' '));current=[];return}current.push(`${left+(i/Math.max(1,series.values.length-1))*width},${260-chartRatio(n,max)*height}`)});if(current.length)segments.push(current.join(' '));return segments}
const csvCell=(value:string)=>`"${value.replaceAll('"','""')}"`
export function chartCsv(data:UsageOverview,keys:readonly string[]){const series=keys.map(key=>data.series.find(s=>s.key===key)!);return '\uFEFF'+[ ['时间',...keys.map(k=>usageLabels[k]||k)].map(csvCell).join(','),...data.bucketStarts.map((at,index)=>[at,...series.map(s=>s.values[index]??'')].map(csvCell).join(','))].join('\r\n')}

export function chartStackMaximum(series:readonly UsageSeries[]){let max=10n;const length=series[0]?.values.length||0;for(let i=0;i<length;i++){let sum=0n;for(const s of series){const n=s.values[i];if(n!==null&&n!==undefined)sum+=BigInt(n)}if(sum>max)max=sum}return ((max+4n)/5n)*5n}
export function chartBars(series:readonly UsageSeries[],max:bigint,stacked:boolean,plotWidth=940,left=50,plotHeight=240){const bars:{key:string;index:number;x:number;y:number;width:number;height:number}[]=[];const length=series[0]?.values.length||0;const width=Math.min(28,plotWidth/Math.max(1,length)*.68);for(let i=0;i<length;i++){let base=0n;for(const s of series){const n=s.values[i];if(n===null||n===undefined)continue;const value=BigInt(n),height=chartRatio(n,max)*plotHeight;if(value>0n)bars.push({key:s.key,index:i,x:left+i/Math.max(1,length-1)*plotWidth-width/2,y:260-chartRatio((base+value).toString(),max)*plotHeight,width,height});if(stacked)base+=value}}return bars}
