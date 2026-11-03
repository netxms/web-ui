<script setup>
import { computed } from 'vue'
import Card from 'primevue/card'
import changelog from '@/data/changelog.json'
import { freshEntries } from '@/config/whatsNew'
import { changelogUrl } from '@/utils/changelogUrl'
import { useServerInfo } from '@/queries/useServerQueries'
import { formatDateMedium } from '@/utils/timeFormat'

const { data: serverInfo } = useServerInfo()

// Derived from the running server rather than the bundle, so it cannot go stale.
const versionRow = computed(() => {
  const version = serverInfo.value?.version
  const url = changelogUrl(version)
  return url ? { version, url } : null
})

const entries = computed(() => freshEntries(changelog))

const hasContent = computed(() => versionRow.value !== null || entries.value.length > 0)

function formatDate(dateStr) {
  return formatDateMedium(dateStr)
}
</script>

<template>
  <Card class="changelog-card">
    <template #title>
      <div class="changelog-card-title">
        <i class="pi pi-megaphone changelog-card-icon" />
        What's New
      </div>
    </template>
    <template #content>
      <div v-if="!hasContent" class="changelog-empty">
        <i class="pi pi-info-circle changelog-empty-icon" />
        <p>No updates available</p>
      </div>

      <div v-else class="changelog-list">
        <a
          v-if="versionRow"
          :href="versionRow.url"
          target="_blank"
          rel="noopener noreferrer"
          class="changelog-item changelog-item--version"
        >
          <div class="changelog-item-dot" />
          <div class="changelog-item-content">
            <div class="changelog-item-header">
              <span class="changelog-item-title">
                What's new in NetXMS {{ versionRow.version }}
              </span>
            </div>
            <p class="changelog-item-summary">
              Release notes for the server you are connected to.
              <i class="pi pi-external-link" />
            </p>
          </div>
        </a>

        <div v-for="item in entries" :key="item.id" class="changelog-item">
          <div class="changelog-item-dot" />
          <div class="changelog-item-content">
            <div class="changelog-item-header">
              <span class="changelog-item-title">{{ item.title }}</span>
              <span class="changelog-item-date">{{ formatDate(item.date) }}</span>
            </div>
            <p class="changelog-item-summary">{{ item.summary }}</p>
            <a
              v-if="item.link"
              :href="item.link"
              target="_blank"
              rel="noopener noreferrer"
              class="changelog-item-link"
            >
              Read more
              <i class="pi pi-external-link" />
            </a>
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>

<style scoped>
.changelog-card-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
}

.changelog-card-icon {
  color: var(--p-primary-color);
}

.changelog-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 0;
  color: var(--p-text-muted-color);
}

.changelog-empty-icon {
  font-size: 2rem;
}

.changelog-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.changelog-item {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.changelog-item:last-child {
  border-bottom: none;
}

.changelog-item-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--p-primary-color);
  flex-shrink: 0;
  margin-top: 0.375rem;
}

.changelog-item-content {
  flex: 1;
  min-width: 0;
}

.changelog-item-header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.changelog-item-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.changelog-item-date {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.changelog-item-summary {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  line-height: 1.5;
}

.changelog-item-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.25rem;
  font-size: 0.8125rem;
  color: var(--p-primary-color);
  text-decoration: none;
}

.changelog-item-link:hover {
  text-decoration: underline;
}

.changelog-item-link .pi {
  font-size: 0.6875rem;
}

.changelog-item--version {
  display: flex;
  text-decoration: none;
  color: inherit;
}

.changelog-item--version:hover .changelog-item-title {
  color: var(--p-primary-color);
}
</style>
