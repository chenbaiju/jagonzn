import type {Schema} from '@/core/contracts'
import {businessKey,referenceVersion} from './reference-profile'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** 读取本页同快照当前标识；空值保持空，不用内部协议键或另一页回执兜底。 */
export function directoryReferenceKeys(items:Schema<'DeviceResponse'>[]|undefined,identities:Schema<'DeviceReferenceIdentityResponse'>[]|undefined):Record<string,string|null>{
 if(!Array.isArray(items)||items.length>96||!Array.isArray(identities)||items.length!==identities.length)throw new Error('目录当前标识投影不完整')
 const expected=new Set(items.map(item=>item.id)),seen=new Set<string>(),result:Record<string,string|null>={}
 if(expected.size!==items.length||items.some(item=>!item.id||!uuid.test(item.id)))throw new Error('目录设备身份无效')
 for(const current of identities){
  if(!current.deviceId||!expected.has(current.deviceId)||seen.has(current.deviceId)||!referenceVersion(current.version)
   ||!(current.businessKey===null||typeof current.businessKey==='string')||typeof current.updatedAt!=='string'||!current.updatedAt||!Number.isFinite(Date.parse(current.updatedAt)))throw new Error('目录当前标识身份或版本无效')
  if(typeof current.businessKey==='string'&&businessKey(current.businessKey)!==current.businessKey)throw new Error('目录业务标识不规范')
  seen.add(current.deviceId);result[current.deviceId]=current.businessKey
 }
 return result
}
