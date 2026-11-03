<script setup>
import NxslScriptRunner from '@/components/common/NxslScriptRunner.vue'

defineProps({
  object: { type: Object, required: true },
})
</script>

<template>
  <NxslScriptRunner :object-id="object.id" show-save />
</template>
