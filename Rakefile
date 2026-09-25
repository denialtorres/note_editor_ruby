require 'bundler/setup'

desc 'Run the web editor in a chromeless Chrome window (default)'
task :web do
  system './start.sh'
end

desc 'Build dist/Note Editor.app and the DMG (ARCHES="arm64 x86_64", VERSION=1.0.0, DMG=0 to skip)'
task :app do
  system 'build/build_app.sh' or abort 'build failed'
end

desc 'Run the legacy native LibUI editor (bundle install --with native)'
task :gui do
  system 'ruby note_editor.rb'
end

task default: :web
