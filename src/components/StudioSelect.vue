<script setup>
import { computed, useId } from 'vue';
import { Label, SelectRoot, SelectTrigger, SelectValue, SelectIcon, SelectPortal, SelectContent, SelectViewport, SelectItem, SelectItemText, SelectItemIndicator } from 'reka-ui';
import Icon from '../Icon.vue';
const props = defineProps({ label: { type: String, required: true }, options: { type: Array, required: true }, placeholder: String });
const value = defineModel({ type: String, default: '' });
const id = useId();
const selection = computed(() => { const index = props.options.findIndex(option => option.value === value.value); return index < 0 ? '' : String(index); });
</script>
<template>
  <div class="select-field">
    <Label :for="id">{{ label }}</Label>
    <SelectRoot :model-value="selection" @update:model-value="value = options[Number($event)].value">
      <SelectTrigger :id="id" class="select-trigger" :aria-label="label"><SelectValue :placeholder="placeholder" /><SelectIcon><Icon name="chevron" :size="16" /></SelectIcon></SelectTrigger>
      <SelectPortal><SelectContent position="popper" :side-offset="4" class="select-content" :body-lock="false">
        <SelectViewport><SelectItem v-for="(option, index) in options" :key="option.value" :value="String(index)" class="select-item"><SelectItemText>{{ option.label }}</SelectItemText><SelectItemIndicator><Icon name="check" :size="16" /></SelectItemIndicator></SelectItem></SelectViewport>
      </SelectContent></SelectPortal>
    </SelectRoot>
    <small v-if="$slots.default"><slot /></small>
  </div>
</template>
