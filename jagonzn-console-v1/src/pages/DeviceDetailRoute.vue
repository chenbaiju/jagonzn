<script setup lang="ts">
import {useRouter} from 'vue-router'
import DeviceDetail from '@/features/devices/DeviceDetail.vue'

const router=useRouter()
function openUser(id:string){void router.push(`/end-users/${encodeURIComponent(id)}`)}
</script>
<template>
 <DeviceDetail
  @create-user="router.push('/end-users/create')"
  @open-user="openUser"
  @open-users="router.push('/end-users')"
  @manage-apps="router.push('/applications')"
 />
</template>
