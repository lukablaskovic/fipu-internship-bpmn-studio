<script setup>
import { ref } from 'vue';
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent, PopoverClose } from 'reka-ui';
import StudioButton from './StudioButton.vue';
import Icon from '../Icon.vue';

const props = defineProps({ modelKey: { type: String, required: true } });
const versions = ref([]);
const status = ref('');
const base = import.meta.env.BASE_URL;
async function load(open) {
  if (!open) return;
  versions.value = [];
  status.value = 'Učitavanje verzija…';
  try {
    const response = await fetch(base + 'api/models/strucna_praksa_' + props.modelKey + '.bpmn/history');
    if (!response.ok) throw new Error();
    versions.value = (await response.json()).versions;
    status.value = versions.value.length ? '' : 'Još nema prethodnih verzija.';
  } catch { status.value = 'Povijest nije dostupna. Ponovno otvorite popis za novi pokušaj.'; }
}
</script>

<template>
  <PopoverRoot @update:open="load">
    <PopoverTrigger as-child><StudioButton class="history-trigger">Povijest verzija</StudioButton></PopoverTrigger>
    <PopoverPortal><PopoverContent class="validation-panel version-history" align="end" :side-offset="8" aria-label="Povijest verzija">
      <div class="panel-heading"><h2>Povijest · Model {{ modelKey }}</h2><PopoverClose as-child><StudioButton class="icon-button" aria-label="Zatvori povijest"><Icon name="close" /></StudioButton></PopoverClose></div>
      <p role="status">{{ status || 'Odaberite verziju za pregled u novoj kartici.' }}</p>
      <ul v-if="versions.length"><li v-for="version in versions" :key="version"><a :href="base + 'admin/model/strucna_praksa_' + modelKey + '/' + version" target="_blank" rel="noopener">Verzija {{ version }}</a></li></ul>
    </PopoverContent></PopoverPortal>
  </PopoverRoot>
</template>
