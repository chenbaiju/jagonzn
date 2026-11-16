<script setup lang="ts">
import {computed} from 'vue'
import type {SubdeviceModbusRtuParser} from './subdevice-modbus-rtu-parser-api'
import {modbusRtuFunctionLabel,isModbusRtuCoil,modbusRtuFieldLabel,type ModbusRtuParser} from './modbus-rtu-parser-api'
const props=defineProps<{value:ModbusRtuParser|SubdeviceModbusRtuParser}>()
const coilMode=computed(()=>isModbusRtuCoil(props.value.functionCode))
</script>
<template><section class="modbus-summary"><h3>Modbus RTU解析</h3><dl><dt>从机地址（保存配置）</dt><dd>{{value.slaveAddress}}</dd><dt>使用子设备地址</dt><dd>{{value.useSubdeviceAddress?'是，执行时读取有效绑定地址':'否，按保存的从机地址'}}</dd><dt>功能码</dt><dd>{{String(value.functionCode).padStart(2,'0')}} {{modbusRtuFunctionLabel(value.functionCode)}}</dd><dt>数据字节数</dt><dd>{{value.dataBytes}}</dd><dt>数据校验</dt><dd>{{value.crc==='NONE'?'不验证':'CRC-16/Modbus'}}</dd></dl><p v-if="coilMode">按线圈地址从0起、低位优先解析为布尔值。</p><el-table :data="[...value.fields]"><el-table-column prop="offset" :label="coilMode?'线圈地址':'起始数据字节位'" min-width="150"/><el-table-column v-if="!coilMode" label="数据类型" min-width="150"><template #default="{row}">{{modbusRtuFieldLabel(row.dataType)}}</template></el-table-column><el-table-column prop="propertyKey" label="生成属性" min-width="130"/><el-table-column v-if="!coilMode" prop="coefficient" label="系数" min-width="120"/></el-table></section></template>
<style scoped>.modbus-summary{min-width:0}.modbus-summary h3{font-size:16px;font-weight:500}.modbus-summary dl{display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;font-size:13px}.modbus-summary dd{margin:0;overflow-wrap:anywhere}.modbus-summary :deep(.cell){overflow-wrap:anywhere}</style>
