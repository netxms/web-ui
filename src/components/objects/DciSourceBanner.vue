<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useObject } from '@/queries/useObjectQueries'
import { useDciSourceRoot } from '@/queries/useDciConfigQueries'
import { useNavTarget } from '@/composables/useNavTarget'
import { dciSource } from '@/utils/dciSource'
import { dciTarget } from '@/utils/routeTargets'

// Edit Source goes to the end of the copy chain, like legacy's: the copies in between are
// overwritten from there, so an edit on them would not last.
const props = defineProps({
  /** As saved. */
  dci: { type: Object, required: true },
  ownerObject: { type: Object, required: true },
})

const source = computed(() => dciSource(props.dci, props.ownerObject.id))
const isInstanceDiscovery = computed(() => source.value?.kind === 'instanceDiscovery')

const { data: root } = useDciSourceRoot(
  () => props.dci,
  () => props.ownerObject,
)

const rootIsOwner = computed(() => root.value?.objectId === props.ownerObject.id)

// Only when the chain goes on past the object that added the DCI (a cluster's copy).
const { data: intermediateObject } = useObject(
  computed(() =>
    source.value?.kind === 'object' && root.value && root.value.objectId !== source.value.objectId
      ? source.value.objectId
      : null,
  ),
)

function kindOf(object) {
  return object?.class === 'Cluster' ? 'cluster' : 'template'
}

function named(object, id) {
  return object ? `${kindOf(object)} "${object.name}"` : `object ${id}`
}

const origin = computed(() => {
  const end = named(root.value.object, root.value.objectId)
  if (isInstanceDiscovery.value) {
    if (!rootIsOwner.value) return `Created by instance discovery from ${end}.`
    const prototype = root.value.prototype
    const name = prototype?.description || prototype?.name
    return name
      ? `Created by instance discovery from "${name}".`
      : `Created by instance discovery from DCI ${root.value.dciId}.`
  }
  if (root.value.objectId === source.value.objectId) return `Added by ${end}.`
  return `Added by ${named(intermediateObject.value, source.value.objectId)}, from ${end}.`
})

const consequence = computed(() => {
  if (!source.value.isProtected) return 'Local changes can be overwritten at any moment.'
  return isInstanceDiscovery.value
    ? 'Local changes are protected from instance discovery updates.'
    : `Local changes are protected from ${kindOf(intermediateObject.value ?? root.value.object)} updates.`
})

const editLabel = computed(() =>
  rootIsOwner.value ? 'Edit prototype' : `Edit in ${kindOf(root.value.object)}`,
)

const editTarget = computed(() =>
  root.value?.object && root.value.dciId ? dciTarget(root.value.object, root.value.dciId) : null,
)

const { linkBindings } = useNavTarget()
</script>

<template>
  <Message
    v-if="source && root"
    :severity="source.isProtected ? 'info' : 'warn'"
    :closable="false"
    class="dci-source-banner"
  >
    <div class="dci-source-content">
      <span>{{ origin }} {{ consequence }}</span>
      <Button
        v-if="editTarget"
        as="a"
        v-bind="linkBindings(editTarget)"
        :label="editLabel"
        icon="pi pi-arrow-right"
        icon-pos="right"
        size="small"
        severity="secondary"
        outlined
      />
    </div>
  </Message>
</template>

<style scoped>
.dci-source-content {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}
</style>
