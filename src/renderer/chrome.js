'use strict';

const api = window.aiobi;
const t = (k) => api.t(k);

function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
}

const state = {
  tabs: new Map(),
  order: [],
  activeId: null,
  lastSubmit: null,
  pendingNav: null,
  dragId: null,
  bookmarks: [],
  dragUrl: null,
  sg: { items: [], i: -1 },
  sgTimer: null,
};

const els = {
  app: document.getElementById('app'),
  back: document.getElementById('back'),
  forward: document.getElementById('forward'),
  reload: document.getElementById('reload'),
  address: document.getElementById('address'),
  bookmark: document.getElementById('bookmark'),
  signets: document.getElementById('signets'),
  bookmarks: document.getElementById('bookmarks'),
  tabs: document.getElementById('tabs'),
  newtab: document.getElementById('newtab'),
  settings: document.getElementById('settings'),
  history: document.getElementById('history'),
  favorites: document.getElementById('favorites'),
  chat: document.getElementById('chat'),
  collapse: document.getElementById('collapse'),
  downloads: document.getElementById('downloads'),
  appsbtn: document.getElementById('appsbtn'),
  apps: document.getElementById('apps'),
  suggest: document.getElementById('suggest'),
  tplClose: document.getElementById('tpl-close'),
  tplSearch: document.getElementById('tpl-search'),
};

const SMILE = 'assets/aiobi-icon.svg';

function isInternal(url) {
  return !url || url === 'about:blank' || url.startsWith('file:') || url.startsWith('aiobi://');
}

function activeTab() {
  return state.activeId ? state.tabs.get(state.activeId) : null;
}

function renderTabs() {
  els.tabs.replaceChildren();
  for (const id of state.order) {
    const tab = state.tabs.get(id);
    if (!tab) continue;
    const row = document.createElement('div');
    row.className = 'tab' + (id === state.activeId ? ' active' : '');
    row.dataset.id = id;
    row.draggable = true;

    const fav = document.createElement('img');
    fav.className = tab.favicon ? 'fav' : 'fav placeholder';
    fav.src = tab.favicon || SMILE;
    fav.onerror = () => {
      fav.className = 'fav placeholder';
      fav.src = SMILE;
    };

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = tab.title || t('newtab');

    const close = document.createElement('button');
    close.className = 'close';
    close.title = t('close');
    close.appendChild(els.tplClose.content.cloneNode(true));

    row.append(fav, label, close);
    els.tabs.appendChild(row);
  }
}

function isWebPage(url) {
  return !!url && /^https?:/.test(url);
}

function renderActive() {
  const tab = activeTab();
  els.back.disabled = !tab || !tab.canGoBack;
  els.forward.disabled = !tab || !tab.canGoForward;
  els.app.classList.toggle('loading', !!(tab && tab.loading));
  els.reload.title = tab && tab.loading ? t('stop') : t('reload');

  const bookmarkable = tab && isWebPage(tab.url);
  els.bookmark.hidden = !bookmarkable;
  els.bookmark.classList.toggle('active', !!(tab && tab.bookmarked));
  els.bookmark.title = tab && tab.bookmarked ? t('bookmark_rm') : t('bookmark_add');

  if (tab && document.activeElement !== els.address) {
    const p = state.pendingNav;
    if (p && tab.url === p.fromUrl) {
      els.address.value = p.value;
    } else {
      if (p) state.pendingNav = null;
      els.address.value = isInternal(tab.url) ? '' : tab.url;
    }
  }
}

function renderBookmarks(list) {
  state.bookmarks = list;
  els.bookmarks.replaceChildren();
  for (const item of list) {
    const row = document.createElement('div');
    row.className = 'bm';
    row.title = item.url;
    row.draggable = true;
    row.dataset.url = item.url;

    const fav = document.createElement('img');
    fav.className = item.favicon ? 'fav' : 'fav placeholder';
    fav.src = item.favicon || SMILE;
    fav.onerror = () => {
      fav.className = 'fav placeholder';
      fav.src = SMILE;
    };

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = item.title || item.url;

    row.append(fav, label);
    row.addEventListener('click', () => api.go(item.url));
    els.bookmarks.appendChild(row);
  }
  els.signets.hidden = list.length === 0;
}

