<script setup lang="ts">
import {computed} from 'vue'
import {functionMdiPath} from './function-style-icons'
const props=defineProps<{iconId?:string|null;color?:string|null}>()
const path=computed(()=>functionMdiPath(props.iconId))
</script>
<template><svg v-if="path" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" role="img" aria-label="功能图标" :style="{color:color||undefined}" class="function-mdi-icon"><path :d="path"/></svg></template>
<style scoped>.function-mdi-icon{display:inline-block;vertical-align:-.125em;flex-shrink:0}</style>
