#!/bin/bash
# Note Editor launcher (Contents/MacOS/NoteEditor).
# Starts the bundled Ruby server and opens the editor in a chromeless browser window.

CONTENTS="$(cd "$(dirname "$0")/.." && pwd)"
RES="$CONTENTS/Resources"

ARCH="$(uname -m)"
[ -d "$RES/ruby-$ARCH" ] || ARCH="x86_64"   # Rosetta fallback
RUBY="$RES/ruby-$ARCH/bin/ruby"

DATA="$HOME/Library/Application Support/Note Editor"
mkdir -p "$DATA"
LOG="$DATA/app.log"
PORT_FILE="$DATA/server.port"

# Isolate the bundled Ruby from anything on the user's machine.
unset GEM_HOME GEM_PATH RUBYOPT RUBYLIB RUBYPATH
export BUNDLE_IGNORE_CONFIG=1
export BUNDLE_GEMFILE="$RES/vendor/Gemfile"
export BUNDLE_PATH="$RES/vendor"
export BUNDLE_FROZEN=1
export BUNDLE_DISABLE_SHARED_GEMS=1
export BUNDLE_WITHOUT=""
export BUNDLE_USER_HOME="$DATA/.bundle"

fail() {
  osascript -e "display dialog \"$1\" with title \"Note Editor\" buttons {\"OK\"} default button 1 with icon stop" >/dev/null 2>&1
  exit 1
}

open_window() {
  local url="$1" app
  for app in "Google Chrome" "Brave Browser" "Microsoft Edge" "Chromium" "Vivaldi"; do
    if [ -d "/Applications/$app.app" ] || [ -d "$HOME/Applications/$app.app" ]; then
      open -na "$app" --args --app="$url" --window-size=1200,900
      return
    fi
  done
  open "$url"   # no Chromium browser: default browser, regular tab
}

# Already running? Just bring up another window.
if [ -f "$PORT_FILE" ]; then
  PORT="$(cat "$PORT_FILE")"
  if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/api/notes"; then
    open_window "http://127.0.0.1:$PORT"
    exit 0
  fi
fi

PORT="$("$RUBY" -e 'require "socket"; s = TCPServer.new("127.0.0.1", 0); print s.addr[1]')" || fail "Could not start the bundled Ruby. See $LOG"
URL="http://127.0.0.1:$PORT"
echo "$PORT" > "$PORT_FILE"

{
  echo "----- $(date) starting on $URL (arch $ARCH)"
} >> "$LOG"

AUTO_EXIT=1 PORT="$PORT" NOTE_DB="$DATA/notes.sqlite3" \
  "$RUBY" -rbundler/setup "$RES/app/note_editor_web.rb" >> "$LOG" 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null; rm -f "$PORT_FILE"' EXIT

for _ in $(seq 1 100); do
  curl -s -o /dev/null --max-time 1 "$URL/api/notes" && break
  kill -0 $SERVER_PID 2>/dev/null || fail "The note server failed to start. Details are in $LOG"
  sleep 0.15
done

open_window "$URL"
wait $SERVER_PID
