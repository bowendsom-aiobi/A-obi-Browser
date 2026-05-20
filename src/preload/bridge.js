'use strict';

const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Inject a real-Chrome-shaped JS environment into the MAIN world before any
// page script runs. Needed because Google's OAuth "less secure browser" check
// fingerprints navigator.userAgentData + window.chrome, beyond the UA string.
(() => {
  const full = process.versions.chrome || '120.0.0.0';
  const major = full.split('.')[0];
  const platform =
    process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';
  const arch = process.arch === 'arm64' ? 'arm' : 'x86';
  // Values MUST mirror session.js's webRequest Sec-CH-UA rewrite for Google
  // sign-in (browserinfo endpoint compares JS vs HTTP — any diff = block).
  webFrame.executeJavaScript(
    `(() => {
      try {
        const brands = [
          { brand: 'Not(A:Brand', version: '99' },
          { brand: 'Google Chrome', version: '${major}' },
          { brand: 'Chromium', version: '${major}' },
        ];
        const fullVersionList = [
          { brand: 'Not(A:Brand', version: '99.0.0.0' },
          { brand: 'Google Chrome', version: '${full}' },
          { brand: 'Chromium', version: '${full}' },
        ];
        const uaData = {
          brands, mobile: false, platform: '${platform}',
          getHighEntropyValues() {
            return Promise.resolve({
              brands, mobile: false, platform: '${platform}',
              platformVersion: '14.0.0', architecture: '${arch}', bitness: '64', model: '',
              uaFullVersion: '${full}', fullVersionList,
              wow64: false, formFactor: ['Desktop'],
            });
          },
          toJSON() { return { brands, mobile: false, platform: '${platform}' }; },
        };
        try { Object.defineProperty(navigator, 'userAgentData', { value: uaData, configurable: true }); } catch (e) {}
        try { if (!window.chrome) window.chrome = {}; if (!window.chrome.runtime) window.chrome.runtime = { id: undefined }; } catch (e) {}
        try { Object.defineProperty(navigator, 'webdriver', { value: undefined, configurable: true }); } catch (e) {}
      } catch (e) {}
    })();`,
    true
  ).catch(() => {});
})();

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
