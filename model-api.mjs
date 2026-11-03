import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createModelStore, nextDefinition, processVersion, revision } from './model-store.mjs';
import { parseModel, validateModel } from './packages/bpmn/model.js';

const { window } = new JSDOM('');
globalThis.DOMParser = window.DOMParser;
globalThis.XMLSerializer = window.XMLSerializer;
const catalog = JSON.parse(readFileSync(new URL('./public/connectors.json', import.meta.url), 'utf8'));
const files = new Set(['strucna_praksa_A.bpmn', 'strucna_praksa_B.bpmn']);

// Local authoring only: no public write API is added to the workflow engine.
export function modelApi(directory, publicOrigin) {
  return async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/models/')) return next();
    const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const origin = new URL(`http://${req.headers.host}`);
      const dashboardRead = !publicOrigin && req.method === 'GET' && files.has(url.pathname.slice('/api/models/'.length))
        && req.headers.origin === 'http://localhost:5173';
      if (publicOrigin ? (req.method !== 'GET' && req.headers.origin !== publicOrigin) : !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || (req.headers.origin && req.headers.origin !== origin.origin && !dashboardRead)) return reply(403, { error: 'Model authoring is available only on the local Studio origin.' });
      if (dashboardRead) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      const file = decodeURIComponent(url.pathname.slice('/api/models/'.length));
      const historical = /^(strucna_praksa_[AB]\.bpmn)\/(history|[1-9]\d*)$/.exec(file);
      if (historical) {
        if (req.method !== 'GET') return reply(405, { error: 'Archived versions are read-only.' });
        try {
          const store = createModelStore(directory);
          if (historical[2] === 'history') return reply(200, { versions: store.listVersions(historical[1]) });
          const { xml } = store.readVersion(historical[1], historical[2]);
          return reply(200, { xml });
        } catch (error) {
          if (error.code === 'ENOENT') return reply(404, { error: 'Version unavailable.' });
          throw error;
        }
      }
      if (!files.has(file)) return reply(404, { error: 'Unknown model.' });
      const store = createModelStore(directory);
      if (req.method === 'GET') {
        const { xml, revision } = store.readFile(file);
        return reply(200, { xml, revision, version: processVersion(parseModel(xml)) });
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
      const candidate = parseModel(xml);
      const issues = validateModel(candidate, catalog);
      if (issues.some(issue => issue.severity === 'error')) return reply(422, { error: 'Ispravite pogreške modela prije spremanja.', issues });
      const next = nextDefinition(store.readFile(file).xml, candidate);
      try { store.save(file, expectedRevision, next.xml); }
      catch (error) { if (/changed|lock/i.test(error.message)) return reply(409, { error: 'Model je izmijenjen izvan Studija. Izvezite svoju skicu i ponovno učitajte model prije spremanja.' }); throw error; }
      return reply(200, { revision: revision(next.xml), version: next.version });
    } catch (error) { reply(error.code === 'ENOENT' ? 503 : 400, { error: error.code === 'ENOENT' ? 'Izvorni modeli nisu dostupni. Postavite BPMN_MODELS_DIR na direktorij enginea models/.' : error.message }); }
  };
}
