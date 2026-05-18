#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/IconAïobiBrowser.png"
OUT="$ROOT/build"
ICONSET="$OUT/icon.iconset"

if [ ! -f "$SRC" ]; then
  echo "Source d'icône introuvable: $SRC" >&2
  exit 1
fi

mkdir -p "$ICONSET"

# macOS-squircle master: content ~824 px on a 1024 transparent canvas (Apple
# icon grid), rounded with the macOS corner radius. The mask is applied with
# `-channel A -compose Multiply` so ONLY the alpha channel is touched — this
# build's DstIn/CopyOpacity composites corrupt RGB; this one preserves color.
MASTER="$OUT/.icon-master.png"
magick "$SRC" -resize 824x824^ -gravity center -extent 824x824 -alpha set \
  \( +clone -alpha extract -fill black -colorize 100 \
     -fill white -draw "roundrectangle 0,0,823,823,184,184" \) \
  -channel A -compose Multiply -composite +channel \
  -background none -gravity center -extent 1024x1024 -strip PNG32:"$MASTER"

for s in 16 32 64 128 256 512 1024; do
  magick "$MASTER" -resize "${s}x${s}" -strip PNG32:"$ICONSET/icon_${s}.png"
done
rm -f "$MASTER"

cp "$ICONSET/icon_16.png"   "$ICONSET/icon_16x16.png"
cp "$ICONSET/icon_32.png"   "$ICONSET/icon_16x16@2x.png"
cp "$ICONSET/icon_32.png"   "$ICONSET/icon_32x32.png"
cp "$ICONSET/icon_64.png"   "$ICONSET/icon_32x32@2x.png"
cp "$ICONSET/icon_128.png"  "$ICONSET/icon_128x128.png"
cp "$ICONSET/icon_256.png"  "$ICONSET/icon_128x128@2x.png"
cp "$ICONSET/icon_256.png"  "$ICONSET/icon_256x256.png"
cp "$ICONSET/icon_512.png"  "$ICONSET/icon_256x256@2x.png"
cp "$ICONSET/icon_512.png"  "$ICONSET/icon_512x512.png"
cp "$ICONSET/icon_1024.png" "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o "$OUT/icon.icns"
cp "$ICONSET/icon_512.png" "$OUT/icon.png"

magick "$ICONSET/icon_256.png" "$ICONSET/icon_128.png" "$ICONSET/icon_64.png" \
  "$ICONSET/icon_32.png" "$ICONSET/icon_16.png" "$OUT/icon.ico"

echo "Icônes générées dans $OUT (icon.icns + icon.png + icon.ico)"
