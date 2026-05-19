'use strict';

const path = require('node:path');
const { WebContentsView, Menu, clipboard, shell } = require('electron');
const { GEOM } = require('./layout');
const i18n = require('./i18n');
const settings = require('./settings');

const RENDERER = path.join(__dirname, '..', 'renderer');
const PRELOAD_TAB = path.join(__dirname, '..', 'preload', 'bridge.js');
const TAB_PARTITION = 'persist:browser';
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'about:', 'file:', 'blob:', 'data:'];
const INTERNAL = {
  home: 'home.html',
  settings: 'settings.html',
  favorites: 'favorites.html',
  history: 'history.html',
  passwords: 'passwords.html',
  downloads: 'downloads.html',
};

function loadInto(wc, target) {
  if (typeof target === 'string' && target.startsWith('aiobi://')) {
    let route = 'home';
    try {
      route = new URL(target).hostname || 'home';
    } catch {
      /* default home */
    }
    wc.loadFile(path.join(RENDERER, INTERNAL[route] || INTERNAL.home));
  } else {
    wc.loadURL(target);
  }
}

function aiobiUrlFor(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol === 'file:') {
      const file = path.basename(decodeURIComponent(u.pathname));
      for (const [route, f] of Object.entries(INTERNAL)) {
        if (f === file) return `aiobi://${route}`;
      }
    }
  } catch {
    /* keep raw */
  }
  return rawUrl;
}

class TabManager {
  constructor(win, sidebar, onNewTabRequest, hooks = {}) {
    this.win = win;
    this.sidebar = sidebar;
    this.onNewTabRequest = onNewTabRequest;
    this.hooks = hooks;
    this.tabs = new Map();
    this.favicons = new Map();
    this.order = [];
    this.activeId = null;
    this.seq = 0;
    this.closed = [];
    this.bounds = { x: 0, y: 0, width: 0, height: 0 };
  }

  send(channel, payload) {
    const wc = this.sidebar.webContents;
    if (!wc.isDestroyed()) wc.send(channel, payload);
  }

  broadcast(channel, payload) {
    for (const view of this.tabs.values()) {
      const wc = view.webContents;
      if (!wc.isDestroyed()) wc.send(channel, payload);
    }
  }

  emitState(id) {
    const view = this.tabs.get(id);
    if (!view) return;
    const wc = view.webContents;
    const url = wc.getURL();
    this.send('tab:state', {
      id,
      url,
      title: wc.getTitle(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      loading: wc.isLoading(),
      bookmarked: this.hooks.isBookmarked ? this.hooks.isBookmarked(url) : false,
    });
  }

  refreshActive() {
    if (this.activeId) this.emitState(this.activeId);
  }

  activeMeta() {
    const v = this.active();
    if (!v) return null;
    const wc = v.webContents;
    return {
      url: wc.getURL(),
      title: wc.getTitle(),
      favicon: this.favicons.get(this.activeId) || null,
    };
  }

  create(url, fallback) {
    const id = `t${++this.seq}`;

    const view = new WebContentsView({
      webPreferences: {
        preload: PRELOAD_TAB,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        partition: TAB_PARTITION,
      },
    });
    view.setBorderRadius(GEOM.RADIUS);
    view.setBackgroundColor('#FFFFFF');

    this.win.contentView.addChildView(view);
    this.tabs.set(id, view);
    this.order.push(id);

    const wc = view.webContents;
    const update = () => this.emitState(id);
    wc.on('did-start-navigation', (e) => {
      if (e.isMainFrame) this.send('tab:loading', { id, loading: true });
    });
    wc.on('did-start-loading', () => this.send('tab:loading', { id, loading: true }));
    wc.on('did-stop-loading', () => {
      this.send('tab:loading', { id, loading: false });
      const u = wc.getURL();
      if (this.hooks.onVisit && /^https?:/.test(u)) {
        this.hooks.onVisit({ url: u, title: wc.getTitle(), favicon: this.favicons.get(id) || null });
      }
    });
    wc.on('did-navigate', update);
    wc.on('did-navigate-in-page', update);
    wc.on('page-title-updated', update);
    wc.on('page-favicon-updated', (_e, icons) => {
      this.favicons.set(id, icons[0] || null);
      this.send('tab:favicon', { id, favicon: icons[0] || null });
    });
    wc.on('found-in-page', (_e, result) => {
      if (this.hooks.onFindResult) {
        this.hooks.onFindResult({ active: result.activeMatchOrdinal, total: result.matches });
      }
    });
    wc.on('context-menu', (_e, params) => this.contextMenu(wc, params));

    wc.setWindowOpenHandler(({ url: target, disposition, features }) => {
      let proto = '';
      try {
        proto = new URL(target).protocol;
      } catch {
        return { action: 'deny' };
      }
      if (proto === 'blob:' || proto === 'data:') {
        return { action: 'allow' };
      }
      if (proto === 'http:' || proto === 'https:') {
        // A real popup (window.open with features, or new-window disposition)
        // must stay a child window so window.opener is preserved — that is
        // how OAuth / "Sign in with Google" posts the result back. Flattening
        // it into a tab severs the opener -> postMessage on null.
        const isPopup =
          disposition === 'new-window' ||
          (typeof features === 'string' && features.length > 0);
        if (isPopup) {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              width: 480,
              height: 640,
              minimizable: false,
              fullscreenable: false,
              webPreferences: {
                partition: 'persist:browser',
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false,
              },
            },
          };
        }
        this.onNewTabRequest(target);
        return { action: 'deny' };
      }
      if (proto !== 'about:' && proto !== 'file:') shell.openExternal(target);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (event, target) => {
      let proto = '';
      try {
        proto = new URL(target).protocol;
      } catch {
        event.preventDefault();
        return;
      }
      if (!ALLOWED_PROTOCOLS.includes(proto)) {
        event.preventDefault();
        if (proto !== 'javascript:') shell.openExternal(target);
      }
    });

    if (fallback) {
      wc.once('did-fail-load', (_e, code, _desc, _u, isMainFrame) => {
        if (isMainFrame && code !== -3) wc.loadURL(fallback);
      });
    }

    this.send('tab:created', { id });
    this.activate(id);
    loadInto(wc, url);
    return id;
  }

