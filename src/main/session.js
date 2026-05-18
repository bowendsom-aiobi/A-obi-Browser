'use strict';

const { session, systemPreferences } = require('electron');

const configured = new Set();

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

module.exports = { hardenPartition };
