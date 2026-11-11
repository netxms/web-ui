<script setup>
import { computed } from 'vue'
import AppLink from '@/components/common/AppLink.vue'
import { useObjects, useObjectTree } from '@/queries/useObjectQueries'
import {
  usePowerDomainConfigs,
  useTaggedDcis,
  useDataCenterValues,
} from '@/queries/useDataCenterQueries'
import { objectMetric, powerPaths, toKilowatts } from '@/utils/dataCenter'
import { useDataCenterTarget } from '@/composables/useDataCenterTarget'

const props = defineProps({
  rackId: { type: Number, required: true },
})

const dataCenterTarget = useDataCenterTarget()

const DEFAULT_SERVICE_ROOT_ID = 2

// The Infrastructure sub-tree, which that perspective has cached already.
const { data: rootObjects } = useObjects()
const serviceRootId = computed(
  () =>
    (rootObjects.value ?? []).find((o) => o.class === 'ServiceRoot')?.id ?? DEFAULT_SERVICE_ROOT_ID,
)
const { data: tree } = useObjectTree(serviceRootId)

const paths = computed(() => powerPaths(tree.value ?? [], props.rackId))
const nearestIds = computed(() => [...new Set(paths.value.map((path) => path[0].id))])
const { configs } = usePowerDomainConfigs(nearestIds)

const rackIds = computed(() => [props.rackId])
const { items } = useTaggedDcis(rackIds, ['env.temp.inlet', 'env.temp.outlet', 'power.feed'])
const { valueOf } = useDataCenterValues(items)

const metric = (base, combine) => objectMetric(items.value, props.rackId, base, valueOf, combine)
const inlet = computed(() => metric('env.temp.inlet', 'max'))
const outlet = computed(() => metric('env.temp.outlet', 'max'))
const feeds = computed(() => {
  const power = metric('power.feed')
  if (!power) return []
  return power.parts
    .map((part) => ({ qualifier: part.qualifier, value: toKilowatts(part.value, power.unit) }))
    .sort((a, b) => a.qualifier.localeCompare(b.qualifier))
})

const visible = computed(() => items.value.length > 0 || paths.value.length > 0)

const fmt = (value) => (value == null ? '—' : value.toFixed(1))
</script>

<template>
  <div v-if="visible" class="rack-dc-strip" aria-label="Environment and power">
    <span v-if="inlet || outlet" class="rack-dc-strip__stat">
      <i class="pi pi-sun" aria-hidden="true" />
      <span class="rack-dc-strip__label">Inlet</span> {{ fmt(inlet?.value) }} °C
      <span class="rack-dc-strip__label">Outlet</span> {{ fmt(outlet?.value) }} °C
    </span>
    <span v-if="feeds.length" class="rack-dc-strip__stat">
      <i class="pi pi-bolt" aria-hidden="true" />
      <template v-for="feed in feeds" :key="feed.qualifier">
        <span class="rack-dc-strip__label">{{
          feed.qualifier ? `Feed ${feed.qualifier}` : 'Feed'
        }}</span>
        {{ fmt(feed.value) }} kW
      </template>
    </span>
    <span v-if="paths.length" class="rack-dc-strip__stat rack-dc-strip__paths">
      <span class="rack-dc-strip__label">Power path</span>
      <span v-for="path in paths" :key="path[0].id" class="rack-dc-strip__path">
        <span v-if="configs.get(path[0].id)?.feedTag" class="rack-dc-strip__feed">
          {{ configs.get(path[0].id).feedTag }}
        </span>
        <template v-for="(domain, i) in path" :key="domain.id">
          <span v-if="i" class="rack-dc-strip__label" aria-hidden="true">›</span>
          <AppLink :to="dataCenterTarget(domain, 'power')">{{ domain.name }}</AppLink>
        </template>
      </span>
    </span>
  </div>
</template>

<style scoped>
.rack-dc-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem 1.25rem;
  padding: 0.375rem 1rem;
  border-bottom: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.rack-dc-strip__stat {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}

.rack-dc-strip__stat > .pi {
  color: var(--p-text-muted-color);
}

.rack-dc-strip__label {
  color: var(--p-text-muted-color);
}

.rack-dc-strip__paths {
  gap: 0.375rem 1rem;
}

.rack-dc-strip__path {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}

.rack-dc-strip__feed {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0 0.3rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-sm);
}
</style>
