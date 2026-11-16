import { describe, it, expect, vi } from 'vitest'
import { reactive } from 'vue'
import {
  createTenantSafetyModel,
  tenantSafetyState,
  tenantSafetyPendingStorage,
  tenantSafetyOperationId
} from '@/features/tenant-governance/model'
import type { PendingTenantSafety } from '@/features/tenant-governance/model'
const target = '0199aabb-0000-7000-8000-000000000001'
const operation = '0199aabb-0000-7000-8000-000000000002'
const selected = {
  id: target,
  name: '测试租户',
  status: 'ACTIVE',
  securityVersion: '9007199254740993'
}
function receipt(p: PendingTenantSafety) {
  return {
    ...p.request,
    tenantId: p.tenantId,
    actorAccountId: 'operator-a',
    resultVersion: '9007199254740994',
    createdAt: '2026-10-22T00:00:00Z'
  }
}
function setup() {
  const state = reactive(tenantSafetyState())
  const ports = {
    list: vi.fn().mockResolvedValue({ items: [selected], nextCursor: target }),
    detail: vi.fn().mockResolvedValue(selected),
    history: vi.fn().mockResolvedValue({ items: [] }),
    change: vi.fn().mockImplementation(async (id, request) => receipt({ tenantId: id, request })),
    save: vi.fn(),
    remove: vi.fn(),
    key: vi.fn().mockReturnValue(operation)
  }
  const model = createTenantSafetyModel(ports, state)
  return { state, ports, model }
}
describe('租户安全治理最小业务模型', () => {
  it('确认代次失效后即使A到B到A也不能提交原确认', async () => {
    const { model, ports } = setup()
    await model.select(target)
    const p = model.prepare('SUSPEND', 'ABUSE', '已核实滥用')
    model.invalidate()
    await model.select(target)
    await expect(model.submit(p)).rejects.toThrow()
    expect(ports.change).not.toHaveBeenCalled()
  })
  it('原申请按原内容重试支持Vue响应式状态并要求先查询', async () => {
    const { model, ports, state } = setup()
    await model.select(target)
    const p = model.prepare('SUSPEND', 'ABUSE', '已核实滥用')
    ports.change.mockRejectedValueOnce(new Error('network'))
    await model.submit(p)
    expect(state.pending?.request.operationId).toBe(operation)
    await model.retryOriginal()
    expect(ports.change).toHaveBeenCalledTimes(1)
    await model.recover()
    await model.retryOriginal()
    expect(ports.change).toHaveBeenCalledTimes(2)
    expect(ports.change.mock.calls[1]?.[1]).toEqual(p.request)
    expect(state.pending).toBeNull()
  })
  it('持久化发生在网络前，存储失败时零写请求', async () => {
    const { model, ports } = setup()
    await model.select(target)
    ports.save.mockImplementation(() => {
      throw new Error('storage denied')
    })
    const p = model.prepare('SUSPEND', 'ABUSE', '已核实')
    await expect(model.submit(p)).rejects.toThrow()
    expect(ports.change).not.toHaveBeenCalled()
  })
  it('网络未知保留原编号，不允许另建操作或自动重试', async () => {
    const { model, state, ports } = setup()
    await model.select(target)
    const p = model.prepare('SUSPEND', 'ABUSE', '已核实')
    ports.change.mockRejectedValue(new Error('timeout'))
    await model.submit(p)
    expect(ports.save.mock.invocationCallOrder[0]).toBeLessThan(
      ports.change.mock.invocationCallOrder[0]!
    )
    expect(state.pending?.request.operationId).toBe(operation)
    expect(() => model.prepare('SUSPEND', 'ABUSE', '另一个操作')).toThrow()
    expect(ports.key).toHaveBeenCalledTimes(1)
    expect(ports.change).toHaveBeenCalledTimes(1)
  })
  it('只接受与原参数完全相同的回执，不因查询为空丢弃申请', async () => {
    const { model, state, ports } = setup()
    const p: PendingTenantSafety = {
      tenantId: target,
      request: {
        operationId: operation,
        action: 'SUSPEND',
        expectedVersion: '0',
        reasonCode: 'ABUSE',
        reason: '原原因'
      }
    }
    model.restore(p)
    await model.recover()
    expect(state.pending).not.toBeNull()
    ports.history.mockResolvedValue({ items: [{ ...receipt(p), reason: '不同原因' }] })
    await model.recover()
    expect(state.pending).not.toBeNull()
    expect(ports.remove).not.toHaveBeenCalled()
    ports.history.mockResolvedValue({ items: [receipt(p)] })
    await model.recover()
    expect(state.pending).toBeNull()
    expect(ports.remove).toHaveBeenCalledWith(operation)
  })
  it('恢复保留原封禁回执及精确版本，不把注销或归档状态升级', async () => {
    const { model, ports } = setup()
    ports.detail.mockResolvedValue({ ...selected, status: 'SUSPENDED', banOperationId: operation })
    await model.select(target)
    const p = model.prepare('RESTORE', 'REMEDIATED', '整改已核实')
    expect(p.request.banOperationId).toBe(operation)
    expect(p.request.expectedVersion).toBe('9007199254740993')
    ports.detail.mockResolvedValue({ ...selected, status: 'DELETING' })
    model.invalidate()
    await model.select(target)
    expect(() => model.prepare('SUSPEND', 'ABUSE', '注销目标')).toThrow()
  })
  it('旧读取迟到不会污染后继身份', async () => {
    const { model, ports, state } = setup()
    let resolve!: (value: typeof selected) => void
    ports.detail.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    const old = model.select(target)
    model.invalidate()
    resolve(selected)
    await old
    expect(state.selected).toBeNull()
    expect(state.history).toEqual([])
    expect(state.busy).toBe(false)
  })
  it('目录和审计分页只使用原游标且保持有界', async () => {
    const { model, state, ports } = setup()
    await model.list({ prefix: '测试', limit: 20 })
    expect(state.nextCursor).toBe(target)
    expect(ports.list).toHaveBeenCalledWith({ prefix: '测试', limit: 20 })
    ports.history
      .mockResolvedValueOnce({ items: [], nextCursor: operation })
      .mockResolvedValueOnce({
        items: [receipt({ tenantId: target, request: { operationId: operation } })]
      })
    await model.select(target)
    await model.moreHistory()
    expect(ports.history).toHaveBeenLastCalledWith(target, { cursor: operation, limit: 20 })
  })
  it('本地原申请按账号隔离且不覆盖另一未决操作', () => {
    const values = new Map<string, string>()
    const storage = {
      get length() {
        return values.size
      },
      key: (i: number) => [...values.keys()][i] ?? null,
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
      removeItem: (k: string) => values.delete(k),
      clear: () => values.clear()
    } satisfies Storage
    const a = tenantSafetyPendingStorage(storage, 'a'),
      b = tenantSafetyPendingStorage(storage, 'b')
    const p: PendingTenantSafety = {
      tenantId: target,
      request: {
        operationId: operation,
        action: 'SUSPEND',
        expectedVersion: '0',
        reasonCode: 'ABUSE',
        reason: '已核实'
      }
    }
    a.save({
      ...p,
      token: 'never-copy',
      request: { ...p.request, password: 'never-copy' }
    } as PendingTenantSafety)
    expect([...values.values()].join('')).not.toContain('never-copy')
    expect(b.first()).toBeNull()
    expect(a.first()?.request.operationId).toBe(operation)
    expect(() =>
      a.save({ ...p, request: { ...p.request, operationId: tenantSafetyOperationId() } })
    ).toThrow()
    a.remove(operation)
    expect(a.first()).toBeNull()
  })
  it('新操作身份为UUIDv7并拒绝不精确版本与非安全原因', async () => {
    expect(tenantSafetyOperationId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    const { model, ports } = setup()
    await model.select(target)
    expect(() => model.prepare('SUSPEND', 'QUOTA_EXCEEDED', '超额')).toThrow()
    ports.detail.mockResolvedValue({ ...selected, securityVersion: '9223372036854775808' })
    model.invalidate()
    await model.select(target)
    expect(() => model.prepare('SUSPEND', 'ABUSE', '已核实')).toThrow()
  })
  it('首次明确CAS拒绝可重新读取，未知后的拒绝不能丢弃原申请', async () => {
    const { model, ports, state } = setup()
    await model.select(target)
    const p = model.prepare('SUSPEND', 'ABUSE', '已核实')
    ports.change.mockRejectedValueOnce({ code: 50065 })
    await model.submit(p)
    expect(state.pending).toBeNull()
    expect(state.selected).toBeNull()
    await model.select(target)
    ports.change.mockRejectedValueOnce(new Error('network')).mockRejectedValueOnce({ code: 50065 })
    const unknown = model.prepare('SUSPEND', 'ABUSE', '已核实')
    await model.submit(unknown)
    await model.recover()
    await model.retryOriginal()
    expect(state.pending?.request.operationId).toBe(operation)
  })
  it('恢复记录采用字段白名单，不重新保存意外凭据字段', () => {
    const { model, state } = setup()
    model.restore({
      tenantId: target,
      token: 'never-copy',
      request: {
        operationId: operation,
        action: 'SUSPEND',
        expectedVersion: '0',
        reasonCode: 'ABUSE',
        reason: '已核实',
        password: 'never-copy'
      }
    })
    expect(JSON.stringify(state.pending)).not.toContain('never-copy')
  })
})
