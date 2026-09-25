# Note Editor

<img width="1788" height="1038" alt="Screenshot 2026-09-25 at 2 40 16 p m" src="https://github.com/user-attachments/assets/ad0e7df6-36d3-4816-9ecf-5a9978bed36f" />

A minimal, distraction-free markdown note editor written in Ruby. Notes are
stored in a SQLite database and listed in a sidebar grouped by creation date.
Two editions:

| Edition | File | Look |
|---|---|---|
| **Web (recommended)** | `note_editor_web.rb` | Dark theme, monospace, centered column, markdown highlighting, formatting toolbar, notes sidebar, autosave. Runs in a chromeless Chrome window. |
| Native LibUI | `note_editor.rb` | Plain native text box editing single files. No styling control (LibUI limitation). |

## Web edition

```bash
./start.sh
```

`start.sh` starts a Sinatra server on `127.0.0.1:4567` and opens it in
Google Chrome's app mode (no tabs or address bar). Closing the window shuts
the server down. Press `⌃⌘F` in the window for a fully chromeless fullscreen view.

To use it in any browser instead, run `ruby note_editor_web.rb` and open
http://127.0.0.1:4567.

### Storage

Notes live in a SQLite database at
`~/Library/Application Support/Note Editor/notes.sqlite3` (override with the
`NOTE_DB` environment variable). Each note keeps its content, a title derived
from its first line, and creation and update timestamps.

Notes save automatically shortly after you stop typing, and when you switch
notes or close the window. A new note is only stored once it has content.

The sidebar lists notes newest first, grouped into Today, Yesterday, This
Week, This Month, and month-by-month beyond that. The search box filters by
title and opening text. Hover a note for its delete button.

Markdown files can still be brought in and out: Import creates a new note
from a file, Export writes the current note to a `.md` file.

### Shortcuts

| Keys | Action |
|---|---|
| `⌘S` | Save now (autosave also runs while you type) |
| `⌥⌘N` | New note (`⌘N` is reserved by Chrome) |
| `⌘\` | Toggle sidebar |
| `⌘O` | Import a markdown file as a new note |
| `⌘⇧S` | Export current note as markdown |
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
- `note_editor_web.rb` — serves the page and a small JSON API:
  `GET/POST /api/notes`, `GET/PUT/DELETE /api/notes/:id`, `POST /api/import`,
  `POST /api/export`. File dialogs are native, via `osascript`.
- Styling lives in the CSS variables at the top of `public/style.css`
  (colours, font, column width, line height, sidebar width).

## Native edition

```bash
ruby note_editor.rb
```

Uses Glimmer DSL for LibUI. Menu with `⌘N` / `⌘O` / `⌘S`. macOS window chrome
and system font only; LibUI's text widget exposes no font, colour, or padding
settings.

## Requirements

Ruby 3.4 (see `.ruby-version`, managed by rvm), `bundle install`, Google Chrome
for the app-mode window. The legacy native edition needs `bundle install --with native`.
