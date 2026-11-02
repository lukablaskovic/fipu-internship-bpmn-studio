<script setup>
import BpmnMarker from '../../packages/bpmn/BpmnMarker.vue';
defineProps({ type: { type: String, required: true } });
</script>

<template>
  <span class="palette-symbol" :class="type" aria-hidden="true"><BpmnMarker :type="type" /></span>
</template>
