'use strict';

const input = document.getElementById('q');
const count = document.getElementById('count');

function applyI18n() {
  input.placeholder = window.panel.t('find_ph');
}
applyI18n();
window.panel.onLang(applyI18n);

function query() {
  const value = input.value;
  if (value) window.panel.find(value);
  else {
    window.panel.findStop();
    count.textContent = '';
  }
}

input.addEventListener('input', query);

input.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.panel.findClose();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (input.value) window.panel.findNext(input.value, !event.shiftKey);
  }
});

document.getElementById('prev').addEventListener('click', () => {
  if (input.value) window.panel.findNext(input.value, false);
});
document.getElementById('next').addEventListener('click', () => {
  if (input.value) window.panel.findNext(input.value, true);
});
document.getElementById('close').addEventListener('click', () => window.panel.findClose());

window.panel.onFindResult(({ active, total }) => {
  count.textContent = total ? `${active}/${total}` : input.value ? window.panel.t('find_none') : '';
});

window.panel.onFindFocus(() => {
  input.focus();
  input.select();
});
