export type DeviceTagRow={key:string;value:string}
export const MAX_DEVICE_TAGS=20
const blank=/^[\s\u001c-\u001f]*$/u
const invalidScalar=(value:string)=>Array.from(value).some(point=>{const code=point.codePointAt(0)!;return code>=0xd800&&code<=0xdfff})
/** 与后端DeviceTagRules共用边界：64个Unicode码点；不裁剪或改写标签键。 */
export function tagKeyError(key:string):string|undefined {
 if(!key||blank.test(key)||Array.from(key).length>64||key.startsWith(' ')||key.endsWith(' ')||/[\u0000-\u001f\u007f-\u009f]/.test(key)||invalidScalar(key))return '标签名称为1至64个字符，不能含首尾空格或控制字符'
}
/** 值沿既有128个UTF16单元合同；原文由调用者决定是否裁剪。 */
export function tagValueError(value:string):string|undefined {
 if(!value||value.length>128||blank.test(value)||value.includes('\u0000')||invalidScalar(value))return '标签值为1至128个字符，不能仅为空白'
}
/** 空白占位行仅在两项都为空串时略过；重复键显式拒绝，不先转对象造成覆盖。 */
export function validateTagRows(rows:readonly DeviceTagRow[]):DeviceTagRow[] {
 const values=rows.filter(row=>row.key!==''||row.value!=='')
 if(values.length>MAX_DEVICE_TAGS)throw new Error('最多添加20个标签')
 const keys=new Set<string>()
 for(const row of values){const error=tagKeyError(row.key)||tagValueError(row.value);if(error)throw new Error(error);if(keys.has(row.key))throw new Error('标签名称不能重复');keys.add(row.key)}
 return values.map(row=>({...row}))
}
