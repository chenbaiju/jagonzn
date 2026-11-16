import {validUnicode} from './preprocess-exact-json'

export const defaultTaskPropertyFunctionSource=`module.exports = function () {
    /**
     * push_attributes: 构造下发的属性对象，作为函数返回值，下发到硬件。
     */
    var push_attributes = {};
    return push_attributes;
}`

export const defaultTaskCloudFunctionSource=defaultTaskPropertyFunctionSource.replaceAll('push_attributes','update_attributes').replace('构造下发的属性对象，作为函数返回值，下发到硬件。','构造云端更新的属性对象，作为函数返回值。')

export const defaultTaskCommandFunctionSource=`module.exports = function () {
    /**
     * command:      构造下发的命令对象，作为函数返回值，下发到硬件。
     */
    var command = {
        method: "command_name",
        params: {
        },
        id: 1000
    }

    return command;
}`

/** 两类属性函数共用原文验证，实际效果按原机器类型单独准入。 */
export function isTaskPropertyFunction(kind:unknown){return kind==='PROPERTY_SET_FUNCTION'||kind==='CLOUD_UPDATE_FUNCTION'}

/** 共享源码编辑器不合并不同执行目的的输入和预览端口。 */
export function isTaskFunction(kind:unknown){return isTaskPropertyFunction(kind)||kind==='DATA_DOWNLINK_FUNCTION'||kind==='COMMAND_FUNCTION'}

/** 函数输入与固定属性对象闭集分离；只验证，不整理或重写用户源码。 */
export function taskPropertyFunctionValue(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('属性云函数配置不完整。')
 const fields=value as Record<string,unknown>
 if(Object.keys(fields).sort().join(',')!=='format,source'||fields.format!=='COMMON_JS'||typeof fields.source!=='string')throw new Error('属性云函数必须是 COMMON_JS 与完整源码。')
 const source=fields.source
 if(!source.trim()||!validUnicode(source)||source.includes('\u0000')||new TextEncoder().encode(source).length>65536)throw new Error('属性云函数源码不能为空，须为有效文本且不超过65536个UTF8字节。')
 return {format:'COMMON_JS' as const,source}
}
