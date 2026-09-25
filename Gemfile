source 'https://rubygems.org'

ruby '>= 3.4'

gem 'sinatra', '~> 4.0'   # web edition: note_editor_web.rb
gem 'puma', '~> 7.0'
gem 'rackup', '~> 2.2'
gem 'webrick', '~> 1.9'   # pure-Ruby server used by the packaged app (Puma has no prebuilt macOS binary)
gem 'sqlite3', '~> 2.8'   # notes database

# Legacy native (LibUI) edition: note_editor.rb. Install with: bundle install --with native
group :native, optional: true do
  gem 'glimmer-dsl-libui', '~> 0.7.0'
end
