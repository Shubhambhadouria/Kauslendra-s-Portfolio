import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import http from 'node:http';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDatabaseStorage } from '../database-storage.js';
import { createVault } from '../vault.js';

const storageFor = database => createDatabaseStorage('', { pool: new (database.adapters.createPg().Pool)() });

test('database persists state, binary documents and messages; stale writes cannot overwrite data', async () => {
  const database = newDb({ noAstCoverageCheck: true });
  const first = await storageFor(database), second = await storageFor(database);
  try {
    assert.deepEqual(await first.loadStore(), { users: [], documents: [] });
    await second.loadStore();
    await first.saveStore({ users: [{ username: 'officer' }], documents: [] });
    await assert.rejects(second.saveStore({ users: [], documents: [] }), { status: 409 });
    assert.equal((await second.loadStore()).users[0].username, 'officer');
    await second.saveStore({ users: [{ username: 'officer' }], documents: [{ id: 'one' }] });
    await assert.rejects(first.saveStore({ users: [], documents: [] }), { status: 409 });
    assert.equal((await first.loadStore()).documents.length, 1);
    await first.loadConfig({ enabled: false, folderId: '' });
    await first.saveConfig({ enabled: false, folderId: 'private-folder' });
    assert.equal((await second.loadConfig({})).folderId, 'private-folder');
    const id = '11111111-1111-4111-8111-111111111111';
    await first.writeFile(id, Buffer.from('private document'));
    assert.equal((await second.readFile(id)).toString(), 'private document');
    await second.deleteFile(id);
    await assert.rejects(first.readFile(id), { status: 404 });
    await first.saveMessage({ id, message: 'Contact request' });
    assert.equal(database.public.many('SELECT value FROM fire_vault_messages')[0].value.message, 'Contact request');
  } finally { await first.close(); await second.close(); }
});

test('hosted vault preserves passwords, settings, uploads and highlights after a server restart', async () => {
  const database = newDb({ noAstCoverageCheck: true }), directory = await mkdtemp(path.join(os.tmpdir(), 'vault-database-'));
  let storage = await storageFor(database), vault, server, base, csrf, cookie;
  const sourceFactory = () => ({ kind: 'google-drive', list: async () => [], read: async () => Buffer.from('') });
  async function start() {
    vault = await createVault(directory, { persistence: storage, createDocumentSource: sourceFactory });
    server = http.createServer(async (req, res) => { await vault.handle(req, res, new URL(req.url, 'http://localhost')); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() { await new Promise(resolve => server.close(resolve)); await storage.close(); }
  const request = (route, method = 'GET', body, extra = {}) => fetch(base + '/api/vault' + route, {
    method, headers: { 'Content-Type': 'application/json', 'X-Vault-Request': '1',
      ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-Vault-CSRF': csrf } : {}), ...extra },
    ...(body !== undefined ? { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) } : {}),
  });
  async function login(mode, password) {
    const response = await request('/login', 'POST', { mode, password });
    assert.equal(response.status, 200); cookie = response.headers.get('set-cookie').split(';')[0]; csrf = (await response.json()).csrfToken;
  }
  try {
    await start();
    await assert.rejects(vault.initialize('same-password-123', 'same-password-123'));
    assert.equal(vault.hasAdmin(), false);
    await vault.initialize('Officer-password-123', 'Viewer-password-123');
    await login('officer', 'Officer-password-123');
    let response = await request('/storage', 'PUT', { enabled: false, folderUrl: 'https://drive.google.com/drive/folders/1234567890_private' });
    assert.equal(response.status, 200);
    response = await request('/documents', 'POST', Buffer.from('Keep exits clear.'), { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'safety.txt' });
    assert.equal(response.status, 201); const id = (await response.json()).document.id;
    response = await request(`/documents/${id}/annotations`, 'PUT', { revision: 0, highlights: [{ kind: 'text', start: 0, end: 4, color: 'yellow' }] });
    assert.equal(response.status, 200);
    await stop(); storage = await storageFor(database); await start();
    await vault.initialize('Replacement-password-123', 'Replacement-viewer-123');
    assert.equal((await request('/documents')).status, 401);
    cookie = null; csrf = null; await login('officer', 'Officer-password-123');
    assert.equal((await (await request('/storage')).json()).folderUrl, 'https://drive.google.com/drive/folders/1234567890_private');
    assert.equal(await (await request(`/documents/${id}`)).text(), 'Keep exits clear.');
    assert.equal((await (await request(`/documents/${id}/annotations`)).json()).highlights.length, 1);
    cookie = null; csrf = null; await login('viewer', 'Viewer-password-123');
    assert.equal((await request('/storage')).status, 403);
    assert.equal(await (await request(`/documents/${id}`)).text(), 'Keep exits clear.');
    assert.deepEqual(await readdir(path.join(directory, 'files')), []);
  } finally { await stop(); await rm(directory, { recursive: true, force: true }); }
});
