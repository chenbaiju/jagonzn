/** 显示标题与协议枚举分离，不更改保存、回读及导出值。 */
export function definitionTypeCaption(label:string){return label.replace('Switch（开关）','Switch (开关量)').replace('Switch（布尔）','Switch (开关量)').replace('Object（对象）','Object (键值对)').replace('（',' (').replace('）',')')}
export function switchEncodingCaption(value:string){return value==='NUMBER'?'1/0':value==='TEXT'?'ON/OFF':'true/false'}
