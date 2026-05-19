// Pure, dependency-free, testable logic for resolving the latest download
// links from GitHub Releases. No site edit is ever needed on a new version:
// the GitHub API (and the static fallback URL) always point to `latest`.

export const REPO = 'bowendsom-aiobi/A-obi-Browser';

// Stable asset filenames produced by CI (electron-builder artifactName).
// They never carry the version, so `releases/latest/download/<name>` is a
// permanent URL that always redirects to the newest release.
export const STABLE = {
  mac: 'Aiobi-Browser-mac-arm64.dmg',
  win: 'Aiobi-Browser-windows-x64.exe',
  linux: 'Aiobi-Browser-linux-x86_64.AppImage',
  deb: 'Aiobi-Browser-linux-amd64.deb',
};

export function fallbackLinks(repo = REPO) {
  const base = `https://github.com/${repo}/releases/latest/download`;
  return {
    version: null,
    mac: `${base}/${STABLE.mac}`,
    win: `${base}/${STABLE.win}`,
    linux: `${base}/${STABLE.linux}`,
    deb: `${base}/${STABLE.deb}`,
  };
}

// Map a GitHub `/releases/latest` JSON payload to download URLs.
// Matches by file extension so it keeps working even if names change.
export function resolveRelease(json, repo = REPO) {
  if (!json || !Array.isArray(json.assets)) return fallbackLinks(repo);
  const pick = (re) => {
    const a = json.assets.find((x) => re.test(x.name || ''));
    return a ? a.browser_download_url : null;
  };
  const fb = fallbackLinks(repo);
  return {
    version: json.tag_name || null,
    publishedAt: json.published_at || null,
    mac: pick(/\.dmg$/i) || fb.mac,
    win: pick(/\.exe$/i) || fb.win,
    linux: pick(/\.AppImage$/i) || fb.linux,
    deb: pick(/\.deb$/i) || fb.deb,
  };
}

export function detectOS(ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '')) {
  const s = String(ua);
  if (/Win/i.test(s)) return 'win';
  if (/Linux|X11|Ubuntu|Fedora|Debian/i.test(s) && !/Android/i.test(s)) return 'linux';
  if (/Mac|iPhone|iPad|iPod/i.test(s)) return 'mac';
  return 'mac';
}

export async function fetchLatest(repo = REPO, fetchImpl) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) return fallbackLinks(repo);
  try {
    const r = await f(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!r.ok) return fallbackLinks(repo);
    return resolveRelease(await r.json(), repo);
  } catch {
    return fallbackLinks(repo);
  }
}