async function loadBookmarks() {
  renderBookmarks(await api.listBookmarks());
}

function clearBmMarks() {
  for (const n of els.bookmarks.querySelectorAll('.drop-before')) n.classList.remove('drop-before');
}

els.bookmarks.addEventListener('dragstart', (event) => {
  const row = event.target.closest('.bm');
  if (!row) return;
  state.dragUrl = row.dataset.url;
  event.dataTransfer.effectAllowed = 'move';
});

els.bookmarks.addEventListener('dragover', (event) => {
  if (!state.dragUrl) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const over = event.target.closest('.bm');
  clearBmMarks();
  if (over && over.dataset.url !== state.dragUrl) over.classList.add('drop-before');
});

els.bookmarks.addEventListener('drop', (event) => {
  if (!state.dragUrl) return;
  event.preventDefault();
  const over = event.target.closest('.bm');
  const overUrl = over ? over.dataset.url : null;
  if (overUrl !== state.dragUrl) {
    const list = state.bookmarks.slice();
    const from = list.findIndex((b) => b.url === state.dragUrl);
    if (from >= 0) {
      const [moved] = list.splice(from, 1);
      let to = overUrl ? list.findIndex((b) => b.url === overUrl) : list.length;
      if (to < 0) to = list.length;
      list.splice(to, 0, moved);
      renderBookmarks(list);
      api.reorderBookmarks(list.map((b) => b.url));
    }
  }
  state.dragUrl = null;
});

els.bookmarks.addEventListener('dragend', () => {
  state.dragUrl = null;
  clearBmMarks();
});

function hideSuggest() {
  els.suggest.hidden = true;
  els.suggest.replaceChildren();
  state.sg = { items: [], i: -1 };
}

function openSuggest(item) {
  hideSuggest();
  const tab = activeTab();
  if (tab) {
    tab.loading = true;
    els.app.classList.add('loading');
  }
  api.go(item.url);
  els.address.blur();
}

function highlightSuggest() {
  const rows = [...els.suggest.children];
  rows.forEach((row, idx) => row.classList.toggle('sel', idx === state.sg.i));
  if (state.sg.i >= 0 && rows[state.sg.i]) {
    rows[state.sg.i].scrollIntoView({ block: 'nearest' });
  }
}

function renderSuggest(matches, query) {
  const items = [{ search: true, label: t('search_prefix').replace('%q', query), url: query }];
  for (const m of matches) items.push({ label: m.title, url: m.url, favicon: m.favicon });
  state.sg = { items, i: -1 };

  els.suggest.replaceChildren();
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'sg';

    if (item.search) {
      row.appendChild(els.tplSearch.content.cloneNode(true));
    } else {
      const fav = document.createElement('img');
      fav.className = item.favicon ? 'fav' : 'fav placeholder';
      fav.src = item.favicon || SMILE;
      fav.onerror = () => {
        fav.className = 'fav placeholder';
        fav.src = SMILE;
      };
      row.appendChild(fav);
    }

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = item.label;
    row.appendChild(label);

    row.addEventListener('mousedown', (event) => event.preventDefault());
    row.addEventListener('click', () => openSuggest(item));
    els.suggest.appendChild(row);
  }
  els.suggest.hidden = items.length === 0;
}

els.tabs.addEventListener('click', (event) => {
  const row = event.target.closest('.tab');
  if (!row) return;
  const id = row.dataset.id;
  if (event.target.closest('.close')) api.closeTab(id);
  else api.activateTab(id);
});

function clearDropMarks() {
  for (const n of els.tabs.querySelectorAll('.drop-before')) n.classList.remove('drop-before');
}

