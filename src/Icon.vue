<script setup>
defineProps({ name: { type: String, required: true }, size: { type: Number, default: 18 } });
const paths = {
  download: 'M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4',
  upload: 'M12 16V4m-5 5 5-5 5 5M5 16v4h14v-4',
  undo: 'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 6 6v3',
  redo: 'm15 5 5 5-5 5m5-5H10a6 6 0 0 0-6 6v3',
  check: 'm4 12 5 5L20 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  close: 'm6 6 12 12M6 18 18 6',
  link: 'M9 7H5v10h4m6-10h4v10h-4M8 12h8m-3-3 3 3-3 3',
  trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  search: 'm15 15 5 5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  chevron: 'm9 5 7 7-7 7',
  menu: 'M4 6h16M4 12h16M4 18h16',
  cursor: 'm5 3 14 10-7 1-3 7-4-18',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18',
  info: 'M12 10v7m0-11v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.info" /></svg></template>
