<script setup>
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { formatDateTimeMedium } from '@/utils/timeFormat'

// Add-only: the server has no update or delete command for incident comments.
defineProps({
  /** @type {import('@/api/incidentsApi').IncidentComment[]} */
  comments: { type: Array, default: () => [] },
  /** False once the incident is closed, which the server refuses to comment on. */
  canComment: { type: Boolean, default: true },
})

const emit = defineEmits(['add'])

function formatDate(value) {
  return formatDateTimeMedium(value, { fallback: '' })
}
</script>

<template>
  <div class="comments-section">
    <div v-if="canComment" class="comments-toolbar">
      <Button
        label="Add comment"
        icon="pi pi-comment"
        size="small"
        severity="secondary"
        outlined
        @click="emit('add')"
      />
    </div>

    <p v-if="comments.length === 0" class="comments-empty">No comments</p>

    <ul v-else class="comment-list">
      <li
        v-for="comment in comments"
        :key="comment.id"
        class="comment-item"
        :class="{ 'comment-item--ai': comment.aiGenerated }"
      >
        <div class="comment-head">
          <span class="comment-user">
            <i
              :class="comment.aiGenerated ? 'pi pi-sparkles' : 'pi pi-user'"
              class="comment-user-icon"
            />
            {{ comment.userName || (comment.userId ? `[${comment.userId}]` : 'system') }}
          </span>
          <Tag v-if="comment.aiGenerated" value="AI" severity="info" outlined class="ai-tag" />
          <span class="comment-time">{{ formatDate(comment.creationTime) }}</span>
        </div>
        <p class="comment-text">{{ comment.text }}</p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.comments-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.comments-toolbar {
  display: flex;
}

.comments-empty {
  margin: 0;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.comment-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.comment-item {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 6px);
  padding: 0.625rem 0.75rem;
  background: var(--p-surface-card);
}

/* AI-written comments get a tinted left edge so they read as machine analysis. */
.comment-item--ai {
  border-left: 3px solid var(--p-blue-400);
  background: color-mix(in srgb, var(--p-blue-500) 5%, var(--p-surface-card));
}

.comment-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.375rem;
}

.comment-user {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 600;
  font-size: 0.8125rem;
}

.comment-user-icon {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.ai-tag {
  font-size: 0.625rem;
}

.comment-time {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.comment-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.875rem;
}
</style>
