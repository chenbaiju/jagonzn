<script setup lang="ts">
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import { useUserStore } from '@/store/modules/user'

  const props = withDefaults(
    defineProps<{
      title: string
      projectStyle?: boolean
      description?: string
      links?: { label: string; path: string; permission?: string }[]
    }>(),
    { description: '', links: () => [] }
  )
  const user = useUserStore()
  const router = useRouter()
  const visibleLinks = computed(() =>
    props.links.filter((link) => !link.permission || user.info.buttons?.includes(link.permission))
  )
</script>

<template>
  <header
    class="console-page-header workspace-header"
    :class="{ 'workspace-header--project': projectStyle }"
  >
    <div>
      <h1 class="console-heading">{{ title }}</h1>
      <p v-if="description" class="console-description">{{ description }}</p>
    </div>
    <div
      v-if="$slots['leading-actions'] || $slots.actions"
      class="console-actions workspace-header__actions"
    >
      <slot name="leading-actions" />
      <slot name="actions" />
    </div>
    <nav
      v-if="visibleLinks.length"
      class="console-actions workspace-header__links"
      :aria-label="`${title}关联入口`"
    >
      <ElButton v-for="link in visibleLinks" :key="link.path" @click="router.push(link.path)">
        {{ link.label }}
      </ElButton>
    </nav>
  </header>
</template>

<style scoped lang="scss">
  .workspace-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px 24px;
    align-items: start;
  }
  .workspace-header__actions {
    grid-row: 1;
    grid-column: 2;
    justify-content: flex-end;
    margin: 0;
  }
  .workspace-header__links {
    grid-column: 1 / -1;
    gap: 24px;
    margin: 0;
  }
  .workspace-header--project {
    padding-bottom: 18px;
    margin-bottom: 14px;
    border-bottom: 1px solid var(--console-line);

    .console-heading {
      margin: 0 0 8px;
      font-size: 20px;
      font-weight: 400;
      line-height: 28px;
    }
    .console-description {
      margin: 0;
      font-size: 14px;
      line-height: 22px;
    }
  }
  @media (width <= 640px) {
    .workspace-header {
      grid-template-columns: minmax(0, 1fr);
    }
    .workspace-header__actions {
      grid-row: auto;
      grid-column: 1;
      justify-content: flex-start;
    }
  }
</style>
