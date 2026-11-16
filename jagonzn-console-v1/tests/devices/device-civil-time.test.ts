import {describe,it,expect} from 'vitest'
import {effectScope,ref} from 'vue'
import {useEastEightRange} from '../../src/features/devices/device-civil-time'
describe('查询窗口草稿与已读时刻分离',()=>{
 it('显示东八区但不改变未编辑窗口的原毫秒，编辑和解析不自动提交',()=>{const scope=effectScope();scope.run(()=>{const range=ref<[Date,Date]>([new Date('2026-03-07T18:30:00.123Z'),new Date('2026-03-07T19:30:00.456Z')]),clock=useEastEightRange(range);expect(clock.draft.value).toEqual(['2026-03-08 02:30:00','2026-03-08 03:30:00']);expect(clock.dirty.value).toBe(false);clock.edit(0,'2026-03-08 02:15:00');expect(clock.dirty.value).toBe(true);expect(range.value[0].toISOString()).toBe('2026-03-07T18:30:00.123Z');expect(clock.parse()[0].toISOString()).toBe('2026-03-07T18:15:00.000Z');range.value=clock.parse();expect(clock.dirty.value).toBe(false)});scope.stop()})
 it('不完整、非法和反序草稿拒绝，不退回旧窗口作成功；reset仅由调用者明确执行',()=>{const scope=effectScope();scope.run(()=>{const range=ref<[Date,Date]>([new Date('2026-03-07T18:30:00Z'),new Date('2026-03-07T19:30:00Z')]),clock=useEastEightRange(range);for(const bad of ['', '2026-02-30 02:30:00','2026-03-08 04:30:00']){clock.edit(0,bad);expect(()=>clock.parse()).toThrow();expect(range.value[0].toISOString()).toBe('2026-03-07T18:30:00.000Z')}clock.reset();expect(clock.dirty.value).toBe(false)});scope.stop()})
})
