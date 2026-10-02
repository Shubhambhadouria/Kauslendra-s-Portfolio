import http from 'node:http';
import { readFile, mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createVault } from './vault.js';
import { createGoogleDriveSource } from './google-drive.js';
import { createDatabaseStorage } from './database-storage.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const production = process.argv.includes('--production');
if(production && process.env.RENDER && !process.env.DATABASE_URL)throw Error('Set DATABASE_URL before deploying on Render so vault data persists.');
const vaultDirectory = path.resolve(process.env.VAULT_DIRECTORY || path.join(root, '.vault'));
const contactDirectory = path.resolve(process.env.CONTACT_STORAGE_DIRECTORY || path.join(root, 'data'));
const driveCredentialsPath=path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(vaultDirectory,'google-service-account.json'));
const createDocumentSource = folderId => createGoogleDriveSource({folderId,
  credentialsPath:driveCredentialsPath});
const defaultDriveFolderId=process.env.GOOGLE_DRIVE_FOLDER_ID||'';
const persistence=process.env.DATABASE_URL?await createDatabaseStorage(process.env.DATABASE_URL):null;
const vault = await createVault(vaultDirectory, {createDocumentSource,defaultDriveFolderId,
  persistence, documentSource:defaultDriveFolderId?createDocumentSource(defaultDriveFolderId):null});
if(process.env.INITIAL_OFFICER_PASSWORD||process.env.INITIAL_VIEWER_PASSWORD){
  await vault.initialize(process.env.INITIAL_OFFICER_PASSWORD,process.env.INITIAL_VIEWER_PASSWORD);
  delete process.env.INITIAL_OFFICER_PASSWORD;delete process.env.INITIAL_VIEWER_PASSWORD;
}
const vite = production ? null : await (await import('vite')).createServer({ server: { middlewareMode: true, fs: { deny: ['**/.vault/**', '**/data/**', '**/.env*', '**/.git/**', path.join(root,'vault.js').replaceAll('\\','/'), '**/google-drive.js', driveCredentialsPath.replaceAll('\\','/'), '**/server.js', '**/scripts/**', '**/tests/**'] } }, appType: 'spa' });
const rates = new Map();
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
export function validateMessage(value) {
  if (!value || typeof value !== 'object') return null;
  const { name, email, message } = value;
  if (typeof name !== 'string' || !name.trim() || name.length > 100 || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof message !== 'string' || message.trim().length < 10 || message.length > 5000) return null;
  return { name: name.trim(), email: email.trim(), message: message.trim() };
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    const decodedPath = decodeURIComponent(url.pathname).replaceAll('\\', '/').toLowerCase();
    if (/(^|\/)(\.vault(?:-test-[^/]*)?|data|\.git|\.env[^/]*)(\/|$)/.test(decodedPath)) return json(res, 404, { error: 'Not found.' });
    if (await vault.handle(req, res, url, production)) return;
    if (url.pathname === '/api/health') return json(res, 200, { status: 'ok' });
    if (url.pathname === '/api/profile' && req.method === 'GET') return json(res, 200, JSON.parse(await readFile(path.join(root, 'data/profile.json'), 'utf8')));
    if (url.pathname === '/api/contact' && req.method === 'POST') {
      if (!req.headers['content-type']?.includes('application/json')) return json(res, 415, { error: 'Please send JSON.' });
      let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 12000) return json(res, 413, { error: 'Message is too large.' }); }
      let value; try { value = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON.' }); }
      const message = validateMessage(value); if (!message) return json(res, 400, { error: 'Enter a name, valid email, and a message of 10–5000 characters.' });
      const key = req.socket.remoteAddress; const recent = (rates.get(key) || []).filter(time => Date.now() - time < 600000);
      if (recent.length >= 5) return json(res, 429, { error: 'Please wait before sending another message.' });
      recent.push(Date.now()); rates.set(key, recent);
      const id = randomUUID(); const savedMessage={ id, createdAt: new Date().toISOString(), ...message };
      if(persistence)await persistence.saveMessage(savedMessage);else{await mkdir(contactDirectory, { recursive: true });await appendFile(path.join(contactDirectory, 'messages.ndjson'), JSON.stringify(savedMessage) + '\n');}
      return json(res, 201, { id, message: 'Message received. Thank you for reaching out.' });
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Endpoint not found.' });
    if (vite) return vite.middlewares(req, res);
    const decoded = decodeURIComponent(url.pathname); const target = path.resolve(root, 'dist', '.' + decoded);
    if(target.toLowerCase()===driveCredentialsPath.toLowerCase())return json(res,404,{error:'Not found.'});
    if (!target.startsWith(path.join(root, 'dist') + path.sep) && target !== path.join(root, 'dist')) return json(res, 403, { error: 'Forbidden' });
    let file = target; let content; try { content = await readFile(file); } catch { if (path.extname(decoded)) return json(res, 404, { error: 'Not found' }); file = path.join(root, 'dist/index.html'); content = await readFile(file); }
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(content);
  } catch (error) { console.error(error); if (!res.headersSent) json(res, 500, { error: 'Something went wrong. Please try again.' }); else res.end(); }
});
if (process.env.NODE_ENV !== 'test') server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Station 07 → http://localhost:' + (process.env.PORT || 3000)));
