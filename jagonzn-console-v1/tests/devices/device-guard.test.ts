import {describe,it,expect,vi} from 'vitest'
import {ref} from 'vue'
import {useDeviceGuard} from '../../src/features/devices/use-device-guard'
import {changeIdentity,IdentityChanged} from '../../src/core/http'
vi.mock('../../src/core/session',()=>({projectId:ref('project')}))
describe('设备写回执范围',()=>{
 it('同项目切换设备使旧回执失效',()=>{let device='a';const capture=useDeviceGuard(()=>device),check=capture();check();device='b';expect(check).toThrow(IdentityChanged)})
 it('身份变化使旧回执失效',()=>{const check=useDeviceGuard(()=>'a')();changeIdentity();expect(check).toThrow(IdentityChanged)})
})

it('组件作用域卸载后即使deviceId未变也拒绝旧回执',async()=>{const {effectScope}=await import('vue');const scope=effectScope();let check=()=>{};scope.run(()=>{check=useDeviceGuard(()=>'a')()});check();scope.stop();expect(check).toThrow(IdentityChanged)})
