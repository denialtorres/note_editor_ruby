#!/bin/bash
# Renders build/icon.svg into an .icns file using only macOS tools.
# Usage: build/make_icon.sh /path/to/AppIcon.icns
set -euo pipefail
OUT="$1"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# QuickLook renders the SVG to a PNG named icon.svg.png.
qlmanage -t -s 1024 -o "$WORK" "$HERE/icon.svg" >/dev/null 2>&1
SRC="$WORK/icon.svg.png"
[ -s "$SRC" ] || { echo "icon render failed"; exit 1; }

ICONSET="$WORK/AppIcon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z $size $size "$SRC" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z $double $double "$SRC" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$OUT"
echo "  icon -> $OUT"
