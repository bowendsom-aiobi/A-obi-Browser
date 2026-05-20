'use strict';

const I = window.aiobiInternal;
const route = (location.pathname.split('/').pop() || 'home.html').replace(/\.html$/, '');
const app = document.getElementById('app');

const FALLBACK_ICON = 'assets/aiobi-icon.svg';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function favicon(src) {
  const img = el('img', 'fav');
  img.src = src || FALLBACK_ICON;
  img.onerror = () => {
    img.src = FALLBACK_ICON;
  };
  return img;
}

function linkRow(item, onOpen, onRemove) {
  const row = el('div', 'row');
  row.append(favicon(item.favicon));

  const body = el('div', 'body');
  body.append(el('span', 'title', item.title || item.url));
  body.append(el('span', 'meta', item.url));
  row.append(body);

  row.addEventListener('click', () => onOpen(item.url));

  if (onRemove) {
    const x = el('button', 'x', '×');
    x.title = I.t('delete');
    x.addEventListener('click', (event) => {
      event.stopPropagation();
      onRemove(item.url);
    });
    row.append(x);
  }
  return row;
}

function empty(message) {
  return el('p', 'empty', message);
}

function humanBytes(n) {
  if (!n || n < 1024) return `${n || 0} o`;
  const u = ['Ko', 'Mo', 'Go'];
  let i = -1;
  let v = n;
  do {
    v /= 1024;
    i += 1;
  } while (v >= 1024 && i < u.length - 1);
  return `${v.toFixed(1)} ${u[i]}`;
}

