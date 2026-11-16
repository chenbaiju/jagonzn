<script setup lang="ts">
import {panelThermometerPath} from '@/assets/icons/device-type-panel-mdi'
import type {PanelComponent} from './device-type-panel-api'
defineProps<{component:PanelComponent}>()
</script>
<template><section class="number-card" :class="{'with-background':component.style.backgroundCard}" :style="{marginTop:component.marginTop+'px',marginBottom:component.marginBottom+'px'}" :data-panel-component="component.id">
 <p v-if="!component.items.length" class="empty-card">选择数值属性后在此预览</p>
 <article v-for="item in component.items" :key="item.propertyId" class="number-item" :data-panel-property="item.propertyId">
  <span v-if="item.iconId==='mdi-thermometer'" class="number-icon" :style="{color:item.iconColor||component.style.iconForegroundColor||undefined,backgroundColor:component.style.iconBackgroundColor||undefined}"><svg viewBox="0 0 24 24" role="img" aria-label="温度计"><path :d="panelThermometerPath"/></svg></span>
  <div><strong class="number-value" :style="{color:component.style.valueColor||undefined}">-</strong><p class="number-name" :style="{color:component.style.nameColor||undefined}">{{item.displayName}}</p></div>
 </article>
</section></template>
<style scoped>.number-card{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:14px 10px}.with-background{background:white;border-radius:8px;box-shadow:0 2px 8px #182a3a0a}.number-item{display:flex;gap:8px;align-items:center;min-width:0}.number-icon{width:32px;height:32px;border-radius:50%;background:#eef5fe;color:var(--tl-primary);display:grid;place-items:center;flex:none}.number-icon svg{width:20px;height:20px;fill:currentColor}.number-value{color:var(--tl-text);font-size:20px;line-height:26px;font-weight:500}.number-name{margin:2px 0 0;color:var(--tl-muted);font-size:11px;line-height:16px;overflow-wrap:anywhere}.empty-card{grid-column:1/-1;color:var(--tl-muted);font-size:12px;text-align:center;padding:20px 0}</style>
