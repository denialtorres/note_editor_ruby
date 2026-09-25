#!/bin/bash
# Builds dist/Note Editor.app: a self-contained macOS app bundling Traveling Ruby
# (arm64 + x86_64), the gems, and the editor. Run from anywhere:
#
#   build/build_app.sh            # universal (both architectures)
#   ARCHES=arm64 build/build_app.sh
#   VERSION=1.2.0 build/build_app.sh
#
# Needs: curl, an Intel or Apple Silicon Mac (the host runtime is used to
# install gems), network access for the first run (downloads are cached).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
CACHE="$BUILD/cache"
TMP="$BUILD/tmp"
DIST="$ROOT/dist"

APP_NAME="Note Editor"
BUNDLE_ID="com.danieltorres.noteeditor"
VERSION="${VERSION:-1.0.0}"
ARCHES="${ARCHES:-arm64 x86_64}"

TR_RELEASE="20251122"
TR_RUBY="3.4.7"
RUBY_ABI="3.4.0"
TR_BASE="https://github.com/YOU54F/traveling-ruby/releases/download/rel-$TR_RELEASE"

HOST_ARCH="$(uname -m)"
case " $ARCHES " in *" $HOST_ARCH "*) ;; *) echo "ARCHES must include the host architecture ($HOST_ARCH) so gems can be installed"; exit 1;; esac

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

# Version of a gem pinned in the project's Gemfile.lock (platform suffix stripped).
lock_version() {
  grep -E "^    $1 \(" "$ROOT/Gemfile.lock" | head -1 | sed -E 's/.*\(([0-9][^-)]*).*/\1/'
}

# ---------------------------------------------------------------------------
log "Downloading Traveling Ruby $TR_RUBY ($ARCHES)"
mkdir -p "$CACHE"
for arch in $ARCHES; do
  f="traveling-ruby-$TR_RELEASE-$TR_RUBY-macos-$arch.tar.gz"
  if [ ! -s "$CACHE/$f" ]; then
    echo "  fetching $f"
    curl -fsSL -o "$CACHE/$f.part" "$TR_BASE/$f" && mv "$CACHE/$f.part" "$CACHE/$f"
  else
    echo "  cached  $f"
  fi
done

# ---------------------------------------------------------------------------
log "Extracting runtimes"
rm -rf "$TMP"
mkdir -p "$TMP"
for arch in $ARCHES; do
  mkdir -p "$TMP/ruby-$arch"
  tar xzf "$CACHE/traveling-ruby-$TR_RELEASE-$TR_RUBY-macos-$arch.tar.gz" -C "$TMP/ruby-$arch"
  # Trim things the app never needs.
  rm -rf "$TMP/ruby-$arch/lib/ruby/gems/$RUBY_ABI/cache" \
         "$TMP/ruby-$arch/lib/ruby/gems/$RUBY_ABI/doc" \
         "$TMP/ruby-$arch/vendor/cache" \
         "$TMP/ruby-$arch/share" \
         "$TMP/ruby-$arch/lib/ruby/gems/$RUBY_ABI/plugins/rdoc_plugin.rb"   # references an rdoc gem that is not shipped
done
HOST_RUBY="$TMP/ruby-$HOST_ARCH"

# ---------------------------------------------------------------------------
log "Installing gems into vendor/ (using the bundled Ruby)"
SINATRA_VER="$(lock_version sinatra)"
RACKUP_VER="$(lock_version rackup)"
WEBRICK_VER="$(lock_version webrick)"
SQLITE_VER="$(lock_version sqlite3)"
echo "  sinatra $SINATRA_VER, rackup $RACKUP_VER, webrick $WEBRICK_VER, sqlite3 $SQLITE_VER"

VENDOR="$TMP/vendor"
mkdir -p "$VENDOR"
cat > "$VENDOR/Gemfile" <<GEM
source 'https://rubygems.org'

gem 'sinatra', '= $SINATRA_VER'
gem 'rackup',  '= $RACKUP_VER'
gem 'webrick', '= $WEBRICK_VER'
gem 'sqlite3', '= $SQLITE_VER'
GEM

# Clean environment: no rvm, no user bundler config, only the bundled Ruby.
run_bundled() {
  env -i HOME="$HOME" PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
    BUNDLE_IGNORE_CONFIG=1 BUNDLE_GEMFILE="$VENDOR/Gemfile" BUNDLE_PATH="$VENDOR" \
    BUNDLE_DISABLE_SHARED_GEMS=1 BUNDLE_JOBS=4 \
    "$@"
}

platforms=""
for arch in $ARCHES; do platforms="$platforms --add-platform $arch-darwin"; done
run_bundled "$HOST_RUBY/bin/bundle" lock $platforms
run_bundled "$HOST_RUBY/bin/bundle" install --quiet

# Bundler only installs the host's sqlite3 variant; add the precompiled gem for the other architectures.
for arch in $ARCHES; do
  [ "$arch" = "$HOST_ARCH" ] && continue
  echo "  adding sqlite3 $SQLITE_VER for $arch"
  run_bundled "$HOST_RUBY/bin/gem" install sqlite3 -v "$SQLITE_VER" --platform "$arch-darwin" \
    --install-dir "$VENDOR/ruby/$RUBY_ABI" --ignore-dependencies --no-document --quiet
done
rm -rf "$VENDOR/ruby/$RUBY_ABI/cache" "$VENDOR/ruby/$RUBY_ABI/doc"

# ---------------------------------------------------------------------------
log "Assembling $APP_NAME.app"
APP="$DIST/$APP_NAME.app"
if pgrep -f "$APP/Contents/MacOS/NoteEditor" >/dev/null; then
  echo "  $APP_NAME is running from $APP. Quit it first."; exit 1
fi
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/app"

sed -e "s/__VERSION__/$VERSION/g" -e "s/__BUNDLE_ID__/$BUNDLE_ID/g" -e "s/__APP_NAME__/$APP_NAME/g" \
  "$BUILD/Info.plist" > "$APP/Contents/Info.plist"
cp "$BUILD/launcher.sh" "$APP/Contents/MacOS/NoteEditor"
chmod +x "$APP/Contents/MacOS/NoteEditor"

for arch in $ARCHES; do cp -R "$TMP/ruby-$arch" "$APP/Contents/Resources/ruby-$arch"; done
cp -R "$VENDOR" "$APP/Contents/Resources/vendor"
cp "$ROOT/note_editor_web.rb" "$APP/Contents/Resources/app/"
cp -R "$ROOT/public" "$APP/Contents/Resources/app/public"

"$BUILD/make_icon.sh" "$APP/Contents/Resources/AppIcon.icns"

# ---------------------------------------------------------------------------
log "Signing (ad-hoc)"
codesign --force --deep --sign - "$APP" 2>&1 | grep -v "replacing existing signature" || true
if codesign --verify --deep --strict "$APP"; then
  echo "  signature OK"
else
  echo "  signing failed"
  exit 1
fi

log "Creating DMG"
if [ "${DMG:-1}" = "1" ]; then
  "$BUILD/make_dmg.sh" "$VERSION"
else
  echo "  skipped (DMG=0)"
fi

log "Done"
du -sh "$APP" | sed "s/^/  /"
echo "  $APP"
