<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {InfoFilled,Plus} from '@element-plus/icons-vue'
import {useRouter} from 'vue-router'
import {session,projectId,currentProject} from '@/core/session'
import {onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {readDeviceTypeDirectory,deviceKindLabel,type DeviceTypeDirectoryItem,type DeviceTypeDirectoryTransport} from './api'

const networkBadges = {
 WIFI: { label: 'WiFi', glyph: '\u{F05A9}' },
 ETHERNET: { label: '以太网', glyph: '\u{F0200}' },
 CELLULAR_2G: { label: '2G', glyph: '\u{F04A2}' },
 CELLULAR_3G: { label: '3G', glyph: '\u{F04A2}' },
 CELLULAR_4G: { label: '4G', glyph: '\u{F04A2}' },
 CELLULAR_5G: { label: '5G', glyph: '\u{F04A2}' },
 NB_IOT: { label: 'NB-IoT', glyph: '\u{F043B}' },
 RS485: { label: 'RS485', glyph: '\u{F065C}' },
 RS232: { label: 'RS232', glyph: '\u{F065C}' },
 RS422: { label: 'RS422', glyph: '\u{F065C}' },
 LORA: { label: 'LoRa', glyph: '\u{F043B}' },
 ZIGBEE: { label: 'Zigbee', glyph: '\u{F0D41}' },
 BLE: { label: '蓝牙/BLE', glyph: '\u{F00AF}' },
 OTHER: { label: '其它', glyph: '\u{F1616}' },
} satisfies Record<NonNullable<DeviceTypeDirectoryItem['networkType']>, { label: string; glyph: string }>
const productIdentifierLabel = '已启用产品识别码'
const productLibraryLabel = '已发布到产品库'

const props=withDefaults(defineProps<{transport?:DeviceTypeDirectoryTransport}>(),{transport:readDeviceTypeDirectory})
const roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&!!projectId.value&&!!currentProject.value&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const canCreate=computed(()=>readable.value&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const router=useRouter(),page=ref(1),limit=ref(24),pageError=ref('')
const emptyImage=`${import.meta.env.BASE_URL}reference/empty-content.png`
const resource=useResource(signal=>props.transport(projectId.value,{page:page.value,limit:limit.value},signal))
const cards = computed(() => resource.data.value?.items.map(item => ({
 item,
 badge: item.networkType && Object.hasOwn(networkBadges, item.networkType) ? networkBadges[item.networkType] : undefined,
})))
let active=true
function reload(){if(!readable.value||resource.loading.value)return;pageError.value='';resource.clear();void resource.reload()}
function changePage(value:number){if(!readable.value||resource.loading.value||value===page.value)return;if(!Number.isInteger(value)||value<1||value>10000){pageError.value='页码超出当前目录读取范围';return}page.value=value;reload()}
function changeLimit(value:number){if(!readable.value||resource.loading.value||![24,48,72,96].includes(value))return;limit.value=value;page.value=1;reload()}
function create(){if(canCreate.value)void router.push('/device-types/create')}
function guardLink(event:MouseEvent,id:string){if(!readable.value||resource.loading.value||!resource.data.value?.items.some(item=>item.id===id)){event.preventDefault();event.stopPropagation()}}
function scopeChanged(){page.value=1;pageError.value='';resource.clear();if(readable.value)void resource.reload()}
watch(()=>[projectId.value,session.user?.accountId,readable.value,props.transport],scopeChanged,{immediate:true,flush:'sync'})
const dispose=onIdentityChange(()=>{resource.clear();page.value=1;pageError.value='';queueMicrotask(()=>{if(active&&readable.value&&!resource.loading.value)void resource.reload()})})
onScopeDispose(()=>{active=false;dispose()})
</script>
<template>
 <main class="tl-page type-directory">
  <PageHeader title="设备类型" :count="readable?resource.data.value?.total:undefined"><el-button v-if="canCreate" size="small" type="primary" :icon="Plus" @click="create">创建设备类型</el-button></PageHeader>
  <div v-if="readable" class="tl-learning-resource"><el-icon aria-hidden="true"><InfoFilled/></el-icon><span>学习资源：<a href="https://www.thingscloud.xyz/docs/guide/device-type/overview.html" target="_blank" rel="noopener noreferrer">什么是设备类型？ ↗</a></span></div>
  <el-alert v-if="pageError" :title="pageError" type="warning" :closable="false"/>
  <AsyncState :forbidden="!readable" :loading="resource.loading.value" :error="resource.error.value" @retry="reload">
   <template v-if="resource.data.value">
    <div v-if="cards?.length" class="type-grid">
     <article v-for="{ item, badge } in cards" :key="item.id" class="type-card">
      <router-link :to="`/device-types/${item.id}`" @click.capture="guardLink($event,item.id)">
       <div class="type-card-icons">
        <ReferenceIcon class="type-icon" glyph="󰆧"/>
        <span v-if="badge" class="type-network-badge">
         <ReferenceIcon :glyph="badge.glyph"/><span class="type-network-label">{{ badge.label }}</span>
        </span>
       </div>
       <div v-if="item.enabledProductIdentifier || item.publishedToProductLibrary === true" class="type-product-status">
        <el-tooltip v-if="item.enabledProductIdentifier" effect="dark" placement="top-start" :trigger="['hover', 'focus']">
         <template #content>{{ productIdentifierLabel }}<br/>{{ item.enabledProductIdentifier }}</template>
         <span class="type-product-status-icon" role="img" :aria-label="productIdentifierLabel" tabindex="0">
          <ReferenceIcon glyph="󱉲"/>
         </span>
        </el-tooltip>
        <el-tooltip v-if="item.publishedToProductLibrary === true" effect="dark" placement="top-start" :trigger="['hover', 'focus']" :content="productLibraryLabel">
         <span class="type-product-status-icon" role="img" :aria-label="productLibraryLabel" tabindex="0">
          <ReferenceIcon glyph="󰚧"/>
         </span>
        </el-tooltip>
       </div>
       <h2 :title="item.name">{{item.name}}</h2>
       <footer><span class="type-device-count">{{item.deviceCount}} 设备</span><span>{{deviceKindLabel[item.deviceKind]}}</span></footer>
      </router-link>
     </article>
    </div>
    <div v-else class="type-empty"><img :src="emptyImage" alt=""/><h2>{{page>1?'当前页暂无设备类型':'定义设备功能和 App 界面'}}</h2><p v-if="page===1">通过编辑物模型，云平台可以快速识别设备属性和功能，并提供开箱即用的低代码设备 App 界面搭建框架，帮您快速生成应用。</p><el-button v-if="canCreate&&page===1" type="primary" @click="create">创建设备类型</el-button></div>
    <CursorPager v-if="page>1||Number(resource.data.value.total||0)>limit" :page="page" :total="resource.data.value.total" :limit="limit" :loading="resource.loading.value" :sizes="[24,48,72,96]" @update:page="changePage" @update:limit="changeLimit"/>
   </template>
  </AsyncState>
 </main>
</template>
<style scoped>
.type-card { transition: box-shadow 0.3s; }
.type-card:hover, .type-card:focus-within { box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1); }
.type-card > a:hover h2 { color: var(--tl-primary); }
@media (prefers-reduced-motion: reduce) { .type-card { transition: none; } }
.type-product-status {
 position: absolute;
 top: 20px;
 right: 20px;
 display: flex;
 gap: 8px;
 color: #999;
}
.type-product-status-icon { display: inline-flex; align-items: center; height: 22px; }
.type-card-icons { position: relative; display: flex; width: 100%; }
.type-network-badge {
 position: absolute;
 right: -4px;
 bottom: 8px;
 display: inline-flex;
 align-items: center;
 gap: 4px;
 max-width: calc(100% - 68px);
 padding: 2px 7px;
 border-radius: 4px;
 background: #eef6fe;
 color: #347fc4;
 font-size: 12px;
 font-weight: 500;
 line-height: 20px;
}
.type-network-badge .reference-icon { font-size: 13px; }
.type-network-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.type-directory{padding:20px 30px 50px}.type-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.type-card{position:relative;min-width:0;height:165px;border:1px solid var(--tl-border);border-radius:4px;background:var(--tl-surface,#fff)}.type-card>a{display:flex;flex-direction:column;align-items:flex-start;height:100%;box-sizing:border-box;padding:20px 20px 15px;color:var(--tl-title);text-decoration:none}.type-icon{flex:none;width:64px;height:80px;font-size:64px;color:#999}.type-card h2{width:100%;height:22px;font-size:16px;font-weight:600;line-height:22px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.type-card footer{position:absolute;left:20px;right:20px;bottom:15px;display:flex;justify-content:space-between;align-items:center;gap:12px;color:#888;font-size:13px;font-weight:400;line-height:22px}.type-empty{text-align:center;padding:54px 16px 40px}.type-empty img{width:180px;max-width:100%;margin-bottom:20px}.type-empty h2{font-size:22px;font-weight:400;line-height:32px}.type-empty p{max-width:680px;margin:14px auto 22px;color:var(--tl-muted);font-size:14px;line-height:24px}@media(min-width:768px){.type-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:992px){.type-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(min-width:1920px){.type-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}@media(max-width:640px){.type-directory{padding:20px 15px}}
</style>
