<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {can,projectId} from '@/core/session'
import {ApiError,identityEpoch} from '@/core/http'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import AsyncState from '@/ui/AsyncState.vue'
import SceneUsageChart from './SceneUsageChart.vue'
import {readSceneStatistics,downloadSceneStatistics,type SceneUsageDays} from './scene-statistics-api'
const props=defineProps<{id:string;name?:string}>()
const emit=defineEmits<{denied:[cause:ApiError]}>()
const days=ref<SceneUsageDays>(1),allowed=computed(()=>can('rule:manage'))
const windows=[{value:1,label:'24小时'},{value:3,label:'3天'},{value:7,label:'7天'},{value:15,label:'15天'},{value:30,label:'30天'}] as const
const resource=useResource(async signal=>{const project=projectId.value,id=props.id,window=days.value,epoch=identityEpoch();try{return await readSceneStatistics(project,id,window,signal)}catch(cause){if(!signal.aborted&&epoch===identityEpoch()&&project===projectId.value&&id===props.id&&window===days.value&&allowed.value&&cause instanceof ApiError&&[401,403,404].includes(cause.status))emit('denied',cause);throw cause}})
watch([projectId,()=>props.id,days,allowed],()=>{resource.clear();if(projectId.value&&props.id&&allowed.value)void resource.reload()},{immediate:true})
function download(kind:'run'|'action'){if(resource.data.value&&!resource.loading.value&&allowed.value)downloadSceneStatistics(resource.data.value,kind,props.name??'')}
</script>
<template><AsyncState :forbidden="!allowed" :loading="resource.loading.value&&!resource.data.value" :error="resource.error.value" @retry="resource.reload"><section v-if="resource.data.value" class="scene-statistics">
 <h2>总体统计</h2><table class="scene-stat-summary"><tbody><tr><th scope="row">运行次数</th><td>{{resource.data.value.totalRunCount}}</td></tr><tr><th scope="row">最后运行时间</th><td>{{formatTime(resource.data.value.lastRunAt)}}</td></tr></tbody></table>
 <header class="scene-stat-heading"><h2>统计趋势</h2><div class="scene-stat-controls"><el-radio-group v-model="days" size="small" aria-label="场景统计窗口"><el-radio-button v-for="window in windows" :key="window.value" :value="window.value">{{window.label}}</el-radio-button></el-radio-group><el-button size="small" plain :loading="resource.loading.value" :disabled="resource.loading.value" @click="resource.reload">刷新</el-button></div></header>
 <SceneUsageChart title="执行统计" :times="resource.data.value.bucketStarts" :series="resource.data.value.run" :loading="resource.loading.value" @refresh="resource.reload" @export="download('run')"/>
 <SceneUsageChart title="动作调用统计" :times="resource.data.value.bucketStarts" :series="resource.data.value.action" :loading="resource.loading.value" @refresh="resource.reload" @export="download('action')"/>
 <p class="scene-stat-coverage">{{resource.data.value.notes.join(' ')}}</p>
</section></AsyncState></template>
<style scoped>
.scene-statistics h2{font-size:22px;font-weight:400;line-height:32px;color:#002822;margin:0}.scene-stat-summary{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px;line-height:20px}.scene-stat-summary th,.scene-stat-summary td{padding:8px 10px;border-bottom:1px solid #ebeef5;text-align:left;font-weight:400}.scene-stat-summary th{width:160px;color:#909399}.scene-stat-summary td{color:#606266}.scene-stat-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-top:40px}.scene-stat-controls{display:flex;align-items:center;gap:10px}.scene-stat-controls :deep(.el-radio-button__inner){padding:9px 15px;font-size:12px;line-height:12px}.scene-stat-controls :deep(.el-button){height:32px;padding:9px 15px;font-size:12px;border-radius:3px}.scene-stat-coverage{font-size:12px;font-weight:400;color:#909399;line-height:20px;margin:16px 0 0}
</style>
