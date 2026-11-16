<script setup lang="ts">
defineProps<{glyph:string}>()
</script>
<template><span class="reference-icon" aria-hidden="true">{{glyph}}</span></template>
<style>
@font-face{font-family:ThingsLinkNavigation;src:url('/fonts/materialdesignicons-v7.4.47.woff2') format('woff2');font-weight:400;font-style:normal;font-display:block}
.reference-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;font-family:ThingsLinkNavigation!important;font-weight:400;font-style:normal;font-size:18px;line-height:1;text-rendering:auto;-webkit-font-smoothing:antialiased}
</style>
