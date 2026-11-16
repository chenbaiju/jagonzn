<script setup lang="ts">
import type {PanelDraft} from './device-type-panel-api'
defineProps<{panel:PanelDraft}>()
</script>

<template>
 <section aria-label="设备面板配置">
  <h4>设备面板草稿：{{panel.components.length}} 个组件</h4>
  <p v-if="!panel.components.length">没有配置组件。</p>
  <ol v-else><li v-for="component in panel.components" :key="component.id">
   <p>{{component.id}} · 图标数值卡 · 上间距 {{component.marginTop}} · 下间距 {{component.marginBottom}}</p>
   <p>卡片背景：{{component.style.backgroundCard?'开启':'关闭'}}；数值颜色：{{component.style.valueColor??'默认'}}；名称颜色：{{component.style.nameColor??'默认'}}；图标前景：{{component.style.iconForegroundColor??'默认'}}；图标背景：{{component.style.iconBackgroundColor??'默认'}}</p>
   <ul><li v-for="item in component.items" :key="item.propertyKey">{{item.displayName}}（{{item.propertyKey}}）；图标 {{item.iconId??'默认'}}；颜色 {{item.iconColor??'默认'}}</li></ul>
  </li></ol>
  <p>按属性标识绑定目标类型的数值属性；不包含 App 实例、运行状态或付款资料。</p>
 </section>
</template>
