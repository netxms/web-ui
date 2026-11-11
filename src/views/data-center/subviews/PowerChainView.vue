<script setup>
import { computed, ref, watch } from 'vue'
import SelectButton from 'primevue/selectbutton'
import AppLink from '@/components/common/AppLink.vue'
import DemoNoticeBanner from '@/components/common/DemoNoticeBanner.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import InfoHint from '@/components/common/InfoHint.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import LoadBar from '@/components/data-center/LoadBar.vue'
import { isDemoDataCenterId } from '@/api/dataCenterApi'
import {
  usePowerDomainConfigs,
  useTaggedDcis,
  useDataCenterValues,
} from '@/queries/useDataCenterQueries'
import {
  POWER_LOAD_TAGS,
  feedLossRisks,
  feedsAffecting,
  firstTagLoads,
  powerDomainRows,
  scenarioLoads,
} from '@/utils/dataCenter'
import { useDataCenterTarget } from '@/composables/useDataCenterTarget'

const props = defineProps({
  /** Facility or PowerDomain, as a full sub-tree node */
  object: { type: Object, required: true },
  /** Facility holding `object`, as a full sub-tree node; partners are looked up across it */
  facility: { type: Object, default: null },
})

const dataCenterTarget = useDataCenterTarget()

const PARTNER_INFO =
  'Domains on different feeds that supply the same racks are partners: when one feed is lost, its partner carries both loads.'
const LOAD_INFO =
  'Load is the first of power.out, power.in, power.feed and power.gen a domain has, against its rated power. Bars run to 125 % of the rating.'

const isDemo = computed(() => isDemoDataCenterId(props.object.id))
/** The rows on screen: `object` and the domains below it. */
const rows = computed(() => powerDomainRows(props.object))
/** Every domain of the facility, in facility depths, for the feed-loss scenarios. */
const scopeRows = computed(() =>
  props.facility && props.facility.id !== props.object.id
    ? powerDomainRows(props.facility)
    : rows.value,
)
const ids = computed(() => scopeRows.value.map((row) => row.node.id))

const { configs, isLoading: loadingConfigs } = usePowerDomainConfigs(ids)
const { items, isLoading: loadingDcis } = useTaggedDcis(ids, POWER_LOAD_TAGS)
const { valueOf } = useDataCenterValues(items)

const loads = computed(() => firstTagLoads(ids.value, items.value, valueOf))

const feeds = computed(() =>
  feedsAffecting(
    scopeRows.value,
    configs.value,
    rows.value.map((row) => row.node.id),
  ),
)
const scenario = ref('none')
watch(feeds, (list) => {
  if (scenario.value !== 'none' && !list.includes(scenario.value)) scenario.value = 'none'
})
const scenarioOptions = computed(() => [
  { label: 'All feeds', value: 'none' },
  ...feeds.value.map((tag) => ({ label: `Feed ${tag} lost`, value: tag })),
])

const DOMAIN_TYPE_LABEL = {
  GRID_ENTRY: 'Grid entry',
  GENERATOR: 'Generator',
  UPS: 'UPS',
  PDU: 'PDU',
  BUSWAY: 'Busway',
  OTHER: 'Other',
}

function describe(row, loadsByScenario) {
  const id = row.node.id
  const config = configs.value.get(id)
  const rated = config?.ratedPower > 0 ? config.ratedPower / 1000 : null
  const state = loadsByScenario.get(id)
  const load = state?.load ?? null
  const ratio = rated && load != null ? load / rated : null
  return { id, row, config, rated, load, offline: !!state?.offline, ratio }
}

const lines = computed(() => {
  const lost = scenario.value === 'none' ? null : scenario.value
  const loadsByScenario = scenarioLoads(scopeRows.value, configs.value, loads.value, lost)
  return rows.value.map((row) => describe(row, loadsByScenario))
})

/** Domains on screen over their rating when one feed is lost, for every feed that matters. */
const risks = computed(() =>
  feedLossRisks(scopeRows.value, rows.value, configs.value, loads.value, feeds.value),
)

const fmt = (value) => (value == null ? '—' : value.toFixed(1))
const pct = (ratio) => `${Math.round(ratio * 100)} %`
</script>

