<script setup>
import { computed } from 'vue'
import { useMibChildren } from '@/queries/useMibQueries'

const props = defineProps({
  oid: { type: String, required: true },
  name: { type: String, required: true },
  hasChildren: { type: Boolean, default: false },
  depth: { type: Number, default: 0 },
  selectedOid: { type: String, default: null },
  focusedOid: { type: String, default: null },
  expandedOids: { type: Object, required: true },
})

const emit = defineEmits(['toggle', 'select', 'focus'])

const isExpanded = computed(() => props.expandedOids.has(props.oid))
const isSelected = computed(() => props.selectedOid === props.oid)
const isFocused = computed(() => props.focusedOid === props.oid)

const enabledOid = computed(() => (isExpanded.value ? props.oid : null))
const { data: children, isFetching } = useMibChildren(enabledOid)

function toggle(event) {
  event.stopPropagation()
  if (props.hasChildren) emit('toggle', props.oid)
}

function handleClick() {
  emit('select', props.oid, props.name)
}

function handleFocus() {
  emit('focus', props.oid)
}
</script>

<template>
  <div class="mib-node">
    <!-- Flat ARIA tree (`aria-level`, no `role="group"`). The `MibBrowser` container owns
         the keys, so rows have no keydown handler. -->
    <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events -->
    <div
      class="mib-tree-item"
      :class="{ 'is-selected': isSelected, 'is-focused': isFocused && !isSelected }"
      :style="{ paddingLeft: `${depth * 1 + 0.25}rem` }"
      :data-oid="oid"
      role="treeitem"
      :aria-level="depth + 1"
      :aria-selected="isSelected"
      :aria-expanded="hasChildren ? isExpanded : undefined"
      tabindex="-1"
      @click="handleClick"
      @focus="handleFocus"
    >
      <!-- Decorative: the row carries aria-expanded. -->
      <span class="mib-toggle" aria-hidden="true" @click="toggle">
        <i v-if="isFetching" class="pi pi-spin pi-spinner mib-spinner" />
        <i
          v-else-if="hasChildren"
          :class="isExpanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
        />
      </span>
      <i :class="hasChildren ? 'pi pi-sitemap' : 'pi pi-circle'" class="mib-node-icon" />
      <span class="mib-node-name">{{ name }}</span>
    </div>
    <template v-if="hasChildren && isExpanded && children">
      <MibTreeNode
        v-for="child in children"
        :key="child.oid"
        :oid="child.oid"
        :name="child.name"
        :has-children="child.hasChildren"
        :depth="depth + 1"
        :selected-oid="selectedOid"
        :focused-oid="focusedOid"
        :expanded-oids="expandedOids"
        @toggle="(o) => emit('toggle', o)"
        @select="(o, n) => emit('select', o, n)"
        @focus="(o) => emit('focus', o)"
      />
    </template>
  </div>
</template>

<style scoped>
.mib-tree-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  border-radius: 4px;
  user-select: none;
  outline: none;
}

.mib-tree-item:hover {
  background: var(--p-surface-hover);
}

.mib-tree-item.is-selected {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.mib-tree-item.is-focused {
  box-shadow: inset 0 0 0 1px var(--p-primary-color);
}

.mib-toggle {
  width: 1rem;
  font-size: 0.7rem;
  text-align: center;
  flex-shrink: 0;
}

.mib-spinner {
  font-size: 0.65rem;
}

.mib-node-icon {
  font-size: 0.75rem;
  width: 1rem;
  text-align: center;
  flex-shrink: 0;
  opacity: 0.6;
}

.mib-node-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.875rem;
}
</style>
