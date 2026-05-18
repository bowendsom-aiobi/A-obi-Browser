'use strict';

const SEARCH_ENGINES = [
  { id: 'brave', name: 'Brave', url: 'https://search.brave.com/search?q=%s' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  { id: 'ecosia', name: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' },
  { id: 'startpage', name: 'Startpage', url: 'https://www.startpage.com/sp/search?query=%s' },
];

const DEFAULT_ENGINE_ID = 'brave';

function getEngine(id) {
  return (
    SEARCH_ENGINES.find((e) => e.id === id) ||
    SEARCH_ENGINES.find((e) => e.id === DEFAULT_ENGINE_ID)
  );
}

function resolveInput(rawInput, engine) {
  const text = String(rawInput || '').trim();
  if (!text) return null;

  if (/^(https?|file|about|aiobi):/i.test(text)) return text;

  const noSpaces = !/\s/.test(text);
  const isLocalhost = /^localhost(:\d+)?(\/.*)?$/i.test(text);
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(text);
  const hasDomainDot = /^[^\s./]+(\.[^\s./]+)+(:\d+)?(\/.*)?$/.test(text);

  if (noSpaces && (isLocalhost || isIpv4 || hasDomainDot)) {
    return 'https://' + text;
  }
  return engine.url.replace('%s', encodeURIComponent(text));
}

module.exports = { SEARCH_ENGINES, DEFAULT_ENGINE_ID, getEngine, resolveInput };
