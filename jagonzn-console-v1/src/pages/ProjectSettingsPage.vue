<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {projectId,session,currentProject} from '@/core/session'
import PageHeader from '@/ui/PageHeader.vue'
import ProjectApplicationConnection from '@/features/projects/ProjectApplicationConnection.vue'
import ProjectMqttViewIdentity from '@/features/projects/ProjectMqttViewIdentity.vue'
const route=useRoute()
const mqttTab=computed(()=>route.query.tab===undefined||route.query.tab==='mqtt_sub')
const viewScopeKey=computed(()=>`${session.user?.accountId||''}:${projectId.value}`)
const scopeKey=computed(()=>`${session.user?.accountId||''}:${projectId.value}:${session.user?.projectRole||''}:${currentProject.value?.status||''}`)
</script>
<template><div class="tl-page project-settings"><PageHeader title="项目设置"/>
 <el-tabs v-if="mqttTab" model-value="mqtt_sub" class="tl-tabs"><el-tab-pane label="MQTT 应用订阅" name="mqtt_sub"><ProjectApplicationConnection :key="scopeKey" presentation="mqtt"/><ProjectMqttViewIdentity :key="viewScopeKey"/></el-tab-pane></el-tabs>
 <p v-else role="status">当前设置标签不可用。<router-link :to="{path:'/project-settings',query:{tab:'mqtt_sub'}}">查看 MQTT 应用订阅</router-link></p>
</div></template>
