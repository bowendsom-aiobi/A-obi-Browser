'use strict';

const { session, systemPreferences, desktopCapturer, Menu } = require('electron');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');

const configured = new Set();

// Ads + tracking blocker (Ghostery's prebuilt EasyList/EasyPrivacy bundle).
// Built once, attached to every partition that gets hardened. Fails open if
// the prebuilt lists can't be fetched (no network) so the app keeps working.
const blockerPromise = ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).catch(() => null);

// A clean Chrome User-Agent (no "Electron/" nor app-name tokens). It is set
// at the Chromium PROCESS level (index.js: --user-agent switch) so Chromium
// itself generates matching Sec-CH-UA client hints consistently on EVERY
// request — incl. cross-origin iframes and XHR. Manually forcing Sec-CH-UA
// via onBeforeSendHeaders made the UA/hints inconsistent and broke Google
// Calendar's data API consistency check (Gmail tolerated it, Calendar did
// not). This UA string is exported for app.userAgentFallback + the switch.
const CHROME_VERSION = process.versions.chrome || '120.0.0.0';

function buildUserAgent() {
  let platform;
  if (process.platform === 'darwin') platform = 'Macintosh; Intel Mac OS X 10_15_7';
  else if (process.platform === 'win32') platform = 'Windows NT 10.0; Win64; x64';
  else platform = 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
}

const USER_AGENT = buildUserAgent();

const CHECK_ALLOWED = new Set([
  'fullscreen',
  'clipboard-sanitized-write',
  'media',
  'display-capture',
]);

const GRANT_NO_PROMPT = new Set(['fullscreen', 'clipboard-sanitized-write', 'display-capture']);

async function ensureMacMedia(mediaTypes) {
  if (process.platform !== 'darwin') return true;
  const need = [];
  if (mediaTypes.includes('video')) need.push('camera');
  if (mediaTypes.includes('audio')) need.push('microphone');
  for (const kind of need) {
    const status = systemPreferences.getMediaAccessStatus(kind);
    if (status === 'not-determined') {
      await systemPreferences.askForMediaAccess(kind);
    } else if (status === 'denied' || status === 'restricted') {
      return false;
    }
  }
  return true;
}

function hardenPartition(partition) {
  if (configured.has(partition)) return;
  configured.add(partition);

  const ses = session.fromPartition(partition);

  ses.setUserAgent(USER_AGENT);

  blockerPromise.then((b) => b && b.enableBlockingInSession(ses)).catch(() => {});

  // Screen sharing (getDisplayMedia, used by Meet/Zoom…). Granting the
  // permission is not enough in Electron — a display-media handler must
  // supply the source. macOS 14+ uses Apple's native picker (no custom UI);
  // elsewhere, a minimal native menu of screens/windows.
  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      if (sources.length === 0) return callback();
      if (sources.length === 1) return callback({ video: sources[0] });
      const chosen = await new Promise((resolve) => {
        const menu = Menu.buildFromTemplate([
          ...sources.map((s) => ({ label: s.name || 'Source', click: () => resolve(s) })),
          { type: 'separator' },
          { label: 'Annuler', click: () => resolve(null) },
        ]);
        menu.popup({ callback: () => resolve(null) });
      });
      callback(chosen ? { video: chosen } : undefined);
    } catch {
      callback();
    }
  }, { useSystemPicker: true });

  ses.setPermissionCheckHandler((_wc, permission) => CHECK_ALLOWED.has(permission));

  ses.setPermissionRequestHandler(async (_wc, permission, callback, details) => {
    if (GRANT_NO_PROMPT.has(permission)) return callback(true);
    if (permission === 'media') {
      const ok = await ensureMacMedia(details.mediaTypes || []);
      return callback(ok);
    }
    callback(false);
  });
}

module.exports = { hardenPartition, USER_AGENT };
