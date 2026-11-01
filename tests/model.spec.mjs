import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || '@playwright/test');
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('packages/bpmn/model.js', root), 'utf8');
const models = await Promise.all(['A', 'B'].map(async name => ({ name, xml: await readFile(new URL(`public/models/strucna_praksa_${name}.bpmn`, root), 'utf8') })));
const catalog = JSON.parse(await readFile(new URL('public/connectors.json', root), 'utf8'));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async ({ source, models, catalog }) => {
    const api = await import(`data:text/javascript;base64,${btoa(unescape(encodeURIComponent(source)))}`);
    const { NS, parseModel, serializeModel, updateElement, moveElement, addNode, addFlow, removeElement, validateModel } = api;
    const check = (value, message) => { if (!value) throw new Error(message); };
    const throws = (callback, message) => { let failed = false; try { callback(); } catch { failed = true; } check(failed, message); };
    const signatures = model => JSON.stringify({ nodes: model.nodes, flows: model.flows, lanes: model.lanes, pools: model.pools });
    const outcomes = [];
    for (const { name, xml } of models) {
      const model = parseModel(xml);
      const exported = serializeModel(model);
      check(!exported.includes('camunda.org'), `${name}: legacy namespace removed`);
      check(signatures(model) === signatures(parseModel(exported)), `${name}: model semantic and DI round trip`);
      const errors = validateModel(model, catalog.connectors).filter(issue => issue.severity === 'error');
      check(errors.length === 0, `${name}: template validation: ${JSON.stringify(errors)}`);
      const mutateXml = callback => {
        const draft = parseModel(exported);
        callback(draft.document);
        return parseModel(serializeModel(draft));
      };
      const legacy = exported.replaceAll(NS.fipu, 'http://camunda.org/schema/1.0/bpmn').replaceAll('fipu:', 'custom:').replaceAll('xmlns:fipu', 'xmlns:custom');
      check(signatures(model) === signatures(parseModel(legacy)), `${name}: legacy and alternate prefix import`);
      const task = model.nodes.find(node => node.type === 'serviceTask');
      const before = serializeModel(model);
      let changed = updateElement(model, task.id, { name: '<Unsafe & name>', documentation: 'Line one\nLine two < &', inputs: { expression: '${student_email}', list: ['a', '${b}'], map: { entry: '<x>' } }, outputs: { id: '' }, connector: { id: 'baserow', method: 'POST', url: '/test', parameters: { to: '${student_email}' } } });
      check(serializeModel(model) === before, 'Updates do not mutate the original draft');
      changed = parseModel(serializeModel(changed));
      const edited = changed.nodes.find(node => node.id === task.id);
      check(edited.name === '<Unsafe & name>' && edited.documentation === 'Line one\nLine two < &', 'XML text escapes safely');
      check(edited.inputs.list[1] === '${b}' && edited.inputs.map.entry === '<x>' && edited.connector.parameters.to === '${student_email}', 'Parameter shapes survive round trip');
      check(validateModel(changed, catalog.connectors).some(issue => issue.id === task.id && issue.message.includes('registered connector operation')), 'Unknown connector operation is rejected by the actual catalog');
      const email = model.nodes.find(node => node.connector?.id === 'sendgrid');
      const missingTemplate = { ...email.connector.parameters };
      delete missingTemplate.template;
      for (const parameters of [missingTemplate, { ...email.connector.parameters, template: 'unknown_template' }]) {
        const invalid = updateElement(model, email.id, { connector: { ...email.connector, parameters } });
        check(validateModel(invalid, catalog).some(issue => issue.id === email.id && issue.message.includes('registered email template')), 'Missing or unknown EmailJS template rejected');
      }
      const missingRecipient = updateElement(model, email.id, { connector: { ...email.connector, parameters: { template: email.connector.parameters.template } } });
      check(validateModel(missingRecipient, catalog).some(issue => issue.id === email.id && issue.message.includes('recipient')), 'Missing email recipient rejected');
      throws(() => updateElement(model, task.id, { inputs: { list: [{ invalid: true }] } }), 'Reject nested unsupported parameter values');
      check(serializeModel(model) === before, 'Rejected updates leave original unchanged');
      throws(() => updateElement(model, task.id, { id: 'new_id' }), 'Existing IDs are immutable');
      const user = model.nodes.find(node => node.type === 'userTask');
      changed = updateElement(model, user.id, { formFields: [{ id: 'value', type: 'string', label: 'Test < &', defaultValue: '${original}', properties: { source: '${table}' }, validation: { required: 'true' } }] });
      const field = parseModel(serializeModel(changed)).nodes.find(node => node.id === user.id).formFields[0];
      check(field.defaultValue === '${original}' && field.properties.source === '${table}' && field.validation.required === 'true', 'User form metadata survives edits');
      changed = moveElement(model, task.id, task.x + 40, task.y + 20);
      check(changed.nodes.find(node => node.id === task.id).x === task.x + 40, 'Move updates BPMN DI bounds');
      check(changed.flows.filter(flow => flow.sourceRef === task.id || flow.targetRef === task.id).every(flow => flow.waypoints.length >= 2), 'Move retains incident routes');
      changed = addNode(model, 'manualTask', { x: 120, y: 120, laneId: model.lanes[0].id, id: 'test_added_task' });
      check(changed.nodes.find(node => node.id === 'test_added_task').laneId === model.lanes[0].id, 'New node assigned to Lane');
      changed = addFlow(changed, user.id, 'test_added_task');
      check(changed.flows.some(flow => flow.sourceRef === user.id && flow.targetRef === 'test_added_task'), 'Connect nodes');
      throws(() => addFlow(changed, user.id, 'test_added_task'), 'Reject duplicate connections');
      changed = removeElement(changed, 'test_added_task');
      check(!serializeModel(changed).includes('test_added_task'), 'Delete cleans flow, DI and Lane references');
      check(signatures(changed) === signatures(model), 'Add/connect/delete restores original semantics');
      const gateway = model.nodes.find(node => node.type === 'exclusiveGateway');
      if (gateway) {
        const flow = model.flows.find(item => item.sourceRef === gateway.id);
        changed = updateElement(model, flow.id, { condition: 'approved:true' });
        check(changed.flows.find(item => item.id === flow.id).condition === 'approved:true', 'Edit gateway condition');
        check(validateModel(updateElement(model, flow.id, { condition: 'approved == true' })).some(issue => issue.id === flow.id), 'Reject unsupported condition language');
        throws(() => updateElement(model, gateway.id, { default: flow.id }), 'Default flow cannot retain a condition');
        changed = updateElement(updateElement(model, flow.id, { condition: '' }), gateway.id, { default: flow.id });
        check(changed.nodes.find(node => node.id === gateway.id).default === flow.id, 'Set Exclusive Gateway default');
        check(!validateModel(changed, catalog).some(issue => issue.severity === 'error'), 'Valid default flow passes catalog and graph validation');
        check(updateElement(changed, gateway.id, { default: '' }).nodes.find(node => node.id === gateway.id).default === '', 'Remove default flow');
      }
      for (const direction of ['incoming', 'outgoing']) {
        const corrupted = mutateXml(document => {
          const flow = model.flows.find(item => direction === 'incoming' ? model.nodes.find(node => node.id === item.targetRef)?.type === 'parallelGateway' : true);
          const ownerId = direction === 'incoming' ? flow.targetRef : flow.sourceRef;
          const owner = Array.from(document.getElementsByTagNameNS(NS.bpmn, '*')).find(element => element.getAttribute('id') === ownerId);
          Array.from(owner.children).find(element => element.localName === direction && element.textContent.trim() === flow.id).remove();
        });
        check(validateModel(corrupted, catalog).some(issue => issue.message.includes(`reciprocal ${direction}`)), `Missing ${direction} engine reference rejected`);
      }
      const parallel = model.nodes.find(node => node.type === 'parallelGateway');
      const downstream = model.flows.find(flow => flow.sourceRef === parallel.id).targetRef;
      const parallelCycle = addFlow(model, downstream, parallel.id);
      check(validateModel(parallelCycle, catalog).some(issue => issue.message.includes('Cycles through Parallel Gateways')), 'Unsupported parallel gateway token cycle rejected');
      for (const extensionName of ['connector', 'inputOutput', 'formData', 'connectorId']) {
        const corrupted = mutateXml(document => {
          const extension = document.getElementsByTagNameNS(NS.fipu, extensionName)[0];
          extension.parentElement.append(extension.cloneNode(true));
        });
        check(validateModel(corrupted, catalog).some(issue => issue.message.includes(`Duplicate ${extensionName}`)), `Duplicate ${extensionName} rejected`);
      }
      const unknownAttribute = mutateXml(document => document.getElementsByTagNameNS(NS.bpmn, 'process')[0].setAttributeNS(NS.fipu, 'fipu:asyncBefore', 'true'));
      check(validateModel(unknownAttribute, catalog).some(issue => issue.message.includes('Unsupported execution attribute')), 'Unsupported execution attribute rejected');
      const unknownExtensionAttribute = mutateXml(document => document.getElementsByTagNameNS(NS.fipu, 'connector')[0].setAttribute('unsupported', 'true'));
      check(validateModel(unknownExtensionAttribute, catalog).some(issue => issue.message.includes('Unsupported connector attribute')), 'Unknown extension attribute rejected');
      throws(() => parseModel(exported.replace('<bpmn:process ', '<bpmn:process xmlns:legacy="http://camunda.org/schema/1.0/bpmn" legacy:asyncBefore="true" ')), 'Mixed legacy attributes with FIPU elements rejected');
      throws(() => parseModel(exported.replace('</bpmn:process>', '<legacy:properties xmlns:legacy="http://camunda.org/schema/1.0/bpmn"/></bpmn:process>')), 'Mixed legacy/FIPU elements rejected');
      const unsupported = exported.replace('<bpmn:process ', '<bpmn:process ').replace('</bpmn:process>', '<bpmn:scriptTask id="bad_script"/></bpmn:process>');
      check(validateModel(parseModel(unsupported)).some(issue => issue.message.includes('Unsupported BPMN')), 'Unsupported executable XML is visibly rejected');
      const duplicate = exported.replace('</bpmn:process>', `<bpmn:task id="${task.id}"/></bpmn:process>`);
      check(validateModel(parseModel(duplicate)).some(issue => issue.message.includes('Duplicate BPMN ID')), 'Duplicate IDs rejected');
      outcomes.push(`${name}: ${model.nodes.length} nodes, ${model.flows.length} flows; XML/DI, connector, form, edits and validation passed`);
    }
    throws(() => parseModel('<invalid>'), 'Malformed XML rejected');
    throws(() => parseModel('<!DOCTYPE definitions [<!ENTITY x SYSTEM "file:///etc/passwd">]><definitions/>'), 'External entities rejected');
    throws(() => parseModel('<definitions/>'), 'Non-BPMN document rejected');
    return outcomes;
  }, { source, models, catalog });
  assert.equal(result.length, 2);
  result.forEach(line => console.log(line));
} finally {
  await browser.close();
}
