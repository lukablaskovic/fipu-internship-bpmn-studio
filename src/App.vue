<script setup>
const baseUrl = import.meta.env.BASE_URL;
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import BpmnDiagram from '../packages/bpmn/BpmnDiagram.vue';
import { parseModel, serializeModel, updateElement, moveElement, moveLabel, reshapeFlow, addNode, addFlow, removeElement, validateModel, variantsFor, TYPE_LABELS } from '../packages/bpmn/model.js';
import Icon from './Icon.vue';
import ElementSymbol from './components/ElementSymbol.vue';
import { Primitive, Label, TooltipProvider, TabsRoot, TabsList, TabsTrigger, TabsContent, ToolbarRoot, ToolbarButton, ToolbarSeparator, Toggle, PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent, PopoverClose, CollapsibleRoot, CollapsibleTrigger, CollapsibleContent } from 'reka-ui';
import StudioButton from './components/StudioButton.vue';
import StudioSelect from './components/StudioSelect.vue';
import StudioConfirm from './components/StudioConfirm.vue';
import StudioHistory from './components/StudioHistory.vue';
import StudioPanel from './components/StudioPanel.vue';

const model = shallowRef(null);
const diagram = ref(null);
const selectedId = ref('');
const nameField = ref(null);
const activeModel = ref('A');
const importedName = ref('');
const importedDraft = ref(null);
const archived = shallowRef(null);
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
const deployedXml = ref('');
const processVersion = ref(null);
const sourceRevision = ref('');
const saving = ref(false);
const draftStored = ref(true);
const importInput = ref(null);
const showIssues = ref(false);
const inspector = ref({});
const inspectorBaseline = ref('');
let loadVersion = 0;
const palette = [
  ['userTask', 'Korisnički zadatak'], ['serviceTask', 'Servisni zadatak'],
  ['sendTask', 'Zadatak slanja'], ['manualTask', 'Ručni zadatak'],
  ['task', 'Zadatak'], ['exclusiveGateway', 'Isključivo grananje'],
  ['parallelGateway', 'Paralelno grananje'], ['intermediateCatchEvent', 'Primitak poruke'], ['timerCatch', 'Vremenski međudogađaj'], ['intermediateThrowEvent', 'Obični međudogađaj'], ['startEvent', 'Početni događaj'], ['endEvent', 'Završni događaj'],
];
const currentXml = computed(() => model.value ? serializeModel(model.value) : '');
const selected = computed(() => [...(model.value?.nodes || []), ...(model.value?.flows || []), ...(model.value?.messageFlows || [])].find(n => n.id === selectedId.value));
const issues = computed(() => model.value ? validateModel(model.value, catalog.value) : []);
const errors = computed(() => issues.value.filter(i => i.severity === 'error'));
const filteredNodes = computed(() => (model.value?.nodes || []).filter(n => `${n.name} ${n.id} ${n.type}`.toLocaleLowerCase('hr').includes(search.value.toLocaleLowerCase('hr'))));
const inspectorDirty = computed(() => JSON.stringify(inspector.value) !== inspectorBaseline.value);
const unsaved = computed(() => !!model.value && (currentXml.value !== savedXml.value || inspectorDirty.value));
const unpublished = computed(() => activeModel.value !== 'import' && (currentXml.value !== deployedXml.value || inspectorDirty.value));
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
    const draft = { xml: currentXml.value, name: importedName.value, exportedXml: exportedXml.value, savedXml: saved, unpublished: unpublished.value, baseRevision: sourceRevision.value };
    localStorage.setItem('fipu-bpmn-studio:active', activeModel.value);
    localStorage.setItem(storageKey(), JSON.stringify(draft));
    if (activeModel.value === 'import') importedDraft.value = draft;
    draftStored.value = true;
    return true;
  }
  catch { draftStored.value = false; notice.value = 'Preglednik ne može spremiti skicu. Izvezite BPMN prije zatvaranja.'; return false; }
}
function saveModel() {
  if (!model.value || loading.value || saving.value || (inspectorDirty.value && !applyInspector())) return false;
  resetInspector();
  if (!persist(currentXml.value)) return false;
  savedXml.value = currentXml.value;
  error.value = '';
  notice.value = 'Skica je spremljena u ovom pregledniku.';
  return true;
}
async function deployModel() {
  if (!unpublished.value || saving.value || loading.value || (inspectorDirty.value && !applyInspector())) return;
  resetInspector();
  const xml = currentXml.value;
  saving.value = true;
  try {
    if (!sourceRevision.value) throw new Error('Skica nema aktualnu reviziju izvornog modela. Izvezite je i ponovno učitajte model.');
    const response = await fetch(`${import.meta.env.BASE_URL}api/models/strucna_praksa_${activeModel.value}.bpmn`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Praksa-Editor': '1' },
      body: JSON.stringify({ xml, expectedRevision: sourceRevision.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Objava modela nije uspjela.');
    sourceRevision.value = result.revision;
    processVersion.value = result.version;
    const published = parseModel(xml);
    if (result.version) published.document.documentElement.setAttribute('processVersion', String(result.version));
    deployedXml.value = serializeModel(published);
    if (currentXml.value === xml && !inspectorDirty.value) model.value = published;
    savedXml.value = deployedXml.value;
    error.value = '';
    notice.value = 'Model je objavljen za nove instance.';
    persist();
    updateModelLink();
  } catch (e) { error.value = e.message || 'Objava modela nije uspjela.'; }
  finally { saving.value = false; }
}
function resetInspector() {
  const element = selected.value;
  inspector.value = element ? {
    name: element.name || '', documentation: element.documentation || '', condition: element.condition || '', laneId: element.laneId || '', default: element.default || '',
    variant: element.timerDuration != null ? 'timerCatch' : element.type, timerDuration: element.timerDuration ?? 'PT15M', termination: element.terminate ? 'terminate' : 'normal', outcome: element.outcome,
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
    if (id === connectFrom.value) return;
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
async function editName(id) {
  if (selectedId.value !== id || connecting.value) return;
  openInspector();
  await nextTick();
  nameField.value?.focus();
  nameField.value?.select();
}
function selectFieldText(event) {
  if (event.detail !== 3) return;
  if (event.target.matches('textarea, input:not([type]), input[type="text"]')) event.target.select();
}
async function selectFromList(id) {
  const focusNode = !connecting.value;
  if (await select(id) && focusNode) diagram.value?.focus(id);
}
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
    if (variantsFor(selected.value.type).length) patch.variant = value.variant;
    if (value.variant === 'timerCatch') patch.timerDuration = value.timerDuration;
    if (value.variant === 'endEvent') { patch.terminate = value.termination === 'terminate'; patch.outcome = patch.terminate ? value.outcome : 'finished'; }
    if (selected.value.type === 'exclusiveGateway') patch.default = value.default;
    if (selected.value.type === 'sequenceFlow') patch.condition = value.condition;
    else if (!selected.value.sourceRef) patch.laneId = value.laneId;
    if (['serviceTask', 'sendTask'].includes(value.variant)) {
      patch.connector = { ...value.connector, parameters: objectValue(value.parameters, 'URL parametri') };
      patch.inputs = objectValue(value.inputs, 'Ulazne varijable');
      patch.outputs = objectValue(value.outputs, 'Izlazne varijable');
    }
    if (value.variant === 'userTask') patch.formFields = value.formFields.map(({ propertiesText, validationText, ...f }) => ({ ...f, properties: objectValue(propertiesText, `Svojstva polja ${f.id}`), validation: objectValue(validationText, `Validacija polja ${f.id}`) }));
    return change(m => updateElement(m, selectedId.value, patch));
  } catch (e) { error.value = e.message; return false; }
}
function updateModelLink() {
  if (location.pathname.slice(import.meta.env.BASE_URL.length).startsWith('admin/model/')) {
    window.history.replaceState(null, '', activeModel.value === 'import' ? import.meta.env.BASE_URL + 'admin' : `${import.meta.env.BASE_URL}admin/model/strucna_praksa_${activeModel.value}/${processVersion.value}`);
  }
}
async function loadModel(key, requestedVersion) {
  if (model.value && !(await leaveModel())) return;
  const version = ++loadVersion;
  loading.value = true; error.value = '';
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/models/strucna_praksa_${key}.bpmn`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Model nije dostupan. Provjerite BPMN_MODELS_DIR na Studio poslužitelju.');
    const { xml, revision, version: savedVersion } = await response.json();
    if (version !== loadVersion) return;
    if (requestedVersion && requestedVersion !== String(savedVersion)) {
      const historical = await fetch(`${import.meta.env.BASE_URL}api/models/strucna_praksa_${key}.bpmn/${requestedVersion}`, { cache: 'no-store' });
      if (!historical.ok) throw new Error(`Model ${key} · v${requestedVersion} nije dostupan. Trenutno je objavljena verzija v${savedVersion}.`);
      const definition = parseModel((await historical.json()).xml);
      if (version === loadVersion) archived.value = { key, version: requestedVersion, definition };
      return;
    }
    const original = parseModel(xml);
    activeModel.value = key; importedName.value = '';
    exportedXml.value = serializeModel(original);
    sourceRevision.value = revision;
    processVersion.value = savedVersion;
    updateModelLink();
    deployedXml.value = exportedXml.value;
    savedXml.value = exportedXml.value;
    let draft;
    try { draft = JSON.parse(readDraft(storageKey()) || 'null'); }
    catch { notice.value = 'Spremljena skica nije čitljiva. Otvoren je izvorni model.'; }
    let restore = draft?.xml && (draft.baseRevision === revision || (!draft.baseRevision && draft.exportedXml === exportedXml.value));
    if (draft?.xml && !restore && draft.xml !== exportedXml.value && (draft.unpublished || !draft.baseRevision || draft.xml !== draft.savedXml)) {
      restore = await ask('Izvorni model je promijenjen. Otvoriti prethodnu lokalnu skicu za pregled i izvoz? Odustani otvara aktualni izvorni model.', 'Otvori lokalnu skicu');
      if (version !== loadVersion) return;
      if (restore) sourceRevision.value = draft.baseRevision || '';
    }
    try {
      model.value = restore ? parseModel(draft.xml) : original;
      if (restore && draft.savedXml) savedXml.value = serializeModel(parseModel(draft.savedXml));
    }
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
    ++loadVersion; sourceRevision.value = ''; activeModel.value = 'import'; updateModelLink(); importedName.value = draft.name || 'model.bpmn';
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
    activeModel.value = 'import'; updateModelLink(); sourceRevision.value = ''; importedName.value = file.name;
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
  if (change(m => addNode(m, type === 'timerCatch' ? 'intermediateCatchEvent' : type, { timerDuration: type === 'timerCatch' ? 'PT15M' : undefined, x: Math.round(x), y: Math.round(y), laneId: lane?.id, name: palette.find(p => p[0] === type)?.[1] }), next => next.nodes.find(n => !ids.has(n.id)).id)) { openInspector(); diagram.value?.focus(selectedId.value); }
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
  connectFrom.value = connecting.value && !selected.value?.sourceRef ? selectedId.value : '';
  notice.value = connecting.value ? (connectFrom.value ? 'Odaberite odredišni element za Sequence Flow.' : 'Odaberite početni, zatim odredišni element.') : '';
}
async function relocateLabel({ id, bounds }) {
  if (await leaveInspector()) change(m => moveLabel(m, id, bounds));
}
async function createFlow({ source, target, side }) {
  if (await leaveInspector()) change(m => addFlow(m, source, target, { sourceSide: side }));
}
async function reshape({ id, points }) {
  if (await leaveInspector()) change(m => reshapeFlow(m, id, points));
}
async function moveNode(value) {
  if (!(await leaveInspector())) return;
  change(m => moveElement(m, value.id, value.x, value.y, value.size));
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
  if (archived.value) return;
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
  try { const response = await fetch(import.meta.env.BASE_URL + 'connectors.json'); if (!response.ok) throw new Error(); catalog.value = (await response.json()).connectors; }
  catch { notice.value = 'Katalog konektora nije dostupan. Ponovno sinkronizirajte datoteke aplikacije.'; }
  try { importedDraft.value = JSON.parse(readDraft('fipu-bpmn-studio:v1:import') || 'null'); } catch { /* Invalid drafts remain on disk until explicitly replaced. */ }
  if (location.pathname.slice(import.meta.env.BASE_URL.length).startsWith('admin/model/')) {
    const link = location.pathname.slice(import.meta.env.BASE_URL.length).match(/^admin\/model\/strucna_praksa_([AB])\/([1-9]\d*)\/?$/);
    if (link) await loadModel(link[1], link[2]);
    else { error.value = 'Neispravna poveznica na verziju modela.'; loading.value = false; }
    return;
  }
  const requested = new URLSearchParams(location.search).get('model');
  if (['A', 'B'].includes(requested)) {
    window.history.replaceState(null, '', location.pathname);
    await loadModel(requested);
    return;
  }
  const active = readDraft('fipu-bpmn-studio:active');
  if (active === 'import' && importedDraft.value) restoreImport();
  else await loadModel(active === 'B' ? 'B' : 'A');
});
onBeforeUnmount(() => { media.removeEventListener('change', resizeWorkspace); window.removeEventListener('keydown', keyboard); window.removeEventListener('beforeunload', unload); });
</script>

<template>
  <main v-if="archived" style="height:100dvh;display:flex;flex-direction:column">
    <header class="app-header archive-header"><h1>Model {{ archived.key }} · v{{ archived.version }}</h1><span>Samo za čitanje</span><a :href="baseUrl + 'admin?model=' + archived.key">Aktualni model</a></header>
    <BpmnDiagram :model="archived.definition" style="flex:1;min-height:0" />
  </main>
  <TooltipProvider v-else :delay-duration="350"><TabsRoot :model-value="activeModel" activation-mode="manual" @update:model-value="key => key === 'import' ? restoreImport() : loadModel(key)" as-child><div class="studio">
    <header class="app-header">
      <a class="brand" :href="baseUrl" aria-label="Praksa BPMN Studio"><Icon name="workflow" :size="30" /><span>Praksa <strong>BPMN Studio</strong></span></a>
      <StudioHistory v-if="model && !loading && activeModel !== 'import'" :key="activeModel" :model-key="activeModel" />
    </header>
    <div class="workspace-bar">
      <TabsList class="model-tabs" aria-label="Modeli prakse"><TabsTrigger value="A">Model A <small>Dodjela zadatka</small></TabsTrigger><TabsTrigger value="B">Model B <small>Izravna prijava</small></TabsTrigger><TabsTrigger v-if="importedDraft" value="import" class="import-tab">Uvezena skica<small>{{ importedDraft.name }}</small></TabsTrigger></TabsList>
      <div class="file-actions"><span v-if="model" class="draft-status" role="status">{{ unsaved ? 'Nespremljene izmjene' : unpublished ? 'Spremljeno · čeka objavu' : 'Spremljeno' }}</span><Primitive as-child><input ref="importInput" type="file" accept=".bpmn,.xml,application/xml,text/xml" hidden @change="importFile"></Primitive><StudioButton @click="importInput.click()"><Icon name="upload" /> Uvezi</StudioButton><StudioButton :disabled="!model || loading" @click="download"><Icon name="download" /> Izvezi BPMN</StudioButton><StudioButton class="primary" :disabled="!model || loading || saving || (!unsaved && draftStored)" title="Spremi skicu u ovaj preglednik (Ctrl/⌘ S)" aria-keyshortcuts="Control+s Meta+s" @click="saveModel"><Icon name="save" /> {{ activeModel === 'import' ? 'Spremi skicu' : 'Spremi' }}</StudioButton><StudioButton v-if="activeModel !== 'import'" class="deploy" :disabled="!model || loading || saving || !unpublished" title="Objavi izmjene kao novu verziju modela" @click="deployModel">{{ saving ? 'Objavljivanje…' : 'Deploy' }}</StudioButton></div>
    </div>
    <div v-if="error" class="message error" role="alert"><Icon name="info" /><span>{{ error }}</span><StudioButton aria-label="Zatvori pogrešku" @click="error = ''"><Icon name="close" /></StudioButton></div>
    <div v-if="notice" class="message notice" role="status"><Icon name="info" /><span>{{ notice }}</span><StudioButton aria-label="Zatvori obavijest" @click="notice = ''"><Icon name="close" /></StudioButton></div>
    <TabsContent :value="activeModel" class="editor" :class="{ 'show-palette': paletteVisible, 'show-inspector': inspectorVisible && selected }">
      <StudioPanel :compact="compact" v-model:open="paletteVisible" title="Elementi procesa" close-label="Zatvori elemente" side="left" panel-class="library-panel" @closed="restorePanelFocus">
        <div class="palette"><StudioButton v-for="[type, label] in palette" :key="type" :disabled="!model || loading" :title="typeName(type)" @click="add(type)"><ElementSymbol :type="type" /><span>{{ label }}<small>{{ typeName(type) }}</small></span><Icon name="plus" :size="14" /></StudioButton></div>
        <div class="list-heading"><h2>Pregled modela</h2><span>{{ model?.nodes.length || 0 }}</span></div>
        <Label class="search-field"><Icon name="search" :size="16" /><Primitive as-child><input v-model="search" aria-label="Pretraži elemente" placeholder="Pronađi zadatak…"></Primitive></Label>
        <div class="element-list"><StudioButton v-for="node in filteredNodes" :key="node.id" :class="{ active: selectedId === node.id }" @click="selectFromList(node.id)"><ElementSymbol :type="node.timerDuration != null ? 'timerCatch' : node.terminate ? 'terminateEnd' : node.type" /><span>{{ node.name || node.id }}<small>{{ typeName(node.timerDuration != null ? 'timerCatch' : node.type) }}</small></span></StudioButton><p v-if="model && !filteredNodes.length" class="empty-search">Nema pronađenih elemenata.</p></div>
      </StudioPanel>
      <main class="canvas-panel" aria-label="Radna površina">
        <PopoverRoot v-model:open="showIssues"><ToolbarRoot class="canvas-toolbar" aria-label="Uređivanje modela"><div class="toolbar-group"><div class="canvas-title"><h1>{{ activeModel === 'import' ? importedName.replace(/\.(xml|bpmn)$/i, '') : `Stručna praksa · Model ${activeModel}${processVersion ? ` · v${processVersion}` : ''}` }}</h1></div><ToolbarButton v-if="compact" as-child><StudioButton ref="libraryOpener" class="icon-button mobile-only" aria-label="Otvori elemente" :aria-expanded="paletteVisible" @click="toggleLibrary"><Icon name="menu" /></StudioButton></ToolbarButton><ToolbarButton as-child :disabled="!history.length"><StudioButton class="icon-button" :disabled="!history.length" aria-label="Poništi izmjenu" title="Poništi (Ctrl/⌘ Z)" @click="undo"><Icon name="undo" /></StudioButton></ToolbarButton><ToolbarButton as-child :disabled="!future.length"><StudioButton class="icon-button" :disabled="!future.length" aria-label="Ponovi izmjenu" title="Ponovi (Ctrl/⌘ Shift Z)" @click="redo"><Icon name="redo" /></StudioButton></ToolbarButton><ToolbarSeparator class="toolbar-divider" /><ToolbarButton as-child><Toggle :model-value="connecting" :disabled="!model" @update:model-value="connect" as-child><StudioButton :class="{ pressed: connecting }"><Icon name="link" /><span>Poveži</span></StudioButton></Toggle></ToolbarButton></div><PopoverTrigger as-child><ToolbarButton as-child><StudioButton class="validate-button" :class="{ 'has-errors': errors.length }" :disabled="!model" ><Icon :name="errors.length ? 'info' : 'check'" /><span>Provjeri model</span><span v-if="errors.length" class="count">{{ errors.length }}</span></StudioButton></ToolbarButton></PopoverTrigger></ToolbarRoot><PopoverPortal><PopoverContent side="bottom" align="end" :side-offset="8" class="validation-panel"><div class="panel-heading"><h2>{{ errors.length ? `${errors.length} pogrešaka u modelu` : 'Provjera modela' }}</h2><PopoverClose as-child><StudioButton class="icon-button" aria-label="Zatvori provjeru"><Icon name="close" /></StudioButton></PopoverClose></div><p v-if="!issues.length" class="valid-result"><Icon name="check" /> Model je spreman za izvoz.</p><ul v-if="issues.length"><li v-for="(issue, index) in issues" :key="index" :class="issue.severity"><StudioButton @click="issue.id && selectFromList(issue.id)"><b>{{ issue.severity === 'error' ? 'Pogreška' : 'Napomena' }}</b> {{ issue.message }}<code v-if="issue.id">{{ issue.id }}</code></StudioButton></li></ul></PopoverContent></PopoverPortal></PopoverRoot>
        <div v-if="loading" class="canvas-empty" role="status">Učitavanje modela…</div>
        <BpmnDiagram v-else-if="model" ref="diagram" :model="model" :selected-id="selectedId" editable :connecting="connecting" @select="select" @edit-name="editName" @move="moveNode" @reshape="reshape" @create-flow="createFlow" @move-label="relocateLabel" @background="async () => { if (!connecting && await leaveInspector()) selectedId = ''; }">
          <template #node-actions="{ node }"><StudioButton v-if="node.type !== 'endEvent'" class="icon-button node-connect" aria-label="Poveži element (Sequence Flow)" title="Poveži s drugim elementom" @click="connect"><Icon name="link" /></StudioButton></template>
        </BpmnDiagram>
        <div v-else class="canvas-empty">Model nije učitan.<StudioButton @click="loadModel('A')">Pokušaj ponovno</StudioButton></div>
        <div class="canvas-bottom"><span class="canvas-help">{{ connecting ? 'Odaberite elemente za povezivanje · Esc za prekid' : 'Pomicanje: povucite pozadinu ili kliznite dvama prstima · Ctrl/⌘ + kotačić za zumiranje' }}</span><ToolbarRoot class="zoom-controls" aria-label="Prikaz dijagrama"><ToolbarButton as-child><StudioButton class="icon-button" aria-label="Umanji" @click="diagram?.zoomOut()"><Icon name="minus" /></StudioButton></ToolbarButton><ToolbarButton as-child><StudioButton class="icon-button" aria-label="Prikaži cijeli model" title="Prikaži cijeli model" @click="diagram?.fit()"><Icon name="fit" /></StudioButton></ToolbarButton><ToolbarButton as-child><StudioButton class="icon-button" aria-label="Uvećaj" @click="diagram?.zoomIn()"><Icon name="plus" /></StudioButton></ToolbarButton></ToolbarRoot></div>

      </main>
      <StudioPanel :compact="compact" :open="inspectorVisible && !!selected" @update:open="inspectorVisible = $event" title="Svojstva elementa" close-label="Zatvori svojstva" side="right" panel-class="inspector-panel" @closed="restorePanelFocus">
        <template v-if="selected">
          <div class="selection-summary"><span class="type-badge">{{ typeName(selected.timerDuration != null ? 'timerCatch' : selected.type) }}</span><h3>{{ selected.name || selected.id }}</h3><code>{{ selected.id }}</code></div>
          <form class="inspector-form" @click="selectFieldText" @submit.prevent="applyInspector">
            <p v-if="selected.sourceRef" class="field-help">Povucite kvadratić za pomak segmenta ili kružić za pomak zavoja. Točke prianjaju uz mrežu; držite Alt za slobodan pomak. Strelice pomiču označenu ručicu.</p>
            <p v-else class="field-help">Pri povlačenju vodilice poravnavaju rubove i središta elemenata. Izvan vodilica element prianja uz mrežu. Držite Alt za slobodan pomak.</p>
            <StudioSelect v-if="variantsFor(selected.type).length" v-model="inspector.variant" label="Varijanta elementa" :options="variantsFor(selected.type).map(value => ({ value, label: typeName(value) }))" />
            <small v-if="inspector.variant !== (selected.timerDuration != null ? 'timerCatch' : selected.type)" class="field-help">Primjenom se uklanjaju postavke koje nova varijanta ne podržava. Izmjenu možete poništiti.</small>
            <label v-if="inspector.variant === 'timerCatch'">Trajanje vremenskog međudogađaja<input v-model.trim="inspector.timerDuration" placeholder="PT15M"><small>Primjeri: PT30S, PT15M, PT2H, P1D</small></label>
            <label>Naziv<Primitive as-child><textarea ref="nameField" v-model="inspector.name" rows="2" /></Primitive></label>
            <StudioSelect v-if="!selected.sourceRef" v-model="inspector.laneId" label="Sudionik / staza" :options="[{ value: '', label: 'Bez staze' }, ...model.lanes.map(lane => ({ value: lane.id, label: lane.name }))]" />
            <template v-if="inspector.variant === 'endEvent'">
              <StudioSelect v-model="inspector.termination" label="Završetak" :options="[{ value: 'normal', label: 'Završi ovu granu' }, { value: 'terminate', label: 'Prekini cijeli proces' }]" />
              <StudioSelect v-if="inspector.termination === 'terminate'" v-model="inspector.outcome" label="Ishod" :options="[{ value: 'finished', label: 'Uspješno završeno' }, { value: 'cancelled', label: 'Odustajanje' }]" />
            </template>
            <StudioSelect v-if="selected.type === 'exclusiveGateway'" v-model="inspector.default" label="Zadani tok" :options="[{ value: '', label: 'Bez zadanog toka' }, ...model.flows.filter(f => f.sourceRef === selected.id).map(flow => ({ value: flow.id, label: flow.name || flow.id }))]">Koristi se ako nijedan uvjet nije zadovoljen.</StudioSelect>
            <label>Dokumentacija<Primitive as-child><textarea v-model="inspector.documentation" rows="3" placeholder="Opišite svrhu ovog koraka…" /></Primitive></label>
            <template v-if="selected.type === 'sequenceFlow'"><div class="field-section"><h3>Uvjet prijelaza</h3><label>Izraz<Primitive as-child><input v-model="inspector.condition" placeholder="kandidat_odobren:True"></Primitive><small>Format enginea: naziv_varijable:vrijednost. Prazno za bezuvjetni tok.</small></label><dl class="connection-details"><dt>Izvor</dt><dd>{{ selected.sourceRef }}</dd><dt>Odredište</dt><dd>{{ selected.targetRef }}</dd></dl></div></template>
            <template v-if="['serviceTask', 'sendTask'].includes(inspector.variant)">
              <div class="field-section"><h3>Konektor</h3><StudioSelect v-model="inspector.connector.id" label="Servis" :options="[...catalog.map(c => ({ value: c.id, label: c.label })), ...(!selectedConnector ? [{ value: inspector.connector.id, label: inspector.connector.id }] : [])]" />
                <StudioSelect v-if="selectedConnector?.operations?.length" model-value="" @update:model-value="chooseOperation" label="Poznata operacija" placeholder="Odaberite operaciju…" :options="selectedConnector.operations.map((op, index) => ({ value: String(index), label: `${op.label} · ${op.method}` }))" />
                <div class="endpoint-row"><StudioSelect v-model="inspector.connector.method" label="Metoda" :options="['GET', 'POST', 'PATCH'].map(value => ({ value, label: value }))" /><label>Putanja<Primitive as-child><input v-model="inspector.connector.url" placeholder="/student" spellcheck="false"></Primitive></label></div>
                <label>URL parametri <small>JSON objekt</small><Primitive as-child><textarea v-model="inspector.parameters" class="code-input" rows="4" spellcheck="false" /></Primitive></label>
              </div><div class="field-section"><h3>Varijable</h3><label>Ulazne varijable <small>JSON objekt; izrazi poput ${student_email}</small><Primitive as-child><textarea v-model="inspector.inputs" class="code-input" rows="7" spellcheck="false" /></Primitive></label><label>Izlazne varijable <small>Ključevi koje engine preuzima iz odgovora</small><Primitive as-child><textarea v-model="inspector.outputs" class="code-input" rows="4" spellcheck="false" /></Primitive></label></div>
            </template>
            <div v-if="inspector.variant === 'userTask'" class="field-section"><div class="section-heading"><h3>Polja obrasca</h3><StudioButton type="button" class="small-button" @click="addField"><Icon name="plus" :size="14" /> Dodaj</StudioButton></div><p class="field-help">ID polja povezuje obrazac s varijablama procesa.</p><div v-for="(field, index) in inspector.formFields" :key="index" class="form-field-editor"><div class="form-field-title"><strong>Polje {{ index + 1 }}</strong><StudioButton type="button" class="icon-button" :aria-label="`Ukloni polje ${field.id}`" @click="inspector.formFields.splice(index, 1)"><Icon name="trash" :size="15" /></StudioButton></div><label>ID<Primitive as-child><input v-model="field.id" spellcheck="false"></Primitive></label><label>Naziv<Primitive as-child><input v-model="field.label"></Primitive></label><StudioSelect v-model="field.type" label="Vrsta" :options="[...new Set(['string', 'boolean', 'long', 'date', field.type])].map(value => ({ value, label: value }))" /><CollapsibleRoot v-slot="{ open }"><CollapsibleTrigger class="disclosure-trigger"><Icon :name="open ? 'minus' : 'plus'" :size="14" /> Svojstva i validacija</CollapsibleTrigger><CollapsibleContent><label>Svojstva <small>JSON objekt</small><Primitive as-child><textarea v-model="field.propertiesText" class="code-input" rows="3" spellcheck="false" /></Primitive></label><label>Validacija <small>JSON objekt</small><Primitive as-child><textarea v-model="field.validationText" class="code-input" rows="3" spellcheck="false" /></Primitive></label></CollapsibleContent></CollapsibleRoot></div></div>
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
