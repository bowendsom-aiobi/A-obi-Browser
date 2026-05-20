'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const i18nData = ipcRenderer.sendSync('i18n:get');
let curLang = i18nData.lang;

// Exposed on every tab, but the main process authorises each call by the
// caller's frame URL (only trusted internal file:// pages are honoured).
contextBridge.exposeInMainWorld('aiobiInternal', {
  t: (k) => (i18nData.strings[curLang] && i18nData.strings[curLang][k]) || i18nData.strings.fr[k] || k,
  lang: () => curLang,
  setLang: (code) => ipcRenderer.invoke('lang:set', code),
  onLang: (cb) => {
    ipcRenderer.on('lang:changed', (_e, l) => {
      curLang = l;
      cb(l);
    });
  },
  search: (query) => ipcRenderer.invoke('home:search', query),
  open: (route) => ipcRenderer.invoke('nav:open-internal', route),
  go: (url) => ipcRenderer.invoke('nav:go', url),
  suggest: (query) => ipcRenderer.invoke('omnibox:suggest', query),

  engines: () => ipcRenderer.invoke('engine:list'),
  setEngine: (id) => ipcRenderer.invoke('engine:set', id),

  bookmarks: () => ipcRenderer.invoke('bookmark:list'),
  removeBookmark: (url) => ipcRenderer.invoke('bookmark:remove', url),

  history: () => ipcRenderer.invoke('history:list'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  vaultList: () => ipcRenderer.invoke('vault:list'),
  vaultStatus: () => ipcRenderer.invoke('vault:status'),
  vaultRemove: (entry) => ipcRenderer.invoke('vault:remove', entry),

  downloads: () => ipcRenderer.invoke('downloads:list'),
  downloadOpen: (p) => ipcRenderer.invoke('downloads:open', p),
  downloadReveal: (p) => ipcRenderer.invoke('downloads:reveal', p),
  downloadCancel: (id) => ipcRenderer.invoke('downloads:cancel', id),
  downloadsClear: () => ipcRenderer.invoke('downloads:clear'),
  onDownloads: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('downloads:changed', listener);
    return () => ipcRenderer.removeListener('downloads:changed', listener);
  },
});

// ---- Password capture + autofill (untrusted web pages only) ----
// Runs in the isolated preload world. Nothing is exposed to page JS.
if (location.protocol === 'https:' || location.protocol === 'http:') {
  const setNativeValue = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const usernameField = (scope) =>
    scope.querySelector(
      'input[type=email], input[autocomplete=username], input[type=text], input[name*=user i], input:not([type])'
    );

  window.addEventListener('DOMContentLoaded', async () => {
    try {
      const creds = await ipcRenderer.invoke('vault:match', location.origin);
      if (!creds) return;
      const pw = document.querySelector('input[type=password]');
      if (!pw) return;
      const user = usernameField(pw.form || document);
      if (user && creds.username) setNativeValue(user, creds.username);
      setNativeValue(pw, creds.password);
    } catch {
      /* ignore */
    }
  });

  window.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const pw = form.querySelector('input[type=password]');
      if (!pw || !pw.value) return;
      const user = usernameField(form);
      ipcRenderer.invoke('vault:offer-save', {
        origin: location.origin,
        username: user ? user.value : '',
        password: pw.value,
      });
    },
    true
  );
}
