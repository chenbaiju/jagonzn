<script setup lang="ts">
import type { AlarmEventEvaluationDisplay } from './alarm-event-evaluation-display'
import { formatTime } from '../../core/time'
defineProps<{ display: AlarmEventEvaluationDisplay }>()
</script>
<template>
 <div class="alarm-event-evaluation">
  <dl class="event-properties">
   <div v-for="property in display.properties" :key="property.key" class="event-property">
    <dt>{{ property.key }}</dt><dd>{{ property.value }}</dd>
    <div v-if="property.acceptedAt" class="property-time" :title="property.acceptedAt">
     {{ property.timeBasis==='PLATFORM_ACCEPTED'?'平台属性接纳时间':'告警平台接纳时间' }}：{{ formatTime(property.acceptedAt) }}
    </div>
    <div v-else-if="property.known" class="property-time">平台接纳时间未知</div>
   </div>
  </dl>
  <div class="evaluation-time" :title="display.checkedAt">检查时间：{{ formatTime(display.checkedAt) }}</div>
  <el-collapse class="evaluation-raw"><el-collapse-item title="原始告警数据" name="raw">
   <pre>{{ display.raw }}</pre>
  </el-collapse-item></el-collapse>
 </div>
</template>
<style scoped>
.event-properties{margin:0}.event-property{display:flex;align-items:baseline;gap:4px 10px;flex-wrap:wrap;margin:0 0 10px}.event-property dt{font-weight:600;overflow-wrap:anywhere}.event-property dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%}.property-time{width:100%;font-size:12px;color:#909399;overflow-wrap:anywhere}.evaluation-time{font-size:12px;color:#909399}.evaluation-raw{margin-top:10px}.evaluation-raw pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font:12px/1.6 monospace;max-height:320px;overflow:auto}
</style>
