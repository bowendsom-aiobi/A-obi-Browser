'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

function file() {
  return path.join(app.getPath('userData'), 'vault.bin');
}

function status() {
  const ok = safeStorage.isEncryptionAvailable();
  let backend = 'os';
  try {
    if (process.platform === 'linux') backend = safeStorage.getSelectedStorageBackend();
  } catch {
    backend = 'unknown';
  }
  return { ok, backend, weak: backend === 'basic_text' };
}

function readAll() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return [];
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(file()))) || [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), safeStorage.encryptString(JSON.stringify(list)));
  } catch {
    /* best-effort */
  }
}

function save({ origin, username, password }) {
  if (!origin || !password) return;
  const list = readAll();
  const user = username || '';
  const entry = { origin, username: user, password, updatedAt: Date.now() };
  const i = list.findIndex((e) => e.origin === origin && e.username === user);
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  writeAll(list);
}

function matchOne(origin) {
  const found = readAll().filter((e) => e.origin === origin);
  return found.length === 1 ? { username: found[0].username, password: found[0].password } : null;
}

function listSafe() {
  return readAll()
    .map(({ origin, username, updatedAt }) => ({ origin, username, updatedAt }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function remove(origin, username) {
  writeAll(readAll().filter((e) => !(e.origin === origin && e.username === (username || ''))));
}

module.exports = { status, save, matchOne, listSafe, remove };
