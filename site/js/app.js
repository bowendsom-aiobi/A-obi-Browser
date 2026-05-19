import { fetchLatest, detectOS } from './release.js';
import { pickLang, applyLang, STRINGS } from './i18n.js';
import { initShader } from './shader.js';

const OS_LABEL = { mac: 'macOS', win: 'Windows', linux: 'Linux' };

let lang = pickLang();

function setLang(l) {
  lang = l;
  const dict = applyLang(l);
  document.querySelectorAll('[data-lang-btn]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.langBtn === l));
  });
  refreshPrimaryLabel(dict);
}

function refreshPrimaryLabel(dict) {
  const os = detectOS();
  const el = document.getElementById('primary-label');
  if (el) el.textContent = `${dict['hero.primary']} ${dict['hero.for']} ${OS_LABEL[os]}`;
}

function wireDownloads(links) {
  const map = { mac: 'dl-mac', win: 'dl-win', linux: 'dl-linux' };
  for (const k of Object.keys(map)) {
    document.querySelectorAll(`[data-dl="${k}"]`).forEach((a) => {
      a.href = links[k];
      a.setAttribute('rel', 'noopener');
    });
  }
  const os = detectOS();
  document.querySelectorAll('[data-dl-primary]').forEach((a) => {
    a.href = links[os] || links.mac;
  });
  if (links.version) {
    document.querySelectorAll('[data-version]').forEach((e) => {
      e.textContent = links.version;
      e.hidden = false;
    });
  }
}

function wireScrollReveal() {
  // Reveal is pure CSS (scroll-timeline) and content is visible without JS.
  // This only adds the scroll-driven tilt of the showcase frame as an
  // optional enhancement (cheap, rAF-throttled).
  const frame = document.querySelector('[data-tilt]');
  if (frame && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const r = frame.getBoundingClientRect();
        const vh = window.innerHeight;
        const prog = Math.min(1, Math.max(0, 1 - (r.top + r.height * 0.2) / vh));
        const rot = (1 - prog) * 16;
        const scale = 0.96 + prog * 0.04;
        frame.style.transform = `perspective(1400px) rotateX(${rot}deg) scale(${scale})`;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
}

function boot() {
  applyLang(lang);
  setLang(lang);
  document.querySelectorAll('[data-lang-btn]').forEach((b) => {
    b.addEventListener('click', () => setLang(b.dataset.langBtn));
  });

  const canvas = document.getElementById('shader');
  if (canvas) initShader(canvas);

  wireScrollReveal();

  // Fallback links work instantly; the API call only upgrades the label
  // with the real version number. The site never needs editing per release.
  fetchLatest().then(wireDownloads);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
