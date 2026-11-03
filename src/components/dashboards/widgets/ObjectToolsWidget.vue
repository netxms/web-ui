<script setup>
import { computed } from 'vue'
import { useObjectsByIds } from '@/queries/useObjectQueries'
import { useObjectTools } from '@/queries/useObjectToolQueries'
import { useToolExecution } from '@/composables/useToolExecution'
import { useDashboardContext } from '@/composables/useDashboardContext'
import { resolveContextObjectId } from '@/utils/dashboardContext'

const props = defineProps({
  widget: { type: Object, required: true },
})

const cfg = computed(() => props.widget.config ?? {})
const { contextObjectId } = useDashboardContext()

// The context sentinel resolves per tool, and to 0 (a disabled button) without a context.
const tools = computed(() =>
  (cfg.value.tools ?? []).map((tool) => ({
    ...tool,
    objectId: resolveContextObjectId(tool.objectId, contextObjectId.value),
  })),
)
const numColumns = computed(() => cfg.value.numColumns || 1)

const targetIds = computed(() => tools.value.map((t) => t.objectId).filter(Boolean))
const { objectsById } = useObjectsByIds(targetIds)

// Fetched once and looked up on click: composables cannot be called from an event handler.
const { data: toolDefs } = useObjectTools()
const toolDefsById = computed(() => new Map((toolDefs.value ?? []).map((t) => [t.id, t])))

const { executeTool } = useToolExecution()

function objectFor(tool) {
  const obj = objectsById.value.get(tool.objectId)
  return obj ?? { id: tool.objectId, name: `Object #${tool.objectId}` }
}

async function runTool(tool) {
  if (!tool.objectId || !tool.toolId) return
  const toolDef = toolDefsById.value.get(tool.toolId) ?? { id: tool.toolId }
  await executeTool(objectFor(tool), toolDef)
}
</script>

<template>
  <div class="object-tools-widget">
    <div v-if="!tools.length" class="otw-state">
      <i class="pi pi-wrench" />
      <span>No tools configured</span>
    </div>
    <div v-else class="otw-grid" :style="{ gridTemplateColumns: `repeat(${numColumns}, 1fr)` }">
      <button
        v-for="(tool, i) in tools"
        :key="i"
        class="otw-btn"
        :disabled="!tool.objectId || !tool.toolId"
        @click="runTool(tool)"
      >
        <i class="pi pi-play-circle" />
        <span class="otw-btn-label">{{ tool.name || `Tool ${i + 1}` }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.object-tools-widget {
  display: flex;
  height: 100%;
  overflow: auto;
}

.otw-grid {
  display: grid;
  gap: 0.375rem;
  width: 100%;
  align-content: start;
}

.otw-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  background: var(--p-surface-card);
  color: var(--p-text-color);
  font-size: 0.8125rem;
  cursor: pointer;
  text-align: left;
}

.otw-btn:hover:not(:disabled) {
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
}

.otw-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.otw-btn i {
  flex-shrink: 0;
}

.otw-btn-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.otw-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  width: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.otw-state i {
  font-size: 1.5rem;
  opacity: 0.3;
}
</style>
