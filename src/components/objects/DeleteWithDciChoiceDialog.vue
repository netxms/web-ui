<script setup>
// Asks whether DCIs created on members are removed or unbound (legacy TemplateDeleteDialog).
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import RadioButton from 'primevue/radiobutton'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** `dciChoiceFor(objects)`: `{ kind: 'template'|'cluster', name }`. */
  choice: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'confirm'])

const removeDci = ref(true)

watch(
  () => props.visible,
  (visible) => {
    if (visible) removeDci.value = true
  },
)

const isCluster = computed(() => props.choice?.kind === 'cluster')

const header = computed(() => (isCluster.value ? 'Delete Cluster' : 'Delete Template'))

const prompt = computed(() =>
  isCluster.value
    ? `You are about to delete cluster "${props.choice?.name}". Please select how to handle DCIs created from this cluster on all member nodes:`
    : `You are about to delete template "${props.choice?.name}". Please select how to handle DCIs created from this template on all bound objects:`,
)

const removeLabel = computed(() =>
  isCluster.value ? 'Remove DCIs from all member nodes' : 'Remove DCIs from all objects',
)
const unbindLabel = computed(() =>
  isCluster.value
    ? 'Unbind DCIs from cluster (keep as standalone)'
    : 'Unbind DCIs from template (keep as standalone)',
)

function close() {
  emit('update:visible', false)
}

function confirm() {
  emit('confirm', removeDci.value)
  close()
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="header"
    modal
    :style="{ width: '32rem' }"
    :draggable="false"
    @update:visible="emit('update:visible', $event)"
  >
    <!-- The dialog focuses the first [autofocus]. -->
    <div class="dci-choice">
      <p class="dci-choice__prompt">{{ prompt }}</p>
      <div class="dci-choice__option">
        <RadioButton
          v-model="removeDci"
          input-id="dci-choice-remove"
          name="dci-choice"
          :value="true"
          :pt="{ input: { autofocus: true } }"
        />
        <label for="dci-choice-remove">{{ removeLabel }}</label>
      </div>
      <div class="dci-choice__option">
        <RadioButton
          v-model="removeDci"
          input-id="dci-choice-unbind"
          name="dci-choice"
          :value="false"
        />
        <label for="dci-choice-unbind">{{ unbindLabel }}</label>
      </div>
    </div>
    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="close" />
      <Button label="Delete" severity="danger" @click="confirm" />
    </template>
  </Dialog>
</template>

<style scoped>
.dci-choice {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.dci-choice__prompt {
  margin: 0 0 0.25rem;
  font-size: 0.875rem;
}

.dci-choice__option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}
</style>
