import { storeToRefs } from 'pinia'
import { useUserStore } from '@/store/modules/user'

/**
 * @author Things Cloud Team
 * 使用当前会话的服务端权限事实；auth.ts 将 /auth/me.permissions 映射为 buttons。
 * 菜单 authList 仅描述部分操作按钮，不包含全部读取权限，不能替代会话授权。
 * 每次读取最新状态，切换项目、撤权或退出后不保留旧权限快照；后端仍做最终鉴权。
 */
export const useAuth = () => {
  const { info } = storeToRefs(useUserStore())
  const hasAuth = (auth: string): boolean => (info.value?.buttons ?? []).includes(auth)
  return { hasAuth }
}
