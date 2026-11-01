<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import BpmnDiagram from '../packages/bpmn/BpmnDiagram.vue';
import { parseModel, serializeModel, updateElement, moveElement, addNode, addFlow, removeElement, validateModel, TYPE_LABELS } from '../packages/bpmn/model.js';
import Icon from './Icon.vue';

const model = shallowRef(null);
const diagram = ref(null);
const selectedId = ref('');
const activeModel = ref('A');
const importedName = ref('');
const importedDraft = ref(null);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const search = ref('');
const paletteVisible = ref(false);
const inspectorVisible = ref(false);
const libraryOpener = ref(null);
const libraryHeading = ref(null);
const inspectorHeading = ref(null);
const connecting = ref(false);
const connectFrom = ref('');
const catalog = ref([]);
const history = ref([]);
const future = ref([]);
const exportedXml = ref('');
const draftStored = ref(true);
const importInput = ref(null);
const showIssues = ref(false);
const inspector = ref({});
const inspectorBaseline = ref('');
let loadVersion = 0;
const palette = [
  ['userTask', 'Korisnički zadatak', 'user'], ['serviceTask', 'Servisni zadatak', 'service'],
  ['sendTask', 'Zadatak slanja', 'send'], ['manualTask', 'Ručni zadatak', 'manual'],
  ['task', 'Zadatak', 'task'], ['exclusiveGateway', 'Isključivo grananje', 'exclusive'],
  ['parallelGateway', 'Paralelno grananje', 'parallel'], ['startEvent', 'Početni događaj', 'start'], ['endEvent', 'Završni događaj', 'end'],
];
const currentXml = computed(() => model.value ? serializeModel(model.value) : '');
const dirty = computed(() => currentXml.value !== exportedXml.value);
const selected = computed(() => [...(model.value?.nodes || []), ...(model.value?.flows || [])].find(n => n.id === selectedId.value));
const issues = computed(() => model.value ? validateModel(model.value, catalog.value) : []);
const errors = computed(() => issues.value.filter(i => i.severity === 'error'));
const filteredNodes = computed(() => (model.value?.nodes || []).filter(n => `${n.name} ${n.id} ${n.type}`.toLocaleLowerCase('hr').includes(search.value.toLocaleLowerCase('hr'))));
const inspectorDirty = computed(() => JSON.stringify(inspector.value) !== inspectorBaseline.value);
const selectedConnector = computed(() => catalog.value.find(c => c.id === inspector.value.connector?.id));
const json = value => JSON.stringify(value || {}, null, 2);
const typeName = type => TYPE_LABELS[type] || type;
const storageKey = () => `fipu-bpmn-studio:v1:${activeModel.value}`;
function readDraft(key) {
  try { return localStorage.getItem(key); }
  catch { draftStored.value = false; return null; }
}
function persist() {
  try {
    const draft = { xml: currentXml.value, name: importedName.value, exportedXml: exportedXml.value };
    localStorage.setItem(storageKey(), JSON.stringify(draft));
    localStorage.setItem('fipu-bpmn-studio:active', activeModel.value);
    if (activeModel.value === 'import') importedDraft.value = draft;
    draftStored.value = true;
  }
  catch { draftStored.value = false; notice.value = 'Preglednik ne može spremiti skicu. Izvezite BPMN prije zatvaranja.'; }
}
function resetInspector() {
  const element = selected.value;
  inspector.value = element ? {
    name: element.name || '', documentation: element.documentation || '', condition: element.condition || '', laneId: element.laneId || '', default: element.default || '',
    connector: { id: element.connector?.id || 'baserow', method: element.connector?.method || 'POST', url: element.connector?.url || '' },
    parameters: json(element.connector?.parameters), inputs: json(element.inputs), outputs: json(element.outputs),
    formFields: (element.formFields || []).map(f => ({ ...f, propertiesText: json(f.properties), validationText: json(f.validation) })),
  } : {};
  inspectorBaseline.value = JSON.stringify(inspector.value);
}
watch([selectedId, model], resetInspector);
function leaveInspector() {
  return !inspectorDirty.value || window.confirm('Svojstva još nisu primijenjena. Odbaciti te izmjene?');
}
function leaveModel() {
  if (!leaveInspector()) return false;
  return !(dirty.value && !draftStored.value) || window.confirm('Skica nije spremljena u pregledniku. Nastaviti bez spremanja? Odaberite Odustani i izvezite BPMN kako biste sačuvali izmjene.');
}
function compactWorkspace() { return window.matchMedia('(max-width: 1000px)').matches; }
function openInspector() {
  inspectorVisible.value = true;
  paletteVisible.value = false;
  if (compactWorkspace()) nextTick(() => inspectorHeading.value?.focus());
}
function closeInspector() {
  inspectorVisible.value = false;
  if (compactWorkspace()) nextTick(() => libraryOpener.value?.focus());
}
function closeLibrary() {
  paletteVisible.value = false;
  if (compactWorkspace()) nextTick(() => libraryOpener.value?.focus());
}
function toggleLibrary() {
  if (paletteVisible.value) { closeLibrary(); return; }
  paletteVisible.value = true;
  if (compactWorkspace()) { inspectorVisible.value = false; nextTick(() => libraryHeading.value?.focus()); }
}
function select(id) {
  if (connecting.value) {
    const node = model.value.nodes.find(n => n.id === id);
    if (!node) return;
    if (!connectFrom.value) { connectFrom.value = id; selectedId.value = id; closeLibrary(); notice.value = 'Odaberite odredišni element za Sequence Flow.'; return true; }
    const source = connectFrom.value;
    connecting.value = false; connectFrom.value = '';
    const changed = change(m => addFlow(m, source, id));
    closeLibrary();
    return changed;
  }
  if (id !== selectedId.value && !leaveInspector()) return;
  selectedId.value = id;
  openInspector();
  return true;
}
function selectFromList(id) { if (select(id)) diagram.value?.focus(id); }
function change(operation, selection) {
  if (!model.value) return false;
  try {
    const previous = currentXml.value;
    const next = operation(parseModel(previous));
    history.value.push(previous);
    if (history.value.length > 50) history.value.shift();
    future.value = [];
    model.value = next;
    if (selection) selectedId.value = selection(next);
    error.value = ''; notice.value = '';
    persist();
    return true;
  } catch (e) { error.value = e.message || 'Izmjena nije uspjela.'; return false; }
}
function objectValue(text, label) {
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error(`${label}: upišite valjani JSON objekt. Provjerite navodnike i zareze.`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: očekuje se objekt s nazivima polja i vrijednostima.`);
  return value;
}
function applyInspector() {
  if (!selected.value) return true;
  try {
    const value = inspector.value;
    const patch = { name: value.name, documentation: value.documentation };
    if (selected.value.type === 'exclusiveGateway') patch.default = value.default;
    if (selected.value.type === 'sequenceFlow') patch.condition = value.condition;
    else patch.laneId = value.laneId;
    if (['serviceTask', 'sendTask'].includes(selected.value.type)) {
      patch.connector = { ...value.connector, parameters: objectValue(value.parameters, 'URL parametri') };
      patch.inputs = objectValue(value.inputs, 'Ulazne varijable');
      patch.outputs = objectValue(value.outputs, 'Izlazne varijable');
    }
    if (selected.value.type === 'userTask') patch.formFields = value.formFields.map(({ propertiesText, validationText, ...f }) => ({ ...f, properties: objectValue(propertiesText, `Svojstva polja ${f.id}`), validation: objectValue(validationText, `Validacija polja ${f.id}`) }));
    return change(m => updateElement(m, selectedId.value, patch));
  } catch (e) { error.value = e.message; return false; }
}
async function loadModel(key) {
  if (model.value && !leaveModel()) return;
  const version = ++loadVersion;
  loading.value = true; error.value = '';
  try {
    const response = await fetch(`/models/strucna_praksa_${key}.bpmn`);
    if (!response.ok) throw new Error('Model nije dostupan. Pokrenite sinkronizaciju modela i pokušajte ponovno.');
    const xml = await response.text();
    if (version !== loadVersion) return;
    const original = parseModel(xml);
    activeModel.value = key; importedName.value = '';
    exportedXml.value = serializeModel(original);
    let draft;
    try { draft = JSON.parse(readDraft(storageKey()) || 'null'); }
    catch { notice.value = 'Spremljena skica nije čitljiva. Otvoren je izvorni model.'; }
    try { model.value = draft?.xml ? parseModel(draft.xml) : original; }
    catch { model.value = original; notice.value = 'Skica sadrži neispravan XML. Otvoren je izvorni model.'; }
    selectedId.value = ''; history.value = []; future.value = []; connecting.value = false; connectFrom.value = '';
    showIssues.value = false;
    try { localStorage.setItem('fipu-bpmn-studio:active', key); } catch { draftStored.value = false; }
    requestAnimationFrame(() => diagram.value?.fit());
  } catch (e) { error.value = e.message; }
  finally { if (version === loadVersion) loading.value = false; }
}
function restoreImport() {
  if (!importedDraft.value || (model.value && !leaveModel())) return;
  try {
    const draft = importedDraft.value;
    const parsed = parseModel(draft.xml);
    ++loadVersion; activeModel.value = 'import'; importedName.value = draft.name || 'model.bpmn';
    model.value = parsed; exportedXml.value = draft.exportedXml || draft.xml;
    selectedId.value = ''; history.value = []; future.value = []; connecting.value = false; connectFrom.value = '';
    loading.value = false; error.value = ''; showIssues.value = false; persist();
    requestAnimationFrame(() => diagram.value?.fit());
  } catch (e) { error.value = `Spremljena uvezena skica nije čitljiva: ${e.message}`; loading.value = false; }
}
async function importFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !leaveModel()) return;
  if (file.size > 2 * 1024 * 1024) { error.value = 'Datoteka je prevelika. Najveća dopuštena veličina je 2 MB.'; return; }
  if (importedDraft.value && !window.confirm('Zamijeniti prethodnu uvezenu skicu? Odaberite Odustani pa otvorite i izvezite skicu ako je želite zadržati.')) return;
  try {
    const imported = parseModel(await file.text());
    ++loadVersion;
    activeModel.value = 'import'; importedName.value = file.name;
    model.value = imported; exportedXml.value = currentXml.value;
    selectedId.value = ''; history.value = []; future.value = []; connecting.value = false; connectFrom.value = ''; showIssues.value = true;
    loading.value = false; error.value = ''; notice.value = `Otvoreno: ${file.name}`;
    persist(); requestAnimationFrame(() => diagram.value?.fit());
  } catch (e) { error.value = `Uvoz nije uspio: ${e.message}`; }
}
function download() {
  if (inspectorDirty.value && !applyInspector()) return;
  showIssues.value = true;
  if (errors.value.length) { error.value = 'Izvoz je zaustavljen. Ispravite pogreške u provjeri modela.'; return; }
  const blob = new Blob([currentXml.value], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = activeModel.value === 'import' ? (importedName.value.replace(/\.(xml|bpmn)$/i, '') + '.bpmn') : `strucna_praksa_${activeModel.value}.bpmn`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  exportedXml.value = currentXml.value; persist(); error.value = ''; notice.value = 'BPMN datoteka je izvezena.';
}
function undo() {
  if (!history.value.length || !leaveInspector()) return;
  future.value.push(currentXml.value); model.value = parseModel(history.value.pop());
  if (!selected.value) selectedId.value = '';
  persist();
}
function redo() {
  if (!future.value.length || !leaveInspector()) return;
  history.value.push(currentXml.value); model.value = parseModel(future.value.pop()); persist();
}
function add(type) {
  if (!leaveInspector()) return;
  const lane = model.value.lanes.find(n => n.id === selected.value?.laneId) || model.value.lanes.find(n => /student/i.test(n.id)) || model.value.lanes[0];
  const p = diagram.value?.center() || { x: 400, y: 300 };
  const x = lane ? Math.max(lane.x + 60, Math.min(p.x, lane.x + lane.width - 130)) : p.x;
  const y = lane ? Math.max(lane.y + 20, Math.min(p.y, lane.y + lane.height - 100)) : p.y;
  const ids = new Set(model.value.nodes.map(n => n.id));
  if (change(m => addNode(m, type, { x: Math.round(x), y: Math.round(y), laneId: lane?.id, name: palette.find(p => p[0] === type)?.[1] }), next => next.nodes.find(n => !ids.has(n.id)).id)) { openInspector(); diagram.value?.focus(selectedId.value); }
}
function removeSelected() {
  if (!selected.value) return;
  if (!window.confirm(`Obrisati „${selected.value.name || selected.value.id}” i pripadajuće veze?`)) return;
  change(m => removeElement(m, selectedId.value)); selectedId.value = ''; connecting.value = false;
}
function connect() {
  if (!leaveInspector()) return;
  connecting.value = !connecting.value;
  connectFrom.value = connecting.value && selected.value?.type !== 'sequenceFlow' ? selectedId.value : '';
  notice.value = connecting.value ? (connectFrom.value ? 'Odaberite odredišni element za Sequence Flow.' : 'Odaberite početni, zatim odredišni element.') : '';
}
function moveNode(value) {
  if (!leaveInspector()) return;
  change(m => moveElement(m, value.id, value.x, value.y));
}
function chooseOperation(event) {
  const operation = selectedConnector.value?.operations?.[Number(event.target.value)];
  if (operation) { inspector.value.connector.method = operation.method; inspector.value.connector.url = operation.url; }
  event.target.value = '';
}
function addField() {
  const fields = inspector.value.formFields;
  let n = fields.length + 1;
  while (fields.some(f => f.id === `polje_${n}`)) n++;
  fields.push({ id: `polje_${n}`, type: 'string', label: '', propertiesText: '{}', validationText: '{}' });
}
function keyboard(event) {
  const editable = event.target.closest('input, textarea, select, [contenteditable]');
  if (event.key === 'Escape') {
    connecting.value = false; connectFrom.value = ''; notice.value = '';
    if (compactWorkspace()) {
      if (inspectorVisible.value) closeInspector();
      else if (paletteVisible.value) closeLibrary();
    }
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); download(); }
  if (!editable && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
}
function unload(event) { if ((dirty.value && !draftStored.value) || inspectorDirty.value) { event.preventDefault(); event.returnValue = ''; } }
onMounted(async () => {
  window.addEventListener('keydown', keyboard); window.addEventListener('beforeunload', unload);
  try { const response = await fetch('/connectors.json'); if (!response.ok) throw new Error(); catalog.value = (await response.json()).connectors; }
  catch { notice.value = 'Katalog konektora nije dostupan. Ponovno sinkronizirajte datoteke aplikacije.'; }
  try { importedDraft.value = JSON.parse(readDraft('fipu-bpmn-studio:v1:import') || 'null'); } catch { /* Invalid drafts remain on disk until explicitly replaced. */ }
  const active = readDraft('fipu-bpmn-studio:active');
  if (active === 'import' && importedDraft.value) restoreImport();
  else await loadModel(active === 'B' ? 'B' : 'A');
});
onBeforeUnmount(() => { window.removeEventListener('keydown', keyboard); window.removeEventListener('beforeunload', unload); });
</script>

<template>
  <div class="studio">
    <header class="app-header">
      <a class="brand" href="/" aria-label="Praksa BPMN Studio"><Icon name="workflow" :size="30" /><span>Praksa <strong>BPMN Studio</strong></span></a>
    </header>
    <div class="workspace-bar">
      <nav class="model-tabs" aria-label="Modeli prakse"><button :class="{ active: activeModel === 'A' }" :aria-current="activeModel === 'A' ? 'page' : null" @click="loadModel('A')">Model A <small>Dodjela zadatka</small></button><button :class="{ active: activeModel === 'B' }" :aria-current="activeModel === 'B' ? 'page' : null" @click="loadModel('B')">Model B <small>Izravna prijava</small></button><button v-if="importedDraft" class="import-tab" :class="{ active: activeModel === 'import' }" :title="importedDraft.name" @click="restoreImport">Uvezena skica<small>{{ importedDraft.name }}</small></button></nav>
      <div class="file-actions"><span v-if="dirty" class="draft-status">{{ draftStored ? 'Skica spremljena u pregledniku' : 'Nespremljene promjene' }}</span><input ref="importInput" type="file" accept=".bpmn,.xml,application/xml,text/xml" hidden @change="importFile"><button @click="importInput.click()"><Icon name="upload" /> Uvezi</button><button class="primary" :disabled="!model || loading" @click="download"><Icon name="download" /> Izvezi BPMN</button></div>
    </div>
    <div v-if="error" class="message error" role="alert"><Icon name="info" /><span>{{ error }}</span><button aria-label="Zatvori pogrešku" @click="error = ''"><Icon name="close" /></button></div>
    <div v-if="notice" class="message notice" role="status"><Icon name="info" /><span>{{ notice }}</span><button aria-label="Zatvori obavijest" @click="notice = ''"><Icon name="close" /></button></div>
    <div class="editor" :class="{ 'show-palette': paletteVisible, 'show-inspector': inspectorVisible && selected }">
      <aside id="element-library" class="library-panel" aria-labelledby="library-heading">
        <div class="panel-heading"><h2 id="library-heading" ref="libraryHeading" tabindex="-1">Elementi procesa</h2><button class="mobile-only icon-button" aria-label="Zatvori elemente" @click="closeLibrary"><Icon name="close" /></button></div>
        <div class="palette"><button v-for="[type, label, icon] in palette" :key="type" :disabled="!model || loading" :title="typeName(type)" @click="add(type)"><span class="palette-symbol" :class="icon"><Icon v-if="!['task', 'start', 'end'].includes(icon)" :name="icon" :size="16" /></span><span>{{ label }}<small>{{ typeName(type) }}</small></span><Icon name="plus" :size="14" /></button></div>
        <div class="list-heading"><h2>Pregled modela</h2><span>{{ model?.nodes.length || 0 }}</span></div>
        <label class="search-field"><Icon name="search" :size="16" /><input v-model="search" aria-label="Pretraži elemente" placeholder="Pronađi zadatak…"></label>
        <div class="element-list"><button v-for="node in filteredNodes" :key="node.id" :class="{ active: selectedId === node.id }" @click="selectFromList(node.id)"><span class="node-dot" :class="node.type"></span><span>{{ node.name || node.id }}<small>{{ typeName(node.type) }}</small></span></button><p v-if="model && !filteredNodes.length" class="empty-search">Nema pronađenih elemenata.</p></div>
      </aside>
      <main class="canvas-panel" aria-label="Radna površina">
        <div class="canvas-toolbar"><div class="toolbar-group"><button ref="libraryOpener" class="icon-button mobile-only" aria-label="Otvori elemente" aria-controls="element-library" :aria-expanded="paletteVisible" @click="toggleLibrary"><Icon name="menu" /></button><button class="icon-button" :disabled="!history.length" aria-label="Poništi izmjenu" title="Poništi (Ctrl/⌘ Z)" @click="undo"><Icon name="undo" /></button><button class="icon-button" :disabled="!future.length" aria-label="Ponovi izmjenu" title="Ponovi (Ctrl/⌘ Shift Z)" @click="redo"><Icon name="redo" /></button><span class="toolbar-divider"></span><button :class="{ pressed: connecting }" :aria-pressed="connecting" :disabled="!model" @click="connect"><Icon name="link" /><span>Poveži</span></button></div><button class="validate-button" :class="{ 'has-errors': errors.length }" :disabled="!model" @click="showIssues = !showIssues"><Icon :name="errors.length ? 'info' : 'check'" /><span>Provjeri model</span><span v-if="errors.length" class="count">{{ errors.length }}</span></button></div>
        <div class="canvas-title"><h1>{{ activeModel === 'import' ? importedName.replace(/\.(xml|bpmn)$/i, '') : `Stručna praksa · Model ${activeModel}` }}</h1></div>
        <div v-if="loading" class="canvas-empty" role="status">Učitavanje modela…</div>
        <BpmnDiagram v-else-if="model" ref="diagram" :model="model" :selected-id="selectedId" editable :connecting="connecting" @select="select" @move="moveNode" @background="() => { if (!connecting && leaveInspector()) selectedId = ''; }" />
        <div v-else class="canvas-empty">Model nije učitan.<button @click="loadModel('A')">Pokušaj ponovno</button></div>
        <div class="canvas-bottom"><span class="canvas-help">{{ connecting ? 'Odaberite elemente za povezivanje · Esc za prekid' : 'Povucite za pomicanje · Ctrl/⌘ + kotačić za zumiranje' }}</span><div class="zoom-controls"><button class="icon-button" aria-label="Umanji" @click="diagram?.zoomOut()"><Icon name="minus" /></button><button class="icon-button" aria-label="Prikaži cijeli model" title="Prikaži cijeli model" @click="diagram?.fit()"><Icon name="fit" /></button><button class="icon-button" aria-label="Uvećaj" @click="diagram?.zoomIn()"><Icon name="plus" /></button></div></div>
        <section v-if="showIssues" class="validation-panel" aria-label="Provjera modela"><div class="panel-heading"><h2>{{ errors.length ? `${errors.length} pogrešaka u modelu` : 'Provjera modela' }}</h2><button class="icon-button" aria-label="Zatvori provjeru" @click="showIssues = false"><Icon name="close" /></button></div><p v-if="!issues.length" class="valid-result"><Icon name="check" /> Model je spreman za izvoz.</p><ul v-if="issues.length"><li v-for="(issue, index) in issues" :key="index" :class="issue.severity"><button @click="issue.id && selectFromList(issue.id)"><b>{{ issue.severity === 'error' ? 'Pogreška' : 'Napomena' }}</b> {{ issue.message }}<code v-if="issue.id">{{ issue.id }}</code></button></li></ul></section>
      </main>
      <aside class="inspector-panel" aria-labelledby="inspector-heading">
        <div class="panel-heading"><h2 id="inspector-heading" ref="inspectorHeading" tabindex="-1">Svojstva elementa</h2><button class="icon-button mobile-only" aria-label="Zatvori svojstva" @click="closeInspector"><Icon name="close" /></button></div>
        <template v-if="selected">
          <div class="selection-summary"><span class="type-badge">{{ typeName(selected.type) }}</span><h3>{{ selected.name || selected.id }}</h3><code>{{ selected.id }}</code></div>
          <form class="inspector-form" @submit.prevent="applyInspector">
            <label>Naziv<textarea v-model="inspector.name" rows="2" /></label>
            <label v-if="selected.type !== 'sequenceFlow'">Sudionik / staza<select v-model="inspector.laneId"><option value="">Bez staze</option><option v-for="lane in model.lanes" :key="lane.id" :value="lane.id">{{ lane.name }}</option></select></label>
            <label v-if="selected.type === 'exclusiveGateway'">Zadani tok<select v-model="inspector.default"><option value="">Bez zadanog toka</option><option v-for="flow in model.flows.filter(f => f.sourceRef === selected.id)" :key="flow.id" :value="flow.id">{{ flow.name || flow.id }}</option></select><small>Koristi se ako nijedan uvjet nije zadovoljen.</small></label>
            <label>Dokumentacija<textarea v-model="inspector.documentation" rows="3" placeholder="Opišite svrhu ovog koraka…" /></label>
            <template v-if="selected.type === 'sequenceFlow'"><div class="field-section"><h3>Uvjet prijelaza</h3><label>Izraz<input v-model="inspector.condition" placeholder="kandidat_odobren:True"><small>Format enginea: naziv_varijable:vrijednost. Prazno za bezuvjetni tok.</small></label><dl class="connection-details"><dt>Izvor</dt><dd>{{ selected.sourceRef }}</dd><dt>Odredište</dt><dd>{{ selected.targetRef }}</dd></dl></div></template>
            <template v-if="['serviceTask', 'sendTask'].includes(selected.type)">
              <div class="field-section"><h3>Konektor</h3><label>Servis<select v-model="inspector.connector.id"><option v-for="connector in catalog" :key="connector.id" :value="connector.id">{{ connector.label }}</option><option v-if="!catalog.some(c => c.id === inspector.connector.id)" :value="inspector.connector.id">{{ inspector.connector.id }}</option></select></label>
                <label v-if="selectedConnector?.operations?.length">Poznata operacija<select value="" @change="chooseOperation"><option value="">Odaberite operaciju…</option><option v-for="(op, index) in selectedConnector.operations" :key="`${op.method}${op.url}`" :value="index">{{ op.label }} · {{ op.method }}</option></select></label>
                <div class="endpoint-row"><label>Metoda<select v-model="inspector.connector.method"><option>GET</option><option>POST</option><option>PATCH</option></select></label><label>Putanja<input v-model="inspector.connector.url" placeholder="/student" spellcheck="false"></label></div>
                <label>URL parametri <small>JSON objekt</small><textarea v-model="inspector.parameters" class="code-input" rows="4" spellcheck="false" /></label>
              </div><div class="field-section"><h3>Varijable</h3><label>Ulazne varijable <small>JSON objekt; izrazi poput ${student_email}</small><textarea v-model="inspector.inputs" class="code-input" rows="7" spellcheck="false" /></label><label>Izlazne varijable <small>Ključevi koje engine preuzima iz odgovora</small><textarea v-model="inspector.outputs" class="code-input" rows="4" spellcheck="false" /></label></div>
            </template>
            <div v-if="selected.type === 'userTask'" class="field-section"><div class="section-heading"><h3>Polja obrasca</h3><button type="button" class="small-button" @click="addField"><Icon name="plus" :size="14" /> Dodaj</button></div><p class="field-help">ID polja povezuje obrazac s varijablama procesa.</p><div v-for="(field, index) in inspector.formFields" :key="index" class="form-field-editor"><div class="form-field-title"><strong>Polje {{ index + 1 }}</strong><button type="button" class="icon-button" :aria-label="`Ukloni polje ${field.id}`" @click="inspector.formFields.splice(index, 1)"><Icon name="trash" :size="15" /></button></div><label>ID<input v-model="field.id" spellcheck="false"></label><label>Naziv<input v-model="field.label"></label><label>Vrsta<select v-model="field.type"><option value="string">string</option><option value="boolean">boolean</option><option value="long">long</option><option value="date">date</option><option v-if="!['string','boolean','long','date'].includes(field.type)" :value="field.type">{{ field.type }}</option></select></label><details><summary>Svojstva i validacija</summary><label>Svojstva <small>JSON objekt</small><textarea v-model="field.propertiesText" class="code-input" rows="3" spellcheck="false" /></label><label>Validacija <small>JSON objekt</small><textarea v-model="field.validationText" class="code-input" rows="3" spellcheck="false" /></label></details></div></div>
            <div class="inspector-actions"><button class="primary" type="submit" :disabled="!inspectorDirty"><Icon name="check" /> Primijeni izmjene</button><button type="button" class="danger-button icon-button" aria-label="Obriši element" title="Obriši element" @click="removeSelected"><Icon name="trash" /></button></div>
          </form><p class="contract-note">ID zadatka je trajan jer ga koristi aplikacija. Novi zadaci mogu zahtijevati novi obrazac ili mapiranje u aplikaciji.</p>
        </template>
        <div v-else class="inspector-empty"><h3>Odaberite element</h3><p>Odaberite zadatak ili vezu na dijagramu za uređivanje.</p></div>
      </aside>
    </div>
    <footer class="status-bar"><span>{{ model ? `${model.nodes.length} elemenata · ${model.flows.length} veza · ${model.lanes.length} staze` : 'Praksa BPMN Studio' }}</span></footer>
  </div>
</template>
