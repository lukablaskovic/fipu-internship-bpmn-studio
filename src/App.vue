<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import BpmnDiagram from '../packages/bpmn/BpmnDiagram.vue';
import { parseModel, serializeModel, updateElement, moveElement, addNode, addFlow, removeElement, validateModel, TYPE_LABELS } from '../packages/bpmn/model.js';
import Icon from './Icon.vue';
import { Primitive, Label, TooltipProvider, TabsRoot, TabsList, TabsTrigger, TabsContent, ToolbarRoot, ToolbarButton, ToolbarSeparator, Toggle, PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent, PopoverClose, CollapsibleRoot, CollapsibleTrigger, CollapsibleContent } from 'reka-ui';
import StudioButton from './components/StudioButton.vue';
import StudioSelect from './components/StudioSelect.vue';
import StudioConfirm from './components/StudioConfirm.vue';
import StudioPanel from './components/StudioPanel.vue';

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
const confirmation = ref(null);
const media = window.matchMedia('(max-width: 1000px)');
const compact = ref(media.matches);
const resizeWorkspace = () => { compact.value = media.matches; };
const ask = (...args) => confirmation.value.ask(...args);
const connecting = ref(false);
const connectFrom = ref('');
const catalog = ref([]);
const history = ref([]);
const future = ref([]);
const exportedXml = ref('');
const savedXml = ref('');
const sourceRevision = ref('');
const saving = ref(false);
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
  ['parallelGateway', 'Paralelno grananje', 'parallel'], ['intermediateCatchEvent', 'Međudogađaj poruke', 'start'], ['startEvent', 'Početni događaj', 'start'], ['endEvent', 'Završni događaj', 'end'],
];
const currentXml = computed(() => model.value ? serializeModel(model.value) : '');
const selected = computed(() => [...(model.value?.nodes || []), ...(model.value?.flows || [])].find(n => n.id === selectedId.value));
const issues = computed(() => model.value ? validateModel(model.value, catalog.value) : []);
const errors = computed(() => issues.value.filter(i => i.severity === 'error'));
const filteredNodes = computed(() => (model.value?.nodes || []).filter(n => `${n.name} ${n.id} ${n.type}`.toLocaleLowerCase('hr').includes(search.value.toLocaleLowerCase('hr'))));
const inspectorDirty = computed(() => JSON.stringify(inspector.value) !== inspectorBaseline.value);
const unsaved = computed(() => !!model.value && (currentXml.value !== savedXml.value || inspectorDirty.value));
const selectedConnector = computed(() => catalog.value.find(c => c.id === inspector.value.connector?.id));
const json = value => JSON.stringify(value || {}, null, 2);
const typeName = type => TYPE_LABELS[type] || type;
const storageKey = () => `fipu-bpmn-studio:v1:${activeModel.value}`;
function readDraft(key) {
  try { return localStorage.getItem(key); }
  catch { draftStored.value = false; return null; }
}
function persist(saved = savedXml.value) {
  try {
    const draft = { xml: currentXml.value, name: importedName.value, exportedXml: exportedXml.value, savedXml: saved, baseRevision: sourceRevision.value };
    localStorage.setItem('fipu-bpmn-studio:active', activeModel.value);
    localStorage.setItem(storageKey(), JSON.stringify(draft));
    if (activeModel.value === 'import') importedDraft.value = draft;
    draftStored.value = true;
    return true;
  }
  catch { draftStored.value = false; notice.value = 'Preglednik ne može spremiti skicu. Izvezite BPMN prije zatvaranja.'; return false; }
}
async function saveModel() {
  if (!model.value || loading.value || saving.value || (inspectorDirty.value && !applyInspector())) return false;
  resetInspector();
  const xml = currentXml.value;
  saving.value = true;
  try {
    if (activeModel.value !== 'import') {
      if (!sourceRevision.value) throw new Error('Skica nema aktualnu reviziju izvornog modela. Izvezite je i ponovno učitajte model.');
      const response = await fetch(`/api/models/strucna_praksa_${activeModel.value}.bpmn`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Praksa-Editor': '1' },
        body: JSON.stringify({ xml, expectedRevision: sourceRevision.value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Spremanje modela nije uspjelo.');
      sourceRevision.value = result.revision;
    } else if (!persist(xml)) return false;
    savedXml.value = xml;
    persist(); error.value = '';
    notice.value = activeModel.value === 'import' ? 'Uvezena skica je spremljena u ovom pregledniku.' : 'Izvorna BPMN datoteka je spremljena. Engine koristi izmjene za nove instance.';
    return !unsaved.value;
  } catch (e) { error.value = e.message || 'Spremanje modela nije uspjelo.'; return false; }
  finally { saving.value = false; }
}
function resetInspector() {
  const element = selected.value;
  inspector.value = element ? {
    name: element.name || '', documentation: element.documentation || '', condition: element.condition || '', laneId: element.laneId || '', default: element.default || '',
    termination: element.terminate ? 'terminate' : 'normal', outcome: element.outcome,
    connector: { id: element.connector?.id || 'baserow', method: element.connector?.method || 'POST', url: element.connector?.url || '' },
    parameters: json(element.connector?.parameters), inputs: json(element.inputs), outputs: json(element.outputs),
    formFields: (element.formFields || []).map(f => ({ ...f, propertiesText: json(f.properties), validationText: json(f.validation) })),
  } : {};
  inspectorBaseline.value = JSON.stringify(inspector.value);
}
watch([selectedId, model], resetInspector);
async function leaveInspector() {
  return !inspectorDirty.value || await ask('Svojstva još nisu primijenjena. Odbaciti te izmjene?', 'Odbaci izmjene');
}
async function leaveModel() {
  if (saving.value) return false;
  if (!unsaved.value) return true;
  const choice = await ask('Model ima nespremljene izmjene. Spremite ih prije nastavka ili ih odbacite.', 'Odbaci izmjene', 'Spremi i nastavi');
  if (choice === 'save') return saveModel();
  if (!choice) return false;
  model.value = parseModel(savedXml.value);
  if (!selected.value) selectedId.value = '';
  resetInspector(); history.value = []; future.value = [];
  persist();
  return true;
}
async function refreshPage() { if (await leaveModel()) window.location.reload(); }
function compactWorkspace() { return compact.value; }
function restorePanelFocus() { if (!paletteVisible.value && !inspectorVisible.value) libraryOpener.value?.focus(); }
function openInspector() {
  inspectorVisible.value = true;
  paletteVisible.value = false;
}
function closeInspector() {
  inspectorVisible.value = false;
}
function closeLibrary() {
  paletteVisible.value = false;
}
function toggleLibrary() {
  if (paletteVisible.value) { closeLibrary(); return; }
  paletteVisible.value = true;
  if (compactWorkspace()) inspectorVisible.value = false;
}
async function select(id) {
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
  if (id !== selectedId.value && !(await leaveInspector())) return;
  selectedId.value = id;
  openInspector();
  return true;
}
async function selectFromList(id) { if (await select(id)) diagram.value?.focus(id); }
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
    if (selected.value.type === 'endEvent') { patch.terminate = value.termination === 'terminate'; patch.outcome = patch.terminate ? value.outcome : 'finished'; }
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
  if (model.value && !(await leaveModel())) return;
  const version = ++loadVersion;
  loading.value = true; error.value = '';
  try {
    const response = await fetch(`/api/models/strucna_praksa_${key}.bpmn`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Model nije dostupan. Provjerite BPMN_MODELS_DIR na Studio poslužitelju.');
    const { xml, revision } = await response.json();
    if (version !== loadVersion) return;
    const original = parseModel(xml);
    activeModel.value = key; importedName.value = '';
    exportedXml.value = serializeModel(original);
    sourceRevision.value = revision;
    savedXml.value = exportedXml.value;
    let draft;
    try { draft = JSON.parse(readDraft(storageKey()) || 'null'); }
    catch { notice.value = 'Spremljena skica nije čitljiva. Otvoren je izvorni model.'; }
    let restore = draft?.xml && (draft.baseRevision === revision || (!draft.baseRevision && draft.exportedXml === exportedXml.value));
    if (draft?.xml && !restore && draft.xml !== exportedXml.value && (!draft.baseRevision || draft.xml !== draft.savedXml)) {
      restore = await ask('Izvorni model je promijenjen. Otvoriti prethodnu lokalnu skicu za pregled i izvoz? Odustani otvara aktualni izvorni model.', 'Otvori lokalnu skicu');
      if (version !== loadVersion) return;
      if (restore) sourceRevision.value = draft.baseRevision || '';
    }
    try { model.value = restore ? parseModel(draft.xml) : original; }
    catch { model.value = original; notice.value = 'Skica sadrži neispravan XML. Otvoren je izvorni model.'; }
    selectedId.value = ''; history.value = []; future.value = []; connecting.value = false; connectFrom.value = '';
    showIssues.value = false;
    try { localStorage.setItem('fipu-bpmn-studio:active', key); } catch { draftStored.value = false; }
    requestAnimationFrame(() => diagram.value?.fit());
  } catch (e) { error.value = e.message; }
  finally { if (version === loadVersion) loading.value = false; }
}
async function restoreImport() {
  if (!importedDraft.value || (model.value && !(await leaveModel()))) return;
  try {
    const draft = importedDraft.value;
    const parsed = parseModel(draft.xml);
    const saved = draft.savedXml ? serializeModel(parseModel(draft.savedXml)) : serializeModel(parsed);
    ++loadVersion; sourceRevision.value = ''; activeModel.value = 'import'; importedName.value = draft.name || 'model.bpmn';
    model.value = parsed; exportedXml.value = draft.exportedXml || draft.xml;
    savedXml.value = saved;
    selectedId.value = ''; history.value = []; future.value = []; connecting.value = false; connectFrom.value = '';
    loading.value = false; error.value = ''; showIssues.value = false; persist();
    requestAnimationFrame(() => diagram.value?.fit());
  } catch (e) { error.value = `Spremljena uvezena skica nije čitljiva: ${e.message}`; loading.value = false; }
}
async function importFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !(await leaveModel())) return;
  if (file.size > 2 * 1024 * 1024) { error.value = 'Datoteka je prevelika. Najveća dopuštena veličina je 2 MB.'; return; }
  if (importedDraft.value && !(await ask('Zamijeniti prethodnu uvezenu skicu? Odaberite Odustani pa otvorite i izvezite skicu ako je želite zadržati.', 'Zamijeni'))) return;
  try {
    const imported = parseModel(await file.text());
    ++loadVersion;
    activeModel.value = 'import'; sourceRevision.value = ''; importedName.value = file.name;
    model.value = imported; exportedXml.value = currentXml.value; savedXml.value = currentXml.value;
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
async function undo() {
  if (!history.value.length || !(await leaveInspector())) return;
  future.value.push(currentXml.value); model.value = parseModel(history.value.pop());
  if (!selected.value) selectedId.value = '';
  persist();
}
async function redo() {
  if (!future.value.length || !(await leaveInspector())) return;
  history.value.push(currentXml.value); model.value = parseModel(future.value.pop()); persist();
}
async function add(type) {
  if (!(await leaveInspector())) return;
  const lane = model.value.lanes.find(n => n.id === selected.value?.laneId) || model.value.lanes.find(n => /student/i.test(n.id)) || model.value.lanes[0];
  const p = diagram.value?.center() || { x: 400, y: 300 };
  const x = lane ? Math.max(lane.x + 60, Math.min(p.x, lane.x + lane.width - 130)) : p.x;
  const y = lane ? Math.max(lane.y + 20, Math.min(p.y, lane.y + lane.height - 100)) : p.y;
  const ids = new Set(model.value.nodes.map(n => n.id));
  if (change(m => addNode(m, type, { x: Math.round(x), y: Math.round(y), laneId: lane?.id, name: palette.find(p => p[0] === type)?.[1] }), next => next.nodes.find(n => !ids.has(n.id)).id)) { openInspector(); diagram.value?.focus(selectedId.value); }
}
async function removeSelected() {
  if (!selected.value) return;
  const id = selectedId.value;
  if (!(await ask(`Obrisati „${selected.value.name || selected.value.id}” i pripadajuće veze?`, 'Obriši'))) return;
  if (change(m => removeElement(m, id))) { selectedId.value = ''; connecting.value = false; }
}
async function connect() {
  if (!(await leaveInspector())) return;
  connecting.value = !connecting.value;
  connectFrom.value = connecting.value && selected.value?.type !== 'sequenceFlow' ? selectedId.value : '';
  notice.value = connecting.value ? (connectFrom.value ? 'Odaberite odredišni element za Sequence Flow.' : 'Odaberite početni, zatim odredišni element.') : '';
}
async function moveNode(value) {
  if (!(await leaveInspector())) return;
  change(m => moveElement(m, value.id, value.x, value.y));
}
function chooseOperation(value) {
  const operation = selectedConnector.value?.operations?.[Number(value)];
  if (operation) { inspector.value.connector.method = operation.method; inspector.value.connector.url = operation.url; }
}
function addField() {
  const fields = inspector.value.formFields;
  let n = fields.length + 1;
  while (fields.some(f => f.id === `polje_${n}`)) n++;
  fields.push({ id: `polje_${n}`, type: 'string', label: '', propertiesText: '{}', validationText: '{}' });
}
function keyboard(event) {
  if (event.defaultPrevented || event.isComposing || event.repeat) return;
  const refresh = event.key === 'F5' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r');
  if (refresh && unsaved.value) { event.preventDefault(); refreshPage(); return; }
  if (document.querySelector('[role="alertdialog"], [role="listbox"]')) return;
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') { event.preventDefault(); saveModel(); return; }
  if (document.querySelector('[role="dialog"]')) return;
  const editable = event.target.closest('input, textarea, select, [contenteditable], [role=combobox]');
  if (!editable && selected.value && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && ['Delete', 'Backspace'].includes(event.key)) {
    event.preventDefault(); removeSelected(); return;
  }
  if (event.key === 'Escape') {
    connecting.value = false; connectFrom.value = ''; notice.value = '';
    if (compactWorkspace()) {
      if (inspectorVisible.value) closeInspector();
      else if (paletteVisible.value) closeLibrary();
    }
  }
  if (!editable && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  if (!editable && event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
}
// Browser toolbar refresh and tab closing cannot wait for a custom dialog.
function unload(event) { if (unsaved.value) { event.preventDefault(); event.returnValue = ''; } }
watch(unsaved, value => { value ? window.addEventListener('beforeunload', unload) : window.removeEventListener('beforeunload', unload); });
onMounted(async () => {
  media.addEventListener('change', resizeWorkspace);
  window.addEventListener('keydown', keyboard);
  try { const response = await fetch('/connectors.json'); if (!response.ok) throw new Error(); catalog.value = (await response.json()).connectors; }
  catch { notice.value = 'Katalog konektora nije dostupan. Ponovno sinkronizirajte datoteke aplikacije.'; }
  try { importedDraft.value = JSON.parse(readDraft('fipu-bpmn-studio:v1:import') || 'null'); } catch { /* Invalid drafts remain on disk until explicitly replaced. */ }
  const active = readDraft('fipu-bpmn-studio:active');
  if (active === 'import' && importedDraft.value) restoreImport();
  else await loadModel(active === 'B' ? 'B' : 'A');
});
onBeforeUnmount(() => { media.removeEventListener('change', resizeWorkspace); window.removeEventListener('keydown', keyboard); window.removeEventListener('beforeunload', unload); });
</script>

<template>
  <TooltipProvider :delay-duration="350"><TabsRoot :model-value="activeModel" activation-mode="manual" @update:model-value="key => key === 'import' ? restoreImport() : loadModel(key)" as-child><div class="studio">
    <header class="app-header">
      <a class="brand" href="/" aria-label="Praksa BPMN Studio"><Icon name="workflow" :size="30" /><span>Praksa <strong>BPMN Studio</strong></span></a>
    </header>
    <div class="workspace-bar">
      <TabsList class="model-tabs" aria-label="Modeli prakse"><TabsTrigger value="A">Model A <small>Dodjela zadatka</small></TabsTrigger><TabsTrigger value="B">Model B <small>Izravna prijava</small></TabsTrigger><TabsTrigger v-if="importedDraft" value="import" class="import-tab">Uvezena skica<small>{{ importedDraft.name }}</small></TabsTrigger></TabsList>
      <div class="file-actions"><span v-if="model" class="draft-status" role="status">{{ unsaved ? 'Nespremljene izmjene' : 'Spremljeno' }}</span><Primitive as-child><input ref="importInput" type="file" accept=".bpmn,.xml,application/xml,text/xml" hidden @change="importFile"></Primitive><StudioButton @click="importInput.click()"><Icon name="upload" /> Uvezi</StudioButton><StudioButton :disabled="!model || loading" @click="download"><Icon name="download" /> Izvezi BPMN</StudioButton><StudioButton class="primary" :disabled="!model || loading || (!unsaved && (activeModel !== 'import' || draftStored)) || saving" :title="activeModel === 'import' ? 'Spremi skicu u preglednik (Ctrl/⌘ S)' : 'Spremi izvornu datoteku (Ctrl/⌘ S)'" aria-keyshortcuts="Control+s Meta+s" @click="saveModel"><Icon name="save" /> {{ saving ? 'Spremanje…' : activeModel === 'import' ? 'Spremi skicu' : 'Spremi' }}</StudioButton></div>
    </div>
    <div v-if="error" class="message error" role="alert"><Icon name="info" /><span>{{ error }}</span><StudioButton aria-label="Zatvori pogrešku" @click="error = ''"><Icon name="close" /></StudioButton></div>
    <div v-if="notice" class="message notice" role="status"><Icon name="info" /><span>{{ notice }}</span><StudioButton aria-label="Zatvori obavijest" @click="notice = ''"><Icon name="close" /></StudioButton></div>
    <TabsContent :value="activeModel" class="editor" :class="{ 'show-palette': paletteVisible, 'show-inspector': inspectorVisible && selected }">
      <StudioPanel :compact="compact" v-model:open="paletteVisible" title="Elementi procesa" close-label="Zatvori elemente" side="left" panel-class="library-panel" @closed="restorePanelFocus">
        <div class="palette"><StudioButton v-for="[type, label, icon] in palette" :key="type" :disabled="!model || loading" :title="typeName(type)" @click="add(type)"><span class="palette-symbol" :class="icon"><Icon v-if="!['task', 'start', 'end'].includes(icon)" :name="icon" :size="16" /></span><span>{{ label }}<small>{{ typeName(type) }}</small></span><Icon name="plus" :size="14" /></StudioButton></div>
        <div class="list-heading"><h2>Pregled modela</h2><span>{{ model?.nodes.length || 0 }}</span></div>
        <Label class="search-field"><Icon name="search" :size="16" /><Primitive as-child><input v-model="search" aria-label="Pretraži elemente" placeholder="Pronađi zadatak…"></Primitive></Label>
        <div class="element-list"><StudioButton v-for="node in filteredNodes" :key="node.id" :class="{ active: selectedId === node.id }" @click="selectFromList(node.id)"><span class="node-dot" :class="node.type"></span><span>{{ node.name || node.id }}<small>{{ typeName(node.type) }}</small></span></StudioButton><p v-if="model && !filteredNodes.length" class="empty-search">Nema pronađenih elemenata.</p></div>
      </StudioPanel>
      <main class="canvas-panel" aria-label="Radna površina">
        <PopoverRoot v-model:open="showIssues"><ToolbarRoot class="canvas-toolbar" aria-label="Uređivanje modela"><div class="toolbar-group"><div class="canvas-title"><h1>{{ activeModel === 'import' ? importedName.replace(/\.(xml|bpmn)$/i, '') : `Stručna praksa · Model ${activeModel}` }}</h1></div><ToolbarButton v-if="compact" as-child><StudioButton ref="libraryOpener" class="icon-button mobile-only" aria-label="Otvori elemente" :aria-expanded="paletteVisible" @click="toggleLibrary"><Icon name="menu" /></StudioButton></ToolbarButton><ToolbarButton as-child :disabled="!history.length"><StudioButton class="icon-button" :disabled="!history.length" aria-label="Poništi izmjenu" title="Poništi (Ctrl/⌘ Z)" @click="undo"><Icon name="undo" /></StudioButton></ToolbarButton><ToolbarButton as-child :disabled="!future.length"><StudioButton class="icon-button" :disabled="!future.length" aria-label="Ponovi izmjenu" title="Ponovi (Ctrl/⌘ Shift Z)" @click="redo"><Icon name="redo" /></StudioButton></ToolbarButton><ToolbarSeparator class="toolbar-divider" /><ToolbarButton as-child><Toggle :model-value="connecting" :disabled="!model" @update:model-value="connect" as-child><StudioButton :class="{ pressed: connecting }"><Icon name="link" /><span>Poveži</span></StudioButton></Toggle></ToolbarButton></div><PopoverTrigger as-child><ToolbarButton as-child><StudioButton class="validate-button" :class="{ 'has-errors': errors.length }" :disabled="!model" ><Icon :name="errors.length ? 'info' : 'check'" /><span>Provjeri model</span><span v-if="errors.length" class="count">{{ errors.length }}</span></StudioButton></ToolbarButton></PopoverTrigger></ToolbarRoot><PopoverPortal><PopoverContent side="bottom" align="end" :side-offset="8" class="validation-panel"><div class="panel-heading"><h2>{{ errors.length ? `${errors.length} pogrešaka u modelu` : 'Provjera modela' }}</h2><PopoverClose as-child><StudioButton class="icon-button" aria-label="Zatvori provjeru"><Icon name="close" /></StudioButton></PopoverClose></div><p v-if="!issues.length" class="valid-result"><Icon name="check" /> Model je spreman za izvoz.</p><ul v-if="issues.length"><li v-for="(issue, index) in issues" :key="index" :class="issue.severity"><StudioButton @click="issue.id && selectFromList(issue.id)"><b>{{ issue.severity === 'error' ? 'Pogreška' : 'Napomena' }}</b> {{ issue.message }}<code v-if="issue.id">{{ issue.id }}</code></StudioButton></li></ul></PopoverContent></PopoverPortal></PopoverRoot>
        <div v-if="loading" class="canvas-empty" role="status">Učitavanje modela…</div>
        <BpmnDiagram v-else-if="model" ref="diagram" :model="model" :selected-id="selectedId" editable :connecting="connecting" @select="select" @move="moveNode" @background="async () => { if (!connecting && await leaveInspector()) selectedId = ''; }" />
        <div v-else class="canvas-empty">Model nije učitan.<StudioButton @click="loadModel('A')">Pokušaj ponovno</StudioButton></div>
        <div class="canvas-bottom"><span class="canvas-help">{{ connecting ? 'Odaberite elemente za povezivanje · Esc za prekid' : 'Povucite za pomicanje · Ctrl/⌘ + kotačić za zumiranje' }}</span><ToolbarRoot class="zoom-controls" aria-label="Prikaz dijagrama"><ToolbarButton as-child><StudioButton class="icon-button" aria-label="Umanji" @click="diagram?.zoomOut()"><Icon name="minus" /></StudioButton></ToolbarButton><ToolbarButton as-child><StudioButton class="icon-button" aria-label="Prikaži cijeli model" title="Prikaži cijeli model" @click="diagram?.fit()"><Icon name="fit" /></StudioButton></ToolbarButton><ToolbarButton as-child><StudioButton class="icon-button" aria-label="Uvećaj" @click="diagram?.zoomIn()"><Icon name="plus" /></StudioButton></ToolbarButton></ToolbarRoot></div>

      </main>
      <StudioPanel :compact="compact" :open="inspectorVisible && !!selected" @update:open="inspectorVisible = $event" title="Svojstva elementa" close-label="Zatvori svojstva" side="right" panel-class="inspector-panel" @closed="restorePanelFocus">
        <template v-if="selected">
          <div class="selection-summary"><span class="type-badge">{{ typeName(selected.type) }}</span><h3>{{ selected.name || selected.id }}</h3><code>{{ selected.id }}</code></div>
          <form class="inspector-form" @submit.prevent="applyInspector">
            <Label>Naziv<Primitive as-child><textarea v-model="inspector.name" rows="2" /></Primitive></Label>
            <StudioSelect v-if="selected.type !== 'sequenceFlow'" v-model="inspector.laneId" label="Sudionik / staza" :options="[{ value: '', label: 'Bez staze' }, ...model.lanes.map(lane => ({ value: lane.id, label: lane.name }))]" />
            <template v-if="selected.type === 'endEvent'">
              <StudioSelect v-model="inspector.termination" label="Završetak" :options="[{ value: 'normal', label: 'Završi ovu granu' }, { value: 'terminate', label: 'Prekini cijeli proces' }]" />
              <StudioSelect v-if="inspector.termination === 'terminate'" v-model="inspector.outcome" label="Ishod" :options="[{ value: 'finished', label: 'Uspješno završeno' }, { value: 'cancelled', label: 'Odustajanje' }]" />
            </template>
            <StudioSelect v-if="selected.type === 'exclusiveGateway'" v-model="inspector.default" label="Zadani tok" :options="[{ value: '', label: 'Bez zadanog toka' }, ...model.flows.filter(f => f.sourceRef === selected.id).map(flow => ({ value: flow.id, label: flow.name || flow.id }))]">Koristi se ako nijedan uvjet nije zadovoljen.</StudioSelect>
            <Label>Dokumentacija<Primitive as-child><textarea v-model="inspector.documentation" rows="3" placeholder="Opišite svrhu ovog koraka…" /></Primitive></Label>
            <template v-if="selected.type === 'sequenceFlow'"><div class="field-section"><h3>Uvjet prijelaza</h3><Label>Izraz<Primitive as-child><input v-model="inspector.condition" placeholder="kandidat_odobren:True"></Primitive><small>Format enginea: naziv_varijable:vrijednost. Prazno za bezuvjetni tok.</small></Label><dl class="connection-details"><dt>Izvor</dt><dd>{{ selected.sourceRef }}</dd><dt>Odredište</dt><dd>{{ selected.targetRef }}</dd></dl></div></template>
            <template v-if="['serviceTask', 'sendTask'].includes(selected.type)">
              <div class="field-section"><h3>Konektor</h3><StudioSelect v-model="inspector.connector.id" label="Servis" :options="[...catalog.map(c => ({ value: c.id, label: c.label })), ...(!selectedConnector ? [{ value: inspector.connector.id, label: inspector.connector.id }] : [])]" />
                <StudioSelect v-if="selectedConnector?.operations?.length" model-value="" @update:model-value="chooseOperation" label="Poznata operacija" placeholder="Odaberite operaciju…" :options="selectedConnector.operations.map((op, index) => ({ value: String(index), label: `${op.label} · ${op.method}` }))" />
                <div class="endpoint-row"><StudioSelect v-model="inspector.connector.method" label="Metoda" :options="['GET', 'POST', 'PATCH'].map(value => ({ value, label: value }))" /><Label>Putanja<Primitive as-child><input v-model="inspector.connector.url" placeholder="/student" spellcheck="false"></Primitive></Label></div>
                <Label>URL parametri <small>JSON objekt</small><Primitive as-child><textarea v-model="inspector.parameters" class="code-input" rows="4" spellcheck="false" /></Primitive></Label>
              </div><div class="field-section"><h3>Varijable</h3><Label>Ulazne varijable <small>JSON objekt; izrazi poput ${student_email}</small><Primitive as-child><textarea v-model="inspector.inputs" class="code-input" rows="7" spellcheck="false" /></Primitive></Label><Label>Izlazne varijable <small>Ključevi koje engine preuzima iz odgovora</small><Primitive as-child><textarea v-model="inspector.outputs" class="code-input" rows="4" spellcheck="false" /></Primitive></Label></div>
            </template>
            <div v-if="selected.type === 'userTask'" class="field-section"><div class="section-heading"><h3>Polja obrasca</h3><StudioButton type="button" class="small-button" @click="addField"><Icon name="plus" :size="14" /> Dodaj</StudioButton></div><p class="field-help">ID polja povezuje obrazac s varijablama procesa.</p><div v-for="(field, index) in inspector.formFields" :key="index" class="form-field-editor"><div class="form-field-title"><strong>Polje {{ index + 1 }}</strong><StudioButton type="button" class="icon-button" :aria-label="`Ukloni polje ${field.id}`" @click="inspector.formFields.splice(index, 1)"><Icon name="trash" :size="15" /></StudioButton></div><Label>ID<Primitive as-child><input v-model="field.id" spellcheck="false"></Primitive></Label><Label>Naziv<Primitive as-child><input v-model="field.label"></Primitive></Label><StudioSelect v-model="field.type" label="Vrsta" :options="[...new Set(['string', 'boolean', 'long', 'date', field.type])].map(value => ({ value, label: value }))" /><CollapsibleRoot v-slot="{ open }"><CollapsibleTrigger class="disclosure-trigger"><Icon :name="open ? 'minus' : 'plus'" :size="14" /> Svojstva i validacija</CollapsibleTrigger><CollapsibleContent><Label>Svojstva <small>JSON objekt</small><Primitive as-child><textarea v-model="field.propertiesText" class="code-input" rows="3" spellcheck="false" /></Primitive></Label><Label>Validacija <small>JSON objekt</small><Primitive as-child><textarea v-model="field.validationText" class="code-input" rows="3" spellcheck="false" /></Primitive></Label></CollapsibleContent></CollapsibleRoot></div></div>
            <div class="inspector-actions"><StudioButton class="primary" type="submit" :disabled="!inspectorDirty"><Icon name="check" /> Primijeni izmjene</StudioButton><StudioButton type="button" class="danger-button icon-button" aria-label="Obriši element" title="Obriši element (Delete / Backspace)" aria-keyshortcuts="Delete Backspace" @click="removeSelected"><Icon name="trash" /></StudioButton></div>
          </form><p class="contract-note">ID zadatka je trajan jer ga koristi aplikacija. Novi zadaci mogu zahtijevati novi obrazac ili mapiranje u aplikaciji.</p>
        </template>
        <div v-else class="inspector-empty"><h3>Odaberite element</h3><p>Odaberite zadatak ili vezu na dijagramu za uređivanje.</p></div>
      </StudioPanel>
    </TabsContent>
    <footer class="status-bar"><span>{{ model ? `${model.nodes.length} elemenata · ${model.flows.length} veza · ${model.lanes.length} staze` : 'Praksa BPMN Studio' }}</span></footer>
    <StudioConfirm ref="confirmation" />
  </div></TabsRoot></TooltipProvider>
</template>
