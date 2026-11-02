import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseModel, serializeModel } from './packages/bpmn/model.js';

export function processVersion(model) {
  const value = model.document.documentElement.getAttribute('processVersion');
  if (value === null) return 1;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid process version.');
  return number;
}

export function nextDefinition(currentXml, candidate) {
  const current = parseModel(currentXml);
  const version = processVersion(current);
  current.document.documentElement.removeAttribute('processVersion');
  candidate.document.documentElement.removeAttribute('processVersion');
  if (serializeModel(current) === serializeModel(candidate)) return { xml: currentXml, version };
  candidate.document.documentElement.setAttribute('processVersion', String(version + 1));
  return { xml: serializeModel(candidate), version: version + 1 };
}

export const revision = xml => createHash('sha256').update(xml).digest('hex');
export function createModelStore(root) {
  const directory = realpathSync(root);
  if (!lstatSync(directory).isDirectory()) throw new Error('Models path must be a directory.');
  function readFile(file) {
    if (!/^[^/\\\0]+\.(bpmn|xml)$/i.test(file)) throw new Error('Invalid model filename.');
    const path = join(directory, file);
    if (!lstatSync(path).isFile()) throw new Error('Only regular model files are supported; symbolic links are not allowed.');
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > 2_000_000) throw new Error('Model files must be regular files smaller than 2 MB.');
      const xml = readFileSync(fd, 'utf8');
      return { path, xml, revision: revision(xml), mode: stat.mode & 0o777 };
    } finally { closeSync(fd); }
  }

  const archive = join(directory, 'history');
  function historyDirectory() {
    if (!lstatSync(archive).isDirectory()) throw new Error('Invalid history directory.');
    return archive;
  }

  function listVersions(file) {
    const current = processVersion(parseModel(readFile(file).xml));
    let entries;
    try { entries = readdirSync(historyDirectory(), { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const versions = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith(file + '.')) continue;
      const match = /^([1-9]\d*)\.xml$/.exec(entry.name.slice(file.length + 1));
      if (match && Number(match[1]) < current) versions.push(Number(match[1]));
    }
    return versions.sort((a, b) => b - a);
  }

  function save(file, expectedRevision, xml) {
    const lock = join(directory, `.${file}.mcp.lock`);
    let lockFd;
    try { lockFd = openSync(lock, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error('Another Studio or MCP save holds the model lock. Retry after it finishes; see docs/mcp.md for stale locks.');
      throw error;
    }
    const temporary = join(directory, `.${file}.${randomUUID()}.tmp`);
    try {
      const current = readFile(file);
      if (current.revision !== expectedRevision) throw new Error('Model changed since it was read. Read it again and review a new preview.');
      if (xml !== current.xml && /^strucna_praksa_[AB]\.bpmn$/.test(file)) {
        const version = processVersion(parseModel(current.xml));
        mkdirSync(archive, { recursive: true });
        const snapshot = join(historyDirectory(), file + '.' + version + '.xml');
        if (existsSync(snapshot)) {
          if (createModelStore(archive).readFile(file + '.' + version + '.xml').revision !== current.revision) throw new Error('Archived version differs from the current definition.');
        } else {
          writeFileSync(temporary, current.xml, { flag: 'wx', mode: current.mode });
          renameSync(temporary, snapshot);
        }
      }
      writeFileSync(temporary, xml, { flag: 'wx', mode: current.mode });
      if (readFile(file).revision !== expectedRevision) throw new Error('Model changed during save; no changes were written.');
      renameSync(temporary, current.path);
    } finally {
      try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      closeSync(lockFd);
      unlinkSync(lock);
    }
  }

  return { readFile, save, listVersions, readVersion: (file, version) => createModelStore(historyDirectory()).readFile(file + '.' + version + '.xml') };
}
