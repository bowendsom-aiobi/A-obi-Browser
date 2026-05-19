// Node test (no deps): node site/test/release.test.mjs
import { resolveRelease, fallbackLinks, detectOS, STABLE, REPO } from '../js/release.js';
import assert from 'node:assert/strict';

let pass = 0;
const ok = (name, fn) => {
  fn();
  pass++;
  console.log('ok  -', name);
};

ok('fallback links point at releases/latest/download with stable names', () => {
  const fb = fallbackLinks();
  assert.equal(fb.mac, `https://github.com/${REPO}/releases/latest/download/${STABLE.mac}`);
  assert.ok(fb.win.endsWith(STABLE.win));
  assert.ok(fb.linux.endsWith(STABLE.linux));
  assert.equal(fb.version, null);
});

ok('resolveRelease maps assets by extension + reads version', () => {
  const json = {
    tag_name: 'v0.1.6',
    published_at: '2026-05-19T00:00:00Z',
    assets: [
      { name: 'Aiobi-Browser-mac-arm64.dmg', browser_download_url: 'https://x/dmg' },
      { name: 'Aiobi-Browser-windows-x64.exe', browser_download_url: 'https://x/exe' },
      { name: 'Aiobi-Browser-linux-x86_64.AppImage', browser_download_url: 'https://x/appimage' },
      { name: 'Aiobi-Browser-linux-amd64.deb', browser_download_url: 'https://x/deb' },
      { name: 'latest.yml', browser_download_url: 'https://x/yml' },
    ],
  };
  const r = resolveRelease(json);
  assert.equal(r.version, 'v0.1.6');
  assert.equal(r.mac, 'https://x/dmg');
  assert.equal(r.win, 'https://x/exe');
  assert.equal(r.linux, 'https://x/appimage');
  assert.equal(r.deb, 'https://x/deb');
});

ok('resolveRelease falls back per-missing-asset, never returns null', () => {
  const r = resolveRelease({ tag_name: 'v9', assets: [] });
  assert.equal(r.version, 'v9');
  assert.ok(r.mac.includes('/releases/latest/download/'));
  assert.ok(r.win && r.linux && r.deb);
});

ok('resolveRelease handles garbage input', () => {
  for (const bad of [null, undefined, {}, { assets: 'nope' }]) {
    const r = resolveRelease(bad);
    assert.ok(r.mac && r.win && r.linux);
  }
});

ok('detectOS classifies the three platforms', () => {
  assert.equal(detectOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'mac');
  assert.equal(detectOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'win');
  assert.equal(detectOS('Mozilla/5.0 (X11; Ubuntu; Linux x86_64)'), 'linux');
  assert.equal(detectOS('Mozilla/5.0 (Linux; Android 14)'), 'mac'); // android -> default, not linux desktop
  assert.equal(detectOS(''), 'mac');
});

console.log(`\n${pass} checks passed`);