async function render() {
  const wrap = el('div', 'wrap');

  if (route === 'settings') {
    const top = el('div', 'topbar');
    top.append(el('h1', null, I.t('settings')));
    wrap.append(top, el('p', 'sub', I.t('settings_engine')));

    const { engines, selectedId } = await I.engines();
    const list = el('div', 'list');
    for (const engine of engines) {
      const row = el('div', 'row engine' + (engine.id === selectedId ? ' selected' : ''));
      row.append(el('span', null, engine.name));
      if (engine.id === selectedId) row.append(el('span', null, '✓'));
      row.addEventListener('click', async () => {
        await I.setEngine(engine.id);
        render();
      });
      list.append(row);
    }
    wrap.append(list);

    wrap.append(el('p', 'sub', I.t('settings_lang')));
    const langList = el('div', 'list');
    for (const opt of [
      { code: 'fr', name: 'Français' },
      { code: 'en', name: 'English' },
      { code: 'mos', name: 'Mooré' },
    ]) {
      const sel = I.lang() === opt.code;
      const row = el('div', 'row engine' + (sel ? ' selected' : ''));
      row.append(el('span', null, opt.name));
      if (sel) row.append(el('span', null, '✓'));
      row.addEventListener('click', async () => {
        await I.setLang(opt.code);
        render();
      });
      langList.append(row);
    }
    wrap.append(langList);

    wrap.append(el('p', 'sub', I.t('settings_security')));
    const pwLink = el('div', 'row');
    const pwBody = el('div', 'body');
    pwBody.append(el('span', 'title', I.t('pw_link')));
    pwBody.append(el('span', 'meta', I.t('pw_link_sub')));
    pwLink.append(pwBody, el('span', null, '→'));
    pwLink.addEventListener('click', () => I.open('passwords'));
    const pwList = el('div', 'list');
    pwList.append(pwLink);
    wrap.append(pwList);
  } else if (route === 'passwords') {
    const top = el('div', 'topbar');
    top.append(el('h1', null, I.t('pw_title')));
    wrap.append(top, el('p', 'sub', I.t('pw_sub')));

    const st = await I.vaultStatus();
    if (st && st.weak) {
      wrap.append(el('p', 'sub', I.t('pw_weak')));
    }

    const items = await I.vaultList();
    if (!items || items.length === 0) {
      wrap.append(empty(I.t('pw_empty')));
    } else {
      const list = el('div', 'list');
      for (const item of items) {
        const row = el('div', 'row');
        const body = el('div', 'body');
        body.append(el('span', 'title', item.origin));
        body.append(el('span', 'meta', item.username || '—'));
        row.append(body);
        const x = el('button', 'x', '×');
        x.title = 'Supprimer';
        x.addEventListener('click', async (event) => {
          event.stopPropagation();
          await I.vaultRemove({ origin: item.origin, username: item.username });
          render();
        });
        row.append(x);
        row.addEventListener('click', () => I.go(item.origin));
        list.append(row);
      }
      wrap.append(list);
    }
  } else if (route === 'downloads') {
    const items = await I.downloads();
    const top = el('div', 'topbar');
    top.append(el('h1', null, I.t('downloads')));
    if (items.length) {
      const clear = el('button', 'btn', I.t('dl_clear'));
      clear.addEventListener('click', async () => {
        await I.downloadsClear();
        render();
      });
      top.append(clear);
    }
    wrap.append(top, el('p', 'sub', I.t('dl_sub')));

    if (!items.length) {
      wrap.append(empty(I.t('dl_empty')));
    } else {
      const list = el('div', 'list');
      for (const d of items) {
        const stateText =
          d.state === 'progressing'
            ? `${humanBytes(d.received)} / ${humanBytes(d.total)}`
            : d.state === 'completed'
              ? I.t('dl_done')
              : d.state === 'cancelled'
                ? I.t('dl_cancelled')
                : I.t('dl_failed');
        const row = el('div', 'row');
        const body = el('div', 'body');
        body.append(el('span', 'title', d.name));
        body.append(el('span', 'meta', stateText));
        row.append(body);
        if (d.state === 'completed') {
          const folder = el('button', 'x', '↗');
          folder.title = I.t('reveal');
          folder.addEventListener('click', (event) => {
            event.stopPropagation();
            I.downloadReveal(d.path);
          });
          row.append(folder);
          row.addEventListener('click', () => I.downloadOpen(d.path));
        } else if (d.state === 'progressing') {
          const x = el('button', 'x', '✕');
          x.title = I.t('dl_cancel');
          x.addEventListener('click', async (event) => {
            event.stopPropagation();
            await I.downloadCancel(d.id);
            render();
          });
          row.append(x);
        }
        list.append(row);
      }
      wrap.append(list);
    }
  } else if (route === 'favorites') {
    const top = el('div', 'topbar');
    top.append(el('h1', null, I.t('favorites')));
    wrap.append(top, el('p', 'sub', I.t('fav_sub')));

    const items = await I.bookmarks();
    if (items.length === 0) {
      wrap.append(empty(I.t('fav_empty')));
    } else {
      const list = el('div', 'list');
      for (const item of items) {
        list.append(
          linkRow(
            item,
            (url) => I.go(url),
            async (url) => {
              await I.removeBookmark(url);
              render();
            }
          )
        );
      }
      wrap.append(list);
    }
  } else {
    const items = await I.history();
    const top = el('div', 'topbar');
    top.append(el('h1', null, I.t('history')));
    if (items.length > 0) {
      const clear = el('button', 'btn', I.t('hist_clear'));
      clear.addEventListener('click', async () => {
        await I.clearHistory();
        render();
      });
      top.append(clear);
    }
    wrap.append(top, el('p', 'sub', I.t('hist_sub')));

    if (items.length === 0) {
      wrap.append(empty(I.t('hist_empty')));
    } else {
      const list = el('div', 'list');
      for (const item of items) list.append(linkRow(item, (url) => I.go(url)));
      wrap.append(list);
    }
  }

  app.replaceChildren(wrap);
}

render();

I.onLang(() => render());

if (route === 'downloads' && I.onDownloads) {
  let pending = false;
  I.onDownloads(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      render();
    }, 250);
  });
}
