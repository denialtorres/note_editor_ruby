#!/bin/bash
# Launch the Note Editor web edition in a chromeless Chrome window.
# Usage: ./start.sh
# Env:   PORT (default 4567), NOTE_DB (default ~/Library/Application Support/Note Editor/notes.sqlite3)
set -e
cd "$(dirname "$0")"

# Pick up the project Ruby via rvm when available (see .ruby-version).
if [ -s "$HOME/.rvm/scripts/rvm" ]; then
  export rvm_silence_path_mismatch_check_flag=1
  source "$HOME/.rvm/scripts/rvm"
  rvm use "$(cat .ruby-version)" >/dev/null
fi

PORT="${PORT:-4567}"
URL="http://127.0.0.1:$PORT"

AUTO_EXIT=1 PORT="$PORT" ruby note_editor_web.rb &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT

# Wait for the server to come up.
for _ in $(seq 1 50); do
  curl -s -o /dev/null "$URL/api/notes" && break
  sleep 0.1
done

open -na "Google Chrome" --args --app="$URL" --window-size=1200,900

echo "Note Editor running at $URL (close the window or press Ctrl+C to quit)"
wait $SERVER_PID
