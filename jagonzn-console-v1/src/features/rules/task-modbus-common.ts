import {hasTaskModbusRtuCommon,taskModbusRtuInput,type TaskModbusRtuCommon} from './task-modbus-rtu-common'
import {taskModbusTcpInput,type TaskModbusTcpCommon} from './task-modbus-tcp-common'
export type TaskModbusCommon=TaskModbusRtuCommon|TaskModbusTcpCommon
export const hasTaskModbusCommon=hasTaskModbusRtuCommon
/** 只新增明确TCP臂；旧RTU规范化函数及其JSON/源码不改。 */
export function taskModbusCommonInput(value:unknown){
 if(value&&typeof value==='object'&&!Array.isArray(value)){const common=(value as Record<string,unknown>).common;if(common&&typeof common==='object'&&!Array.isArray(common)&&(common as Record<string,unknown>).kind==='MODBUS_TCP')return taskModbusTcpInput(value)}
 return taskModbusRtuInput(value)
}
