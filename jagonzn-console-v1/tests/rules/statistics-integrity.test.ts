import { expect, it } from 'vitest'
import { usagePoints, taskUsageSummary } from '../../src/features/rules/statistics'
const from='2026-10-23T00:00:00Z',to='2026-10-24T00:00:00Z'
const items=Array.from({length:24},(_,i)=>({hour:new Date(Date.parse(from)+i*3600000).toISOString(),calls:i,actions:i===1?null:i}))
const complete=()=>({from,to,items:items.map(row=>({...row}))})
it('完整小时与未知动作原值保留，不补造计数或跨NULL连线',()=>{const result=usagePoints(complete(),'rule',1);expect(result).toHaveLength(24);expect(result[1]).toEqual({time:items[1]!.hour,values:[1,null]})})
it.each([
 ()=>({...complete(),items:items.slice(1)}),
 ()=>({...complete(),items:[...items.slice(0,2),...items.slice(3)]}),
 ()=>({...complete(),items:items.slice(0,-1)}),
 ()=>({...complete(),items:[{...items[0]!,hour:'2026-10-22T23:00:00Z'},...items.slice(1)]}),
 ()=>({...complete(),items:[...items.slice(0,-1),{...items.at(-1)!,hour:to}]}),
 ()=>({...complete(),items:[{...items[0]!,hour:'2026-10-23T00:00:01Z'},...items.slice(1)]}),
 ()=>({...complete(),from:'2026-10-23T00:00:00Z',to:'2026-10-26T00:00:00Z'}),
 ()=>({...complete(),from:'2026-02-30T00:00:00Z',to:'2026-03-03T00:00:00Z'}),
 ()=>({...complete(),items:[{...items[0]!,hour:'2026-10-23T00:00:00.000001Z'},...items.slice(1)]}),
])('范围/缺桶/非UTC整小时损坏整体拒绝，不静默画局部曲线 %#',make=>{expect(()=>usagePoints(make(),'rule',1)).toThrow()})
it('当前选择3天但服务端回1天时拒绝旧窗口',()=>{expect(()=>usagePoints(complete(),'rule',3)).toThrow()})
it.each(['000001','000000001'])('合法offset与完整小数秒%s的首尾边界不被毫秒截断',fraction=>{
 const value={from:`2026-10-23T08:00:00.${fraction}+08:00`,to:`2026-10-24T08:00:00.${fraction}+08:00`,items:[...items,{hour:to,calls:9,actions:null}]};expect(usagePoints(value,'rule',1)).toHaveLength(25)
 expect(()=>usagePoints({...value,items},'rule',1)).toThrow();expect(()=>usagePoints({...complete(),items:[...items,{hour:to,calls:9,actions:0}]},'rule',1)).toThrow()
})
it('30天窗口最多721个首尾部分小时均保持服务端事实，不扩为31天',()=>{
 const start='2026-09-24T00:00:00.123456Z',end='2026-10-24T00:00:00.123456Z',rows=Array.from({length:721},(_,i)=>({hour:new Date(Date.parse('2026-09-24T00:00:00Z')+i*3600000).toISOString(),calls:0,actions:0}));expect(usagePoints({from:start,to:end,items:rows},'task',30)).toHaveLength(721)
})
it('任务动作计数为真实非负整数，不接受规则的未知NULL或缺字段',()=>{expect(()=>usagePoints(complete(),'task',1)).toThrow();expect(()=>usagePoints({...complete(),items:items.map(({actions,...row})=>row)},'task',1)).toThrow()})
it.each([
 {rows:[{id:'one',jobId:'other',startedAt:from}]},
 {rows:[{id:'one',startedAt:from}]},
 {rows:[{id:1,jobId:'job',startedAt:from}]},
 {rows:[{id:'one',jobId:'job',startedAt:'2026-02-30T00:00:00Z'}]},
])('任务总体统计拒绝外任务/缺身份/坏日期 %#',({rows})=>{expect(()=>taskUsageSummary(rows as never,'job')).toThrow()})
it('总体统计是全部当前任务执行，保留窗口前事实并按完整小数秒选最后发生时间',()=>{
 const earlier='2026-10-24T00:00:00.000001Z',later='2026-10-24T00:00:00.000009Z';expect(taskUsageSummary([{actionType:'COMMAND',id:'one',jobId:'job',startedAt:'2020-01-01T00:00:00Z'},{actionType:'COMMAND',id:'two',jobId:'job',startedAt:earlier},{actionType:'COMMAND',id:'three',jobId:'job',startedAt:later}],'job')).toEqual({total:3,latest:later});expect(taskUsageSummary([],'job')).toEqual({total:0,latest:undefined})
})
