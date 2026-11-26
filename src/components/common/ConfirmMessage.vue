<script setup>
/**
 * Body of the app's ConfirmDialog. Besides PrimeVue's `message` (line breaks kept) and `icon`,
 * a confirmation can pass `subject`, the name of what the action applies to, shown in bold on its
 * own line, and `details`, consequences shown as a muted list.
 */
defineProps({
  /** The options passed to `confirm.require`. */
  options: { type: Object, required: true },
})
</script>

<template>
  <div class="confirm-message">
    <span
      v-if="options.icon"
      :class="['p-confirmdialog-icon', 'confirm-message__icon', options.icon]"
      aria-hidden="true"
    />
    <div class="confirm-message__text">
      <p class="confirm-message__lead">{{ options.message }}</p>
      <p v-if="options.subject" class="confirm-message__subject">{{ options.subject }}</p>
      <ul v-if="options.details?.length" class="confirm-message__details">
        <li v-for="(detail, i) in options.details" :key="i">{{ detail }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.confirm-message {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  flex: 1;
  min-width: 0;
}

.confirm-message__icon {
  flex-shrink: 0;
}

.confirm-message__text {
  min-width: 0;
  line-height: 1.5;
}

.confirm-message__lead,
.confirm-message__subject {
  margin: 0;
  overflow-wrap: anywhere;
}

.confirm-message__lead {
  white-space: pre-line;
}

.confirm-message__subject {
  font-weight: 600;
}

.confirm-message__details {
  margin: 0.75rem 0 0;
  padding-left: 1.125rem;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.confirm-message__details li + li {
  margin-top: 0.25rem;
}
</style>
