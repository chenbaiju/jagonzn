import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, changeIdentity, IdentityChanged, onSessionExpired, setAccessToken, ApiError } from '@/core/http'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const fetchMock = vi.fn()
beforeEach(() => { changeIdentity('initial'); onSessionExpired(() => changeIdentity()); vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset() })
afterEach(() => vi.unstubAllGlobals())
describe('请求、令牌和身份边界', () => {
  it('重复query key保留多选，空筛选不发送', async () => {
    fetchMock.mockResolvedValue(json({ items: [] }))
    await api('/api/v1/projects/p/devices/search', { query: { status: ['ONLINE','OFFLINE'], keyword: '', limit: 24 } })
    const [url, request] = fetchMock.mock.calls[0]
    expect(url.searchParams.getAll('status')).toEqual(['ONLINE','OFFLINE'])
    expect(url.searchParams.has('keyword')).toBe(false)
    expect(request.headers.get('Authorization')).toBe('Bearer initial')
    expect(request.credentials).toBe('include')
  })
  it('204写结果不尝试JSON解析', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(api('/api/v1/projects/p/devices/d', { method: 'delete' })).resolves.toBeUndefined()
  })
  it('写操作401、网络未知结果均不自动重放', async () => {
    fetchMock.mockResolvedValueOnce(json({message:'失效'},401))
    await expect(api('/api/v1/projects/p/devices', {method:'post',body:{name:'test'}})).rejects.toMatchObject({status:401})
    expect(fetchMock).toHaveBeenCalledTimes(1)
    setAccessToken('retry-test'); fetchMock.mockReset().mockRejectedValue(new TypeError('network'))
    await expect(api('/api/v1/projects/p/devices', {method:'post',body:{name:'test'}})).rejects.toMatchObject({outcomeUnknown:true})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it.each([
    { method: 'get', bodyKind: 'json' },
    { method: 'get', bodyKind: 'html' },
    { method: 'post', bodyKind: 'json' },
    { method: 'post', bodyKind: 'html' },
  ] as const)('$method 的 $bodyKind 503只报失败，写结果未知且不重试', async ({ method, bodyKind }) => {
    const expired = vi.fn(); onSessionExpired(expired)
    fetchMock.mockResolvedValue(bodyKind === 'json'
      ? json({ message: '服务暂不可用', code: 50000, traceId: 'bounded-503' }, 503)
      : new Response('<html>upstream unavailable</html>', { status: 503, headers: { 'Content-Type': 'text/html' } }))
    const result = method === 'get'
      ? api('/api/v1/projects/p/devices/d')
      : api('/api/v1/projects/p/devices', { method: 'post', body: { name: 'isolated-test' } })
    await expect(result).rejects.toMatchObject({
      status: 503,
      outcomeUnknown: method === 'post',
      message: bodyKind === 'json' ? '服务暂不可用' : '请求失败（503）',
      code: bodyKind === 'json' ? 50000 : undefined,
      traceId: bodyKind === 'json' ? 'bounded-503' : undefined,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].method).toBe(method.toUpperCase())
    expect(expired).not.toHaveBeenCalled()
  })
  it('GET401只刷新并重读一次，刷新失败清会话', async () => {
    const expired = vi.fn(); onSessionExpired(expired)
    fetchMock.mockResolvedValueOnce(json({},401)).mockResolvedValueOnce(json({accessToken:'new'})).mockResolvedValueOnce(json({id:'p'}))
    await expect(api('/api/v1/projects/p/devices/d')).resolves.toEqual({id:'p'})
    expect(fetchMock.mock.calls[2][1].headers.get('Authorization')).toBe('Bearer new')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    fetchMock.mockReset().mockResolvedValue(json({},401))
    await expect(api('/api/v1/projects/p/devices/d')).rejects.toBeInstanceOf(ApiError)
    expect(expired).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('首屏没有令牌且refresh失败时不会再刷新第二次', async () => {
    changeIdentity(); const expired = vi.fn(); onSessionExpired(expired)
    fetchMock.mockResolvedValue(json({},401))
    await expect(api('/api/v1/projects')).rejects.toMatchObject({status:401})
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(expired).toHaveBeenCalledTimes(1)
  })
  it('项目切换后旧响应不返回给消费者', async () => {
    let done!: (response: Response) => void
    fetchMock.mockImplementation(() => new Promise(resolve => { done = resolve }))
    const pending = api('/api/v1/projects/p/devices/d')
    changeIdentity('other-project'); done(json({id:'old-device'}))
    await expect(pending).rejects.toBeInstanceOf(IdentityChanged)
  })
  it('成功正文解析后、API交付前的身份切换也拒绝旧响应', async () => {
    fetchMock.mockResolvedValue(json({ id: 'old-device' }))
    const parse = JSON.parse
    const spy = vi.spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
      const value = parse(text, reviver)
      if (text.includes('old-device')) queueMicrotask(() => changeIdentity('winning-session'))
      return value
    })
    try {
      await expect(api('/api/v1/projects/p/devices/d')).rejects.toBeInstanceOf(IdentityChanged)
    } finally { spy.mockRestore() }
  })
  it('并发首屏请求共享一次refresh，令牌只存在内存', async () => {
    changeIdentity(); const stored = vi.spyOn(window.Storage.prototype, 'setItem')
    fetchMock.mockImplementation((url: URL) => Promise.resolve(json(url.pathname.endsWith('/refresh') ? {accessToken:'private-token'} : [])))
    await Promise.all([api('/api/v1/projects'),api('/api/v1/system/menus')])
    expect(fetchMock.mock.calls.filter(([url]) => url.pathname.endsWith('/refresh'))).toHaveLength(1)
    expect(stored).not.toHaveBeenCalled(); stored.mockRestore()
  })
  it('原始JSON历史保留超过安全整数范围的字面值', async () => {
    const raw = '{"value":9007199254740993,"decimal":0.1234567890123456789}'
    fetchMock.mockResolvedValue(new Response(raw))
    await expect(api<string>('/api/v1/projects/p/devices/d', {responseType:'text'})).resolves.toBe(raw)
  })
  it('图片上传不JSON化，下载保留MIME和实际字节', async () => {
    const upload = new Blob([new Uint8Array([1,2,3])],{type:'image/png'})
    fetchMock.mockResolvedValue(new Response(new Uint8Array([4,5]),{headers:{'Content-Type':'image/png'}}))
    const image = await api<Blob>('/api/v1/projects/p/devices/d/image', {method:'put',body:upload,responseType:'blob'})
    expect(fetchMock.mock.calls[0][1].body).toBe(upload)
    expect(image.type).toBe('image/png'); expect(image.size).toBe(2)
  })
  it('无Content-Length的分块响应也有上限，失败不重放写入', async () => {
    const stream = new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2]));controller.enqueue(new Uint8Array([3,4]));controller.close()}})
    fetchMock.mockResolvedValue(new Response(stream))
    await expect(api('/api/v1/projects/p/devices', {method:'post',body:{},responseType:'bytes',maxResponseBytes:3})).rejects.toMatchObject({outcomeUnknown:true})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('原始写入JSON不经过再次转义或数值舍入', async () => {
    const raw = '{"value":9007199254740993}'
    fetchMock.mockResolvedValue(new Response(null,{status:204}))
    await api('/api/v1/projects/p/devices/d', {method:'put',rawBody:raw,headers:{'Content-Type':'application/json'}})
    expect(fetchMock.mock.calls[0][1].body).toBe(raw)
  })
  const instance = '/api/v1/projects/11111111-1111-1111-1111-111111111111/console/alarm-instances/22222222-2222-2222-2222-222222222222' as const
  const largeBudget = 12 * 1024 * 1024
  const evaluation = '/api/v1/projects/11111111-1111-1111-1111-111111111111/console/alarm-logs/22222222-2222-2222-2222-222222222222/evaluation' as const
  it('单事件原件只对精确UUID GET开放显式12MiB，默认预算不扩大', async () => {
    const invoke = api as (path: string, options: { method?: 'get' | 'post' | 'delete'; maxResponseBytes?: number; responseType?: 'bytes' }) => Promise<Uint8Array>
    fetchMock.mockImplementation(() => Promise.resolve(new Response(new Uint8Array(8 * 1024 * 1024 + 1))))
    await expect(invoke(evaluation, { responseType: 'bytes' })).rejects.toMatchObject({ outcomeUnknown: false })
    await expect(invoke(evaluation, { responseType: 'bytes', maxResponseBytes: largeBudget })).resolves.toHaveProperty('byteLength', 8 * 1024 * 1024 + 1)
    fetchMock.mockClear()
    for (const [path, method] of [[evaluation, 'post'], [evaluation, 'delete'], [`${evaluation}/extra`, 'get'], [`${evaluation}/`, 'get'], [evaluation.replace('22222222-', 'invalid-'), 'get'], [evaluation.replace('/22222222-2222-2222-2222-222222222222/', '//'), 'get']] as const) {
      await expect(invoke(path, { method, maxResponseBytes: largeBudget })).rejects.toMatchObject({ message: '响应大小限制无效' })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('单事件12MiB预算仍逐块拒绝超限响应', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(largeBudget)); controller.enqueue(new Uint8Array(1)); controller.close()
    } }))))
    const invoke = api as (path: string, options: { maxResponseBytes: number; responseType: 'bytes' }) => Promise<unknown>
    await expect(invoke(evaluation, { maxResponseBytes: largeBudget, responseType: 'bytes' })).rejects.toMatchObject({ outcomeUnknown: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('只有精确详情GET和ack/clear POST允许显式12MiB预算', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ evaluationSnapshotJson: '9007199254740993' })))
    await expect(api(instance, { maxResponseBytes: largeBudget })).resolves.toHaveProperty('evaluationSnapshotJson', '9007199254740993')
    for (const action of ['ack', 'clear'] as const) {
      await expect(api(`${instance}/${action}`, { method: 'post', body: { version: 1 }, maxResponseBytes: largeBudget })).resolves.toHaveProperty('evaluationSnapshotJson')
    }
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
  it('邻近路由、非对应方法和非法身份不能提高预算，普通路径仍是8MiB', async () => {
    // 运行时边界包含绕过类型检查的调用，不为这些非法请求增加网络合同。
    const invoke = api as (path: string, options: { method?: 'get' | 'post' | 'put'; maxResponseBytes: number }) => Promise<unknown>
    for (const [path, method] of [[`${instance}/ack`, 'get'], [instance, 'post'], [instance, 'put'], [`${instance}/clear/extra`, 'post'], [`${instance}/`, 'get'], [instance.replace('22222222-', 'not-uuid-'), 'get'], ['/api/v1/projects/p/devices/d', 'get']] as const) {
      await expect(invoke(path, { method, maxResponseBytes: largeBudget })).rejects.toMatchObject({ message: '响应大小限制无效' })
    }
    await expect(api(instance, { maxResponseBytes: largeBudget + 1 })).rejects.toMatchObject({ message: '响应大小限制无效' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('精确详情默认仍是2MiB，显式12MiB可接收大于8MiB的原件', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(new Uint8Array(8 * 1024 * 1024 + 1))))
    await expect(api(instance, { responseType: 'bytes' })).rejects.toMatchObject({ outcomeUnknown: false })
    const bytes = await api<Uint8Array>(instance, { responseType: 'bytes', maxResponseBytes: largeBudget })
    expect(bytes.byteLength).toBe(8 * 1024 * 1024 + 1)
  })
  it('12MiB写响应仍逐块计数，超限或401均不重放写入', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(largeBudget)); controller.enqueue(new Uint8Array(1)); controller.close()
    } }))))
    await expect(api(`${instance}/ack`, { method: 'post', maxResponseBytes: largeBudget, responseType: 'bytes' })).rejects.toMatchObject({ outcomeUnknown: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockReset().mockResolvedValue(json({}, 401))
    await expect(api(`${instance}/clear`, { method: 'post', maxResponseBytes: largeBudget })).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('较大响应在读取期间身份切换后仍丢弃旧结果', async () => {
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ pull(controller) {
      changeIdentity('another-project'); controller.enqueue(new Uint8Array(1)); controller.close()
    } })))
    await expect(api(instance, { maxResponseBytes: largeBudget, responseType: 'bytes' })).rejects.toBeInstanceOf(IdentityChanged)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
it('仅OTA原始正文可延长到五分钟，原字节保持且其它路径拒绝扩大等待',async()=>{
 const id='00000000-0000-4000-8000-000000000001',raw=new Uint8Array([0,255,128]).buffer
 fetchMock.mockResolvedValue(json({ok:true}))
 await api(`/api/v1/projects/${id}/ota/firmwares/${id}/uploads/${id}/content`,{method:'put',rawBody:raw,headers:{'Content-Type':'application/octet-stream'},timeoutMs:300000})
 expect(fetchMock).toHaveBeenCalledTimes(1);expect(fetchMock.mock.calls[0]?.[1].body).toBe(raw)
 await expect(api(`/api/v1/projects/${id}/devices/${id}`,{timeoutMs:300000})).rejects.toThrow('等待时间');expect(fetchMock).toHaveBeenCalledTimes(1)
})
