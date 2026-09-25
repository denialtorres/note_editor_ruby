#!/bin/bash
# Packages dist/Note Editor.app into a compressed DMG with an Applications shortcut.
# Usage: build/make_dmg.sh [version]   (normally called by build_app.sh)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
DIST="$ROOT/dist"
APP_NAME="Note Editor"
VERSION="${1:-${VERSION:-1.0.0}}"
APP="$DIST/$APP_NAME.app"
DMG="$DIST/Note-Editor-$VERSION.dmg"
[ -d "$APP" ] || { echo "missing $APP, run build/build_app.sh first"; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
ditto "$APP" "$STAGE/$APP_NAME.app"          # ditto keeps the signature and symlinks intact
ln -s /Applications "$STAGE/Applications"
cp "$BUILD/READ ME FIRST.txt" "$STAGE/READ ME FIRST.txt"

rm -f "$DMG"
hdiutil create -quiet -volname "$APP_NAME" -srcfolder "$STAGE" -ov -format UDZO -fs HFS+ "$DMG"
echo "  $(du -h "$DMG" | cut -f1)	$DMG"
