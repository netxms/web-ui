<script setup>
import { computed } from 'vue'
import AppLink from '@/components/common/AppLink.vue'
import DemoNoticeBanner from '@/components/common/DemoNoticeBanner.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import InfoHint from '@/components/common/InfoHint.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import LoadBar from '@/components/data-center/LoadBar.vue'
import { isDemoDataCenterId } from '@/api/dataCenterApi'
import {
  useCoolingZoneConfigs,
  useTaggedDcis,
  useDataCenterValues,
} from '@/queries/useDataCenterQueries'
import {
  COOLING_TAGS,
  coolingTemperatures,
  coolingZoneRows,
  objectMetric,
  toKilowatts,
} from '@/utils/dataCenter'
import { useDataCenterTarget } from '@/composables/useDataCenterTarget'

const props = defineProps({
  /** Facility or CoolingZone, as a full sub-tree node */
  object: { type: Object, required: true },
  /** Facility holding `object`, as a full sub-tree node; the outdoor temperature is its */
  facility: { type: Object, default: null },
})

const dataCenterTarget = useDataCenterTarget()

const OUTDOOR_INFO = 'env.temp.outdoor and env.humidity.outdoor of the facility.'
const READING_INFO =
  "Load is cooling.load against the zone's rated capacity; draws is its cooling.power. Temperatures are the coolant's (cooling.temp.supply and .return) where a zone has them, otherwise the air's (env.temp.supply and .return). Bars run to 125 % of the capacity."

const isDemo = computed(() => isDemoDataCenterId(props.object.id))
const rows = computed(() => coolingZoneRows(props.object))
const ids = computed(() => rows.value.map((row) => row.node.id))
const facilityId = computed(
  () => props.facility?.id ?? (props.object.class === 'Facility' ? props.object.id : null),
)

const OUTDOOR_TAGS = ['env.temp.outdoor', 'env.humidity.outdoor']
const dciObjectIds = computed(() =>
  facilityId.value ? [facilityId.value, ...ids.value] : ids.value,
)
const { configs, isLoading: loadingConfigs } = useCoolingZoneConfigs(ids)
const {
  items,
  isLoading: loadingDcis,
  isError: dciError,
} = useTaggedDcis(dciObjectIds, [...COOLING_TAGS, ...OUTDOOR_TAGS])
const { valueOf, isLoading: loadingValues } = useDataCenterValues(items)
/** Until the DCI lists and their values are in, an absent metric is not yet a missing one. */
const loading = computed(() => loadingConfigs.value || loadingDcis.value || loadingValues.value)

const outdoor = computed(() => {
  if (!facilityId.value) return null
  const temp = objectMetric(items.value, facilityId.value, 'env.temp.outdoor', valueOf, 'max')
  const humidity = objectMetric(
    items.value,
    facilityId.value,
    'env.humidity.outdoor',
    valueOf,
    'max',
  )
  return temp || humidity ? { temp: temp?.value ?? null, humidity: humidity?.value ?? null } : null
})

const ZONE_TYPE_LABEL = { PLANT: 'Plant', ZONE: 'Zone', OTHER: 'Other' }

function kilowatts(metric) {
  return metric ? toKilowatts(metric.value, metric.unit) : null
}

const lines = computed(() =>
  rows.value.map((row) => {
    const id = row.node.id
    const config = configs.value.get(id)
    const rated = config?.ratedCapacity > 0 ? config.ratedCapacity / 1000 : null
    const load = kilowatts(objectMetric(items.value, id, 'cooling.load', valueOf))
    return {
      id,
      row,
      config,
      rated,
      load,
      ratio: rated && load != null ? load / rated : null,
      power: kilowatts(objectMetric(items.value, id, 'cooling.power', valueOf)),
      temps: coolingTemperatures(items.value, id, valueOf),
      hasMetrics: items.value.some((item) => item.objectId === id),
    }
  }),
)

const fmt = (value) => (value == null ? '—' : value.toFixed(1))
const pct = (ratio) => `${Math.round(ratio * 100)} %`
</script>

