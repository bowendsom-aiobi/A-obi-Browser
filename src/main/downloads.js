'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, shell } = require('electron');

const items = [];
let seq = 0;
let onChange = () => {};

function summary() {
  return { active: items.filter((d) => d.state === 'progressing').length };
}

function notifyChange() {
  onChange(summary());
}

function uniquePath(dir, name) {
  let candidate = path.join(dir, name);
  if (!fs.existsSync(candidate)) return candidate;
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let i = 1;
  do {
    candidate = path.join(dir, `${base} (${i})${ext}`);
    i += 1;
  } while (fs.existsSync(candidate));
  return candidate;
}

function init(ses, notify) {
  onChange = notify || (() => {});
  ses.on('will-download', (_event, item) => {
    const dir = app.getPath('downloads');
    const savePath = uniquePath(dir, item.getFilename());
    item.setSavePath(savePath);

    const record = {
      id: `d${++seq}`,
      name: path.basename(savePath),
      path: savePath,
      url: item.getURL(),
      total: item.getTotalBytes(),
      received: 0,
      state: 'progressing',
      startedAt: Date.now(),
    };
    items.unshift(record);
    notifyChange();

    item.on('updated', (_e, state) => {
      record.received = item.getReceivedBytes();
      record.state = state;
      notifyChange();
    });
    item.once('done', (_e, state) => {
      record.state = state === 'completed' ? 'completed' : 'failed';
      record.received = item.getReceivedBytes();
      notifyChange();
    });
  });
}

function list() {
  return items.map((d) => ({ ...d }));
}

function open(p) {
  shell.openPath(p);
}

function reveal(p) {
  shell.showItemInFolder(p);
}

function clearFinished() {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (items[i].state !== 'progressing') items.splice(i, 1);
  }
  notifyChange();
}

module.exports = { init, list, open, reveal, clearFinished };
