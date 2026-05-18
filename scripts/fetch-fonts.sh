#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/src/renderer/fonts"
URL='https://api.fontshare.com/v2/css?f[]=clash-display@600,700&f[]=satoshi@400,500,700&display=swap'
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

mkdir -p "$DEST"
SRC="$DEST/.fonts.src.css"

curl -fsSL -A "$UA" "$URL" -o "$SRC" || { echo "échec téléchargement CSS Fontshare"; exit 1; }

grep -oE "//[^'\")]+\.woff2" "$SRC" | sort -u | while read -r rel; do
  fname="$(basename "$rel")"
  curl -fsSL -A "$UA" "https:${rel}" -o "$DEST/$fname" || echo "warn: $fname"
done

sed -E "s#//[^'\")]*/([^'\"/)]+\.woff2)#./\1#g; s#url\('//#url('https://#g" "$SRC" > "$DEST/fonts.css"
rm -f "$SRC"

count=$(ls -1 "$DEST"/*.woff2 2>/dev/null | wc -l | tr -d ' ')
echo "Fonts auto-hébergées : $count fichiers .woff2 dans $DEST"
[ "$count" -gt 0 ] || { echo "aucun woff2 téléchargé"; exit 1; }
