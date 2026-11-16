<script setup lang="ts">
import {computed} from 'vue'
import {Refresh} from '@element-plus/icons-vue'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
/** 当前受权页的纯展示投影；不定义网络DTO，不从当前设备猜目录。 */
export type RuleRelatedDeviceDisplayRow={key:string;label:string;href?:string;allowed:boolean;canChange:boolean}
const props=withDefaults(defineProps<{
 rows:readonly RuleRelatedDeviceDisplayRow[];forbidden?:boolean;loading?:boolean;error?:unknown;
 busy?:boolean;locked?:boolean;readOnly?:boolean;writeError?:string;notice?:string;page?:number;hasNext?:boolean;limit?:number
}>(),{page:1,limit:24})
const emit=defineEmits<{change:[key:string,allowed:boolean];refresh:[];reread:[];next:[];previous:[];resize:[limit:number]}>()
const unavailable=computed(()=>props.forbidden||props.loading||props.busy||props.locked||!!props.error)
function change(row:RuleRelatedDeviceDisplayRow,value:boolean){if(!unavailable.value&&!props.readOnly&&row.canChange&&value!==row.allowed)emit('change',row.key,value)}
</script>
<template><section class="rule-related-devices">
 <h3>相关设备</h3>
 <p class="rule-related-help">规则可关联多个设备，可以对其中的设备单独设置允许使用或禁用规则。</p>
 <div class="rule-related-toolbar"><el-button size="small" :icon="Refresh" :disabled="forbidden||loading||busy" @click="locked?emit('reread'):emit('refresh')">{{locked?'重新读取核对':'刷新'}}</el-button></div>
 <el-alert v-if="writeError" :title="writeError" type="error" :closable="false"/>
 <p v-if="notice" role="status">{{notice}}</p>
 <p v-if="readOnly" role="status">当前项目只读，无法修改设备许可。</p>
 <AsyncState :forbidden="forbidden" :loading="loading" :error="error" @retry="locked?emit('reread'):emit('refresh')">
  <el-table :data="rows" class="rule-related-table">
   <el-table-column label="设备名称" min-width="120"><template #default="{row}"><router-link v-if="row.href&&!busy&&!locked" :to="row.href">{{row.label}}</router-link><span v-else>{{row.label}}</span></template></el-table-column>
   <el-table-column label="允许使用规则" width="150" align="center"><template #default="{row}"><el-switch :model-value="row.allowed" :disabled="unavailable||readOnly||!row.canChange" :aria-label="`允许 ${row.label} 使用规则`" @change="(value:string|number|boolean)=>change(row,value===true)"/></template></el-table-column>
   <template #empty>暂无数据</template>
  </el-table>
  <CursorPager v-if="page>1||hasNext||limit!==24" :page="page" :has-next="hasNext" :limit="limit" :sizes="[24,48]" :show-pages="false" :loading="!!unavailable" @next="emit('next')" @previous="emit('previous')" @update:limit="emit('resize',$event)"/>
 </AsyncState>
</section></template>
<style scoped>
.rule-related-devices{min-width:0}.rule-related-devices h3{margin:10px 0 0;font-size:22px;font-weight:400;line-height:32px;color:#002822}.rule-related-help{margin:8px 0 0;color:#888;font-size:15px;line-height:22px}.rule-related-toolbar{display:flex;align-items:center;justify-content:flex-end;margin:10px 0 20px;gap:12px}.rule-related-table a{color:var(--el-color-primary);text-decoration:none;overflow-wrap:anywhere}.rule-related-devices>.el-alert{margin:12px 0}.rule-related-devices>p[role]{font-size:13px}.rule-related-table{max-width:100%}.rule-related-table :deep(.el-switch){height:23px;line-height:23px}
.rule-related-table :deep(th.el-table__cell){color:#303133;font-weight:600}
</style>
