import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { modelApi } from '../model-api.mjs';
import { createModelStore } from '../model-store.mjs';
import { modelXml } from './model-source.mjs';

test('Studio and MCP share two files, validation, revision guards and atomic writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'praksa-source-'));
  const file = 'strucna_praksa_A.bpmn';
  const xml = await modelXml('A');
  await writeFile(join(directory, file), xml);
  await writeFile(join(directory, 'strucna_praksa_B.bpmn'), await modelXml('B'));
  const handler = modelApi(directory);
  const server = createServer((req, res) => handler(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const url = `${origin}/api/models/${file}`;
  const put = (xml, expectedRevision, extra = {}) => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Praksa-Editor': '1', ...extra }, body: JSON.stringify({ xml, expectedRevision }) });
  try {
    const initial = await (await fetch(url)).json();
    assert.equal(initial.xml, xml);
    assert.equal(initial.version >= 1, true);
    const changed = xml.replace('name="Spremanje preferencija u baserow"', 'name="Provjera zajedničkog izvora"');
    const response = await put(changed, initial.revision);
    assert.equal(response.status, 200);
    const stored = await (await fetch(url)).json();
    assert.equal(stored.version, initial.version + 1);
    assert.ok(stored.xml.includes('Provjera zajedničkog izvora'));
    assert.deepEqual(await (await put(changed, stored.revision)).json(), { version: stored.version, revision: stored.revision });
    assert.equal(await readFile(join(directory, file), 'utf8'), stored.xml);
    const store = createModelStore(directory);
    assert.equal(store.readFile(file).xml, stored.xml);
    assert.equal((await put(xml, initial.revision)).status, 409);
    assert.throws(() => store.save(file, initial.revision, xml), /changed/);
    const current = store.readFile(file);
    assert.equal((await put('<broken>', current.revision)).status, 400);
    assert.equal((await put(changed.replace('/api/student_preferencije', '/unregistered'), current.revision)).status, 422);
    assert.equal((await put(xml, current.revision, { Origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await put(xml, current.revision, { 'X-Praksa-Editor': '' })).status, 403);
    assert.equal((await fetch(`${origin}/api/models/extra.bpmn`)).status, 404);
    assert.equal((await fetch(`${origin}/api/models/%2e%2e%2foutside.bpmn`)).status, 404);
    assert.equal(await readFile(join(directory, file), 'utf8'), stored.xml);
    store.save(file, current.revision, xml);
    assert.equal((await (await fetch(url)).json()).xml, xml, 'Studio reads an MCP-style save immediately');
    await rm(join(directory, file));
    await symlink(join(directory, 'strucna_praksa_B.bpmn'), join(directory, file));
    assert.equal((await fetch(url)).status, 400);
    assert.deepEqual((await readdir(directory)).sort(), ['strucna_praksa_A.bpmn', 'strucna_praksa_B.bpmn']);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
