# Aïobi Browser — site vitrine

Site statique, **zéro dépendance** (HTML/CSS/JS pur). À héberger n'importe où.

## Héberger

Déposez le **contenu du dossier `site/`** sur n'importe quel hébergeur statique :
glissez-le dans Netlify / Vercel / Cloudflare Pages, ou copiez-le sur votre
serveur (Nginx/Apache), ou un bucket S3. Aucun build, aucune install.

Aperçu local :

```bash
cd site && python3 -m http.server 8080   # puis http://localhost:8080
```

## La logique de téléchargement (aucune maintenance)

Les boutons ne pointent **jamais** vers une version figée :

1. Au chargement, le site interroge l'API GitHub
   `repos/bowendsom-aiobi/A-obi-Browser/releases/latest` → récupère le n° de
   version et les liens exacts des installeurs de la **dernière** Release.
2. En secours (API indisponible / quota), il retombe sur l'URL **permanente**
   `github.com/<repo>/releases/latest/download/<nom-fixe>` que GitHub
   redirige toujours vers la dernière version.
3. L'OS du visiteur est détecté → le gros bouton propose directement le bon
   fichier ; les 3 boutons OS restent disponibles.

Conséquence : **une nouvelle version = un nouveau tag → la CI publie la
Release → le site sert la nouvelle automatiquement.** Le site n'est jamais
modifié. Les noms d'assets sont fixes (voir `js/release.js` → `STABLE`) et
produits par `electron-builder.yml` (`artifactName`).

Changer de dépôt : `REPO` en haut de `js/release.js`.

## Remplacer les visuels

Mettez vos fichiers dans `assets/img/` en gardant **exactement ces noms** :

| Fichier | Usage |
|---|---|
| `browser.png` | grand screenshot (section showcase) |
| `chat.png` | carte « Chat IA » |
| `bookmarks.png` | carte « Signets » |
| `world.png` | carte « Aïobi World » |
| `logo.svg` | logo (nav + footer + favicon) |
| `wallpaper.png` | fond (réserve, non utilisé par défaut) |

Polices de marque (Clash Display + Satoshi) auto-hébergées dans
`assets/fonts/` — rien à faire.

## Test de la logique

```bash
node site/test/release.test.mjs
```
