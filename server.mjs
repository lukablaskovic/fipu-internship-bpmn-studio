import express from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { modelApi } from './model-api.mjs';
import { isStudioEditor } from './studio-access.mjs';

const app = express();
const origin = 'https://fipu-praksa.unipu.hr';
const audience = '182844940133-k5k1t08dposga8083n6nek2r4gjo9a7l.apps.googleusercontent.com';
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const cookie = '__Secure-praksa_studio';
async function verify(token) {
  const { payload } = await jwtVerify(token, keys, { algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'], audience, requiredClaims: ['exp', 'sub'] });
  return isStudioEditor(payload);
}
app.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
app.post('/login', express.json({ limit: '8kb' }), async (req, res) => {
  if (req.headers.origin !== origin) return res.sendStatus(403);
  try {
    if (!await verify(req.body.credential)) return res.sendStatus(403);
    res.cookie(cookie, req.body.credential, { secure: true, httpOnly: true, sameSite: 'strict', path: '/studio/' }).sendStatus(204);
  } catch { res.sendStatus(401); }
});
app.use(async (req, res, next) => {
  const token = (req.headers.cookie || '').split('; ').find(entry => entry.startsWith(cookie + '='))?.slice(cookie.length + 1);
  try { if (token && await verify(token)) return next(); } catch {}
  if (req.method !== 'GET' || !req.accepts('html') || req.path.startsWith('/api/')) return res.sendStatus(401);
  res.type('html').send(`<!doctype html><html lang="hr"><meta charset="utf-8"><title>Prijava · BPMN Studio</title><h1>Praksa BPMN Studio</h1><div id="g_id_onload" data-client_id="${audience}" data-callback="login" data-auto_prompt="false"></div><div class="g_id_signin"></div><p role="status" id="message"></p><script>async function login({credential}) { try { const r=await fetch('/studio/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential})}); if(r.ok) location.reload(); else message.textContent='Pristup nije odobren.'; } catch {message.textContent='Prijava nije uspjela.';} }</script><script async src="https://accounts.google.com/gsi/client"></script></html>`);
});
app.use(modelApi(process.env.BPMN_MODELS_DIR, origin));
app.use(express.static('dist', { cacheControl: false }));
app.get(/^\/(?:admin(?:\/model\/[^/]+\/\d+)?)?\/?$/, (_req,res) => res.sendFile('dist/index.html', {root:'.'}));
app.listen(8080);
