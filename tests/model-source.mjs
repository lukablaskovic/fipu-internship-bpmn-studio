import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const modelsDirectory = process.env.BPMN_MODELS_DIR || fileURLToPath(new URL('../../python-bpmn-engine/models', import.meta.url));
export const modelXml = name => readFile(resolve(modelsDirectory, `strucna_praksa_${name}.bpmn`), 'utf8');

// UI regressions must never save edits into the real model files.
export async function mockModelSource(context) {
  const models = Object.fromEntries(await Promise.all(['A', 'B'].map(async name => [name, await modelXml(name)])));
  const revision = xml => createHash('sha256').update(xml).digest('hex');
  await context.route('**/api/models/*', async route => {
    const name = new URL(route.request().url()).pathname.match(/strucna_praksa_([AB])\.bpmn$/)?.[1];
    if (!name) return route.fulfill({ status: 404, json: { error: 'Unknown model' } });
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      if (body.expectedRevision !== revision(models[name])) return route.fulfill({ status: 409, json: { error: 'Model je izmijenjen izvan Studija.' } });
      models[name] = body.xml;
    }
    await route.fulfill({ json: { xml: models[name], revision: revision(models[name]) } });
  });
  return models;
}
