'use strict';

const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { app, BaseWindow, WebContentsView, ipcMain, shell, dialog, session } = require('electron');
const { TabManager } = require('./tabs');
const { GEOM, compute, clampChat, findRect } = require('./layout');
const { getEngine, resolveInput, SEARCH_ENGINES } = require('./search-engines');
const { hardenPartition } = require('./session');
const { buildAppMenu } = require('./menu');
const i18n = require('./i18n');
const downloads = require('./downloads');
const settings = require('./settings');
const store = require('./store');
const vault = require('./vault');

const RENDERER = path.join(__dirname, '..', 'renderer');
const APP_ICON = path.join(__dirname, '..', '..', 'build', 'icon.png');
const HOME_URL = 'aiobi://home';
const CHAT_URL = 'https://chat.aiobi.world';
const PRELOAD_CHROME = path.join(__dirname, '..', 'preload', 'chrome.js');
const PRELOAD_BRIDGE = path.join(__dirname, '..', 'preload', 'bridge.js');
const PRELOAD_PANEL = path.join(__dirname, '..', 'preload', 'panel.js');
const CHROME_HTML = path.join(RENDERER, 'chrome.html');
const CHAT_GRIP_HTML = path.join(RENDERER, 'chat-grip.html');
const FIND_HTML = path.join(RENDERER, 'find.html');
const EDGE_HTML = path.join(RENDERER, 'edge.html');

// No global UA spoof: lying as Chrome process-wide created mismatches
// (JS vs HTTP hints) that Google's sign-in classified as "browser may not
// be secure". Native Electron UA everywhere except the Cloudflare challenge
// iframe — see session.js for the scoped rewrite.
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch(
  'disable-features',
  'ThirdPartyStoragePartitioning,PrivacySandboxSettings4,TrackingProtection3pcd,TpcdMetadataGrants,TpcdHeuristicsGrants,DeviceBoundSessions'
);

let win = null;
let sidebar = null;
let chat = null;
let chatGrip = null;
let tabs = null;
let chatOpen = false;
let chatWidth = GEOM.CHAT_DEFAULT;
let findView = null;
let findOpen = false;
let edgeView = null;
let sidebarCollapsed = false;
let contentDocked = true;
let animTimer = null;

function isInternalSender(frame) {
  try {
    if (!frame) return false;
    const url = new URL(frame.url);
    if (url.protocol !== 'file:') return false;
    const rel = path.relative(RENDERER, fileURLToPath(frame.url));
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  } catch {
    return false;
  }
}

function internalOnly(fn) {
  return (event, ...args) => {
    if (!isInternalSender(event.senderFrame)) return undefined;
    return fn(event, ...args);
  };
}

function currentEngine() {
  return getEngine(settings.read().searchEngineId);
}

const SUPPORTED_LANGS = new Set(['fr', 'en', 'mos']);

function currentLang() {
  const l = settings.read().lang;
  return SUPPORTED_LANGS.has(l) ? l : 'fr';
}

const menuActions = {
  newTab: () => openTab(null),
  closeTab: () => tabs && tabs.activeId && tabs.close(tabs.activeId),
  reopenTab: () => tabs && tabs.reopenClosed(),
  focusAddress: () => sidebar && sidebar.webContents.send('ui:focus-address'),
  find: () => (findOpen ? hideFind() : showFind()),
  toggleSidebar: () => toggleSidebar(),
  reload: () => tabs && tabs.reload(),
  back: () => tabs && tabs.back(),
  forward: () => tabs && tabs.forward(),
  zoomIn: () => tabs && tabs.zoomIn(),
  zoomOut: () => tabs && tabs.zoomOut(),
  zoomReset: () => tabs && tabs.zoomReset(),
  toggleDevTools: () => tabs && tabs.toggleDevTools(),
  openInternal: (route) => tabs && tabs.navigate(`aiobi://${route}`),
};

function applyMenu() {
  const lang = currentLang();
  buildAppMenu(menuActions, (k) => i18n.t(k, lang));
}

