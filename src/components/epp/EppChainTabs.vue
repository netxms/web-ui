<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import { useNavTarget } from '@/composables/useNavTarget'
import { useTabOverflow } from '@/composables/useTabOverflow'
import { chainLabel, isMainChain } from '@/utils/eppChains'

// Styled like ViewTabBar but not reusing it: chains have a fixed order and closing one would
// mean deleting it. Overflow (scroll plus a chevron list) is shared through useTabOverflow.
defineOptions({ name: 'EppChainTabs' })

const props = defineProps({
  /** Main chain first; see `sortChains`. */
  chains: { type: Array, required: true },
  activeChainId: { type: Number, default: 0 },
  dirtyChainIds: { type: Set, default: () => new Set() },
  canManage: { type: Boolean, default: false },
  /** `(chainId) => RouteLocationRaw`, enabling ctrl/middle-click "open in a new tab". */
  targetFor: { type: Function, default: null },
})

const emit = defineEmits(['select', 'add'])

const { navBindings } = useNavTarget()

// Tab keys are chain ids as strings: useTabOverflow finds tabs by `data-tab-key`.

const scrollRef = ref(null)
const tabKeys = computed(() => props.chains.map((chain) => String(chain.id)))
const { canScrollLeft, canScrollRight, hiddenKeys, scrollKeyIntoView } = useTabOverflow(
  scrollRef,
  tabKeys,
)

const overflowMenu = ref()

const overflowItems = computed(() => {
  const byKey = new Map(props.chains.map((chain) => [String(chain.id), chain]))
  return hiddenKeys.value.map((key) => {
    const chain = byKey.get(key)
    return {
      label: chainLabel(chain) + (props.dirtyChainIds.has(chain.id) ? ' •' : ''),
      icon: chain.id === props.activeChainId ? 'pi pi-check' : undefined,
      command: () => selectChain(chain.id),
    }
  })
})

/** Also activates it: landing on a chain still out of sight would be a dead end. */
function selectChain(chainId) {
  scrollKeyIntoView(String(chainId))
  emit('select', chainId)
}

// Chains are also activated from outside (routing, deleting the active chain).
watch(
  () => props.activeChainId,
  (id) => scrollKeyIntoView(String(id)),
  { flush: 'post' },
)
onMounted(() => nextTick(() => scrollKeyIntoView(String(props.activeChainId))))

function tabBindings(chainId) {
  return navBindings(props.targetFor?.(chainId) ?? null, () => emit('select', chainId))
}

function tabTooltip(chain) {
  const parts = []
  if (chain.description) parts.push(chain.description)
  parts.push(`${chain.ruleCount ?? 0} rule${chain.ruleCount === 1 ? '' : 's'}`)
  if (!isMainChain(chain)) {
    parts.push(`called by ${chain.callerCount ?? 0} rule${chain.callerCount === 1 ? '' : 's'}`)
  }
  return parts.join(' · ')
}

// Roving tabindex: one tab stop for the strip, Left/Right move, Enter/Space activates.

const stripRef = ref(null)
const focusedChainId = ref(null)

const rovingChainId = computed(() => {
  const ids = props.chains.map((chain) => chain.id)
  return (
    [focusedChainId.value, props.activeChainId].find((id) => id != null && ids.includes(id)) ??
    ids[0] ??
    null
  )
})

function focusChainAt(index) {
  const chain = props.chains[index]
  if (!chain) return
  focusedChainId.value = chain.id
  // The tabindex swap has to land in the DOM before the tab can take focus.
  nextTick(() => stripRef.value?.querySelectorAll('.chain-tab')[index]?.focus())
}

function onTabKeydown(event, chainId) {
  const ids = props.chains.map((chain) => chain.id)
  const index = ids.indexOf(chainId)
  if (index === -1) return

  // Keeps arrow keys from scrolling the page out from under the focused tab.
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    return
  }

  let next
  if (event.key === 'ArrowRight') next = (index + 1) % ids.length
  else if (event.key === 'ArrowLeft') next = (index - 1 + ids.length) % ids.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = ids.length - 1
  else return

  event.preventDefault()
  focusChainAt(next)
}
</script>

