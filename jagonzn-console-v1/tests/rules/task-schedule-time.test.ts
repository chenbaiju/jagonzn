import { expect,it } from 'vitest'
import { taskInstantToWall,taskWallToInstant,canonicalTaskInstant } from '../../src/features/rules/task-schedule-time'
it('按任务IANA时区反解，上海午夜不是浏览器所在时区',()=>{expect(taskWallToInstant('2026-10-25T00:00:00','Asia/Shanghai')).toEqual({instant:'2026-10-24T16:00:00.000Z',ambiguous:false});expect(taskInstantToWall('2026-10-24T16:00:00Z','Asia/Shanghai')).toBe('2026-10-25T00:00:00')})
it('春季缺失本地时间拒绝，不能自动改为一个小时后',()=>{expect(()=>taskWallToInstant('2026-03-08T02:30:00','America/New_York')).toThrow('不存在')})
it('秋季重叠只选较早UTC发生点，不偷用运行环境offset',()=>{expect(taskWallToInstant('2026-11-01T01:30:00','America/New_York')).toEqual({instant:'2026-11-01T05:30:00.000Z',ambiguous:true})})
it('Lord Howe半小时重叠与缺失均正确处理',()=>{expect(taskWallToInstant('2026-04-05T01:45:00','Australia/Lord_Howe')).toEqual({instant:'2026-04-04T14:45:00.000Z',ambiguous:true});expect(()=>taskWallToInstant('2026-10-04T02:15:00','Australia/Lord_Howe')).toThrow('不存在')})
it('非整小时和跨日期边界offset保持精确秒',()=>{expect(taskWallToInstant('2026-10-25T00:00:01','Asia/Kathmandu').instant).toBe('2026-10-24T18:15:01.000Z');expect(taskWallToInstant('2026-10-25T00:00:00','Pacific/Kiritimati').instant).toBe('2026-10-24T10:00:00.000Z')})
it.each(['2026-02-30T01:02:03','2026-13-01T00:00:00','2026-10-25T24:00:00','2026-10-25T00:60:00','2026-10-25T00:00:60','2026-10-25 00:00:00','0000-01-01T00:00:00'])('非法日期/墙钟格式%s拒绝而不归一化',value=>{expect(()=>taskWallToInstant(value,'UTC')).toThrow()})
it('回填保留微秒原串的显示口径，不将零至99年猜成1900年',()=>{expect(taskInstantToWall('2026-10-24T00:00:00.123456Z','UTC')).toBe('2026-10-24T00:00:00');expect(taskWallToInstant('0099-01-01T00:00:00','UTC').instant).toBe('0099-01-01T00:00:00.000Z')})
it('未知IANA标识和缺少显式offset的返回事实拒绝',()=>{expect(()=>taskWallToInstant('2026-10-25T00:00:00','Unknown/Zone')).toThrow();expect(()=>taskInstantToWall('2026-10-25T00:00:00','UTC')).toThrow();expect(()=>taskInstantToWall('2026-02-30T00:00:00Z','UTC')).toThrow()})

it('等价offset和省略零分数统一UTC微秒，保留真实微秒而非毫秒截断',()=>{expect(canonicalTaskInstant('2026-10-25T08:00:00.123456+08:00')).toBe('2026-10-25T00:00:00.123456Z');expect(canonicalTaskInstant('2026-10-25T00:00:00.000Z')).toBe(canonicalTaskInstant('2026-10-25T00:00:00Z'))})
it('UTC规范化拒绝过长分数和错误的offset，而非吞掉坏格式',()=>{expect(()=>canonicalTaskInstant('2026-10-25T00:00:00.1234567Z')).toThrow();expect(()=>canonicalTaskInstant('2026-10-25T00:00:00+24:00')).toThrow()})
