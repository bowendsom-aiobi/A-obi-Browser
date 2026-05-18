'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const HISTORY_LIMIT = 500;

function file(name) {
  return path.join(app.getPath('userData'), name);
}

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  try {
    fs.mkdirSync(path.dirname(file(name)), { recursive: true });
    fs.writeFileSync(file(name), JSON.stringify(value, null, 2));
  } catch {
    /* best-effort */
  }
}

function listBookmarks() {
  return readJson('bookmarks.json', []);
}

function isBookmarked(url) {
  return listBookmarks().some((b) => b.url === url);
}

function toggleBookmark(meta) {
  if (!meta || !meta.url) return false;
  const items = listBookmarks();
  const i = items.findIndex((b) => b.url === meta.url);
  if (i >= 0) {
    items.splice(i, 1);
    writeJson('bookmarks.json', items);
    return false;
  }
  items.unshift({
    url: meta.url,
    title: meta.title || meta.url,
    favicon: meta.favicon || null,
    addedAt: Date.now(),
  });
  writeJson('bookmarks.json', items);
  return true;
}

function removeBookmark(url) {
  writeJson(
    'bookmarks.json',
    listBookmarks().filter((b) => b.url !== url)
  );
}

function reorderBookmarks(urls) {
  const remaining = new Map(listBookmarks().map((b) => [b.url, b]));
  const ordered = [];
  for (const url of urls) {
    if (remaining.has(url)) {
      ordered.push(remaining.get(url));
      remaining.delete(url);
    }
  }
  for (const b of remaining.values()) ordered.push(b);
  writeJson('bookmarks.json', ordered);
}

function listHistory() {
  return readJson('history.json', []);
}

function addHistory(meta) {
  if (!meta || !meta.url) return;
  const all = listHistory();
  const prev = all.find((h) => h.url === meta.url);
  const items = all.filter((h) => h.url !== meta.url);
  items.unshift({
    url: meta.url,
    title: meta.title || meta.url,
    favicon: meta.favicon || (prev && prev.favicon) || null,
    visitedAt: Date.now(),
  });
  writeJson('history.json', items.slice(0, HISTORY_LIMIT));
}

function clearHistory() {
  writeJson('history.json', []);
}

function readSession() {
  return readJson('session.json', null);
}

function saveSession(data) {
  writeJson('session.json', data);
}

module.exports = {
  listBookmarks,
  isBookmarked,
  toggleBookmark,
  removeBookmark,
  reorderBookmarks,
  listHistory,
  addHistory,
  clearHistory,
  readSession,
  saveSession,
};
