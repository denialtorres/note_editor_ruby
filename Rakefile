require 'bundler/setup'

desc 'Run the web editor in a chromeless Chrome window (default)'
task :web do
  system './start.sh'
end

desc 'Run the native LibUI editor'
task :gui do
  system 'ruby note_editor.rb'
end

task default: :web
