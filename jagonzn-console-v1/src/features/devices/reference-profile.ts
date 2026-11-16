import type {Schema} from '@/core/contracts'
export type DeviceProfile=Schema<'DeviceReferenceProfileResponse'>
export type ValidDeviceProfile=Required<DeviceProfile>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const deviceKeyPattern=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
/** 设备唯一标识必须同时是MQTT Topic安全段；空值表示由服务端生成。 */
export function deviceKey(value:string):string|null {
 if(value==='')return null
 if(!deviceKeyPattern.test(value))throw new Error('设备唯一标识需为1至64位字母、数字、下划线或连字符')
 return value
}
/** 当前可空业务标识的有界原文；不裁剪、不转小写，也不生成内部协议键。 */
export function businessKey(value:string):string|null {
 if(value==='')return null
 const points=Array.from(value)
 if(points.length>128||value.startsWith(' ')||value.endsWith(' ')||/[\u0000-\u001f\u007f-\u009f]/.test(value)||points.some(point=>{const code=point.codePointAt(0)!;return code>=0xd800&&code<=0xdfff}))throw new Error('唯一标识最多128个字符，不能含首尾空格或控制字符')
 return value
}
/** 版本保持规范十进制字符串，不经Number丢精度。 */
export function referenceVersion(value:unknown):value is string{return typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n}
/** 精确核对正式生成的资料响应，错误或别设备回执不得写进当前表单。 */
export function assertProfile(value:DeviceProfile|undefined,expectedDevice?:string):asserts value is ValidDeviceProfile {
 if(!value||!value.deviceId||!uuid.test(value.deviceId)||(expectedDevice!==undefined&&value.deviceId!==expectedDevice)||typeof value.name!=='string'||!value.name.trim()
  ||typeof value.deviceKey!=='string'||!deviceKeyPattern.test(value.deviceKey)
  ||!(value.description===null||typeof value.description==='string')||!(value.businessKey===null||typeof value.businessKey==='string')
  ||!(value.deviceTypeId===null||typeof value.deviceTypeId==='string'&&uuid.test(value.deviceTypeId))
  ||!referenceVersion(value.referenceVersion)||!value.profileToken||!/^([0-9a-f]{64})$/.test(value.profileToken))throw new Error('设备资料回执不完整或身份不匹配')
 if(typeof value.businessKey==='string'&&businessKey(value.businessKey)!==value.businessKey)throw new Error('设备资料标识不规范')
}
/** 写后按同一资料GET核对；不以另一份旧设备响应拼接确认。 */
export function sameProfile(first:DeviceProfile,second:DeviceProfile){
 assertProfile(first);assertProfile(second,first.deviceId)
 return (['deviceId','name','deviceKey','description','deviceTypeId','businessKey','referenceVersion','profileToken'] as const).every(key=>first[key]===second[key])
}
/** 前提只采用打开弹窗时GET的服务端值；名称、业务标识、描述一次提交。 */
export function changeProfileBody(form:{name:string;businessKey:string;description:string},source:DeviceProfile):Schema<'ChangeDeviceReferenceProfileRequest'> {
 assertProfile(source)
 if(!form.name.trim()||form.name.trim().length>128||form.description.length>500)throw new Error('请填写名称并检查描述长度')
 return {name:form.name.trim(),businessKey:businessKey(form.businessKey),description:form.description.trim()||null,expectedProfileToken:source.profileToken,expectedReferenceVersion:source.referenceVersion}
}
