<script setup>
/** The URL owns the node (`?node=`) and the selected OID (`?oid=`). */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MibExplorer from '@/components/mibs/MibExplorer.vue'
import { toolTarget } from '@/utils/routeTargets'

const route = useRoute()
const router = useRouter()

const selectedOid = computed(() => {
  const oid = route.query.oid
  return typeof oid === 'string' && oid !== '' ? oid : null
})

const nodeId = computed(() => Number(route.query.node) || null)

function replaceQuery(patch) {
  const query = { ...route.query, ...patch }
  for (const key of Object.keys(patch)) if (query[key] == null) delete query[key]
  router.replace(toolTarget('mib-explorer', query))
}

function selectOid(oid) {
  if (oid !== selectedOid.value) replaceQuery({ oid: oid || null })
}

function selectNode(id) {
  if (id !== nodeId.value) replaceQuery({ node: id ? String(id) : null })
}
</script>

<template>
  <MibExplorer
    class="mib-explorer-tool"
    object-picker
    :object-id="nodeId"
    :selected-oid="selectedOid"
    @select="selectOid"
    @update:object-id="selectNode"
  />
</template>

<style scoped>
.mib-explorer-tool {
  margin: -1rem;
}
</style>
