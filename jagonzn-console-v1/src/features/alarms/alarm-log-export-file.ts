/** 客户端文件显示模型；不是HTTP DTO，不以未生成合同的路径发请求。 */
export const alarmLogExportColumns=[
 {key:'device_id',label:'设备 ID'},{key:'device_name',label:'设备名称'},{key:'device_type_name',label:'设备类型名称'},
 {key:'alarm_time',label:'告警时间'},{key:'alarm_rule',label:'告警规则名称'},{key:'alarm_state',label:'告警状态'},
 {key:'alarm_level',label:'告警级别'},{key:'alarm_attributes',label:'告警相关属性'},{key:'alarm_reason',label:'告警原因'},
 {key:'solution',label:'解决方案'},{key:'remark',label:'其它备注'}
] as const
export type AlarmLogExportKey=typeof alarmLogExportColumns[number]['key']
export type AlarmLogExportDisplayRow=Readonly<Record<AlarmLogExportKey,string>>
export type AlarmLogExportFormat='xls'|'csv'
export interface AlarmLogExportFile {text:string;mime:'application/vnd.ms-excel'|'application/csv';filename:string}
const html=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
// 名称和维护原文作为文本单元格，避免CSV的公式起始符被电子表格执行。
const csv=(value:string)=>'"'+(/^[\s]*[=+@-]/.test(value)?"'"+value:value).replace(/"/g,'""')+'"'
const pad=(value:number)=>String(value).padStart(2,'0')
/** Source选项xls输出HTML表格，非BIFF/OOXML；CSV UTF-8/CRLF。保持原站本地时间文件名prop，不推断浏览器最终扩展名。 */
export function buildAlarmLogExportFile(rows:readonly AlarmLogExportDisplayRow[],selected:readonly AlarmLogExportKey[],format:AlarmLogExportFormat,now=new Date()):AlarmLogExportFile {
 if(!['xls','csv'].includes(format)||!Array.isArray(rows)||rows.length>1000||!selected.length||new Set(selected).size!==selected.length||selected.some(key=>!alarmLogExportColumns.some(column=>column.key===key))||!Number.isFinite(now.getTime()))throw new Error('导出选项或记录范围无效')
 const columns=alarmLogExportColumns.filter(column=>selected.includes(column.key))
 let textBytes=0
 const cells=rows.map(row=>columns.map(column=>{const value=row[column.key];if(typeof value!=='string'||/[\u0000]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value))throw new Error('导出显示资料不完整');if(value.length>1024*1024)throw new Error('导出内容过多，请缩小筛选范围后重试');textBytes+=new TextEncoder().encode(value).byteLength;if(textBytes>1024*1024)throw new Error('导出内容过多，请缩小筛选范围后重试');return value}))
 const filename=`告警消息-${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
 if(format==='csv')return {filename,mime:'application/csv',text:[columns.map(column=>column.label),...cells].map(row=>row.map(csv).join(',')).join('\r\n')+'\r\n'}
 return {filename,mime:'application/vnd.ms-excel',text:'<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body><table><thead><tr>'+columns.map(column=>'<th>'+html(column.label)+'</th>').join('')+'</tr></thead><tbody>'+cells.map(row=>'<tr>'+row.map(value=>'<td x:str style="mso-number-format:\\@">'+html(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table></body></html>'}
}
/** 通过Blob生成UTF-8字节；浏览器下载由宿主明确提供，不在纯组件中写入未知目录。 */
export const alarmLogExportBlob=(file:AlarmLogExportFile)=>new Blob([file.text],{type:file.mime})
