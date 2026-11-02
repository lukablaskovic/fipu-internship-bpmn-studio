<script setup>
import {
  mdiDownload, mdiUpload, mdiUndo, mdiRedo, mdiCheck, mdiPlus, mdiMinus, mdiContentSaveOutline,
  mdiFitToScreenOutline, mdiClose, mdiVectorLine, mdiDeleteOutline, mdiMagnify,
  mdiMenu, mdiInformationOutline, mdiSitemapOutline,
  mdiChevronDown,
} from '@mdi/js';

defineProps({ name: { type: String, required: true }, size: { type: Number, default: 18 } });
const paths = {
  save: mdiContentSaveOutline, chevron: mdiChevronDown, download: mdiDownload, upload: mdiUpload, undo: mdiUndo, redo: mdiRedo,
  check: mdiCheck, plus: mdiPlus, minus: mdiMinus, fit: mdiFitToScreenOutline,
  close: mdiClose, link: mdiVectorLine, trash: mdiDeleteOutline, search: mdiMagnify,
  menu: mdiMenu, info: mdiInformationOutline, workflow: mdiSitemapOutline,
};
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path :d="paths[name] || paths.info" /></svg>
</template>
