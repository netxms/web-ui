<script setup>
import { computed, ref } from 'vue'
import AppLink from '@/components/common/AppLink.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import { getLogCatalogEntry, groupLogsByFamily } from '@/config/logCatalog'
import { logTarget } from '@/utils/routeTargets'
import { useWorkingState } from '@/composables/useWorkingState'

const props = defineProps({
  logs: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: [Object, Error], default: null },
})

defineEmits(['retry'])

const filter = ref({ text: '', tokens: [] })

useWorkingState('catalog', { view: { filter } })

const matching = computed(() => {
  const search = filter.value.text.trim().toLowerCase()
  if (!search) return props.logs
  return props.logs.filter((log) => {
    const entry = getLogCatalogEntry(log.name)
    return (
      entry.label.toLowerCase().includes(search) ||
      log.name.toLowerCase().includes(search) ||
      (log.description ?? '').toLowerCase().includes(search)
    )
  })
})

const families = computed(() => groupLogsByFamily(matching.value))
</script>

<template>
  <div class="log-catalog">
    <header class="catalog-header">
      <div class="catalog-heading">
        <h1 class="catalog-title">Logs</h1>
        <p class="catalog-subtitle">
          Query any server log. Pick one to open the explorer, or search across all of them.
        </p>
      </div>
      <SmartFilterInput v-model="filter" placeholder="Search logs..." class="catalog-search" />
    </header>

    <QueryErrorState v-if="error" :error="error" @retry="$emit('retry')" />

    <div v-else-if="loading" class="catalog-grid">
      <div v-for="n in 8" :key="n" class="log-card log-card--skeleton" />
    </div>

    <EmptyState
      v-else-if="families.length === 0"
      icon="pi pi-search"
      :title="filter.text ? 'No logs match your search' : 'No logs available'"
      :message="
        filter.text
          ? 'Try a different term, or clear the search to see every log.'
          : 'Your account has no access to any server log. Ask an administrator for the relevant view rights.'
      "
    />

    <template v-else>
      <section v-for="family in families" :key="family.id" class="catalog-family">
        <h2 class="family-title">{{ family.label }}</h2>
        <div class="catalog-grid">
          <AppLink
            v-for="log in family.logs"
            :key="log.name"
            :to="logTarget(log.name)"
            class="log-card"
          >
            <div class="log-card-head">
              <i :class="[getLogCatalogEntry(log.name).icon, 'log-card-icon']" />
              <span class="log-card-title">{{ getLogCatalogEntry(log.name).label }}</span>
            </div>
            <p class="log-card-description">{{ log.description || 'No description available.' }}</p>
          </AppLink>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.log-catalog {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding-bottom: 1.5rem;
}

.catalog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.catalog-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.catalog-subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.catalog-search {
  width: 20rem;
  max-width: 100%;
}

.catalog-family {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.family-title {
  margin: 0;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.catalog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  gap: 0.75rem;
}

.log-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  background: var(--p-surface-card);
  color: inherit;
  text-decoration: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
}

.log-card:hover {
  border-color: var(--p-primary-color);
  box-shadow: 0 2px 8px rgb(0 0 0 / 8%);
  transform: translateY(-1px);
}

.log-card--skeleton {
  min-height: 7.5rem;
  background: var(--p-surface-ground);
  animation: log-card-pulse 1.4s ease-in-out infinite;
}

@keyframes log-card-pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.85;
  }
}

.log-card-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.log-card-icon {
  color: var(--p-primary-color);
  font-size: 0.9375rem;
}

.log-card-title {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--p-text-color);
}

.log-card-description {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--p-text-muted-color);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
