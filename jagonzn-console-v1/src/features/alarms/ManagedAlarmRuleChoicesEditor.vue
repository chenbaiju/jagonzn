<script setup lang="ts">
import {onScopeDispose} from 'vue'
import ManagedAlarmRuleEditor from './ManagedAlarmRuleEditor.vue'
import {createAlarmRuleChoiceReader} from './alarm-rule-choice-reader'
import {readAlarmRuleSourceChoices} from './alarm-rule-source-choices-api'
import type {AlarmRuleConfiguration} from './alarm-rule-management-api'
defineProps<{ruleId?:string;deviceTypeId?:string;initialSource?:AlarmRuleConfiguration['source'];initialPropertyKey?:string}>()
const emit=defineEmits<{close:[];saved:[id:string];verified:[id:string,source:AlarmRuleConfiguration['source']];removed:[id:string];state:[value:{busy:boolean;review:boolean}]}>()
const reader=createAlarmRuleChoiceReader(readAlarmRuleSourceChoices)
onScopeDispose(reader.dispose)
function verified(id:string,source:AlarmRuleConfiguration['source']){emit('verified',id,source)}
</script>
<template><ManagedAlarmRuleEditor :rule-id="ruleId" :device-type-id="deviceTypeId" :initial-source="initialSource" :initial-property-key="initialPropertyKey" :load-choices="reader.load" :move-choice-page="reader.move" @close="emit('close')" @saved="emit('saved',$event)" @verified="verified" @state="emit('state',$event)" @removed="emit('removed',$event)" /></template>
