<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import RestrictedState from '@/components/common/RestrictedState.vue'

const route = useRoute()
const router = useRouter()

// The route guard passes the right it checked.
const right = computed(() => String(route.query.right ?? ''))
</script>

<template>
  <div class="forbidden-view">
    <RestrictedState :right="right" title="Access denied">
      <template #actions>
        <Button label="Go back" icon="pi pi-arrow-left" text @click="router.back()" />
      </template>
    </RestrictedState>
  </div>
</template>

<style scoped>
.forbidden-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}
</style>
