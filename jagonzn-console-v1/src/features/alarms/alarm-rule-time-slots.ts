/** 每日48个半小时格的显示工具；不转换时区、不把展示时钟反写为UTC。 */
export function alarmRuleTimeSlots(values:readonly number[]):number[]{
 if(!Array.isArray(values)||values.some(value=>!Number.isInteger(value)||value<0||value>47)||new Set(values).size!==values.length)throw new Error('有效时段资料不完整')
 return [...values].sort((a,b)=>a-b)
}
const clock=(slot:number)=>slot===48?'24:00':`${String(Math.floor(slot/2)).padStart(2,'0')}:${slot%2?'30':'00'}`
/** 连续半小时格合并左闭右开区间，午夜两边分别保留，不假装日期或夏令时运行资格。 */
export function alarmRuleTimeRanges(values:readonly number[]):readonly [string,string][]{
 const slots=alarmRuleTimeSlots(values),ranges:[string,string][]=[]
 let start=-1,previous=-1
 for(const slot of slots){if(start<0)start=slot;else if(slot!==previous+1){ranges.push([clock(start),clock(previous+1)]);start=slot}previous=slot}
 if(start>=0)ranges.push([clock(start),clock(previous+1)])
 return ranges
}
