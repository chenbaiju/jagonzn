<script setup lang="ts">
import {computed,watch} from 'vue'
import {ApiError} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import type {OtaFirmware} from './ota-read-api'
import {otaMainAppTransport} from './ota-main-app-api'
const props=withDefaults(defineProps<{firmware:OtaFirmware;transport?:Pick<typeof otaMainAppTransport,'binding'>}>(),{transport:()=>otaMainAppTransport})
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&props.firmware.projectId===projectId.value&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||'')&&can('ota:read'))
const resource=useResource(signal=>props.transport.binding(projectId.value,props.firmware.id,signal))
const forbidden=computed(()=>!readable.value||resource.error.value instanceof ApiError&&[401,403].includes(resource.error.value.status))
function reload(){resource.clear();if(readable.value)void resource.reload()}
watch([()=>projectId.value,()=>props.firmware.id,()=>session.user?.accountId,readable,()=>props.transport],reload,{immediate:true,flush:'sync'})
</script>
<template><section v-if="readable" class="ota-execution-binding"><h3>升级信息</h3><AsyncState :forbidden="forbidden" :loading="resource.loading.value" :error="resource.error.value" @retry="reload"><template v-if="resource.data.value"><dl v-if="resource.data.value.executionBinding"><dt>模块</dt><dd>main（主应用）</dd><dt>版本属性</dt><dd>{{resource.data.value.executionBinding.versionProperty}}</dd></dl><p v-else>历史版本未设置模块和版本属性。</p><p v-if="resource.data.value.executionBinding" class="help">模块和版本属性已固定，不能修改。</p></template></AsyncState></section></template>
<style scoped>.ota-execution-binding{margin:20px 0}.ota-execution-binding h3{font-size:17px;font-weight:500}.ota-execution-binding dl{display:grid;grid-template-columns:100px minmax(0,1fr);gap:12px;font-size:13px}.ota-execution-binding dt,.help{color:var(--tl-muted)}.ota-execution-binding dd{margin:0;overflow-wrap:anywhere}.help{font-size:12px}</style>
