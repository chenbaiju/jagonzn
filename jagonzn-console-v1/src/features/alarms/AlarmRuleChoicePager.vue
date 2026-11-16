<script setup lang="ts">
defineProps<{name:string;page?:{previous:boolean;next:boolean};disabled?:boolean}>()
const emit=defineEmits<{page:[direction:'previous'|'next']}>()
</script>
<template><div v-if="page&&(page.previous||page.next)" class="choice-pager"><span>可翻页查找更多{{name}}</span><el-button link :disabled="disabled||!page.previous" :aria-label="`${name}上一页`" @click="emit('page','previous')">上一页</el-button><el-button link :disabled="disabled||!page.next" :aria-label="`${name}下一页`" @click="emit('page','next')">下一页</el-button></div></template>
<style scoped>.choice-pager{display:flex;align-items:center;justify-content:flex-end;gap:12px;width:100%;margin-top:5px;font-size:12px;line-height:1.6;color:var(--tl-muted);flex-wrap:wrap}.choice-pager>.el-button{margin:0;font-size:12px}.choice-pager>span{margin-right:auto}</style>
