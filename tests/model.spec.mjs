import { modelXml } from './model-source.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || '@playwright/test');
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('packages/bpmn/model.js', root), 'utf8');
const models = await Promise.all(['A', 'B'].map(async name => ({ name, xml: await modelXml(name) })));
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
      const certificateGateway = model.nodes.find(node => node.id === 'Gateway_1b8kjb9');
      if (certificateGateway) {
        const flow = model.flows.find(f => f.sourceRef === certificateGateway.id && f.targetRef === 'slanje_potvrde_student_email');
        const recreated = addFlow(removeElement(model, flow.id), certificateGateway.id, flow.targetRef);
        const [tip, bend, end] = recreated.flows.at(-1).waypoints;
        check(tip.x === certificateGateway.x + certificateGateway.width / 2 && tip.y === certificateGateway.y && bend.x === tip.x && bend.y === end.y, 'Certificate branch leaves the top tip and reaches the email task horizontally');
      }
      const exported = serializeModel(model);
      check(!exported.includes('camunda.org'), `${name}: legacy namespace removed`);
      check(signatures(model) === signatures(parseModel(exported)), `${name}: model semantic and DI round trip`);
      const edge = model.flows[0];
      const annotated = parseModel(exported.replace('</bpmn:collaboration>', `<bpmn:participant id="external"/><bpmn:messageFlow id="msg" sourceRef="${edge.sourceRef}" targetRef="external"/></bpmn:collaboration>`).replace('</bpmndi:BPMNPlane>', '<bpmndi:BPMNEdge id="msg_di" bpmnElement="msg"><di:waypoint x="10" y="10"/><di:waypoint x="90" y="10"/></bpmndi:BPMNEdge></bpmndi:BPMNPlane>'));
      const points = [{ x: 10, y: 10 }, { x: 50, y: 30 }, { x: 90, y: 10 }];
      const reshaped = parseModel(serializeModel(api.reshapeFlow(annotated, 'msg', points)));
      check(JSON.stringify(reshaped.messageFlows[0].waypoints) === JSON.stringify(points), 'Message route survives XML round trip');
      check(!validateModel(reshaped, catalog.connectors).some(issue => issue.id === 'msg'), 'Collaboration annotation is valid');
      check(JSON.stringify(reshaped.flows) === JSON.stringify(model.flows), 'Message layout does not change executable flows');
      const labelBox = { x: 31, y: -15, width: 60, height: 14 };
      const labeled = parseModel(serializeModel(api.moveLabel(reshaped, 'msg', labelBox)));
      check(JSON.stringify(labeled.messageFlows[0].label) === JSON.stringify(labelBox), 'Moving a label creates persistent DI bounds');
      check(JSON.stringify(labeled.messageFlows[0].waypoints) === JSON.stringify(points), 'Label movement preserves the arrow route');
      const service = model.nodes.find(node => node.type === 'serviceTask');
      const manual = updateElement(model, service.id, { variant: 'manualTask' });
      const changedTask = manual.nodes.find(node => node.id === service.id);
      check(changedTask.type === 'manualTask' && !changedTask.connector && changedTask.x === service.x, 'Changing task variant preserves geometry and removes incompatible settings');
      check(JSON.stringify(manual.flows) === JSON.stringify(model.flows), 'Variant changes preserve connections');
      const start = model.nodes.find(node => node.type === 'startEvent');
      const timerVariant = updateElement(model, start.id, { variant: 'timerCatch', timerDuration: 'PT10S' });
      const throwVariant = updateElement(timerVariant, start.id, { variant: 'intermediateThrowEvent' });
      check(throwVariant.nodes.find(n => n.id === start.id).timerDuration === null, 'Replacing a timer removes its duration');
      const ending = updateElement(throwVariant, start.id, { variant: 'endEvent', terminate: true });
      check(ending.nodes.find(n => n.id === start.id).terminate, 'An event can become a terminate end');
      const withTimer = addNode(model, 'intermediateCatchEvent', { id: 'test_timer', timerDuration: 'PT1H' });
      const editedTimer = updateElement(withTimer, 'test_timer', { timerDuration: 'P2D' });
      const events = parseModel(serializeModel(addNode(editedTimer, 'intermediateThrowEvent', { id: 'test_throw' })));
      check(events.nodes.find(n => n.id === 'test_timer').timerDuration === 'P2D', 'Timer duration survives editing and export');
      check(events.nodes.some(n => n.id === 'test_throw' && n.type === 'intermediateThrowEvent'), 'None throw survives export');
      throws(() => updateElement(withTimer, 'test_timer', { timerDuration: 'tomorrow' }), 'Invalid timers cannot be saved');
      const catchId = 'odustajanje_od_prakse';
      const asTimer = updateElement(model, catchId, { variant: 'timerCatch', timerDuration: 'PT20S' });
      for (const candidate of [model, asTimer, updateElement(asTimer, catchId, { variant: 'intermediateThrowEvent' })]) {
        check(!validateModel(candidate, catalog.connectors).some(issue => issue.severity === 'error'), 'Connected message, timer and none throw variants pass validation');
      }
      const timerXml = serializeModel(asTimer);
      for (const invalid of [
        timerXml.replaceAll('bpmn:timerEventDefinition', 'foreign:timerEventDefinition').replace('<foreign:timerEventDefinition', '<foreign:timerEventDefinition xmlns:foreign="urn:foreign"'),
        timerXml.replace('PT20S', '<bpmn:timeDuration>PT20S</bpmn:timeDuration>'),
        exported.replace('<bpmn:messageEventDefinition', '<bpmn:messageEventDefinition messageRef="ignored"'),
        timerXml.replace('PT20S', 'PT0S'),
      ]) check(validateModel(parseModel(invalid)).some(issue => issue.severity === 'error'), 'Reject malformed or unsupported imported event definitions');
      const errors = validateModel(model, catalog.connectors).filter(issue => issue.severity === 'error');
      check(errors.length === 0, `${name}: template validation: ${JSON.stringify(errors)}`);
      const taskToResize = model.nodes.find(node => node.type === 'serviceTask' && model.flows.some(flow => flow.targetRef === node.id));
      const incomingEdge = model.flows.find(flow => flow.targetRef === taskToResize.id);
      const oldTip = incomingEdge.waypoints.at(-1);
      const resized = moveElement(model, taskToResize.id, taskToResize.x, taskToResize.y, { width: taskToResize.width * 2, height: taskToResize.height * 2 });
      const restored = parseModel(serializeModel(resized));
      const tip = restored.flows.find(flow => flow.id === incomingEdge.id).waypoints.at(-1);
      check(restored.nodes.find(node => node.id === taskToResize.id).width === taskToResize.width * 2, 'Task size survives export');
      check(tip.x === taskToResize.x + 2 * (oldTip.x - taskToResize.x) && tip.y === taskToResize.y + 2 * (oldTip.y - taskToResize.y), 'Arrow stays attached at the same relative position');
      const startFlows = model.flows.filter(flow => flow.sourceRef === 'start_event_student');
      check(startFlows.length === 1, `${name}: Start has one outgoing flow`);
      const split = model.nodes.find(node => node.id === startFlows[0].targetRef);
      check(split?.type === 'parallelGateway', `${name}: Start leads to an AND split`);
      check(model.flows.some(flow => flow.sourceRef === split.id && flow.targetRef === 'odustajanje_od_prakse'), `${name}: AND split activates withdrawal`);
      check(model.nodes.find(node => node.id === 'odustajanje_od_prakse')?.type === 'intermediateCatchEvent', 'Withdrawal is a message catch event');
      check(model.nodes.find(node => node.id === 'end_event_odustajanje')?.terminate && model.nodes.find(node => node.id === 'end_event_odustajanje')?.outcome === 'cancelled', 'Withdrawal terminates the process with a cancelled outcome');
      check(model.nodes.find(node => node.id === 'end_event_student')?.terminate, 'Normal completion terminates the unused withdrawal listener');
      const invalidEnd = updateElement(model, 'end_event_odustajanje', { terminate: false });
      check(validateModel(invalidEnd, catalog).some(issue => issue.message.includes('Cancelled outcomes')), 'Cancelled outcomes cannot silently become normal end events');
      const noMessage = parseModel(exported.replace('<bpmn:messageEventDefinition/>', ''));
      check(validateModel(noMessage, catalog).some(issue => issue.message.includes('Message Event Definition')), 'Catch events need a supported definition');
      if (name === 'B') {
        check(validateModel(model, catalog.connectors).length === 0, 'Model B has no validation warnings');
        check(!model.nodes.some(node => node.id === 'Activity_0dri58t'), 'Unused Model B placeholder removed');
        const branchEnd = model.nodes.find(node => node.id === 'end_event_dogovor_poslodavac');
        check(branchEnd?.type === 'endEvent' && model.flows.some(flow => flow.sourceRef === 'model_b_dogovor_poslodavac' && flow.targetRef === branchEnd.id), 'Employer branch has a normal End Event');
      }
      const mutateXml = callback => {
        const draft = parseModel(exported);
        callback(draft.document);
        return parseModel(serializeModel(draft));
      };
      const legacy = exported.replaceAll(NS.fipu, 'http://camunda.org/schema/1.0/bpmn').replaceAll('fipu:', 'custom:').replaceAll('xmlns:fipu', 'xmlns:custom');
      throws(() => parseModel(legacy), `${name}: legacy and alternate prefix import`);
      const task = model.nodes.find(node => node.type === 'serviceTask');
      const before = serializeModel(model);
      let changed = updateElement(model, task.id, { name: '<Unsafe & name>', documentation: 'Line one\nLine two < &', inputs: { expression: '${student_email}', list: ['a', '${b}'], map: { entry: '<x>' } }, outputs: { id: '' }, connector: { id: 'baserow', method: 'POST', url: '/test', parameters: { to: '${student_email}' } } });
      check(serializeModel(model) === before, 'Updates do not mutate the original draft');
      changed = parseModel(serializeModel(changed));
      const edited = changed.nodes.find(node => node.id === task.id);
      check(edited.name === '<Unsafe & name>' && edited.documentation === 'Line one\nLine two < &', 'XML text escapes safely');
      check(edited.inputs.list[1] === '${b}' && edited.inputs.map.entry === '<x>' && edited.connector.parameters.to === '${student_email}', 'Parameter shapes survive round trip');
      check(validateModel(changed, catalog.connectors).some(issue => issue.id === task.id && issue.message.includes('registered connector operation')), 'Unknown connector operation is rejected by the actual catalog');
      const email = model.nodes.find(node => node.connector?.id === 'emailjs');
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
      throws(() => addFlow(changed, user.id, 'test_added_task', { id: user.id }), 'Reject flow ID collisions');
      throws(() => addFlow(changed, user.id, 'test_added_task', { id: 'invalid id' }), 'Reject invalid flow IDs');
      changed = addFlow(changed, user.id, 'test_added_task', { id: 'test_added_flow' });
      check(changed.flows.some(flow => flow.id === 'test_added_flow'), 'Explicit flow ID is preserved');
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
