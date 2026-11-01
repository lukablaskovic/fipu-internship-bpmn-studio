<script setup>
import { ref, nextTick, onBeforeUnmount } from 'vue';
import { AlertDialogRoot, AlertDialogPortal, AlertDialogOverlay, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from 'reka-ui';
const open = ref(false);
const message = ref('');
const action = ref('Nastavi');
const saveAction = ref('');
let resolve;
let previousFocus;
function ask(text, label = 'Nastavi', saveLabel = '') {
  if (resolve) return Promise.resolve(false);
  previousFocus = document.activeElement;
  message.value = text; action.value = label; saveAction.value = saveLabel; open.value = true;
  return new Promise(done => { resolve = done; });
}
async function finish(accepted) {
  open.value = false;
  const done = resolve; resolve = null;
  await nextTick();
  done?.(accepted);
}
function restoreFocus(event) {
  event.preventDefault();
  if (previousFocus?.isConnected) previousFocus.focus();
  else document.querySelector('[aria-label="Otvori elemente"], [role="tab"][data-state="active"]')?.focus();
}
onBeforeUnmount(() => resolve?.(false));
defineExpose({ ask });
</script>
<template>
  <AlertDialogRoot :open="open" @update:open="value => { if (!value) finish(false); }">
    <AlertDialogPortal><AlertDialogOverlay class="dialog-overlay confirmation-overlay" />
      <AlertDialogContent class="confirmation-dialog" @close-auto-focus="restoreFocus">
        <AlertDialogTitle>{{ saveAction ? 'Nespremljene izmjene' : action === 'Obriši' ? 'Obrisati element?' : 'Potvrda izmjene' }}</AlertDialogTitle>
        <AlertDialogDescription>{{ message }}</AlertDialogDescription>
        <div class="dialog-actions"><AlertDialogCancel @click.capture="finish(false)">Odustani</AlertDialogCancel><AlertDialogAction :class="action === 'Obriši' ? 'destructive' : !saveAction ? 'primary' : ''" @click.capture="finish(true)">{{ action }}</AlertDialogAction><AlertDialogAction v-if="saveAction" class="primary" @click.capture="finish('save')">{{ saveAction }}</AlertDialogAction></div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
