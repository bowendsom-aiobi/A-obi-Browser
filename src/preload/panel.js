'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel) {
  return (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

const i18nData = ipcRenderer.sendSync('i18n:get');
let curLang = i18nData.lang;

contextBridge.exposeInMainWorld('panel', {
  t: (k) => (i18nData.strings[curLang] && i18nData.strings[curLang][k]) || i18nData.strings.fr[k] || k,
  onLang: (cb) => {
    ipcRenderer.on('lang:changed', (_e, l) => {
      curLang = l;
      cb(l);
    });
  },
  resize: (delta) => ipcRenderer.send('chat:resize', delta),
  openSidebar: () => ipcRenderer.invoke('sidebar:open'),

  find: (text) => ipcRenderer.invoke('find:query', text),
  findNext: (text, forward) => ipcRenderer.invoke('find:next', { text, forward }),
  findStop: () => ipcRenderer.invoke('find:stop'),
  findClose: () => ipcRenderer.invoke('find:close'),
  onFindResult: subscribe('find:result'),
  onFindFocus: subscribe('find:focus'),
});
