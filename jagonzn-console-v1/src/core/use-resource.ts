import { onScopeDispose, ref, shallowRef } from 'vue'
import { ApiError, identityEpoch, assertIdentity, IdentityChanged, onIdentityChange } from './http'
/** 身份切换和同页快速筛选后，旧响应不能覆盖当前内容。 */
export function useResource<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const data = shallowRef<T>(), error = shallowRef<unknown>(), loading = ref(false)
  let sequence = 0, controller: AbortController | undefined
  function clear() { sequence++; controller?.abort(); data.value = undefined; error.value = undefined; loading.value = false }
  const dispose = onIdentityChange(clear)
  onScopeDispose(() => { clear(); dispose() })
  async function reload() {
    controller?.abort(); controller = new AbortController()
    const signal = controller.signal, request = ++sequence, identity = identityEpoch()
    error.value = undefined; loading.value = true
    try { const result = await loader(signal); assertIdentity(identity); if (request === sequence) data.value = result }
    catch (cause) {
      if (request === sequence && !signal.aborted && !(cause instanceof IdentityChanged)) {
        if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) data.value = undefined
        error.value = cause
      }
    }
    finally { if (request === sequence) loading.value = false }
  }
  return { data, error, loading, reload, clear }
}
