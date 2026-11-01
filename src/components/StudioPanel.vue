<script setup>
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogClose } from 'reka-ui';
import Icon from '../Icon.vue';
defineProps({ compact: Boolean, open: Boolean, title: String, closeLabel: String, side: String, panelClass: String });
defineEmits(['update:open', 'closed']);
</script>
<template>
  <DialogRoot v-if="compact" :open="open" @update:open="$emit('update:open', $event)">
    <DialogPortal><DialogOverlay class="dialog-overlay" />
      <DialogContent :class="['mobile-panel', panelClass, side]" :aria-describedby="undefined" @close-auto-focus="$event.preventDefault(); $emit('closed')">
        <div class="panel-heading"><DialogTitle>{{ title }}</DialogTitle><DialogClose class="icon-button" :aria-label="closeLabel"><Icon name="close" /></DialogClose></div>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
  <aside v-else :class="panelClass" :aria-label="title"><div class="panel-heading"><h2>{{ title }}</h2></div><slot /></aside>
</template>