function broadcastLang() {
  const lang = currentLang();
  for (const v of [sidebar, chat, chatGrip, findView]) {
    if (v && !v.webContents.isDestroyed()) v.webContents.send('lang:changed', lang);
  }
  if (tabs) tabs.broadcast('lang:changed', lang);
}

const SUITE = {
  docs: { url: 'https://docs.aiobi.world', fallback: 'https://aiobi-docs.duckdns.org:8443/' },
  forms: { url: 'https://forms.aiobi.world' },
  sheets: { url: 'https://sheets.aiobi.world' },
  drive: { url: 'https://drive.aiobi.world' },
  mail: { url: 'https://mail.aiobi.world' },
  meet: { url: 'https://meet.aiobi.world' },
  calendar: { url: 'https://calendar.aiobi.world' },
};

function openTab(input) {
  const url = input ? resolveInput(input, currentEngine()) || HOME_URL : HOME_URL;
  return tabs.create(url);
}

function openSuite(key) {
  const s = SUITE[key];
  if (s && tabs) tabs.create(s.url, s.fallback);
}

function relayout() {
  if (!win) return;
  const h = win.getContentBounds().height;
  // Content geometry follows `contentDocked` (decoupled from the slide so it
  // is only resized while occluded by the sidebar — no visible jump).
  const box = compute(win.getContentBounds(), {
    chatOpen,
    chatWidth,
    sidebarCollapsed: !contentDocked,
  });
  sidebar.setVisible(!sidebarCollapsed);
  if (!sidebarCollapsed) {
    win.contentView.addChildView(sidebar); // overlay on top, full width
    sidebar.setBounds({ x: 0, y: 0, width: GEOM.SIDEBAR_W, height: h });
  }
  tabs.setContentBounds(box.content);
  if (chatOpen && chat) {
    chatGrip.setBounds(box.grip);
    chat.setBounds(box.chatBody);
  }
  if (findOpen && findView) findView.setBounds(findRect(box.content));
  if (sidebarCollapsed) {
    ensureEdge();
    win.contentView.addChildView(edgeView);
    edgeView.setVisible(true);
    edgeView.setBounds({ x: 0, y: 0, width: 40, height: h });
  } else if (edgeView) {
    edgeView.setVisible(false);
  }
}

function ensureEdge() {
  if (edgeView) return;
  edgeView = new WebContentsView({
    webPreferences: { preload: PRELOAD_PANEL, contextIsolation: true, sandbox: true },
  });
  edgeView.setBackgroundColor('#00000000');
  edgeView.webContents.loadFile(EDGE_HTML);
}

function openSidebar() {
  if (!sidebarCollapsed || !sidebar) return;
  clearTimeout(animTimer);
  // Show the sidebar as an overlay over the still-full-width content; the
  // panel slides in (content does NOT move → no glitch).
  sidebarCollapsed = false;
  relayout();
  sidebar.webContents.send('sidebar:anim', 'open');
  animTimer = setTimeout(finalizeOpen, 340);
}

function finalizeOpen() {
  if (sidebarCollapsed || contentDocked) return;
  // Slide finished: the sidebar now fully covers the left strip, so docking
  // the content here is invisible.
  contentDocked = true;
  relayout();
}

function closeSidebar() {
  if (sidebarCollapsed || !sidebar) return;
  clearTimeout(animTimer);
  // Undock the content FIRST, while it is still hidden behind the open
  // sidebar (invisible), then slide the sidebar out to reveal it.
  contentDocked = false;
  relayout();
  sidebar.webContents.send('sidebar:anim', 'close');
  animTimer = setTimeout(finalizeClose, 340);
}

function finalizeClose() {
  if (sidebarCollapsed) return;
  sidebarCollapsed = true;
  relayout();
}

function toggleSidebar(force) {
  if (force === true) return openSidebar();
  if (force === false) return closeSidebar();
  return sidebarCollapsed ? openSidebar() : closeSidebar();
}