<template>
  <div class="power-chain-view">
    <DemoNoticeBanner
      v-if="isDemo"
      message="Demo facility: the loads and ratings are sample data."
    />

    <EmptyState
      v-if="!rows.length"
      icon="pi pi-bolt"
      title="No power domains"
      message="Power domains below this object appear here with their load against the declared rating."
    />

    <template v-else>
      <div class="pc-toolbar">
        <SelectButton
          v-if="feeds.length"
          v-model="scenario"
          :options="scenarioOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
          aria-label="Feed scenario"
        />
        <InfoHint v-if="feeds.length" :text="PARTNER_INFO" label="feed partners" />
        <span v-else class="pc-muted"
          >No feed tags declared, so there is no redundancy to check.</span
        >
        <i
          v-if="loadingConfigs || loadingDcis"
          class="pi pi-spin pi-spinner pc-muted"
          aria-hidden="true"
        />
        <span class="pc-toolbar__end">
          How loads are read
          <InfoHint :text="LOAD_INFO" label="loads" />
        </span>
      </div>

      <section v-if="feeds.length" class="pc-risks" aria-label="Redundancy check">
        <p v-if="!risks.length" class="pc-ok">
          <StatusIcon :status="0" />
          Every domain stays within its rating when any one feed is lost.
        </p>
        <ul v-else class="pc-risk-list">
          <li v-for="risk in risks" :key="`${risk.lostFeed}-${risk.id}`">
            <StatusIcon :status="2" />
            <span>
              <strong>{{ risk.node.name }}</strong> would carry {{ fmt(risk.load) }} kW of
              {{ fmt(risk.rated) }} kW ({{ pct(risk.ratio) }}) if feed {{ risk.lostFeed }} is lost.
            </span>
          </li>
        </ul>
      </section>

      <div class="pc-rows" role="list">
        <div
          v-for="line in lines"
          :key="line.id"
          class="pc-row"
          role="listitem"
          :style="{ '--pc-depth': line.row.depth }"
        >
          <div class="pc-name">
            <AppLink :to="dataCenterTarget(line.row.node, 'power')" class="pc-link">
              {{ line.row.node.name }}
            </AppLink>
            <span v-if="line.config?.feedTag" class="pc-feed">{{ line.config.feedTag }}</span>
            <span class="pc-muted pc-type">
              {{ DOMAIN_TYPE_LABEL[line.config?.domainType] ?? '' }}
              <template v-if="line.row.racks">
                · {{ line.row.racks }} {{ line.row.racks === 1 ? 'rack' : 'racks' }}
              </template>
            </span>
          </div>

          <LoadBar
            class="pc-bar"
            :ratio="line.ratio"
            :rated="!!line.rated"
            :offline="line.offline"
            :label="
              line.offline
                ? `${line.row.node.name} without supply`
                : line.ratio == null
                  ? `${line.row.node.name}: no load value`
                  : `${line.row.node.name} at ${pct(line.ratio)} of its rating`
            "
          />

          <div class="pc-value">
            <template v-if="line.offline">
              <span class="pc-muted">No supply</span>
            </template>
            <template v-else-if="line.load == null">
              <span class="pc-muted">No power metric</span>
            </template>
            <template v-else>
              <span>
                {{ fmt(line.load)
                }}<template v-if="line.rated"> / {{ fmt(line.rated) }}</template> kW
                <template v-if="line.ratio != null"> · {{ pct(line.ratio) }}</template>
              </span>
              <span v-if="line.ratio != null && line.ratio > 1" class="pc-warn">
                <StatusIcon :status="2" /> over rating by {{ fmt(line.load - line.rated) }} kW
              </span>
              <span v-else-if="!line.rated" class="pc-muted">rating not declared</span>
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.power-chain-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  height: 100%;
  overflow-y: auto;
  container-type: inline-size;
}

.pc-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.pc-muted {
  color: var(--p-text-muted-color);
}

.pc-risks {
  font-size: 0.875rem;
}

.pc-ok,
.pc-risk-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
}

.pc-risk-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.375rem;
}

.pc-rows {
  display: grid;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-md);
  background: var(--p-content-background);
}

.pc-row {
  display: grid;
  grid-template-columns: minmax(12rem, 18rem) minmax(8rem, 1fr) minmax(11rem, 15rem);
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.pc-row:last-child {
  border-bottom: 0;
}

.pc-name {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding-inline-start: calc(var(--pc-depth) * 1.25rem);
  min-width: 0;
}

.pc-link {
  font-weight: 600;
}

.pc-type {
  font-size: 0.75rem;
}

.pc-feed {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0 0.3rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-sm);
}

.pc-value {
  display: grid;
  justify-items: end;
  gap: 0.125rem;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

.pc-warn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 600;
}

.pc-toolbar__end {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

@container (max-width: 720px) {
  .pc-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .pc-bar {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
