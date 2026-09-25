# Note Editor, web edition.
#
# Ruby (Sinatra) serves a single-page editor on localhost. Notes live in a
# SQLite database; markdown files can still be imported and exported through
# native macOS dialogs. Launch with ./start.sh for a chromeless Chrome window,
# or run directly:
#
#   ruby note_editor_web.rb
#
require 'sinatra'
require 'sqlite3'
require 'json'
require 'open3'
require 'fileutils'
require 'time'

set :bind, '127.0.0.1'
set :port, (ENV['PORT'] || 4567).to_i
set :public_folder, File.join(__dir__, 'public')
set :logging, ENV['DEBUG'] == '1'
set :server_settings, { AccessLog: [] } # keep WEBrick (packaged app) from logging every heartbeat

# ---- Storage -------------------------------------------------------------
DB_PATH = ENV['NOTE_DB'] || File.join(Dir.home, 'Library', 'Application Support', 'Note Editor', 'notes.sqlite3')
FileUtils.mkdir_p(File.dirname(DB_PATH))

DB = SQLite3::Database.new(DB_PATH)
DB.results_as_hash = true
DB.busy_timeout = 5000
DB.execute_batch <<~SQL
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT '',
    content    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS notes_created_at ON notes(created_at DESC);
SQL
DB_LOCK = Mutex.new

def db
  DB_LOCK.synchronize { yield DB }
end

def now_iso
  Time.now.utc.iso8601(3)
end

# First non-empty line, with markdown markers stripped, as the note's title.
def title_for(content)
  line = content.to_s.each_line.map(&:strip).find { |l| !l.empty? } || ''
  line = line.sub(/\A(\#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+\.\s+)/, '')
  line = line.gsub(/\[([^\]]+)\]\([^)]*\)/, '\1').gsub(/[*_`~]/, '').strip
  line.empty? ? 'Untitled' : line[0, 80]
end

def find_note(id)
  db { |d| d.get_first_row('SELECT * FROM notes WHERE id = ?', id) }
end

def list_notes
  db do |d|
    d.execute('SELECT id, title, substr(content, 1, 160) AS snippet, created_at, updated_at FROM notes ORDER BY created_at DESC')
  end
end

def create_note(content)
  ts = now_iso
  db do |d|
    d.execute('INSERT INTO notes (title, content, created_at, updated_at) VALUES (?, ?, ?, ?)', [title_for(content), content, ts, ts])
    d.get_first_row('SELECT * FROM notes WHERE id = ?', d.last_insert_row_id)
  end
end

def update_note(id, content)
  db do |d|
    d.execute('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?', [title_for(content), content, now_iso, id])
    d.get_first_row('SELECT * FROM notes WHERE id = ?', id)
  end
end

# With AUTO_EXIT=1 (set by start.sh) the server shuts itself down a few seconds
# after the editor window stops sending heartbeats, so closing the window
# quits the app.
LAST_PING = { at: nil }
if ENV['AUTO_EXIT'] == '1'
  Thread.new do
    loop do
      sleep 2
      if LAST_PING[:at] && Time.now - LAST_PING[:at] > 6
        warn 'Editor window closed, shutting down.'
        Process.kill('INT', Process.pid)
        break
      end
    end
  end
end

# ---- Helpers -------------------------------------------------------------
helpers do
  def json_body
    JSON.parse(request.body.read) rescue {}
  end

  def json(obj)
    content_type :json
    obj.to_json
  end

  def as_string(str)
    '"' + str.to_s.gsub('\\', '\\\\\\\\').gsub('"', '\\"') + '"'
  end

  # Runs an AppleScript "choose ..." command. Returns the chosen POSIX path,
  # nil if the user cancelled. The dialog is attached to the frontmost app
  # (the editor window) so it appears on top.
  def choose_path(command)
    script = <<~AS
      tell application (path to frontmost application as text)
        with timeout of 3600 seconds
          POSIX path of (#{command})
        end timeout
      end tell
    AS
    out, err, status = Open3.capture3('osascript', '-e', script)
    return out.strip if status.success?
    return nil if err.include?('-128') # user cancelled

    out, err, status = Open3.capture3('osascript', '-e', "POSIX path of (#{command})")
    return out.strip if status.success?
    return nil if err.include?('-128')

    halt 500, json(error: err.strip)
  end

  def note_or_404(id)
    find_note(id.to_i) || halt(404, json(error: 'Note not found'))
  end
end

# ---- Routes --------------------------------------------------------------
get '/' do
  send_file File.join(settings.public_folder, 'index.html')
end

get '/api/notes' do
  json(list_notes)
end

post '/api/notes' do
  json(create_note(json_body['content'].to_s))
end

get '/api/notes/:id' do
  json(note_or_404(params[:id]))
end

# PUT is the normal update; POST is an alias so navigator.sendBeacon can flush
# unsaved changes when the window closes.
[:put, :post].each do |verb|
  send(verb, '/api/notes/:id') do
    note_or_404(params[:id])
    json(update_note(params[:id].to_i, json_body['content'].to_s))
  end
end

delete '/api/notes/:id' do
  note_or_404(params[:id])
  db { |d| d.execute('DELETE FROM notes WHERE id = ?', params[:id].to_i) }
  json(ok: true)
end

# Import a markdown/text file as a new note.
post '/api/import' do
  path = choose_path('choose file with prompt "Import note"')
  return json(canceled: true) unless path
  halt 400, json(error: 'Not a readable file') unless File.file?(path)
  json(create_note(File.read(path)))
end

# Export the current editor content to a markdown file.
post '/api/export' do
  body = json_body
  slug = title_for(body['content']).downcase.gsub(/[^a-z0-9]+/, '-').gsub(/\A-|-\z/, '')
  slug = 'note' if slug.empty?
  path = choose_path("choose file name with prompt \"Export note as\" default name #{as_string(slug + '.md')}")
  return json(canceled: true) unless path
  File.write(path, body['content'].to_s)
  json(ok: true, path: path, name: File.basename(path))
end

post '/api/ping' do
  LAST_PING[:at] = Time.now
  status 204
end
