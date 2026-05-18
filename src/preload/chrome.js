'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel) => (callback) => {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const i18nData = ipcRenderer.sendSync('i18n:get');
let curLang = i18nData.lang;

contextBridge.exposeInMainWorld('aiobi', {
  t: (k) => (i18nData.strings[curLang] && i18nData.strings[curLang][k]) || i18nData.strings.fr[k] || k,
  lang: () => curLang,
  onLang: (cb) => {
    ipcRenderer.on('lang:changed', (_e, l) => {
      curLang = l;
      cb(l);
    });
  },
  newTab: (input) => ipcRenderer.invoke('tab:new', input),
  closeTab: (id) => ipcRenderer.invoke('tab:close', id),
  activateTab: (id) => ipcRenderer.invoke('tab:activate', id),
  reorderTabs: (ids) => ipcRenderer.invoke('tab:reorder', ids),

  go: (input) => ipcRenderer.invoke('nav:go', input),
  back: () => ipcRenderer.invoke('nav:back'),
  forward: () => ipcRenderer.invoke('nav:forward'),
  reload: () => ipcRenderer.invoke('nav:reload'),
  stop: () => ipcRenderer.invoke('nav:stop'),
  openInternal: (route) => ipcRenderer.invoke('nav:open-internal', route),

  setEngine: (id) => ipcRenderer.invoke('engine:set', id),
  toggleChat: (force) => ipcRenderer.invoke('chat:toggle', force),
  openSuite: (key) => ipcRenderer.invoke('suite:open', key),
  toggleSidebar: () => ipcRenderer.invoke('ui:toggle-sidebar'),
  sidebarAnimDone: (state) => ipcRenderer.invoke('sidebar:anim-done', state),
  onSidebar: subscribe('sidebar:anim'),

  toggleBookmark: () => ipcRenderer.invoke('bookmark:toggle'),
  listBookmarks: () => ipcRenderer.invoke('bookmark:list'),
  reorderBookmarks: (urls) => ipcRenderer.invoke('bookmark:reorder', urls),
  suggest: (query) => ipcRenderer.invoke('omnibox:suggest', query),

  onEngines: subscribe('engines:list'),
  onBookmarks: subscribe('bookmarks:changed'),
  onDownloads: subscribe('downloads:changed'),
  onFocusAddress: subscribe('ui:focus-address'),
  onTabCreated: subscribe('tab:created'),
  onTabActivated: subscribe('tab:activated'),
  onTabClosed: subscribe('tab:closed'),
  onTabState: subscribe('tab:state'),
  onTabLoading: subscribe('tab:loading'),
  onTabFavicon: subscribe('tab:favicon'),
});
