<script setup lang="ts">
import {ref,shallowRef,watch,onScopeDispose} from 'vue'
import {Refresh} from '@element-plus/icons-vue'
import PageHeader from '../../ui/PageHeader.vue'
import AsyncState from '../../ui/AsyncState.vue'
import CursorPager from '../../ui/CursorPager.vue'
import {api} from '../../core/http'
import {can,projectId} from '../../core/session'
import type {Schema} from '../../core/contracts'

type Application=Schema<'ApplicationCatalogResponse'>
const rows=shallowRef<readonly Application[]>([]),loading=ref(false),failed=ref(false),error=ref(''),page=ref(1),cursors=ref<(string|undefined)[]>([undefined]),nextCursor=ref<string|null>(null)
let generation=0,controller:AbortController|undefined
function readable(){return can('application:read')&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(projectId.value)}
function reset(){generation++;controller?.abort();rows.value=[];loading.value=false;failed.value=false;error.value='';page.value=1;cursors.value=[undefined];nextCursor.value=null}
async function load(){if(!readable()||loading.value)return;const token=++generation,project=projectId.value;loading.value=true;failed.value=false;error.value='';controller=new AbortController();try{const cursor=cursors.value[page.value-1];const value=await api<Schema<'CursorPageApplicationCatalogResponse'>>(`/api/v1/projects/${project}/applications`,{query:{limit:24,...(cursor?{cursor}:{})},signal:controller.signal});if(token!==generation||project!==projectId.value)return;rows.value=value.items??[];nextCursor.value=value.hasMore?value.nextCursor??null:null}catch(cause){if(token===generation){failed.value=true;error.value=cause instanceof Error?cause.message:'应用目录读取失败'}}finally{if(token===generation)loading.value=false}}
function next(){if(!nextCursor.value||loading.value)return;cursors.value[page.value]=nextCursor.value;page.value++;void load()}
function previous(){if(page.value<=1||loading.value)return;page.value--;void load()}
watch([projectId,()=>can('application:read')],()=>{reset();void load()},{immediate:true,flush:'sync'})
onScopeDispose(()=>{generation++;controller?.abort()})
function published(row:Application){return row.currentVersionId?'已发布':'草稿'}
</script>

<template>
 <main class="tl-page project-applications">
  <PageHeader title="项目应用"><el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button></PageHeader>
  <p class="scope-note">当前仅展示项目应用目录与发布状态；模板创建、草稿编辑、版本发布/回退和运行宿主尚未接入。</p>
  <AsyncState :forbidden="!readable()" :loading="loading" :error="failed?error:undefined" @retry="load">
   <el-empty v-if="!rows.length" description="暂无项目应用" />
   <template v-else>
    <el-table :data="rows" class="tl-device-detail-table">
     <el-table-column label="应用名称" min-width="220"><template #default="{row}">{{row.managementName||row.appKey||row.id}}</template></el-table-column>
     <el-table-column prop="appKey" label="App Key" min-width="200"/>
     <el-table-column label="状态" width="100"><template #default="{row}">{{published(row)}}</template></el-table-column>
     <el-table-column prop="publicationRevision" label="发布修订" min-width="120"/>
     <el-table-column label="更新时间" min-width="180"><template #default="{row}">{{row.updatedAt||'—'}}</template></el-table-column>
    </el-table>
    <CursorPager :page="page" :has-next="!!nextCursor" :loading="loading" :show-sizes="false" @previous="previous" @next="next"/>
   </template>
  </AsyncState>
 </main>
</template>

<style scoped>.scope-note{color:var(--tl-muted);font-size:13px;line-height:22px;margin:16px 0 20px}</style>
