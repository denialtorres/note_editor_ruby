# Note Editor

A minimal, distraction-free markdown note editor written in Ruby. Two editions:

| Edition | File | Look |
|---|---|---|
| **Web (recommended)** | `note_editor_web.rb` | Dark theme, monospace, centered column, markdown highlighting, status bar with word count. Runs in a chromeless Chrome window. |
| Native LibUI | `note_editor.rb` | Plain native text box. No styling control (LibUI limitation). |

## Web edition

```bash
./start.sh              # empty note
./start.sh notes.md     # open (or create) a file
```

`start.sh` starts a Sinatra server on `127.0.0.1:4567` and opens it in
Google Chrome's app mode (no tabs or address bar). Closing the window shuts
the server down. Press `⌃⌘F` in the window for a fully chromeless fullscreen view.

To use it in any browser instead, run `ruby note_editor_web.rb [file]` and open
http://127.0.0.1:4567.

### Shortcuts

| Keys | Action |
|---|---|
| `⌘S` | Save (prompts for a name on first save) |
| `⌘⇧S` | Save As |
| `⌘O` | Open (native macOS dialog) |
| `+` button in status bar | New note (`⌘N` is reserved by Chrome) |
| `⌘B` / `⌘I` / `⌘⇧X` | Bold / italic / strikethrough |
| `⌘E` / `⌘K` | Inline code / link |
| `⌥⌘1` `⌥⌘2` `⌥⌘3` | Heading level 1, 2, 3 (toggle) |

The toolbar at the top also has quote, bullet list, numbered list, checklist,
and horizontal rule. Every control wraps or toggles markdown around the
current selection, and undo works as usual.

### How it works

- `public/index.html`, `style.css`, `app.js` — the editor. A transparent
  `<textarea>` sits on top of a `<pre>` mirror that carries the markdown
  colouring, so editing stays native while the text is styled.
- `note_editor_web.rb` — serves the page and exposes `/api/open`, `/api/save`,
  `/api/save_as`. File dialogs are native, via `osascript`.
- Styling lives in the CSS variables at the top of `public/style.css`
  (colours, font, column width, line height).

## Native edition

```bash
ruby note_editor.rb
```

Uses Glimmer DSL for LibUI. Menu with `⌘N` / `⌘O` / `⌘S`. macOS window chrome
and system font only; LibUI's text widget exposes no font, colour, or padding
settings.

## Requirements

Ruby 3.0 (see `.ruby-version`, managed by rvm), `bundle install`, Google Chrome
for the app-mode window.
