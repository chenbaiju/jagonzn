import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/** 只恢复本页注册的公开页签；查询参数不授予内部能力或触发定义重读。 */
export function useDetailTab(names: readonly string[], initial: string) {
  const route = useRoute(), router = useRouter()
  return computed({
    get: () => {
      const raw = route.query?.tab
      const value = raw === 'stat' && names.includes('statistics') ? 'statistics' : raw
      return typeof value === 'string' && names.includes(value) ? value : initial
    },
    set: (value: string) => {
      if (!names.includes(value)) return
      const query = { ...route.query }
      if (value === initial) delete query.tab
      else query.tab = value === 'statistics' ? 'stat' : value
      void router.replace({ query })
    }
  })
}
