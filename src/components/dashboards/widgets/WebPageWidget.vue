<script setup>
import { computed } from 'vue'
import { isSafeExternalUrl } from '@/utils/sanitize'

const props = defineProps({
  widget: { type: Object, required: true },
})

// `allow-same-origin` keeps external pages' cookies and storage, but with `allow-scripts` a
// same-origin page could read the session token from the parent, so same-origin URLs are refused.
const url = computed(() => {
  const raw = props.widget.config?.url?.trim()
  if (!raw) return null
  if (!isSafeExternalUrl(raw)) return null
  try {
    if (new URL(raw).origin === window.location.origin) return null
  } catch {
    return null
  }
  return raw
})

/** Widget title, else the URL. */
const frameTitle = computed(
  () => props.widget.config?.title?.trim() || url.value || 'Embedded web page',
)
</script>

<template>
  <div class="web-page-widget">
    <div v-if="!url" class="web-page-empty">
      <i class="pi pi-globe" />
      <span>No URL configured</span>
    </div>
    <template v-else>
      <iframe
        :src="url"
        :title="frameTitle"
        class="web-page-frame"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerpolicy="no-referrer"
        loading="lazy"
      />
      <a
        :href="url"
        target="_blank"
        rel="noopener noreferrer"
        class="web-page-open"
        v-tooltip.left="'Open in new tab'"
        :aria-label="'Open ' + frameTitle + ' in new tab'"
      >
        <i class="pi pi-external-link" aria-hidden="true" />
      </a>
    </template>
  </div>
</template>

<style scoped>
.web-page-widget {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.web-page-frame {
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}

.web-page-open {
  position: absolute;
  top: 0.375rem;
  right: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 4px;
  background: color-mix(in srgb, var(--p-surface-card) 85%, transparent);
  border: 1px solid var(--p-surface-border);
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  opacity: 0;
  transition: opacity 0.15s;
}

.web-page-widget:hover .web-page-open {
  opacity: 1;
}

.web-page-open:hover {
  color: var(--p-text-color);
}

.web-page-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.web-page-empty i {
  font-size: 1.5rem;
  opacity: 0.4;
}
</style>
