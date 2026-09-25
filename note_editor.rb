require 'glimmer-dsl-libui'

class NoteEditor
  include Glimmer
  
  attr_accessor :content
  
  def initialize
    @content = ""
    @current_file = nil
  end
  
  def launch
    menu('File') {
      menu_item('New (⌘N)') {
        on_clicked { new_file }
      }
      
      menu_item('Open (⌘O)') {
        on_clicked { open_file }
      }
      
      menu_item('Save (⌘S)') {
        on_clicked { save_file }
      }
      
      menu_item('Save As') {
        on_clicked { save_file_as }
      }
      
      quit_menu_item
    }
    
    # Minimal window - just title and text
    @main_window = window('', 1200, 900) {  # Empty title to minimize top bar
      margined false
      
      @text_area = multiline_entry {
        text <=> [self, :content]
      }
      
      on_closing {
        true  # Allow closing
      }
    }.show
  end
  
  def new_file
    self.content = ""
    @current_file = nil
  end
  
  def open_file
    file = UI.open_file(@main_window)
    if file && File.exist?(file)
      self.content = File.read(file)
      @current_file = file
    end
  end
  
  def save_file
    if @current_file
      File.write(@current_file, content)
      puts "✓ Saved to #{@current_file}"
    else
      save_file_as
    end
  end
  
  def save_file_as
    file = UI.save_file(@main_window)
    if file
      File.write(file, content)
      @current_file = file
      puts "✓ Saved to #{file}"
    end
  end
end

NoteEditor.new.launch
