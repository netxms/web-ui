<script setup>
import AclPicker from '@/components/common/AclPicker.vue'

/* eslint-disable vue/no-mutating-props */
defineProps({
  form: { type: Object, required: true },
})
</script>

<template>
  <div class="access-control-tab">
    <AclPicker v-model="form.accessList" />
  </div>
</template>

<style scoped>
.access-control-tab {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 1rem;
  min-height: 0;
}
</style>
