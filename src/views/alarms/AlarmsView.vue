<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AlarmTable from '@/components/alarms/AlarmTable.vue'
import AlarmDetailsView from '@/components/alarms/AlarmDetailsView.vue'
import { useAlarms } from '@/queries/useAlarmQueries'
import { alarmTarget } from '@/utils/routeTargets'

const route = useRoute()
const router = useRouter()

const { data: alarmsData, isLoading, isFetching, isError, error, refetch } = useAlarms()
const alarms = computed(() => alarmsData.value ?? [])

// An omitted optional route param is an empty string, not null.
const selectedAlarmId = computed(() => (route.params.alarmId ? Number(route.params.alarmId) : null))
const selectedRow = computed(() => alarms.value.find((a) => a.id === selectedAlarmId.value) ?? null)

function openDetails(row) {
  router.push(alarmTarget(row.id))
}

function closeDetails() {
  router.push(alarmTarget())
}

const newAlarmIds = ref(new Set())
const prevIds = ref(new Set())

watch(alarms, (current) => {
  // On the very first load, just seed prevIds without marking anything as new
  if (prevIds.value.size === 0) {
    prevIds.value = new Set(current.map((a) => a.id))
    return
  }
  const incoming = new Set(current.map((a) => a.id))
  const added = new Set([...incoming].filter((id) => !prevIds.value.has(id)))
  if (added.size > 0) {
    newAlarmIds.value = added
    setTimeout(() => {
      newAlarmIds.value = new Set()
    }, 3000)
  }
  prevIds.value = incoming
})
</script>

<template>
  <div class="alarms-view">
    <AlarmDetailsView
      v-if="selectedAlarmId != null"
      :alarm-id="selectedAlarmId"
      :row="selectedRow"
      @back="closeDetails"
    />
    <AlarmTable
      v-show="selectedAlarmId == null"
      :alarms="alarms"
      :is-loading="isLoading"
      :is-fetching="isFetching"
      :is-error="isError"
      :error="error"
      :new-alarm-ids="newAlarmIds"
      @retry="refetch"
      @refresh="refetch"
      @open-details="openDetails"
    />
  </div>
</template>

<style scoped>
.alarms-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: -1rem;
}
</style>