function moveOrder(dragId, beforeId) {
  const o = state.order;
  const from = o.indexOf(dragId);
  if (from < 0) return;
  o.splice(from, 1);
  let to = beforeId ? o.indexOf(beforeId) : o.length;
  if (to < 0) to = o.length;
  o.splice(to, 0, dragId);
}

els.tabs.addEventListener('dragstart', (event) => {
  const row = event.target.closest('.tab');
  if (!row) return;
  state.dragId = row.dataset.id;
  event.dataTransfer.effectAllowed = 'move';
});

els.tabs.addEventListener('dragover', (event) => {
  if (!state.dragId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const over = event.target.closest('.tab');
  clearDropMarks();
  if (over && over.dataset.id !== state.dragId) over.classList.add('drop-before');
});

els.tabs.addEventListener('drop', (event) => {
  if (!state.dragId) return;
  event.preventDefault();
  const over = event.target.closest('.tab');
  const overId = over ? over.dataset.id : null;
  if (overId !== state.dragId) {
    moveOrder(state.dragId, overId);
    api.reorderTabs(state.order);
    renderTabs();
    renderActive();
  }
  state.dragId = null;
});

els.tabs.addEventListener('dragend', () => {
  state.dragId = null;
  clearDropMarks();
});

els.newtab.addEventListener('click', () => api.newTab());
els.back.addEventListener('click', () => api.back());
els.forward.addEventListener('click', () => api.forward());
els.reload.addEventListener('click', () => {
  const tab = activeTab();
  if (tab && tab.loading) api.stop();
  else api.reload();
});

els.address.addEventListener('focus', () => els.address.select());

els.address.addEventListener('input', () => {
  clearTimeout(state.sgTimer);
  const value = els.address.value.trim();
  if (!value) {
    hideSuggest();
    return;
  }
  state.sgTimer = setTimeout(async () => {
    if (els.address.value.trim() !== value) return;
    const matches = await api.suggest(value);
    if (els.address.value.trim() === value) renderSuggest(matches, value);
  }, 130);
});

els.address.addEventListener('blur', () => {
  setTimeout(hideSuggest, 120);
});

els.address.addEventListener('keydown', (event) => {
  const items = state.sg.items;

  if (event.key === 'Escape') {
    hideSuggest();
    return;
  }
  if (event.key === 'ArrowDown' && items.length) {
    event.preventDefault();
    state.sg.i = Math.min(state.sg.i + 1, items.length - 1);
    highlightSuggest();
    return;
  }
  if (event.key === 'ArrowUp' && items.length) {
    event.preventDefault();
    state.sg.i = Math.max(state.sg.i - 1, -1);
    highlightSuggest();
    return;
  }
  if (event.key !== 'Enter') return;

  if (state.sg.i >= 0 && items[state.sg.i]) {
    openSuggest(items[state.sg.i]);
    return;
  }

  const value = els.address.value.trim();
  if (!value) return;

  const tab = activeTab();
  if (tab && tab.loading && value === state.lastSubmit) return; // guard double submit

  state.lastSubmit = value;
  if (tab) {
    state.pendingNav = { fromUrl: tab.url, value };
    tab.loading = true;
    els.app.classList.add('loading'); // optimistic feedback
  }
  hideSuggest();
  api.go(value);
  els.address.blur();
});

els.bookmark.addEventListener('click', () => api.toggleBookmark());
els.settings.addEventListener('click', () => api.openInternal('settings'));
els.history.addEventListener('click', () => api.openInternal('history'));
els.favorites.addEventListener('click', () => api.openInternal('favorites'));
els.chat.addEventListener('click', async () => {
  const open = await api.toggleChat();
  els.chat.classList.toggle('active', !!open);
});

window.addEventListener('keydown', (event) => {
  const mod = event.metaKey || event.ctrlKey;
  if (!mod) return;
  if (event.key === 't') {
    event.preventDefault();
    api.newTab();
  } else if (event.key === 'w') {
    event.preventDefault();
    if (state.activeId) api.closeTab(state.activeId);
  } else if (event.key === 'r') {
    event.preventDefault();
    api.reload();
  } else if (event.key === 'l') {
    event.preventDefault();
    els.address.focus();
  }
});

api.onTabCreated(({ id }) => {
  if (!state.tabs.has(id)) {
    state.tabs.set(id, { title: '', url: '', favicon: null, loading: true });
    state.order.push(id);
  }
  renderTabs();
});

api.onTabActivated(({ id }) => {
  state.activeId = id;
  renderTabs();
  renderActive();
});

api.onTabClosed(({ id }) => {
  state.tabs.delete(id);
  state.order = state.order.filter((x) => x !== id);
  renderTabs();
  renderActive();
});

api.onTabState((data) => {
  const tab = state.tabs.get(data.id);
  if (!tab) return;
  tab.url = data.url;
  tab.title = data.title;
  tab.canGoBack = data.canGoBack;
  tab.canGoForward = data.canGoForward;
  tab.bookmarked = data.bookmarked;
  if (typeof data.loading === 'boolean') tab.loading = data.loading;
  renderTabs();
  if (data.id === state.activeId) renderActive();
});

api.onTabLoading(({ id, loading }) => {
  const tab = state.tabs.get(id);
  if (!tab) return;
  tab.loading = loading;
  if (id === state.activeId) renderActive();
});

api.onTabFavicon(({ id, favicon }) => {
  const tab = state.tabs.get(id);
  if (tab && favicon) {
    tab.favicon = favicon;
    renderTabs();
  }
});

api.onBookmarks(() => loadBookmarks());
loadBookmarks();

els.collapse.addEventListener('click', () => api.toggleSidebar());

api.onSidebar((cmd) => {
  if (cmd === 'open') {
    els.app.classList.add('no-anim', 'collapsed');
    void els.app.offsetWidth;
    requestAnimationFrame(() => {
      els.app.classList.remove('no-anim');
      requestAnimationFrame(() => els.app.classList.remove('collapsed'));
    });
  } else {
    requestAnimationFrame(() => els.app.classList.add('collapsed'));
  }
});
els.app.addEventListener('transitionend', (event) => {
  if (event.propertyName !== 'transform') return;
  api.sidebarAnimDone(els.app.classList.contains('collapsed') ? 'closed' : 'open');
});

const dl = { active: 0, unseen: false };

function updateDownloads() {
  els.downloads.classList.toggle('dl-active', dl.active > 0);
  els.downloads.classList.toggle('dl-done', dl.active === 0 && dl.unseen);
  els.downloads.title =
    dl.active > 0 ? t('dl_inprogress').replace('%n', dl.active) : t('downloads');
}

api.onDownloads((s) => {
  const active = (s && s.active) || 0;
  if (dl.active > 0 && active === 0) dl.unseen = true;
  dl.active = active;
  updateDownloads();
});

els.downloads.addEventListener('click', () => {
  dl.unseen = false;
  updateDownloads();
  api.openInternal('downloads');
});

els.appsbtn.addEventListener('click', (event) => {
  event.stopPropagation();
  els.apps.hidden = !els.apps.hidden;
});
els.apps.addEventListener('click', (event) => {
  const btn = event.target.closest('.app');
  if (!btn) return;
  api.openSuite(btn.dataset.key);
  els.apps.hidden = true;
});
document.addEventListener('click', (event) => {
  if (!els.apps.hidden && !els.apps.contains(event.target) && event.target !== els.appsbtn) {
    els.apps.hidden = true;
  }
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') els.apps.hidden = true;
});

api.onFocusAddress(() => {
  els.address.focus();
  els.address.select();
});

applyI18n();
api.onLang(() => {
  applyI18n();
  renderTabs();
  renderActive();
  updateDownloads();
});
