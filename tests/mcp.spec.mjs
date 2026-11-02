import { modelXml } from './model-source.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = new URL('../', import.meta.url);
const sourceA = await modelXml('A');
const sourceB = await modelXml('B');

test('MCP stdio edits actual BPMN files with validation, previews and revision guards', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'praksa mcp '));
  const directory = join(temporary, 'models');
  await mkdir(directory);
  const xmlA = sourceA.replace('</bpmn:definitions>', '<meta:note xmlns:meta="urn:test:metadata">Keep this metadata</meta:note></bpmn:definitions>');
  await writeFile(join(directory, 'A.bpmn'), xmlA);
  await writeFile(join(directory, 'B.bpmn'), sourceB);
  await writeFile(join(directory, 'ignored.txt'), 'not a model');
  await writeFile(join(temporary, 'outside.bpmn'), sourceA);
  await symlink(join(temporary, 'outside.bpmn'), join(directory, 'link.bpmn'));
  const clients = [];
  async function connect() {
    const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('mcp/server.mjs', root)), '--models-dir', directory], cwd: temporary, stderr: 'pipe' });
    const client = new Client({ name: 'praksa-mcp-test', version: '1.0.0' });
    clients.push(client);
    await client.connect(transport);
    return client;
  }
  try {
    const client = await connect();
    async function call(name, args = {}, failed = false, target = client) {
      const response = await target.callTool({ name, arguments: args });
      assert.equal(Boolean(response.isError), failed, JSON.stringify(response));
      return response.structuredContent || JSON.parse(response.content[0].text);
    }
    async function rejects(name, args) {
      const response = await client.callTool({ name, arguments: args });
      assert(response.isError, JSON.stringify(response));
    }
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['bpmn_edit_model', 'bpmn_get_guidance', 'bpmn_list_models', 'bpmn_read_model', 'bpmn_validate_model']);
    assert.equal(tools.tools.find(tool => tool.name === 'bpmn_edit_model').annotations.readOnlyHint, false);
    const resources = await client.listResources();
    assert.equal(resources.resources.length, 2);
    assert((await client.readResource({ uri: 'praksa://profile' })).contents[0].text.includes('urn:fipu:bpmn:1'));
    assert.equal((await call('bpmn_get_guidance')).catalog.connectors.length, 3);
    assert.deepEqual((await call('bpmn_list_models')).models, ['A.bpmn', 'B.bpmn']);
    const initial = await call('bpmn_read_model', { file: 'A.bpmn', includeXml: true });
    assert.equal(initial.nodes.length, 35);
    assert.equal(initial.xml, xmlA);
    assert((await call('bpmn_validate_model', { file: 'A.bpmn' })).valid);
    assert((await call('bpmn_validate_model', { file: 'B.bpmn' })).valid);
    const task = initial.nodes.find(node => node.type === 'serviceTask');
    const user = initial.nodes.find(node => node.type === 'userTask');
    const focused = await call('bpmn_read_model', { file: 'A.bpmn', elementId: task.id });
    assert.equal(focused.element.id, task.id);
    assert(!('nodes' in focused));
    const operations = [
      { op: 'update_element', id: task.id, patch: { name: 'Agent edit < &', documentation: 'Model edit through MCP', inputs: { ...task.inputs, mcp_test: '${student_email}' }, outputs: task.outputs, connector: task.connector } },
      { op: 'update_element', id: user.id, patch: { formFields: user.formFields.map((field, index) => index ? field : { ...field, label: 'Reviewed field' }) } },
      { op: 'move_element', id: task.id, x: task.x + 20, y: task.y },
    ];
    const args = { file: 'A.bpmn', expectedRevision: initial.revision, operations };
    const preview = await call('bpmn_edit_model', { ...args, includeXml: true });
    assert(preview.valid && !preview.saved);
    assert(preview.changes.updated.some(item => item.after.id === task.id && item.after.name === 'Agent edit < &'));
    assert.equal(await readFile(join(directory, 'A.bpmn'), 'utf8'), xmlA, 'Preview leaves the file byte-identical');
    const saved = await call('bpmn_edit_model', { ...args, save: true });
    assert(saved.saved && saved.revision === preview.proposedRevision);
    assert.equal(await readFile(join(directory, 'A.bpmn'), 'utf8'), preview.xml);
    assert(preview.xml.includes('Keep this metadata'));
    const edited = await call('bpmn_read_model', { file: 'A.bpmn' });
    assert.deepEqual(edited.nodes.map(node => node.id), initial.nodes.map(node => node.id));
    const editedTask = edited.nodes.find(node => node.id === task.id);
    assert.deepEqual(editedTask.connector, task.connector);
    assert.equal(editedTask.inputs.mcp_test, '${student_email}');
    assert.equal(editedTask.x, task.x + 20);
    assert.equal(edited.nodes.find(node => node.id === user.id).formFields[0].label, 'Reviewed field');
    assert.deepEqual(edited.nodes.find(node => node.id === user.id).formFields.map(field => field.id), user.formFields.map(field => field.id));
    await call('bpmn_edit_model', { ...args, save: true }, true);

    const invalid = await call('bpmn_edit_model', { ...args, expectedRevision: saved.revision, save: true, operations: [{ op: 'update_element', id: task.id, patch: { connector: { ...task.connector, url: '/unknown' } } }] }, true);
    assert(!invalid.saved && invalid.issues.some(issue => issue.severity === 'error'));
    await rejects('bpmn_edit_model', { ...args, expectedRevision: saved.revision, save: true, operations: [{ op: 'update_element', id: task.id, patch: { id: 'renamed' } }] });
    assert.equal(await readFile(join(directory, 'A.bpmn'), 'utf8'), preview.xml, 'Rejected edits leave the file unchanged');

    // Inserting a connector task is invalid halfway through; the final batch must validate.
    const flow = edited.flows.find(item => item.sourceRef === user.id);
    const batch = [
      { op: 'add_node', id: 'mcp_service', type: 'serviceTask', name: 'New connector task', x: task.x, y: task.y + 120, laneId: task.laneId },
      { op: 'update_element', id: 'mcp_service', patch: { connector: task.connector, inputs: task.inputs, outputs: task.outputs } },
      { op: 'remove_element', id: flow.id },
      { op: 'add_flow', id: 'mcp_in', sourceId: flow.sourceRef, targetId: 'mcp_service' },
      { op: 'add_flow', id: 'mcp_out', sourceId: 'mcp_service', targetId: flow.targetRef },
    ];
    const graph = await call('bpmn_edit_model', { file: 'A.bpmn', expectedRevision: saved.revision, operations: batch, save: true });
    assert(graph.saved && graph.changes.added.some(item => item.id === 'mcp_in'));
    assert((await call('bpmn_validate_model', { file: 'A.bpmn' })).valid);
    const graphXml = await readFile(join(directory, 'A.bpmn'), 'utf8');
    await call('bpmn_edit_model', { file: 'A.bpmn', expectedRevision: graph.revision, operations: [{ op: 'remove_element', id: initial.nodes.find(node => node.type === 'startEvent').id }], save: true }, true);
    assert.equal(await readFile(join(directory, 'A.bpmn'), 'utf8'), graphXml);

    for (const file of ['../outside.bpmn', join(temporary, 'outside.bpmn'), 'link.bpmn', 'ignored.txt']) await rejects('bpmn_read_model', { file });
    await writeFile(join(directory, 'large.bpmn'), ' '.repeat(2_000_001));
    await rejects('bpmn_read_model', { file: 'large.bpmn' });
    for (const xml of ['<broken>', '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>']) {
      await writeFile(join(directory, 'bad.bpmn'), xml);
      await rejects('bpmn_read_model', { file: 'bad.bpmn' });
    }
    const unsupported = sourceB.replace('</bpmn:process>', '<bpmn:subProcess id="unsupported" /></bpmn:process>');
    await writeFile(join(directory, 'unsupported.bpmn'), unsupported);
    const invalidSource = await call('bpmn_read_model', { file: 'unsupported.bpmn' });
    await call('bpmn_edit_model', { file: 'unsupported.bpmn', expectedRevision: invalidSource.revision, operations: [{ op: 'update_element', id: invalidSource.nodes[0].id, patch: { name: 'Changed' } }], save: true }, true);
    assert.equal(await readFile(join(directory, 'unsupported.bpmn'), 'utf8'), unsupported);

    const other = await connect();
    const b = await call('bpmn_read_model', { file: 'B.bpmn' });
    const concurrent = { file: 'B.bpmn', expectedRevision: b.revision, operations: [{ op: 'update_element', id: b.nodes[0].id, patch: { name: 'Concurrent update' } }], save: true };
    const outcomes = await Promise.all([client.callTool({ name: 'bpmn_edit_model', arguments: concurrent }), other.callTool({ name: 'bpmn_edit_model', arguments: concurrent })]);
    assert.equal(outcomes.filter(outcome => !outcome.isError && outcome.structuredContent.saved).length, 1, 'Only one stale-revision contender saves');
    assert(!(await readdir(directory)).some(file => file.endsWith('.mcp.lock') || file.endsWith('.tmp')));
    assert.equal(await readFile(join(temporary, 'outside.bpmn'), 'utf8'), sourceA);
  } finally {
    await Promise.all(clients.map(client => client.close()));
    await rm(temporary, { recursive: true, force: true });
  }
});
