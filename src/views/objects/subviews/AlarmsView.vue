<script setup>
import { computed, inject, ref, watch } from 'vue'
import AlarmTable from '@/components/alarms/AlarmTable.vue'
import AlarmDetailsView from '@/components/alarms/AlarmDetailsView.vue'
import { useAlarms } from '@/queries/useAlarmQueries'

const props = defineProps({
  object: { type: Object, required: true },
})

const params = computed(() => ({ rootObject: props.object.id }))
const { data: alarmsData, isLoading, isFetching, isError, error, refetch } = useAlarms(params)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())
const alarms = computed(() => alarmsData.value ?? [])

// Inline detail: this subview lives inside ObjectsView tabs, so it can't own a route.
const selectedAlarm = ref(null)
const selectedRow = computed(() =>
  selectedAlarm.value != null
    ? (alarms.value.find((a) => a.id === selectedAlarm.value) ?? null)
    : null,
)

watch(
  () => props.object.id,
  () => {
    selectedAlarm.value = null
  },
)
</script>

<template>
  <div class="alarms-subview">
    <AlarmDetailsView
      v-if="selectedAlarm != null"
      :alarm-id="selectedAlarm"
      :row="selectedRow"
      embedded
      @back="selectedAlarm = null"
    />
    <AlarmTable
      v-show="selectedAlarm == null"
      :alarms="alarms"
      :is-loading="isLoading"
      :is-fetching="isFetching"
      :is-error="isError"
      :error="error"
      hide-go-to-object
      @retry="refetch"
      @refresh="refetch"
      @open-details="selectedAlarm = $event.id"
    />
  </div>
</template>

<style scoped>
.alarms-subview {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
