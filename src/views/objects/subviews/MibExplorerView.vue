<script setup>
/** Without `?oid=` it opens on the node's sysObjectID, as legacy does. */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MibExplorer from '@/components/mibs/MibExplorer.vue'

const props = defineProps({
  object: { type: Object, required: true },
})

const route = useRoute()
const router = useRouter()

const selectedOid = computed(() => {
  const oid = route.query.oid
  if (typeof oid === 'string' && oid !== '') return oid
  return props.object.snmpObjectId || null
})

function selectOid(oid) {
  if (oid === selectedOid.value) return
  router.replace({ query: { ...route.query, oid: oid || undefined } })
}
</script>

<template>
  <MibExplorer :object-id="object.id" :selected-oid="selectedOid" @select="selectOid" />
</template>
