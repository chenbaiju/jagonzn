import {beforeEach,it,expect,vi} from 'vitest'
const send=vi.hoisted(()=>vi.fn())
vi.mock('../../src/core/http',async importOriginal=>({...await importOriginal<typeof import('../../src/core/http')>(),api:send}))
import {listTasks} from '../../src/features/rules/api'
beforeEach(()=>send.mockReset())
it('完整任务数组沿原受权路径读取，空数组是真空而非失败兜底',async()=>{
 const signal=new AbortController().signal;send.mockResolvedValueOnce([]);expect(await listTasks('p',signal)).toEqual([]);expect(send).toHaveBeenCalledExactlyOnceWith('/api/v1/projects/p/task-jobs',{signal});send.mockResolvedValueOnce([{id:'a',targetType:'FUTURE'}]);expect(await listTasks('p')).toEqual([{id:'a',targetType:'FUTURE'}])
})
it.each([undefined,null,{items:[]},{}])('非完整数组%s拒绝而非伪造目录0',async(value)=>{
 send.mockResolvedValueOnce(value);await expect(listTasks('p')).rejects.toThrow('格式不完整');expect(send).toHaveBeenCalledTimes(1)
})