<template>
  <div class="cooling-view">
    <DemoNoticeBanner
      v-if="isDemo"
      message="Demo facility: the temperatures, loads and capacities are sample data."
    />

    <EmptyState
      v-if="!rows.length"
      icon="pi pi-cloud"
      title="No cooling zones"
      message="Cooling zones below this object appear here with their temperatures and their load against the rated capacity."
    />

    <template v-else>
      <div class="cl-toolbar">
        <span v-if="outdoor" class="cl-stat">
          <i class="pi pi-sun" aria-hidden="true" />
          Outdoor
          <template v-if="outdoor.temp != null">{{ fmt(outdoor.temp) }} °C</template>
          <span v-if="outdoor.humidity != null" class="cl-muted">
            · {{ Math.round(outdoor.humidity) }} % humidity
          </span>
          <InfoHint :text="OUTDOOR_INFO" label="the outdoor figures" />
        </span>
        <span v-else-if="!loading" class="cl-muted">No outdoor temperature for this facility.</span>
        <span v-if="dciError" class="cl-muted">
          <i class="pi pi-exclamation-triangle" aria-hidden="true" />
          Some metrics could not be read.
        </span>
        <i v-if="loading" class="pi pi-spin pi-spinner cl-muted" aria-hidden="true" />
        <span class="cl-toolbar__end">
          How figures are read
          <InfoHint :text="READING_INFO" label="cooling figures" />
        </span>
      </div>

      <div class="cl-rows" role="list">
        <div
          v-for="line in lines"
          :key="line.id"
          class="cl-row"
          role="listitem"
          :style="{ '--cl-depth': line.row.depth }"
        >
          <div class="cl-name">
            <AppLink :to="dataCenterTarget(line.row.node, 'cooling')" class="cl-link">
              {{ line.row.node.name }}
            </AppLink>
            <span class="cl-muted cl-type">
              {{ ZONE_TYPE_LABEL[line.config?.zoneType] ?? '' }}
              <template v-if="line.row.racks">
                · {{ line.row.racks }} {{ line.row.racks === 1 ? 'rack' : 'racks' }}
              </template>
            </span>
          </div>

          <LoadBar
            class="cl-bar"
            :ratio="line.ratio"
            :rated="!!line.rated"
            :label="
              line.ratio == null
                ? `${line.row.node.name}: no load value`
                : `${line.row.node.name} at ${pct(line.ratio)} of its capacity`
            "
          />

          <div v-if="loading" class="cl-value" />
          <div v-else class="cl-value">
            <template v-if="!line.hasMetrics">
              <span class="cl-muted">No cooling metrics</span>
            </template>
            <template v-else>
              <span v-if="line.load != null">
                {{ fmt(line.load)
                }}<template v-if="line.rated"> / {{ fmt(line.rated) }}</template> kW
                <template v-if="line.ratio != null"> · {{ pct(line.ratio) }}</template>
              </span>
              <span v-else class="cl-muted">No load value</span>
              <span v-if="line.ratio != null && line.ratio > 1" class="cl-warn">
                <StatusIcon :status="2" /> over capacity by {{ fmt(line.load - line.rated) }} kW
              </span>
              <span v-else-if="!line.rated" class="cl-muted">capacity not declared</span>
              <span v-if="line.power != null" class="cl-muted">
                draws {{ fmt(line.power) }} kW
              </span>
            </template>
          </div>

          <div v-if="loading" class="cl-temps" />
          <div v-else class="cl-temps">
            <template v-if="line.temps">
              <span>
                supply {{ fmt(line.temps.supply) }} · return {{ fmt(line.temps.return) }} °C
              </span>
              <span class="cl-muted">
                {{ line.temps.medium }}
                <template v-if="line.temps.deltaT != null">
                  · ΔT {{ fmt(line.temps.deltaT) }} K
                </template>
              </span>
            </template>
            <span v-else-if="line.hasMetrics" class="cl-muted">No temperatures</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cooling-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  height: 100%;
  overflow-y: auto;
  container-type: inline-size;
}

.cooling-view > * {
  flex-shrink: 0;
}

.cl-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  min-height: 2rem;
}

.cl-stat {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}

.cl-muted {
  color: var(--p-text-muted-color);
}

.cl-rows {
  display: grid;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-md);
  background: var(--p-content-background);
}

.cl-row {
  display: grid;
  grid-template-columns:
    minmax(12rem, 18rem) minmax(8rem, 1fr) minmax(10rem, 13rem)
    minmax(11rem, 14rem);
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.cl-row:last-child {
  border-bottom: 0;
}

.cl-name {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding-inline-start: calc(var(--cl-depth) * 1.25rem);
  min-width: 0;
}

.cl-link {
  font-weight: 600;
}

.cl-type {
  font-size: 0.75rem;
}

.cl-value,
.cl-temps {
  display: grid;
  justify-items: end;
  gap: 0.125rem;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

.cl-warn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 600;
}

.cl-toolbar__end {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

@container (max-width: 860px) {
  .cl-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .cl-bar {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .cl-temps {
    grid-column: 1 / -1;
    grid-row: 3;
    justify-items: start;
    grid-auto-flow: column;
    justify-content: start;
    gap: 0.5rem;
  }
}
</style>
