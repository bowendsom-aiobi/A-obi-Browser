'use strict';

const I = window.aiobiInternal;
const form = document.getElementById('searchform');
const input = document.getElementById('q');
const box = document.getElementById('suggest');
const tplSearch = document.getElementById('tpl-search');

const SMILE = 'assets/aiobi-icon.svg';
const sg = { items: [], i: -1 };
let timer = null;
let hasRecent = false;

function showRecent(show) {
  if (recent) recent.hidden = !(show && hasRecent);
}

function hide() {
  box.hidden = true;
  box.replaceChildren();
  sg.items = [];
  sg.i = -1;
  if (!input.value.trim()) showRecent(true);
}

function open(item) {
  hide();
  if (item.search) I.search(item.url);
  else I.go(item.url);
}

function highlight() {
  const rows = [...box.children];
  rows.forEach((row, idx) => row.classList.toggle('sel', idx === sg.i));
  if (sg.i >= 0 && rows[sg.i]) rows[sg.i].scrollIntoView({ block: 'nearest' });
}

function render(matches, query) {
  const items = [{ search: true, label: `Rechercher : ${query}`, url: query }];
  for (const m of matches) items.push({ label: m.title, url: m.url, favicon: m.favicon });
  sg.items = items;
  sg.i = -1;

  box.replaceChildren();
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'sg';

    if (item.search) {
      row.appendChild(tplSearch.content.cloneNode(true));
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
    row.addEventListener('click', () => open(item));
    box.appendChild(row);
  }
  box.hidden = items.length === 0;
}

input.addEventListener('input', () => {
  clearTimeout(timer);
  const value = input.value.trim();
  if (!value) {
    hide();
    return;
  }
  showRecent(false);
  timer = setTimeout(async () => {
    if (input.value.trim() !== value) return;
    const matches = await I.suggest(value);
    if (input.value.trim() === value) render(matches, value);
  }, 130);
});

input.addEventListener('keydown', (event) => {
  const items = sg.items;
  if (event.key === 'Escape') {
    hide();
    return;
  }
  if (event.key === 'ArrowDown' && items.length) {
    event.preventDefault();
    sg.i = Math.min(sg.i + 1, items.length - 1);
    highlight();
    return;
  }
  if (event.key === 'ArrowUp' && items.length) {
    event.preventDefault();
    sg.i = Math.max(sg.i - 1, -1);
    highlight();
    return;
  }
  if (event.key === 'Enter' && sg.i >= 0 && items[sg.i]) {
    event.preventDefault();
    open(items[sg.i]);
  }
});

input.addEventListener('blur', () => setTimeout(hide, 120));

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = input.value.trim();
  if (value) {
    hide();
    I.search(value);
  }
});

const recent = document.getElementById('recent');
const recentList = document.getElementById('recentlist');
document.getElementById('more').addEventListener('click', () => I.open('history'));

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function ago(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return I.t('ago_now');
  const m = Math.floor(s / 60);
  if (m < 60) return I.t('ago_min').replace('%n', m);
  const h = Math.floor(m / 60);
  if (h < 24) return I.t('ago_h').replace('%n', h);
  const d = Math.floor(h / 24);
  return d === 1 ? I.t('ago_yesterday') : I.t('ago_d').replace('%n', d);
}

async function loadRecent() {
  const items = (await I.history()).slice(0, 3);
  recentList.replaceChildren();
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'rc';

    const fav = document.createElement('img');
    fav.className = item.favicon ? 'fav' : 'fav placeholder';
    fav.src = item.favicon || SMILE;
    fav.onerror = () => {
      fav.className = 'fav placeholder';
      fav.src = SMILE;
    };

    const body = document.createElement('div');
    body.className = 'body';
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = item.title || item.url;
    const m = document.createElement('span');
    m.className = 'm';
    m.textContent = `${hostOf(item.url)} · ${ago(item.visitedAt)}`;
    body.append(t, m);

    row.append(fav, body);
    row.addEventListener('click', () => I.go(item.url));
    recentList.appendChild(row);
  }
  hasRecent = items.length > 0;
  showRecent(!input.value.trim());
}

function applyI18n() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = I.t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-ph]'))
    el.placeholder = I.t(el.dataset.i18nPh);
}

applyI18n();
loadRecent();

I.onLang(() => {
  applyI18n();
  loadRecent();
});
