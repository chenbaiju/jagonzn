import {hasTaskModbusCommon,taskModbusCommonInput} from './task-modbus-common'
import {taskPropertyFunctionValue} from './task-property-function'

export const defaultTaskDataFunctionSource=`module.exports = function () {
    /**
     * data: 构造下发的自定义数据对象，作为函数返回值，下发到硬件。
     */
    var data = {
        type: "hex",
        msg: "010300ff8312"
    }

    return data;
}`

export function isTaskData(kind:unknown){return kind==='DATA_DOWNLINK'||kind==='DATA_DOWNLINK_FUNCTION'}

/** DATA函数的协议和流来自明确配置；不从函数输出猜目的或改变原源码。 */
export function taskDataFunctionValue(value:unknown){
 if(hasTaskModbusCommon(value))return taskModbusCommonInput(value)
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('自定义数据云函数配置不完整。')
 const fields=value as Record<string,unknown>
 if(Object.keys(fields).sort().join(',')!=='format,protocol,source,streamIdentifier')throw new Error('自定义数据云函数配置字段不完整或未知。')
 const {protocol,streamIdentifier}=fields
 if(protocol!=='MQTT'&&protocol!=='TCP')throw new Error('请选择有效的推送方式。')
 if(typeof streamIdentifier!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(streamIdentifier))throw new Error('自定义数据流标识符须为1至64位字母、数字、下划线或短横线。')
 return {protocol,streamIdentifier,...taskPropertyFunctionValue({format:fields.format,source:fields.source})}
}