function ensureFindView() {
  if (findView) return;
  findView = new WebContentsView({
    webPreferences: { preload: PRELOAD_PANEL, contextIsolation: true, sandbox: true },
  });
  findView.setBackgroundColor('#00000000');
  findView.webContents.loadFile(FIND_HTML);
}

function showFind() {
  if (!win) return;
  ensureFindView();
  findOpen = true;
  win.contentView.addChildView(findView);
  findView.setVisible(true);
  relayout();
  findView.webContents.send('find:focus');
}

function hideFind() {
  findOpen = false;
  if (findView) findView.setVisible(false);
  if (tabs) tabs.findStop();
}


function buildSuggestions(query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return [];
  const out = [];
  const seen = new Set();
  const matches = (item) =>
    item.url.toLowerCase().includes(q) || (item.title || '').toLowerCase().includes(q);
  const push = (item, kind) => {
    if (seen.has(item.url) || out.length >= 6) return;
    seen.add(item.url);
    out.push({ title: item.title || item.url, url: item.url, favicon: item.favicon || null, kind });
  };
  for (const b of store.listBookmarks()) if (matches(b)) push(b, 'bookmark');
  for (const h of store.listHistory()) if (matches(h)) push(h, 'history');
  return out;
}

function bookmarksChanged() {
  if (sidebar && !sidebar.webContents.isDestroyed()) {
    sidebar.webContents.send('bookmarks:changed');
  }
  if (tabs) tabs.refreshActive();
}

function ensureChat() {
  if (chat) return;
  hardenPartition('persist:chat');

  chat = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      partition: 'persist:chat',
    },
  });
  chat.setBorderRadius(GEOM.RADIUS);
  chat.setBackgroundColor('#FFFFFF');
  chat.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  chatGrip = new WebContentsView({
    webPreferences: { preload: PRELOAD_PANEL, contextIsolation: true, sandbox: true },
  });
  chatGrip.setBackgroundColor('#00000000');
  chatGrip.webContents.loadFile(CHAT_GRIP_HTML);

  win.contentView.addChildView(chat);
  win.contentView.addChildView(chatGrip);
  chat.webContents.loadURL(CHAT_URL);
}

