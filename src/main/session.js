'use strict';

const { session, systemPreferences, desktopCapturer, Menu } = require('electron');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');

const configured = new Set();

// Ads + tracking blocker (Ghostery's prebuilt EasyList/EasyPrivacy bundle).
// Built once, attached to every partition that gets hardened. Fails open if
// the prebuilt lists can't be fetched (no network) so the app keeps working.
//
// Google sign-in fires telemetry/heartbeat requests (generate_204, play.google.com/log)
// that EasyPrivacy blocks by default. When those fail with ERR_BLOCKED_BY_CLIENT,
// Google classifies the browser as broken/automated → "browser may not be secure"
// rejection. We layer ABP exception filters (@@) on top of the prebuilt bundle so
// the blocker stays active everywhere else but lets the sign-in flow's own
// integrity probes through.
const GOOGLE_ALLOWLIST = [
  '@@||accounts.google.com^',
  '@@||accounts.youtube.com^',
  '@@||apis.google.com^',
  '@@||oauth2.googleapis.com^',
  '@@||play.google.com/log',
  '@@||www.google.com/generate_204',
  '@@||clients4.google.com^',
  '@@||clients6.google.com^',
  '@@||ssl.gstatic.com^',
];
const blockerPromise = ElectronBlocker.fromPrebuiltFull(fetch)
  .then((b) => {
    b.updateFromDiff({ added: GOOGLE_ALLOWLIST });
    return b;
  })
  .catch(() => null);

// A clean Chrome User-Agent (no "Electron/" nor app-name tokens). It is set
// at the Chromium PROCESS level (index.js: --user-agent switch) so Chromium
// itself generates matching Sec-CH-UA client hints consistently on EVERY
// request — incl. cross-origin iframes and XHR. Manually forcing Sec-CH-UA
// via onBeforeSendHeaders made the UA/hints inconsistent and broke Google
// Calendar's data API consistency check (Gmail tolerated it, Calendar did
// not). This UA string is exported for app.userAgentFallback + the switch.
const CHROME_VERSION = process.versions.chrome || '120.0.0.0';
const CHROME_MAJOR = CHROME_VERSION.split('.')[0];

function buildUserAgent() {
  let platform;
  if (process.platform === 'darwin') platform = 'Macintosh; Intel Mac OS X 10_15_7';
  else if (process.platform === 'win32') platform = 'Windows NT 10.0; Win64; x64';
  else platform = 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
}

const USER_AGENT = buildUserAgent();

// Chromium does NOT regenerate Sec-CH-UA from the `--user-agent` switch, and
// (electron#34762) it also never auto-sends the HIGH-entropy hints requested
// via Accept-CH. Google's /AccountsSignInUi/browserinfo endpoint compares the
// HTTP hints against navigator.userAgentData.getHighEntropyValues() (spoofed
// in preload/bridge.js) — any mismatch → "browser may not be secure".
// We force-emit every hint Google asks for, with values matching bridge.js
// EXACTLY, scoped to the sign-in/OAuth endpoints so Calendar/Gmail/Drive
// receive nothing here and keep behaving like before.
const SEC_CH_UA_ARCH_VALUE = process.arch === 'arm64' ? 'arm' : 'x86';
const SEC_CH_UA_PLATFORM_VERSION_VALUE = '14.0.0';
const SEC_CH_UA = `"Not(A:Brand";v="99", "Google Chrome";v="${CHROME_MAJOR}", "Chromium";v="${CHROME_MAJOR}"`;
const SEC_CH_UA_FULL_VERSION_LIST = `"Not(A:Brand";v="99.0.0.0", "Google Chrome";v="${CHROME_VERSION}", "Chromium";v="${CHROME_VERSION}"`;
const SEC_CH_UA_PLATFORM =
  process.platform === 'darwin' ? '"macOS"' :
  process.platform === 'win32'  ? '"Windows"' : '"Linux"';
const GOOGLE_SIGNIN_URLS = [
  'https://accounts.google.com/*',
  'https://accounts.youtube.com/*',
  'https://oauth2.googleapis.com/*',
];

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
  ses.setSpellCheckerLanguages(['en-US', 'fr']);

  ses.webRequest.onBeforeSendHeaders({ urls: GOOGLE_SIGNIN_URLS }, (details, callback) => {
    const h = details.requestHeaders;
    h['Sec-CH-UA'] = SEC_CH_UA;
    h['Sec-CH-UA-Mobile'] = '?0';
    h['Sec-CH-UA-Platform'] = SEC_CH_UA_PLATFORM;
    h['Sec-CH-UA-Platform-Version'] = `"${SEC_CH_UA_PLATFORM_VERSION_VALUE}"`;
    h['Sec-CH-UA-Arch'] = `"${SEC_CH_UA_ARCH_VALUE}"`;
    h['Sec-CH-UA-Bitness'] = '"64"';
    h['Sec-CH-UA-Model'] = '""';
    h['Sec-CH-UA-WoW64'] = '?0';
    h['Sec-CH-UA-Form-Factors'] = '"Desktop"';
    h['Sec-CH-UA-Full-Version'] = `"${CHROME_VERSION}"`;
    h['Sec-CH-UA-Full-Version-List'] = SEC_CH_UA_FULL_VERSION_LIST;
    callback({ requestHeaders: h });
  });

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
