<script setup>
/**
 * Legacy MibExplorer: the MIB tree and a definition pane, with walks of the selected subtree on
 * a node shown below. The Tools perspective picks the node here (`objectPicker`); a node's own
 * view passes it in. The caller owns the selected OID, so a deep link and a click agree.
 *
 * @event select - the OID to select, from the tree, the OID field or a walk result
 * @event update:objectId - the picked node, or null
 */
import { computed, ref, useTemplateRef, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import MibBrowser from './MibBrowser.vue'
import MibObjectDetails from './MibObjectDetails.vue'
import SnmpWalkResults from './SnmpWalkResults.vue'
import FormField from '@/components/common/FormField.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'
import { OBJECT_ACCESS_RIGHTS, hasObjectRight } from '@/auth/objectAccessRights'
import { useResizeHandle } from '@/composables/useResizeHandle'
import { useSnmpWalk } from '@/composables/useSnmpWalk'
import { useClosestMibObject, useMibNode } from '@/queries/useMibQueries'
import { useObject, useObjectSnmpConfig } from '@/queries/useObjectQueries'
import { prefs, userPrefs } from '@/utils/appStorage'
import { safeFilename } from '@/utils/csvExport'
import { normalizeOid, oidError } from '@/utils/snmpOid'

const props = defineProps({
  /** Node to walk. */
  objectId: { type: Number, default: null },
  objectPicker: { type: Boolean, default: false },
  selectedOid: { type: String, default: null },
})

const emit = defineEmits(['select', 'update:objectId'])

const { data: node } = useObject(() => props.objectId)

const { data: snmpConfig } = useObjectSnmpConfig(() => props.objectId)

const agentName = ref(null)

/** Legacy offers the choice only on a node with additional SNMP agents. */
const agentOptions = computed(() => {
  const agents = snmpConfig.value?.agents ?? []
  if (!agents.length) return []
  return [
    { label: 'Primary', value: null },
    ...agents.map((agent) => ({ label: agent.name, value: agent.name })),
  ]
})

const walk = useSnmpWalk()

watch(
  () => props.objectId,
  () => {
    agentName.value = null
    walk.clear()
  },
)

// As in legacy, typing selects the deepest MIB object the OID falls under and leaves the text
// alone; Walk takes the text as typed.
const oidText = ref('')
const oidInputError = ref('')
/** The selection the field asked for, which must not write itself back into the field. */
let selectedFromField = null

watch(
  () => props.selectedOid,
  (oid) => {
    const fromField = oid && oid === selectedFromField
    selectedFromField = null
    if (fromField) return
    oidText.value = oid ?? ''
    oidInputError.value = ''
  },
  { immediate: true },
)

const closestMibObject = useClosestMibObject(oidText)

watch(closestMibObject, (oid) => {
  if (!oid || oid === props.selectedOid) return
  selectedFromField = oid
  emit('select', oid)
})

const READ_SNMP_LABEL = OBJECT_ACCESS_RIGHTS.find((right) => right.key === 'READ_SNMP').label

const walkProblem = computed(() => {
  if (!props.objectId) return 'Pick a node to walk'
  const n = node.value
  if (!n) return null
  if (n.class !== 'Node') return 'Only nodes can be walked'
  if (!hasObjectRight(n, 'READ_SNMP')) {
    return `Walking needs the "${READ_SNMP_LABEL}" right on this node`
  }
  if (!agentName.value && !n.capabilities?.isSnmp) return 'This node has no SNMP agent'
  return null
})

function startWalk() {
  if (walkProblem.value || walk.running.value) return
  oidInputError.value = oidError(oidText.value)
  if (oidInputError.value) return
  const oid = normalizeOid(oidText.value)
  walk.start({ objectId: props.objectId, oid, snmpAgentName: agentName.value })
}

function rewalk() {
  const last = walk.target.value
  if (last) walk.start(last)
}

const { data: mibNode, isLoading, isError, error, refetch } = useMibNode(() => props.selectedOid)

const notInMib = computed(() => isError.value && error.value?.status === 404)

async function copyOid() {
  if (!props.selectedOid) return
  try {
    await navigator.clipboard.writeText(props.selectedOid)
  } catch {
    // Clipboard access can be refused; the OID is on screen and selectable.
  }
}

const SHORT_NAMES_PREF = 'mibExplorer.longNames'

function loadShortNames() {
  return userPrefs.get(SHORT_NAMES_PREF, false) !== true
}

const shortNames = ref(loadShortNames())

watch(shortNames, (value) => {
  if (value) userPrefs.remove(SHORT_NAMES_PREF)
  else userPrefs.set(SHORT_NAMES_PREF, true)
})

watch(userPrefs.revision, () => {
  shortNames.value = loadShortNames()
})

const RESULTS_HEIGHT_PREF = 'mibExplorer.resultsHeight'
const rootRef = useTemplateRef('root')
const resultsHeight = ref(prefs.get(RESULTS_HEIGHT_PREF, 320))

watch(resultsHeight, (px) => prefs.set(RESULTS_HEIGHT_PREF, px))

const { isResizing, handleBindings: resizeBindings } = useResizeHandle({
  size: resultsHeight,
  setSize: (px) => (resultsHeight.value = px),
  min: 140,
  // Measured, so the tree keeps a usable height whatever the window size.
  max: () => (rootRef.value?.getBoundingClientRect().height ?? 700) - 200,
  label: 'Resize walk results',
  orientation: 'horizontal',
})

const idleMessage = computed(() =>
  props.objectId
    ? 'Choose an object in the MIB tree, or type an OID, and press Walk to read its subtree from the node.'
    : 'Pick a node, choose an object in the MIB tree and press Walk to read its subtree from the node.',
)

const exportName = computed(() =>
  safeFilename(`snmp-walk-${node.value?.name ?? props.objectId}-${walk.target.value?.oid ?? ''}`),
)
</script>

<template>
  <div ref="root" class="mib-explorer">
    <div v-if="objectPicker || agentOptions.length" class="explorer-context">
      <FormField v-if="objectPicker" label="Node" group class="context-field node-field">
        <ObjectPickerField
          :model-value="objectId ?? 0"
          empty-label="(none)"
          dialog-title="Select Node"
          :selectable="(candidate) => candidate.class === 'Node'"
          @update:model-value="emit('update:objectId', $event || null)"
        />
      </FormField>
      <FormField
        v-if="agentOptions.length"
        label="SNMP agent"
        class="context-field"
        v-slot="{ id }"
      >
        <Select
          v-model="agentName"
          :input-id="id"
          :options="agentOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="agent-select"
        />
      </FormField>
    </div>

    <div class="explorer-browse">
      <div class="mib-tree-panel">
        <MibBrowser :selected-oid="selectedOid" @select="(oid) => emit('select', oid)" />
      </div>

      <div class="mib-detail-panel">
        <form class="walk-form" @submit.prevent="startWalk">
          <FormField
            label="Object identifier (OID)"
            :error="oidInputError"
            v-slot="{ id, describedBy }"
          >
            <div class="walk-row">
              <InputText
                :id="id"
                v-model="oidText"
                :aria-describedby="describedBy"
                spellcheck="false"
                size="small"
                class="oid-input"
                @input="oidInputError = ''"
              />
              <Button
                v-if="walk.running.value"
                label="Stop"
                icon="pi pi-stop"
                size="small"
                severity="secondary"
                outlined
                @click="walk.stop()"
              />
              <!-- A disabled button gets no pointer events, so the wrapper carries the tooltip. -->
              <span v-else v-tooltip.bottom="walkProblem">
                <Button
                  type="submit"
                  label="Walk"
                  icon="pi pi-sitemap"
                  size="small"
                  :disabled="!!walkProblem || !oidText.trim()"
                />
              </span>
            </div>
          </FormField>
        </form>

        <p v-if="!selectedOid" class="detail-hint">
          Pick a node in the MIB tree to see its definition.
        </p>
        <p v-else-if="notInMib" class="detail-hint">The loaded MIBs do not describe this OID.</p>
        <QueryErrorState v-else-if="isError" :error="error" @retry="refetch" />
        <LoadingState v-else-if="isLoading" compact />
        <div v-else-if="mibNode" class="mib-details">
          <div class="details-header">
            <span class="details-title">{{ mibNode.name || mibNode.oid }}</span>
            <Button
              icon="pi pi-copy"
              label="Copy OID"
              severity="secondary"
              text
              size="small"
              @click="copyOid"
            />
          </div>
          <MibObjectDetails :node="mibNode" />
        </div>
      </div>
    </div>

    <div
      class="resize-handle"
      :class="{ 'resize-handle--dragging': isResizing }"
      v-bind="resizeBindings"
    />

    <div class="explorer-results" :style="{ height: resultsHeight + 'px' }">
      <SnmpWalkResults
        v-model:short-names="shortNames"
        :rows="walk.rows.value"
        :status="walk.status.value"
        :error="walk.error.value"
        :truncated="walk.truncated.value"
        :target="walk.target.value"
        :idle-message="idleMessage"
        :export-name="exportName"
        @select-oid="(oid) => emit('select', oid)"
        @retry="rewalk"
      />
    </div>
  </div>
</template>

<style scoped>
.mib-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.explorer-context {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem 1.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
}

.context-field {
  min-width: 16rem;
  margin: 0;
}

/* Fixed, so picking a node does not resize the bar; a long name is cut with an ellipsis. */
.node-field {
  flex: 0 1 30rem;
}

.agent-select {
  min-width: 12rem;
}

.explorer-browse {
  display: grid;
  grid-template-columns: minmax(280px, 2fr) 3fr;
  flex: 1;
  min-height: 0;
}

.mib-tree-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--p-surface-border);
  overflow: hidden;
}

.mib-detail-panel {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  min-height: 0;
  overflow: auto;
  padding: 0.75rem 1.25rem 1rem;
}

.walk-form {
  margin: 0;
}

.walk-row {
  display: flex;
  gap: 0.5rem;
}

.oid-input {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
}

.detail-hint {
  margin: 0;
  font-size: 0.8125rem;
  font-style: italic;
  color: var(--p-text-muted-color);
}

.details-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.details-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
  overflow-wrap: anywhere;
}

.resize-handle {
  height: 5px;
  flex-shrink: 0;
  cursor: ns-resize;
  background: var(--p-surface-border);
  transition: background 0.15s;
  user-select: none;
}

.resize-handle:hover,
.resize-handle:focus-visible,
.resize-handle--dragging {
  background: var(--p-primary-color);
  outline: none;
}

/* A height stored on a taller screen must not squeeze the tree away. */
.explorer-results {
  flex-shrink: 0;
  min-height: 0;
  max-height: calc(100% - 12rem);
}

@media (max-width: 900px) {
  .explorer-browse {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }

  .mib-tree-panel {
    border-right: none;
    border-bottom: 1px solid var(--p-surface-border);
  }
}
</style>