  reorder(ids) {
    const valid = ids.filter((id) => this.tabs.has(id));
    for (const id of this.order) if (!valid.includes(id)) valid.push(id);
    this.order = valid;
  }

  activate(id) {
    if (!this.tabs.has(id)) return;
    this.activeId = id;
    for (const [tid, view] of this.tabs) view.setVisible(tid === id);
    this.applyBounds();
    this.send('tab:activated', { id });
    this.emitState(id);
  }

  close(id) {
    const view = this.tabs.get(id);
    if (!view) return;
    const closedUrl = aiobiUrlFor(view.webContents.getURL());
    if (/^(https?:|aiobi:)/.test(closedUrl)) {
      this.closed.push(closedUrl);
      if (this.closed.length > 25) this.closed.shift();
    }
    view.webContents.close();
    this.win.contentView.removeChildView(view);
    this.tabs.delete(id);
    this.favicons.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this.send('tab:closed', { id });

    if (this.activeId === id) {
      this.activeId = null;
      const next = this.order[this.order.length - 1];
      if (next) this.activate(next);
    }
    if (this.tabs.size === 0) this.onNewTabRequest(null);
  }

  active() {
    return this.activeId ? this.tabs.get(this.activeId) : null;
  }

  navigate(url) {
    const v = this.active();
    if (v) loadInto(v.webContents, url);
  }

  back() {
    const v = this.active();
    if (v && v.webContents.navigationHistory.canGoBack()) v.webContents.navigationHistory.goBack();
  }

  forward() {
    const v = this.active();
    if (v && v.webContents.navigationHistory.canGoForward())
      v.webContents.navigationHistory.goForward();
  }

  reload() {
    const v = this.active();
    if (v) v.webContents.reload();
  }

  stop() {
    const v = this.active();
    if (v) v.webContents.stop();
  }

  reopenClosed() {
    const url = this.closed.pop();
    if (url) this.create(url);
  }

  sessionUrls() {
    const urls = [];
    let activeIndex = 0;
    for (const id of this.order) {
      const v = this.tabs.get(id);
      if (!v) continue;
      const u = aiobiUrlFor(v.webContents.getURL());
      if (!u || u === 'about:blank') continue;
      if (id === this.activeId) activeIndex = urls.length;
      urls.push(u);
    }
    return { urls, activeIndex };
  }

  zoom(delta) {
    const v = this.active();
    if (!v) return;
    const wc = v.webContents;
    if (delta === 0) wc.setZoomLevel(0);
    else wc.setZoomLevel(Math.max(-3, Math.min(4, wc.getZoomLevel() + delta)));
  }

  zoomIn() {
    this.zoom(0.5);
  }

  zoomOut() {
    this.zoom(-0.5);
  }

  zoomReset() {
    this.zoom(0);
  }

  find(text, opts) {
    const v = this.active();
    if (v && text) v.webContents.findInPage(text, opts || {});
  }

  findStop() {
    const v = this.active();
    if (v) v.webContents.stopFindInPage('clearSelection');
  }

  toggleDevTools() {
    const v = this.active();
    if (v) v.webContents.toggleDevTools();
  }

  contextMenu(wc, params) {
    const tt = (k) => i18n.t(k, settings.read().lang);
    const items = [];
    if (params.linkURL) {
      items.push(
        { label: tt('ctx_open_newtab'), click: () => this.onNewTabRequest(params.linkURL) },
        { label: tt('ctx_copy_link'), click: () => clipboard.writeText(params.linkURL) },
        { type: 'separator' }
      );
    }
    if (params.srcURL && params.mediaType === 'image') {
      items.push(
        { label: tt('ctx_copy_img'), click: () => wc.copyImageAt(params.x, params.y) },
        { label: tt('ctx_open_img'), click: () => this.onNewTabRequest(params.srcURL) },
        { type: 'separator' }
      );
    }
    if (params.isEditable) {
      items.push(
        { role: 'cut', label: tt('m_cut') },
        { role: 'copy', label: tt('m_copy') },
        { role: 'paste', label: tt('m_paste') },
        { role: 'selectAll', label: tt('m_selectall') }
      );
    } else if (params.selectionText) {
      const sel = params.selectionText.trim();
      items.push(
        { role: 'copy', label: tt('m_copy') },
        {
          label: tt('ctx_search').replace('%s', sel.slice(0, 50)),
          click: () => this.onNewTabRequest(sel),
        },
        { type: 'separator' }
      );
    }
    items.push(
      {
        label: tt('back'),
        enabled: wc.navigationHistory.canGoBack(),
        click: () => wc.navigationHistory.goBack(),
      },
      {
        label: tt('forward'),
        enabled: wc.navigationHistory.canGoForward(),
        click: () => wc.navigationHistory.goForward(),
      },
      { label: tt('reload'), click: () => wc.reload() },
      { type: 'separator' },
      { label: tt('ctx_inspect'), click: () => wc.inspectElement(params.x, params.y) }
    );
    Menu.buildFromTemplate(items).popup();
  }

  setContentBounds(rect) {
    this.bounds = rect;
    this.applyBounds();
  }

  applyBounds() {
    const v = this.active();
    if (v) v.setBounds(this.bounds);
  }
}

module.exports = { TabManager, TAB_PARTITION };
