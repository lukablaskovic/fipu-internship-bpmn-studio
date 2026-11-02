import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createModelStore, revision } from './model-store.mjs';
import { parseModel, validateModel } from './packages/bpmn/model.js';

const { window } = new JSDOM('');
globalThis.DOMParser = window.DOMParser;
globalThis.XMLSerializer = window.XMLSerializer;
const catalog = JSON.parse(readFileSync(new URL('./public/connectors.json', import.meta.url), 'utf8'));
const files = new Set(['strucna_praksa_A.bpmn', 'strucna_praksa_B.bpmn']);

// Local authoring only: no public write API is added to the workflow engine.
export function modelApi(directory) {
  return async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/models/')) return next();
    const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const origin = new URL(`http://${req.headers.host}`);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || (req.headers.origin && req.headers.origin !== origin.origin)) return reply(403, { error: 'Model authoring is available only on the local Studio origin.' });
      const file = decodeURIComponent(url.pathname.slice('/api/models/'.length));
      if (!files.has(file)) return reply(404, { error: 'Unknown model.' });
      const store = createModelStore(directory);
      if (req.method === 'GET') {
        const { xml, revision } = store.readFile(file);
        return reply(200, { xml, revision });
      }
      if (req.method !== 'PUT') return reply(405, { error: 'Use GET or PUT.' });
      if (req.headers['x-praksa-editor'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) return reply(403, { error: 'Expected a Studio JSON request.' });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 3_000_000) return reply(413, { error: 'Request is too large.' });
        chunks.push(chunk);
      }
      const { xml, expectedRevision } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (typeof xml !== 'string' || Buffer.byteLength(xml) > 2_000_000 || !/^[a-f0-9]{64}$/.test(expectedRevision)) return reply(400, { error: 'Expected BPMN XML and the revision read from this model.' });
      const issues = validateModel(parseModel(xml), catalog);
      if (issues.some(issue => issue.severity === 'error')) return reply(422, { error: 'Ispravite pogreške modela prije spremanja.', issues });
      try { store.save(file, expectedRevision, xml); }
      catch (error) { if (/changed|lock/i.test(error.message)) return reply(409, { error: 'Model je izmijenjen izvan Studija. Izvezite svoju skicu i ponovno učitajte model prije spremanja.' }); throw error; }
      return reply(200, { revision: revision(xml) });
    } catch (error) { reply(error.code === 'ENOENT' ? 503 : 400, { error: error.code === 'ENOENT' ? 'Izvorni modeli nisu dostupni. Postavite BPMN_MODELS_DIR na direktorij enginea models/.' : error.message }); }
  };
}
