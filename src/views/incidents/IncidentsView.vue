<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IncidentTable from '@/components/incidents/IncidentTable.vue'
import IncidentDetailsView from '@/components/incidents/IncidentDetailsView.vue'
import { useIncidents } from '@/queries/useIncidentQueries'
import { incidentTarget } from '@/utils/routeTargets'

const route = useRoute()
const router = useRouter()

const { data: incidentsData, isLoading, isFetching, isError, error, refetch } = useIncidents()
const incidents = computed(() => incidentsData.value ?? [])

// An omitted optional route param is an empty string, not null.
const selectedIncidentId = computed(() =>
  route.params.incidentId ? Number(route.params.incidentId) : null,
)

function openDetails(row) {
  router.push(incidentTarget(row.id))
}

function closeDetails() {
  router.push(incidentTarget())
}
</script>

<template>
  <div class="incidents-view">
    <IncidentDetailsView
      v-if="selectedIncidentId != null"
      :incident-id="selectedIncidentId"
      @back="closeDetails"
    />
    <IncidentTable
      v-show="selectedIncidentId == null"
      :incidents="incidents"
      :is-loading="isLoading"
      :is-fetching="isFetching"
      :is-error="isError"
      :error="error"
      @retry="refetch"
      @refresh="refetch"
      @open-details="openDetails"
    />
  </div>
</template>

<style scoped>
.incidents-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: -1rem;
}
</style>
