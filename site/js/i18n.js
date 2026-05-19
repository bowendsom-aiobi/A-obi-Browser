// FR / EN strings. Brand "Aïobi" is never translated and always keeps the
// capital A + tréma. Selector persists in localStorage, defaults to the
// browser language.

export const STRINGS = {
  fr: {
    'nav.features': 'Fonctionnalités',
    'nav.download': 'Télécharger',
    'hero.title': 'Aïobi Browser',
    'hero.tagline': 'Simple, élégant, privé. Votre navigateur, votre marque, votre monde.',
    'hero.primary': 'Télécharger',
    'hero.for': 'pour',
    'hero.free': 'Gratuit · macOS, Windows, Linux',
    'hero.other': 'Autres plateformes',
    'dl.mac': 'macOS',
    'dl.win': 'Windows',
    'dl.linux': 'Linux',
    'dl.mac.sub': 'Apple Silicon · .dmg',
    'dl.win.sub': 'Installeur · .exe',
    'dl.linux.sub': 'AppImage',
    'show.title': 'Pensé pour aller à l’essentiel',
    'show.sub': 'Une barre latérale claire, vos onglets à gauche, et tout le reste qui s’efface.',
    'feat.title': 'Tout ce qu’il faut, rien de superflu',
    'feat.chat.t': 'Chat IA intégré',
    'feat.chat.d': 'Ouvrez l’assistant Aïobi en panneau latéral, sans quitter votre page.',
    'feat.book.t': 'Signets élégants',
    'feat.book.d': 'Vos pages sauvegardées, accessibles d’un geste, réorganisables.',
    'feat.world.t': 'Aïobi World',
    'feat.world.d': 'Docs, Sheets, Drive, Forms, Mail, Meet, Calendar — votre suite, à portée de clic.',
    'cta.title': 'Prêt à essayer ?',
    'cta.sub': 'Téléchargement direct, gratuit, sans compte.',
    'foot.tag': 'Aïobi Browser — simple, élégant, privé.',
    'note.mac': 'macOS : au 1ᵉʳ lancement, clic droit sur l’app → Ouvrir.',
  },
  en: {
    'nav.features': 'Features',
    'nav.download': 'Download',
    'hero.title': 'Aïobi Browser',
    'hero.tagline': 'Simple, elegant, private. Your browser, your brand, your world.',
    'hero.primary': 'Download',
    'hero.for': 'for',
    'hero.free': 'Free · macOS, Windows, Linux',
    'hero.other': 'Other platforms',
    'dl.mac': 'macOS',
    'dl.win': 'Windows',
    'dl.linux': 'Linux',
    'dl.mac.sub': 'Apple Silicon · .dmg',
    'dl.win.sub': 'Installer · .exe',
    'dl.linux.sub': 'AppImage',
    'show.title': 'Built to get out of your way',
    'show.sub': 'A calm sidebar, tabs on the left, and everything else fades away.',
    'feat.title': 'Everything you need, nothing you don’t',
    'feat.chat.t': 'Built-in AI chat',
    'feat.chat.d': 'Open the Aïobi assistant in a side panel without leaving your page.',
    'feat.book.t': 'Elegant bookmarks',
    'feat.book.d': 'Your saved pages, one gesture away, reorderable.',
    'feat.world.t': 'Aïobi World',
    'feat.world.d': 'Docs, Sheets, Drive, Forms, Mail, Meet, Calendar — your suite, one click away.',
    'cta.title': 'Ready to try it?',
    'cta.sub': 'Direct download, free, no account.',
    'foot.tag': 'Aïobi Browser — simple, elegant, private.',
    'note.mac': 'macOS: on first launch, right-click the app → Open.',
  },
};

export function pickLang() {
  try {
    const saved = localStorage.getItem('aiobi-lang');
    if (saved === 'fr' || saved === 'en') return saved;
  } catch {}
  const n = (typeof navigator !== 'undefined' && navigator.language) || 'fr';
  return /^en/i.test(n) ? 'en' : 'fr';
}

export function applyLang(lang, root = document) {
  const dict = STRINGS[lang] || STRINGS.fr;
  root.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n');
    if (dict[k] != null) el.textContent = dict[k];
  });
  try {
    localStorage.setItem('aiobi-lang', lang);
  } catch {}
  return dict;
}