function toggleChat(force) {
  chatOpen = typeof force === 'boolean' ? force : !chatOpen;
  if (chatOpen) ensureChat();
  for (const v of [chat, chatGrip]) if (v) v.setVisible(chatOpen);
  relayout();
  return chatOpen;
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  const saved = store.readSession() || {};
  const b = saved.bounds || {};
  win = new BaseWindow({
    width: b.width || 1320,
    height: b.height || 860,
    x: typeof b.x === 'number' ? b.x : undefined,
    y: typeof b.y === 'number' ? b.y : undefined,
    minWidth: 760,
    minHeight: 480,
    transparent: isMac,
    backgroundColor: isMac ? '#00000000' : '#F4F2FA',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? GEOM.TRAFFIC : undefined,
    icon: isMac ? undefined : APP_ICON,
    hasShadow: true,
    show: false,
  });
  if (isMac) win.setVibrancy('under-window');

  sidebar = new WebContentsView({
    webPreferences: {
      preload: PRELOAD_CHROME,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  sidebar.setBackgroundColor('#00000000');
  win.contentView.addChildView(sidebar);
  sidebar.webContents.loadFile(CHROME_HTML);
  sidebar.webContents.on('will-navigate', (e) => e.preventDefault());
  sidebar.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  tabs = new TabManager(win, sidebar, (input) => openTab(input), {
    onVisit: (meta) => store.addHistory(meta),
    isBookmarked: (url) => store.isBookmarked(url),
    onFindResult: (r) => {
      if (findView && !findView.webContents.isDestroyed()) {
        findView.webContents.send('find:result', r);
      }
    },
  });

  win.on('resize', relayout);
  win.on('close', () => {
    try {
      store.saveSession({
        bounds: win.getBounds(),
        tabs: tabs ? tabs.sessionUrls() : null,
      });
    } catch {
      /* best-effort */
    }
  });
  win.on('closed', () => {
    win = null;
    sidebar = null;
    chat = null;
    chatGrip = null;
    findView = null;
    findOpen = false;
    edgeView = null;
    sidebarCollapsed = false;
    contentDocked = true;
    clearTimeout(animTimer);
    tabs = null;
    chatOpen = false;
  });

  sidebar.webContents.once('did-finish-load', () => {
    sidebar.webContents.send('engines:list', {
      engines: SEARCH_ENGINES.map(({ id, name }) => ({ id, name })),
      selectedId: currentEngine().id,
    });
    const sess = store.readSession();
    if (sess && sess.tabs && Array.isArray(sess.tabs.urls) && sess.tabs.urls.length) {
      sess.tabs.urls.forEach((u) => tabs.create(u));
      const idx = Math.min(sess.tabs.activeIndex || 0, tabs.order.length - 1);
      if (tabs.order[idx]) tabs.activate(tabs.order[idx]);
    } else {
      openTab(null);
    }
    relayout();
    win.show();
  });
}

function wireIpc() {
  ipcMain.handle('tab:new', internalOnly((_e, input) => openTab(input)));
  ipcMain.handle('tab:close', internalOnly((_e, id) => tabs && tabs.close(id)));
  ipcMain.handle('tab:activate', internalOnly((_e, id) => tabs && tabs.activate(id)));
  ipcMain.handle(
    'tab:reorder',
    internalOnly((_e, ids) => tabs && tabs.reorder(ids))
  );
  ipcMain.handle(
    'nav:go',
    internalOnly((_e, input) => {
      if (!tabs) return;
      const url = resolveInput(input, currentEngine());
      if (url) tabs.navigate(url);
    })
  );
  ipcMain.handle('nav:back', internalOnly(() => tabs && tabs.back()));
  ipcMain.handle('nav:forward', internalOnly(() => tabs && tabs.forward()));
  ipcMain.handle('nav:reload', internalOnly(() => tabs && tabs.reload()));
  ipcMain.handle('nav:stop', internalOnly(() => tabs && tabs.stop()));
  ipcMain.handle(
    'nav:open-internal',
    internalOnly((_e, route) => tabs && tabs.navigate(`aiobi://${route}`))
  );
  ipcMain.handle(
    'engine:set',
    internalOnly((_e, id) => settings.write({ searchEngineId: getEngine(id).id }).searchEngineId)
  );
  ipcMain.handle(
    'engine:list',
    internalOnly(() => ({
      engines: SEARCH_ENGINES.map(({ id, name }) => ({ id, name })),
      selectedId: currentEngine().id,
    }))
  );
  ipcMain.handle('bookmark:list', internalOnly(() => store.listBookmarks()));
  ipcMain.handle(
    'bookmark:remove',
    internalOnly((_e, url) => {
      store.removeBookmark(url);
      bookmarksChanged();
    })
  );
  ipcMain.handle(
    'bookmark:toggle',
    internalOnly(() => {
      if (!tabs) return false;
      const result = store.toggleBookmark(tabs.activeMeta());
      bookmarksChanged();
      return result;
    })
  );
  ipcMain.handle(
    'bookmark:reorder',
    internalOnly((_e, urls) => {
      store.reorderBookmarks(urls);
      bookmarksChanged();
    })
  );
  ipcMain.handle(
    'omnibox:suggest',
    internalOnly((_e, query) => buildSuggestions(query))
  );
  ipcMain.handle('history:list', internalOnly(() => store.listHistory()));
  ipcMain.handle('history:clear', internalOnly(() => store.clearHistory()));

  ipcMain.handle('vault:offer-save', async (event, payload) => {
    const frame = event.senderFrame;
    if (!frame) return;
    let origin;
    try {
      origin = new URL(frame.url).origin;
    } catch {
      return;
    }
    if (!/^https?:$/.test(new URL(origin).protocol)) return;
    if (!payload || payload.origin !== origin || !payload.password) return;
    const lang = currentLang();
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: [i18n.t('dlg_save', lang), i18n.t('dlg_notnow', lang)],
      defaultId: 0,
      cancelId: 1,
      message: i18n.t('dlg_save_pw', lang),
      detail: `${payload.username || 'identifiant'} — ${origin}`,
    });
    if (response === 0) {
      vault.save({ origin, username: payload.username, password: payload.password });
    }
  });
  ipcMain.handle('vault:match', (event, origin) => {
    const frame = event.senderFrame;
    if (!frame) return null;
    let frameOrigin;
    try {
      frameOrigin = new URL(frame.url).origin;
    } catch {
      return null;
    }
    if (origin !== frameOrigin) return null;
    return vault.matchOne(frameOrigin);
  });
  ipcMain.handle('vault:list', internalOnly(() => vault.listSafe()));
  ipcMain.handle('vault:status', internalOnly(() => vault.status()));
  ipcMain.handle(
    'vault:remove',
    internalOnly((_e, { origin, username }) => vault.remove(origin, username))
  );
  ipcMain.handle('chat:toggle', internalOnly((_e, force) => toggleChat(force)));
  ipcMain.handle(
    'home:search',
    internalOnly((_e, query) => {
      if (!tabs) return;
      const url = resolveInput(query, currentEngine());
      if (url) tabs.navigate(url);
    })
  );
  ipcMain.on(
    'chat:resize',
    internalOnly((_e, delta) => {
      chatWidth = clampChat(chatWidth - delta);
      relayout();
    })
  );

  ipcMain.handle(
    'find:query',
    internalOnly((_e, text) => tabs && tabs.find(text, { findNext: false }))
  );
  ipcMain.handle(
    'find:next',
    internalOnly((_e, { text, forward }) => tabs && tabs.find(text, { findNext: true, forward }))
  );
  ipcMain.handle('find:stop', internalOnly(() => tabs && tabs.findStop()));
  ipcMain.handle('find:close', internalOnly(() => hideFind()));
  ipcMain.handle('suite:open', internalOnly((_e, key) => openSuite(key)));
  ipcMain.handle('ui:toggle-sidebar', internalOnly(() => toggleSidebar()));
  ipcMain.handle('sidebar:open', internalOnly(() => openSidebar()));
  ipcMain.handle(
    'sidebar:anim-done',
    internalOnly((_e, state) => (state === 'open' ? finalizeOpen() : finalizeClose()))
  );
  ipcMain.on('i18n:get', (event) => {
    event.returnValue = { lang: currentLang(), strings: i18n.STRINGS };
  });
  ipcMain.handle(
    'lang:set',
    internalOnly((_e, code) => {
      settings.write({ lang: SUPPORTED_LANGS.has(code) ? code : 'fr' });
      applyMenu();
      broadcastLang();
      return currentLang();
    })
  );

  ipcMain.handle('downloads:list', internalOnly(() => downloads.list()));
  ipcMain.handle('downloads:open', internalOnly((_e, p) => downloads.open(p)));
  ipcMain.handle('downloads:reveal', internalOnly((_e, p) => downloads.reveal(p)));
  ipcMain.handle('downloads:cancel', internalOnly((_e, id) => downloads.cancel(id)));
  ipcMain.handle('downloads:clear', internalOnly(() => downloads.clearFinished()));
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(APP_ICON);
    } catch {
      /* icon not generated yet */
    }
  }
  hardenPartition('persist:browser');
  wireIpc();
  createWindow();

  downloads.init(session.fromPartition('persist:browser'), (s) => {
    if (sidebar && !sidebar.webContents.isDestroyed()) {
      sidebar.webContents.send('downloads:changed', s);
    }
    if (tabs) tabs.broadcast('downloads:changed', s);
  });

  applyMenu();

  if (app.isPackaged) {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.logger = console;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on('error', (err) => console.error('[updater]', err && err.message));
      autoUpdater.on('update-available', (info) =>
        console.log('[updater] update available', info && info.version)
      );
      autoUpdater.on('update-downloaded', (info) =>
        console.log('[updater] update downloaded, will install on quit', info && info.version)
      );
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    } catch {
      /* updater unavailable */
    }
  }

  app.on('activate', () => {
    if (!win) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
