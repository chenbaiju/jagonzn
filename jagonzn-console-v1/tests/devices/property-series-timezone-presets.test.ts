import {describe,it,expect} from 'vitest'
import {presetRange} from '../../src/features/devices/property-series-options'
const iso=(key:string,now:string)=>presetRange(key,new Date(now))!.map(value=>value.toISOString())
describe('东八区自然日历预设',()=>{
 it('浏览器仍为周日时东八区已周一，日周边界均采用东八区',()=>{const now='2026-03-08T23:30:00Z';expect(iso('today',now)).toEqual(['2026-03-08T16:00:00.000Z','2026-03-09T16:00:00.000Z']);expect(iso('this_week',now)).toEqual(['2026-03-08T16:00:00.000Z','2026-03-15T16:00:00.000Z']);expect(iso('yesterday',now)).toEqual(['2026-03-07T16:00:00.000Z','2026-03-08T16:00:00.000Z'])})
 it('月年跨界和月末回退按东八区，进行中窗口保留真实now毫秒',()=>{expect(iso('this_month','2026-03-31T23:30:00Z')).toEqual(['2026-03-31T16:00:00.000Z','2026-04-30T16:00:00.000Z']);expect(iso('last_1mo','2026-03-31T04:30:00Z')[0]).toBe('2026-02-28T04:30:00.000Z');expect(iso('last_1y','2024-02-29T04:30:00Z')[0]).toBe('2023-02-28T04:30:00.000Z');expect(iso('this_year_so_far','2026-12-31T23:30:00.123Z')).toEqual(['2026-12-31T16:00:00.000Z','2026-12-31T23:30:00.123Z'])})
 it('最近小时和天仍为实际经过时长，不受本地夏令时跳变影响',()=>{expect(iso('last_24h','2026-03-08T23:30:00Z')).toEqual(['2026-03-07T23:30:00.000Z','2026-03-08T23:30:00.000Z']);expect(presetRange('custom')).toBeUndefined()})
})
