# Note Editor, web edition.
#
# Ruby (Sinatra) serves a single-page editor on localhost and handles file
# open/save with native macOS dialogs. Launch with ./start.sh to get a
# chromeless Chrome "app mode" window, or run directly:
#
#   ruby note_editor_web.rb [file.md]
#
require 'sinatra'
require 'json'
require 'open3'

set :bind, '127.0.0.1'
set :port, (ENV['PORT'] || 4567).to_i
set :public_folder, File.join(__dir__, 'public')
set :logging, ENV['DEBUG'] == '1'

INITIAL_FILE = begin
  candidate = ENV['NOTE_FILE'] || ARGV.find { |a| !a.start_with?('-') && File.file?(a) }
  candidate && File.expand_path(candidate)
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

    # Some apps refuse to host the dialog; fall back to a plain dialog.
    out, err, status = Open3.capture3('osascript', '-e', "POSIX path of (#{command})")
    return out.strip if status.success?
    return nil if err.include?('-128')

    halt 500, json(error: err.strip)
  end

  def write_note(path, content)
    File.write(path, content)
    { ok: true, path: path, name: File.basename(path) }
  end
end

get '/' do
  send_file File.join(settings.public_folder, 'index.html')
end

get '/api/initial' do
  if INITIAL_FILE && File.file?(INITIAL_FILE)
    json(path: INITIAL_FILE, name: File.basename(INITIAL_FILE), content: File.read(INITIAL_FILE))
  else
    json(path: nil)
  end
end

post '/api/open' do
  path = choose_path('choose file with prompt "Open note"')
  return json(canceled: true) unless path
  halt 400, json(error: 'Not a readable file') unless File.file?(path)
  json(path: path, name: File.basename(path), content: File.read(path))
end

post '/api/save' do
  body = json_body
  halt 400, json(error: 'No file path; use Save As') if body['path'].to_s.empty?
  json(write_note(body['path'], body['content'].to_s))
end

post '/api/save_as' do
  body = json_body
  current = body['path'].to_s
  default_name = current.empty? ? 'untitled.md' : File.basename(current)
  command = "choose file name with prompt \"Save note as\" default name #{as_string(default_name)}"
  command += " default location (POSIX file #{as_string(File.dirname(current))})" unless current.empty?
  path = choose_path(command)
  return json(canceled: true) unless path
  json(write_note(path, body['content'].to_s))
end

post '/api/ping' do
  LAST_PING[:at] = Time.now
  status 204
end
