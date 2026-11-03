<script setup>
import { computed, ref } from 'vue'
import AppLink from '@/components/common/AppLink.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import { toolTarget } from '@/utils/routeTargets'
import { groupToolsByFamily } from '@/views/tools/toolRegistry'
import { useWorkingState } from '@/composables/useWorkingState'

const props = defineProps({
  tools: { type: Array, default: () => [] },
})

const filter = ref({ text: '', tokens: [] })

useWorkingState('catalog', { view: { filter } })

const matching = computed(() => {
  const search = filter.value.text.trim().toLowerCase()
  if (!search) return props.tools
  return props.tools.filter(
    (tool) =>
      tool.label.toLowerCase().includes(search) || tool.description.toLowerCase().includes(search),
  )
})

const families = computed(() => groupToolsByFamily(matching.value))
</script>

<template>
  <div class="tool-catalog">
    <header class="catalog-header">
      <div class="catalog-heading">
        <h1 class="catalog-title">Tools</h1>
        <p class="catalog-subtitle">
          Searches and explorers that work across the whole infrastructure rather than one object.
        </p>
      </div>
      <SmartFilterInput v-model="filter" placeholder="Search tools..." class="catalog-search" />
    </header>

    <EmptyState
      v-if="matching.length === 0"
      icon="pi pi-search"
      :title="filter.text ? 'No tools match your search' : 'No tools available'"
      :message="
        filter.text
          ? 'Try a different term, or clear the search to see every tool.'
          : 'Your account has no access to any of the tools in this perspective.'
      "
    />

    <template v-else>
      <section v-for="family in families" :key="family.id" class="catalog-family">
        <h2 class="family-title">{{ family.label }}</h2>
        <div class="catalog-grid">
          <AppLink
            v-for="tool in family.tools"
            :key="tool.id"
            :to="toolTarget(tool.id)"
            class="tool-card"
            :class="{ 'tool-card--planned': !tool.component }"
          >
            <div class="tool-card-head">
              <i :class="[tool.icon, 'tool-card-icon']" />
              <span class="tool-card-title">{{ tool.label }}</span>
              <span v-if="!tool.component" class="tool-card-chip">Planned</span>
            </div>
            <p class="tool-card-description">{{ tool.description }}</p>
          </AppLink>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.tool-catalog {
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

.tool-card {
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

.tool-card:hover {
  border-color: var(--p-primary-color);
  box-shadow: 0 2px 8px rgb(0 0 0 / 8%);
  transform: translateY(-1px);
}

.tool-card--planned {
  opacity: 0.6;
}

.tool-card-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tool-card-icon {
  color: var(--p-primary-color);
  font-size: 0.9375rem;
}

.tool-card-title {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--p-text-color);
}

.tool-card-chip {
  margin-left: auto;
  padding: 0.0625rem 0.375rem;
  border-radius: 999px;
  background: var(--p-surface-ground);
  border: 1px solid var(--p-surface-border);
  font-size: 0.6875rem;
  color: var(--p-text-muted-color);
}

.tool-card-description {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--p-text-muted-color);
}
</style>
