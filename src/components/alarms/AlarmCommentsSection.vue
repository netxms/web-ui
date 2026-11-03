<script setup>
import { ref, computed } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Textarea from 'primevue/textarea'
import Skeleton from 'primevue/skeleton'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { formatDateTimeMedium } from '@/utils/timeFormat'
import {
  useAlarmComments,
  useCreateAlarmComment,
  useUpdateAlarmComment,
  useDeleteAlarmComment,
} from '@/queries/useAlarmQueries'

const props = defineProps({
  alarmId: { type: Number, required: true },
  /** False once the alarm is terminated. */
  canEdit: { type: Boolean, default: true },
})

const { data: comments, isLoading, isError, error, refetch } = useAlarmComments(() => props.alarmId)

const { mutateAsync: createComment, isPending: isCreating } = useCreateAlarmComment()
const { mutateAsync: updateComment, isPending: isUpdating } = useUpdateAlarmComment()
const { mutateAsync: deleteComment } = useDeleteAlarmComment()

const confirm = useConfirm()
const toast = useToast()

const commentList = computed(() => comments.value ?? [])

const dialogVisible = ref(false)
const editingId = ref(null) // null => creating a new comment
const draftText = ref('')
const isSaving = computed(() => isCreating.value || isUpdating.value)
const canSave = computed(() => draftText.value.trim().length > 0)

function openAdd() {
  editingId.value = null
  draftText.value = ''
  dialogVisible.value = true
}

function openEdit(comment) {
  editingId.value = comment.id
  draftText.value = comment.text ?? ''
  dialogVisible.value = true
}

async function saveComment() {
  const text = draftText.value.trim()
  if (!text) return
  try {
    if (editingId.value == null) {
      await createComment({ alarmId: props.alarmId, text })
    } else {
      await updateComment({ alarmId: props.alarmId, commentId: editingId.value, text })
    }
    dialogVisible.value = false
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Failed to save comment',
      detail: e?.message,
      life: 4000,
    })
  }
}

function confirmDelete(comment) {
  confirm.require({
    message: 'Are you sure you want to delete this alarm comment?',
    header: 'Delete Comment',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    acceptLabel: 'Delete',
    rejectLabel: 'Cancel',
    accept: async () => {
      try {
        await deleteComment({ alarmId: props.alarmId, commentId: comment.id })
      } catch (e) {
        toast.add({
          severity: 'error',
          summary: 'Failed to delete comment',
          detail: e?.message,
          life: 4000,
        })
      }
    },
  })
}

function formatDate(value) {
  return formatDateTimeMedium(value, { fallback: '' })
}
</script>

<template>
  <div class="comments-section">
    <div v-if="canEdit" class="comments-toolbar">
      <Button
        label="Add comment"
        icon="pi pi-comment"
        size="small"
        severity="secondary"
        outlined
        @click="openAdd"
      />
    </div>

    <div v-if="isLoading" class="comments-loading">
      <Skeleton height="3.5rem" />
      <Skeleton height="3.5rem" />
    </div>

    <QueryErrorState
      v-else-if="isError"
      :error="error"
      message="Failed to load comments"
      @retry="refetch"
    />

    <p v-else-if="commentList.length === 0" class="comments-empty">No comments</p>

    <ul v-else class="comment-list">
      <li v-for="comment in commentList" :key="comment.id" class="comment-item">
        <div class="comment-head">
          <span class="comment-user">
            <i class="pi pi-user comment-user-icon" />
            {{ comment.userName || `[${comment.userId}]` }}
          </span>
          <span class="comment-time">{{ formatDate(comment.lastChangeTime) }}</span>
          <span v-if="canEdit" class="comment-actions">
            <Button
              icon="pi pi-pencil"
              text
              rounded
              size="small"
              severity="secondary"
              aria-label="Edit comment"
              @click="openEdit(comment)"
            />
            <Button
              icon="pi pi-trash"
              text
              rounded
              size="small"
              severity="danger"
              aria-label="Delete comment"
              @click="confirmDelete(comment)"
            />
          </span>
        </div>
        <p class="comment-text">{{ comment.text }}</p>
      </li>
    </ul>

    <Dialog
      v-model:visible="dialogVisible"
      :header="editingId == null ? 'Add Comment' : 'Edit Comment'"
      modal
      :style="{ width: '32rem' }"
      :draggable="false"
    >
      <Textarea
        v-model="draftText"
        auto-resize
        rows="6"
        class="comment-input"
        placeholder="Comment text"
        autofocus
      />
      <template #footer>
        <Button
          label="Cancel"
          text
          severity="secondary"
          :disabled="isSaving"
          @click="dialogVisible = false"
        />
        <Button
          label="Save"
          icon="pi pi-check"
          :loading="isSaving"
          :disabled="!canSave"
          @click="saveComment"
        />
      </template>
    </Dialog>
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

.comments-loading {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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

.comment-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
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

.comment-time {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.comment-actions {
  margin-left: auto;
  display: inline-flex;
  gap: 0.125rem;
}

.comment-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.875rem;
}

.comment-input {
  width: 100%;
}
</style>
