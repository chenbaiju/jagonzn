/** 唯一合同来源为主仓生成物；各实施窗禁止复制或手改服务端 DTO。 */
export type { components, paths } from '../../../../things-link-console/src/types/api/schema'
import type { components } from '../../../../things-link-console/src/types/api/schema'
export type Schema<K extends keyof components['schemas']> = components['schemas'][K]