<template>
  <div ref="stripRef" class="chain-tab-bar">
    <!-- `tabindex="-1"`: browsers otherwise give the scroll container its own focus stop. -->
    <div
      ref="scrollRef"
      class="chain-tab-scroll"
      :class="{ 'can-scroll-left': canScrollLeft, 'can-scroll-right': canScrollRight }"
      tabindex="-1"
    >
      <div
        class="chain-tab-bar-tabs"
        role="tablist"
        aria-label="Rule chains"
        aria-orientation="horizontal"
        tabindex="-1"
      >
        <!-- Focusable through the roving `:tabindex`; the rule cannot evaluate a bound value. -->
        <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
        <div
          v-for="chain in chains"
          :key="chain.id"
          :data-tab-key="String(chain.id)"
          v-tooltip.bottom="tabTooltip(chain)"
          class="chain-tab"
          :class="{ active: chain.id === activeChainId, dirty: dirtyChainIds.has(chain.id) }"
          role="tab"
          :aria-selected="chain.id === activeChainId"
          v-bind="tabBindings(chain.id)"
          :tabindex="chain.id === rovingChainId ? 0 : -1"
          @focus="focusedChainId = chain.id"
          @keydown="onTabKeydown($event, chain.id)"
        >
          <i :class="isMainChain(chain) ? 'pi pi-sitemap' : 'pi pi-link'" class="chain-tab-icon" />
          <span class="chain-tab-label">{{ chainLabel(chain) }}</span>
          <span class="chain-tab-count">{{ chain.ruleCount ?? 0 }}</span>
          <span
            v-if="dirtyChainIds.has(chain.id)"
            class="chain-tab-dirty"
            aria-label="Unsaved changes"
            >•</span
          >
        </div>
      </div>
    </div>

    <!-- Without it the actions read as one more tab. -->
    <div class="chain-tab-actions-divider" />

    <div class="chain-tab-bar-actions">
      <Button
        v-if="hiddenKeys.length > 0"
        v-tooltip.bottom="'Show hidden chains'"
        :aria-label="`Show hidden chains (${hiddenKeys.length})`"
        icon="pi pi-chevron-down"
        size="small"
        severity="secondary"
        text
        class="chain-tab-overflow"
        @click="overflowMenu.toggle($event)"
      />
      <Menu ref="overflowMenu" :model="overflowItems" :popup="true" />

      <Button
        v-if="canManage"
        v-tooltip.bottom="'New chain'"
        icon="pi pi-plus"
        size="small"
        severity="secondary"
        text
        rounded
        aria-label="New chain"
        @click="emit('add')"
      />
    </div>
  </div>
</template>

<style scoped>
.chain-tab-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  min-height: 2.5rem;

  /* A variable because the dark value is not a token flip. */
  --chain-tab-bg: var(--p-surface-100);
}

html.app-dark .chain-tab-bar {
  --chain-tab-bg: var(--p-surface-800);
}

/* overflow-y: hidden is not cosmetic: a pixel of vertical scroll takes the wheel. The 1px
   baseline nudge lives here for the same reason; on `.chain-tab` it overflowed. */
.chain-tab-scroll {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  position: relative;
  top: 1px;
}

.chain-tab-scroll::-webkit-scrollbar {
  display: none;
}

/* The scrollbar is hidden, so a soft edge is the only cue that the row continues. */
.chain-tab-scroll.can-scroll-left {
  mask-image: linear-gradient(to right, transparent 0, black 2.5rem);
}

.chain-tab-scroll.can-scroll-right {
  mask-image: linear-gradient(to right, black calc(100% - 2.5rem), transparent 100%);
}

.chain-tab-scroll.can-scroll-left.can-scroll-right {
  mask-image: linear-gradient(
    to right,
    transparent 0,
    black 2.5rem,
    black calc(100% - 2.5rem),
    transparent 100%
  );
}

.chain-tab-bar-tabs {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

/* The bar's gap spaces it. */
.chain-tab-actions-divider {
  width: 1px;
  height: 1.25rem;
  background: var(--p-surface-border);
  flex-shrink: 0;
}

.chain-tab-bar-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex-shrink: 0;
}

.chain-tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border-radius: 0.25rem 0.25rem 0 0;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  background: var(--chain-tab-bg);
  border: 1px solid transparent;
  border-bottom: none;
  transition: all 0.15s;
  white-space: nowrap;
  /* Otherwise the tabs shrink to fit and the strip never scrolls. */
  flex-shrink: 0;
}

.chain-tab:hover {
  color: var(--p-text-color);
  background: var(--p-surface-hover);
}

/* Negative offset keeps the ring inside the scrolling strip. */
.chain-tab:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.chain-tab.active {
  color: var(--p-primary-color);
  background: var(--p-surface-card);
  border-color: var(--p-surface-border);
  font-weight: 500;
}

.chain-tab.dirty {
  font-style: italic;
}

.chain-tab-icon {
  font-size: 0.875rem;
}

.chain-tab-label {
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chain-tab-count {
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
  background: var(--p-surface-ground);
  border-radius: 0.625rem;
  padding: 0 0.375rem;
  min-width: 1.25rem;
  text-align: center;
}

.chain-tab.active .chain-tab-count {
  background: var(--p-surface-ground);
  color: var(--p-text-color);
}

.chain-tab-dirty {
  color: var(--p-primary-color);
  font-size: 1rem;
  line-height: 0.5;
}

.chain-tab-overflow {
  flex-shrink: 0;
}
</style>
