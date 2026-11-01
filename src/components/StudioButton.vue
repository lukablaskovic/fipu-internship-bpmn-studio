<script setup>
import { useAttrs } from 'vue';
import { Primitive, TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent, useForwardExpose } from 'reka-ui';
defineOptions({ inheritAttrs: false });
const props = defineProps({ title: String, type: { type: String, default: 'button' } });
const attrs = useAttrs();
defineExpose({ focus: () => currentElement.value?.focus() });
const { forwardRef, currentElement } = useForwardExpose();
</script>
<template>
  <TooltipRoot v-if="props.title">
    <TooltipTrigger as-child><Primitive :ref="forwardRef" as="button" :type="type" v-bind="attrs"><slot /></Primitive></TooltipTrigger>
    <TooltipPortal><TooltipContent class="studio-tooltip" :side-offset="6">{{ props.title }}</TooltipContent></TooltipPortal>
  </TooltipRoot>
  <Primitive v-else :ref="forwardRef" as="button" :type="type" v-bind="attrs"><slot /></Primitive>
</template>
