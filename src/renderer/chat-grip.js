'use strict';

const bar = document.getElementById('bar');
let dragging = false;
let startX = 0;

bar.addEventListener('pointerdown', (event) => {
  dragging = true;
  startX = event.screenX;
  bar.setPointerCapture(event.pointerId);
});

bar.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const delta = event.screenX - startX;
  startX = event.screenX;
  if (delta !== 0) window.panel.resize(delta);
});

function end(event) {
  if (!dragging) return;
  dragging = false;
  try {
    bar.releasePointerCapture(event.pointerId);
  } catch {
    /* ignore */
  }
}

bar.addEventListener('pointerup', end);
bar.addEventListener('pointercancel', end);
