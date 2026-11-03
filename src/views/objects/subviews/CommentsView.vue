<script setup>
import { computed, inject, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import MarkdownCommentEditor from '@/components/common/MarkdownCommentEditor.vue'
import { useObject, useUpdateObjectProperties } from '@/queries/useObjectQueries'
import { usePropertyEditor } from '@/composables/usePropertyEditor'
import { withMarkdownPrefix } from '@/utils/commentsUtils'

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object?.id)
const { data: currentObject, isLoading, isFetching, isError, error, refetch } = useObject(objectId)

// Paints from the tree-sourced prop until the full fetch resolves. Edits `commentsSource` (raw
// macro source): `comments` on GET is macro-expanded. The id drives usePropertyEditor's reset.
const base = computed(() => currentObject.value ?? props.object)
const editableSource = computed(() =>
  base.value ? { id: base.value.id, commentsSource: base.value.commentsSource ?? '' } : null,
)

const updateMutation = useUpdateObjectProperties()
const toast = useToast()

const { draft, isDirty, isSaving, saveError, save, cancel } = usePropertyEditor(editableSource, {
  onSave: async (d) => {
    await updateMutation.mutateAsync({
      id: objectId.value,
      payload: { comments: d.commentsSource ? withMarkdownPrefix(d.commentsSource) : null },
    })
    toast.add({ severity: 'success', summary: 'Comments saved', life: 2500 })
  },
})

watch(saveError, (message) => {
  if (message) toast.add({ severity: 'error', summary: 'Save failed', detail: message, life: 3000 })
})

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())
</script>

<template>
  <div class="comments-view">
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <QueryErrorState v-if="isError" :error="error" @retry="refetch" />

    <template v-else>
      <div class="comments-toolbar">
        <span class="toolbar-title">Comments</span>
        <div class="save-actions">
          <Button
            label="Cancel"
            text
            severity="secondary"
            size="small"
            :disabled="!isDirty || isSaving"
            @click="cancel"
          />
          <Button
            label="Save"
            icon="pi pi-check"
            size="small"
            :loading="isSaving"
            :disabled="!isDirty"
            @click="save"
          />
        </div>
      </div>

      <div class="comments-body">
        <MarkdownCommentEditor v-model="draft.commentsSource" fill :rows="10" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.comments-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.comments-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.toolbar-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.save-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-left: auto;
}

.comments-body {
  flex: 1;
  min-height: 0;
  padding: 1rem;
  display: flex;
  flex-direction: column;
}
</style>
