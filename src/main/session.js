'use strict';

const { session, systemPreferences, desktopCapturer, Menu } = require('electron');

const configured = new Set();

// A clean Chrome User-Agent (no "Electron/" nor app-name tokens): those make
// Cloudflare / Turnstile flag the client as a bot and loop the "verify you
// are a human" challenge forever. Must be applied on every request — incl.
// the cross-origin challenges.cloudflare.com iframe (Electron #40374) — and
// the Sec-CH-UA client hints must stay consistent with it.
const CHROME_VERSION = process.versions.chrome || '120.0.0.0';

function buildUserAgent() {
  let platform;
  if (process.platform === 'darwin') platform = 'Macintosh; Intel Mac OS X 10_15_7';
  else if (process.platform === 'win32') platform = 'Windows NT 10.0; Win64; x64';
  else platform = 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
}

const USER_AGENT = buildUserAgent();

function clientHints() {
  const major = CHROME_VERSION.split('.')[0];
  let platform;
  if (process.platform === 'darwin') platform = '"macOS"';
  else if (process.platform === 'win32') platform = '"Windows"';
  else platform = '"Linux"';
  return {
    'Sec-CH-UA': `"Not A(Brand";v="8", "Chromium";v="${major}", "Google Chrome";v="${major}"`,
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': platform,
  };
}

const HINTS = clientHints();

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
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = USER_AGENT;
    for (const [k, v] of Object.entries(HINTS)) details.requestHeaders[k] = v;
    callback({ requestHeaders: details.requestHeaders });
  });

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
