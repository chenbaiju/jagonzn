import {describe,it,expect} from 'vitest'
import {decodePropertySeries,seriesDecimal} from '../../src/features/devices/property-series-json'
import {plotSeries,seriesStatistics,compareDecimals,linePath} from '../../src/features/devices/property-series-presentation'
import {seriesCsv,seriesXlsx} from '../../src/features/devices/property-series-export'
import {presetRange,minimumSeriesStep} from '../../src/features/devices/property-series-options'
import {seriesQuery,seriesWire} from './property-series-fixture'
function frame(values:string[],property='n'){const query=seriesQuery({property,granularity:'ONE_MINUTE',aggregation:'SUM'});return decodePropertySeries(seriesWire(query,values,{}, {sourceKind:'PLATFORM_CLOUD_UPDATE',timeKind:'PLATFORM_ACCEPTED',precision:'DECIMAL_AGGREGATE'}),query)}
describe('曲线独立展示与导出事实',()=>{
 it('2e308/极小数与相邻大整数保持相对跨度，坐标有限，原词法不变',()=>{
  for(const values of [['-2e308','0','2e308'],['1e-16383','2e-16383','3e-16383'],['9007199254740993','9007199254740994','9007199254740995']]){
   const result=frame(values),line=plotSeries([result])[0]!
   expect(line.points.map(p=>p.y)).toEqual([196,110,24]);expect(line.points.every(p=>Number.isFinite(p.x)&&p.x>=24&&p.x<=616)).toBe(true);expect(line.points.map(p=>p.point.value.lexical)).toEqual(values)
  }
  expect(compareDecimals(seriesDecimal('1e308'),seriesDecimal('9e307'))).toBe(1)
 })
 it('多属性共用绝对时间轴，纳秒先后仍有跨度；不同来源/模型及缺桶不连线',()=>{
  const query=seriesQuery(),a=decodePropertySeries(seriesWire(query,['1'],{}, {ts:'2026-10-24T00:01:00.000000001Z'}),query),bQuery=seriesQuery({property:'b'}),b=decodePropertySeries(seriesWire(bQuery,['5'],{}, {ts:'2026-10-24T00:01:00.000000002Z'}),bQuery)
  expect(plotSeries([a,b]).map(line=>line.points[0]!.x)).toEqual([24,616])
  const aggregate=seriesQuery({granularity:'THIRTY_SECONDS'}),result=decodePropertySeries(seriesWire(aggregate,['1','2','3']),aggregate)
  expect(plotSeries([result])[0]!.segments).toHaveLength(3)
  expect(linePath(plotSeries([frame(['1','2'])])[0]!.points,true)).toContain('H616V24')
 })
 it('横轴使用查询窗口而不是把稀疏数据拉伸到两端',()=>{
  const result=frame(['1','2']),first=Date.parse(result.points[0]!.ts!),last=Date.parse(result.points[1]!.ts!),span=last-first
  const line=plotSeries([result],{},[new Date(first-span).toISOString(),new Date(last+span).toISOString()])[0]!
  expect(line.points[0]!.x).toBeCloseTo(24+592/3,5);expect(line.points[1]!.x).toBeCloseTo(24+592*2/3,5)
 })
 it('手动轴不会修改原值，越界点隐藏且断开；错误范围拒绝',()=>{
  const result=frame(['1','2','3']),line=plotSeries([result],{n:{minimum:seriesDecimal('1.5'),maximum:seriesDecimal('3.5')}})[0]!
  expect(line.points.map(p=>p.visible)).toEqual([false,true,true]);expect(line.points[1]!.y).toBe(153);expect(line.segments[0]).toHaveLength(2)
  expect(()=>plotSeries([result],{n:{minimum:seriesDecimal('5'),maximum:seriesDecimal('1')}})).toThrow()
 })
 it('统计在精确十进制域计算；循环平均显式近似，不用Infinity或四舍五入替换原点',()=>{
  const result=frame(['9007199254740993','9007199254740994','9007199254740995']),stats=seriesStatistics(result.points)!
  expect(stats.minimum).toBe('9007199254740993');expect(stats.maximum).toBe('9007199254740995');expect(Number(stats.average)).toBe(9007199254740994);expect(stats.approximate).toBe(false)
  expect(seriesStatistics(frame(['1','0','0']).points)!.approximate).toBe(true)
 })
 it('自然月/周预设按实际日历计算，月末回退不会溢到下月，窗口阈值同后端',()=>{
  const now=new Date('2026-03-31T04:00:00Z'),last=presetRange('last_6mo',now)!,week=presetRange('this_week',now)!
  expect(last[0].toISOString()).toBe('2025-09-30T04:00:00.000Z');expect(week[0].toISOString()).toBe('2026-03-29T16:00:00.000Z')
  expect(minimumSeriesStep('2026-01-01T00:00:00Z','2026-01-01T06:00:01Z')).toBe('TWO_MINUTES')
 })
 it('CSV原数字不经浮点、标签和版本防公式，XLSX是含真实OpenXML的ZIP且用文本存数字',()=>{
  const result=frame(['9007199254740993.0000000001','2e308']),csv=seriesCsv([result],{n:'=HYPERLINK("bad")'})
  expect(csv).toContain('9007199254740993.0000000001');expect(csv).toContain('2e308');expect(csv).toContain("'=HYPERLINK");expect(csv).toContain('DECIMAL_AGGREGATE')
  const bytes=seriesXlsx([result],{n:'=SUM(A1)'}),text=new TextDecoder().decode(bytes)
  expect([...bytes.slice(0,4)]).toEqual([80,75,3,4]);expect(text).toContain('[Content_Types].xml');expect(text).toContain('t="inlineStr"');expect(text).toContain('9007199254740993.0000000001');expect(text).not.toContain('<f>')
 })
})
