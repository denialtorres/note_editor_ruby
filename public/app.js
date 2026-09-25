(() => {
  const input = document.getElementById('input');
  const highlight = document.getElementById('highlight');
  const statusEl = document.getElementById('status');
  const wordsEl = document.getElementById('words');
  const toastEl = document.getElementById('toast');
  const listEl = document.getElementById('notes-list');
  const searchEl = document.getElementById('search');

  // ---- State
  let notes = [];          // [{id, title, snippet, created_at, updated_at}] newest first
  let currentId = null;    // null = new, not yet stored note
  let savedContent = '';
  let saveTimer = null;
  let saving = null;       // in-flight save promise
  let savePending = false;

  // ---- Markdown highlighting (widths must match the textarea exactly, so
  // every character stays visible; we only colour and weight them).
  const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const inline = (s) =>
    s
      .replace(/`([^`\n]+)`/g, '<span class="md-code">`$1`</span>')
      .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g,
        '<span class="md-mark">[</span><span class="md-link">$1</span><span class="md-mark">]($2)</span>')
      .replace(/(?<!\()https?:\/\/[^\s<]+/g, '<span class="md-link">$&</span>')
      .replace(/\*\*([^*\n]+?)\*\*/g, '<span class="md-mark">**</span><span class="md-b">$1</span><span class="md-mark">**</span>')
      .replace(/(?<![*\w])\*(?!\*)([^*\n]+?)\*(?![*\w])/g, '<span class="md-mark">*</span><span class="md-i">$1</span><span class="md-mark">*</span>')
      .replace(/(?<![\w_])_([^_\n]+?)_(?![\w_])/g, '<span class="md-mark">_</span><span class="md-i">$1</span><span class="md-mark">_</span>')
      .replace(/~~([^~\n]+?)~~/g, '<span class="md-mark">~~</span><span class="md-s">$1</span><span class="md-mark">~~</span>');

  const renderLine = (line) => {
    let m;
    if ((m = line.match(/^(#{1,6})( +)(.*)$/))) {
      return `<span class="md-mark">${m[1]}</span>${m[2]}<span class="md-h">${inline(m[3])}</span>`;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return `<span class="md-mark">${line}</span>`;
    if ((m = line.match(/^(\s*&gt;\s?)(.*)$/))) {
      return `<span class="md-mark">${m[1]}</span><span class="md-quote">${inline(m[2])}</span>`;
    }
    if ((m = line.match(/^(\s*)([-*+]|\d+\.)( +)(\[[ xX]\] )?(.*)$/))) {
      const box = m[4] ? `<span class="md-mark">${m[4]}</span>` : '';
      return `${m[1]}<span class="md-bullet">${m[2]}</span>${m[3]}${box}${inline(m[5])}`;
    }
    return inline(line);
  };

  const render = () => {
    const text = input.value;
    highlight.innerHTML = escapeHtml(text).split('\n').map(renderLine).join('\n') + '\n';
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
    updateStatus();
  };

  // ---- Status bar
  const isDirty = () => input.value !== savedContent;

  const updateStatus = () => {
    const words = input.value.trim().split(/\s+/).filter(Boolean).length;
    wordsEl.textContent = `${words} ${words === 1 ? 'Word' : 'Words'}`;
    const dirty = isDirty();
    if (saving) statusEl.textContent = 'Saving…';
    else if (!currentId) statusEl.textContent = dirty ? 'New note · unsaved' : 'New note';
    else statusEl.textContent = dirty ? 'Unsaved changes' : 'Saved';
    statusEl.classList.toggle('dirty', dirty && !saving);
    const current = notes.find((n) => n.id === currentId);
    document.title = (dirty ? '• ' : '') + (current ? current.title : 'Note Editor');
  };

  let toastTimer;
  const toast = (msg, isError = false) => {
    toastEl.textContent = msg;
    toastEl.classList.toggle('error', isError);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  };

  // ---- API
  const api = async (method, path, body) => {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
    return data;
  };

  // ---- Notes list (sidebar)
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const groupLabel = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return 'This Week';
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'This Month';
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  };

  const shortTime = (iso) => {
    const d = new Date(iso);
    const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
    if (days <= 0) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const snippetOf = (n) => {
    const lines = n.snippet.split('\n').map((l) => l.trim()).filter(Boolean);
    return (lines[1] || '').replace(/[#*_`~>\[\]]/g, '').slice(0, 60);
  };

  const renderList = () => {
    const q = searchEl.value.trim().toLowerCase();
    const shown = q
      ? notes.filter((n) => (n.title + '\n' + n.snippet).toLowerCase().includes(q))
      : notes;

    listEl.innerHTML = '';
    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = q ? 'No notes match.' : 'No notes yet. Start typing and your note is saved automatically.';
      listEl.appendChild(empty);
      return;
    }

    let lastGroup = null;
    for (const n of shown) {
      const g = groupLabel(n.created_at);
      if (g !== lastGroup) {
        const label = document.createElement('div');
        label.className = 'group-label';
        label.textContent = g;
        listEl.appendChild(label);
        lastGroup = g;
      }
      const item = document.createElement('div');
      item.className = 'note-item' + (n.id === currentId ? ' active' : '');
      item.dataset.id = n.id;

      const title = document.createElement('div');
      title.className = 'note-title';
      title.textContent = n.title || 'Untitled';

      const meta = document.createElement('div');
      meta.className = 'note-meta';
      const snip = snippetOf(n);
      meta.textContent = shortTime(n.created_at) + (snip ? ' · ' + snip : '');

      const del = document.createElement('button');
      del.className = 'note-del';
      del.title = 'Delete note';
      del.textContent = '×';
      del.addEventListener('click', (e) => { e.stopPropagation(); deleteNote(n.id); });

      item.append(title, meta, del);
      item.addEventListener('click', () => openNote(n.id));
      listEl.appendChild(item);
    }
  };

  const loadNotes = async () => {
    notes = await api('GET', '/api/notes');
    renderList();
  };

  // ---- Saving (debounced autosave + explicit ⌘S)
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(), 700);
  };

  const save = async () => {
    clearTimeout(saveTimer);
    if (saving) { savePending = true; return saving; }
    const content = input.value;
    if (content === savedContent) return;
    if (!currentId && !content.trim()) return; // don't store empty new notes

    saving = (async () => {
      try {
        updateStatus();
        if (currentId) {
          const note = await api('PUT', `/api/notes/${currentId}`, { content });
          const idx = notes.findIndex((n) => n.id === note.id);
          if (idx >= 0) notes[idx] = { ...notes[idx], title: note.title, snippet: note.content.slice(0, 160), updated_at: note.updated_at };
        } else {
          const note = await api('POST', '/api/notes', { content });
          currentId = note.id;
          notes.unshift({ id: note.id, title: note.title, snippet: note.content.slice(0, 160), created_at: note.created_at, updated_at: note.updated_at });
        }
        savedContent = content;
        renderList();
      } catch (e) {
        toast(e.message, true);
      } finally {
        saving = null;
        updateStatus();
      }
    })();
    await saving;
    if (savePending) { savePending = false; return save(); }
  };

  const flush = () => (isDirty() ? save() : Promise.resolve());

  // ---- Note operations
  const setEditor = (content) => {
    input.value = content;
    savedContent = content;
    input.setSelectionRange(0, 0);
    render();
    document.querySelector('.scroll').scrollTop = 0;
    input.focus();
  };

  const openNote = async (id) => {
    if (id === currentId) return input.focus();
    await flush();
    try {
      const note = await api('GET', `/api/notes/${id}`);
      currentId = note.id;
      setEditor(note.content);
      renderList();
    } catch (e) {
      toast(e.message, true);
    }
  };

  const newNote = async () => {
    await flush();
    currentId = null;
    setEditor('');
    renderList();
  };

  const deleteNote = async (id) => {
    const n = notes.find((x) => x.id === id);
    if (!confirm(`Delete "${n ? n.title : 'this note'}"?`)) return;
    try {
      await api('DELETE', `/api/notes/${id}`);
      notes = notes.filter((x) => x.id !== id);
      if (id === currentId) { currentId = null; setEditor(''); }
      renderList();
      toast('Deleted');
    } catch (e) {
      toast(e.message, true);
    }
  };

  const importFile = async () => {
    await flush();
    try {
      const note = await api('POST', '/api/import');
      if (note.canceled) return;
      notes.unshift({ id: note.id, title: note.title, snippet: note.content.slice(0, 160), created_at: note.created_at, updated_at: note.updated_at });
      currentId = note.id;
      setEditor(note.content);
      renderList();
      toast('Imported');
    } catch (e) {
      toast(e.message, true);
    }
  };

  const exportFile = async () => {
    try {
      const r = await api('POST', '/api/export', { content: input.value });
      if (!r.canceled) toast(`Exported ${r.name}`);
    } catch (e) {
      toast(e.message, true);
    }
    input.focus();
  };

  const toggleSidebar = () => {
    const hidden = document.body.classList.toggle('sidebar-hidden');
    localStorage.setItem('sidebar-hidden', hidden ? '1' : '0');
  };

  // ---- Formatting (toolbar + shortcuts). Edits go through execCommand so
  // native undo (⌘Z) keeps working; setRangeText is the fallback.
  const replaceRange = (start, end, text) => {
    input.focus();
    input.setSelectionRange(start, end);
    if (!document.execCommand || !document.execCommand('insertText', false, text)) {
      input.setRangeText(text, start, end, 'end');
    }
  };

  const afterEdit = () => { render(); scheduleSave(); };

  // Wrap the selection in markers, or unwrap it if already wrapped.
  const wrap = (before, after, placeholder) => {
    const v = input.value;
    const s = input.selectionStart;
    const e = input.selectionEnd;
    const sel = v.slice(s, e);

    if (sel.startsWith(before) && sel.endsWith(after) && sel.length >= before.length + after.length) {
      const innerText = sel.slice(before.length, sel.length - after.length);
      replaceRange(s, e, innerText);
      input.setSelectionRange(s, s + innerText.length);
    } else if (v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after) {
      replaceRange(s - before.length, e + after.length, sel);
      input.setSelectionRange(s - before.length, s - before.length + sel.length);
    } else {
      const innerText = sel || placeholder;
      replaceRange(s, e, before + innerText + after);
      input.setSelectionRange(s + before.length, s + before.length + innerText.length);
    }
    afterEdit();
  };

  const lineBounds = () => {
    const v = input.value;
    const start = v.lastIndexOf('\n', input.selectionStart - 1) + 1;
    let end = v.indexOf('\n', input.selectionEnd);
    if (end === -1) end = v.length;
    if (input.selectionEnd > input.selectionStart && v[input.selectionEnd - 1] === '\n' && input.selectionEnd > start) {
      end = input.selectionEnd - 1;
    }
    return { start, end };
  };

  // Toggle a per-line prefix on every selected line. `has` tests for this
  // exact prefix kind, `strip` removes any prefix of the same family (so a
  // bullet list converts to a numbered one), `make(i)` builds the new prefix.
  const prefixLines = (has, strip, make) => {
    const { start, end } = lineBounds();
    const lines = input.value.slice(start, end).split('\n');
    const allHave = lines.every((l) => has.test(l));
    const text = lines.map((l, i) => (allHave ? l.replace(strip, '') : make(i) + l.replace(strip, ''))).join('\n');
    replaceRange(start, end, text);
    input.setSelectionRange(start, start + text.length);
    afterEdit();
  };

  const heading = (level) => {
    const { start, end } = lineBounds();
    const lines = input.value.slice(start, end).split('\n');
    const mark = '#'.repeat(level) + ' ';
    const allSame = lines.every((l) => l.startsWith(mark));
    const text = lines.map((l) => (allSame ? l.replace(/^#{1,6} /, '') : mark + l.replace(/^#{1,6} /, ''))).join('\n');
    replaceRange(start, end, text);
    input.setSelectionRange(start, start + text.length);
    afterEdit();
  };

  const link = () => {
    const sel = input.value.slice(input.selectionStart, input.selectionEnd);
    const s = input.selectionStart;
    if (/^https?:\/\/\S+$/.test(sel)) {
      replaceRange(s, input.selectionEnd, `[link text](${sel})`);
      input.setSelectionRange(s + 1, s + 10);
    } else {
      const text = sel || 'link text';
      replaceRange(s, input.selectionEnd, `[${text}](https://)`);
      const urlStart = s + text.length + 3;
      input.setSelectionRange(urlStart, urlStart + 8);
    }
    afterEdit();
  };

  const rule = () => {
    const { end } = lineBounds();
    const atLineStart = end === 0 || input.value[end - 1] === '\n';
    replaceRange(end, end, (atLineStart ? '' : '\n') + '\n---\n\n');
    afterEdit();
  };

  const LIST = /^(\s*)([-*+]|\d+\.) (\[[ xX]\] )?/;

  const actions = {
    heading: (btn) => heading(Number(btn.dataset.level)),
    bold: () => wrap('**', '**', 'bold text'),
    italic: () => wrap('*', '*', 'italic text'),
    strike: () => wrap('~~', '~~', 'struck text'),
    code: () => wrap('`', '`', 'code'),
    link,
    quote: () => prefixLines(/^> ?/, /^> ?/, () => '> '),
    ul: () => prefixLines(/^\s*[-*+] (?!\[[ xX]\] )/, LIST, () => '- '),
    ol: () => prefixLines(/^\s*\d+\. /, LIST, (i) => `${i + 1}. `),
    task: () => prefixLines(/^\s*[-*+] \[[ xX]\] /, LIST, () => '- [ ] '),
    hr: rule,
  };

  document.querySelectorAll('.toolbar button').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep textarea selection
    btn.addEventListener('click', () => actions[btn.dataset.action](btn));
  });

  // ---- Wiring
  input.addEventListener('input', () => { render(); scheduleSave(); });
  window.addEventListener('resize', render);
  searchEl.addEventListener('input', renderList);
  document.getElementById('new-btn').addEventListener('click', newNote);
  document.getElementById('save-btn').addEventListener('click', save);
  document.getElementById('import-btn').addEventListener('click', importFile);
  document.getElementById('export-btn').addEventListener('click', exportFile);
  document.getElementById('sidebar-btn').addEventListener('click', toggleSidebar);

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) {
      if (e.key === 'Tab' && document.activeElement === input) {
        e.preventDefault();
        replaceRange(input.selectionStart, input.selectionEnd, '\t');
        afterEdit();
      }
      return;
    }
    const key = e.key.toLowerCase();
    const run = (fn) => { e.preventDefault(); fn(); };
    if (e.altKey && ['1', '2', '3'].includes(key)) return run(() => heading(Number(key)));
    if (e.altKey && key === 'n') return run(newNote);
    if (key === '\\') return run(toggleSidebar);
    if (key === 's' && e.shiftKey) return run(exportFile);
    if (key === 's') return run(save);
    if (key === 'o') return run(importFile);
    if (key === 'b') return run(actions.bold);
    if (key === 'i') return run(actions.italic);
    if (key === 'e') return run(actions.code);
    if (key === 'k') return run(actions.link);
    if (key === 'x' && e.shiftKey) return run(actions.strike);
  });

  // Flush unsaved text when the window closes (sendBeacon survives unload).
  window.addEventListener('pagehide', () => {
    if (!isDirty()) return;
    const content = input.value;
    if (!currentId && !content.trim()) return;
    const url = currentId ? `/api/notes/${currentId}` : '/api/notes';
    navigator.sendBeacon(url, new Blob([JSON.stringify({ content })], { type: 'application/json' }));
  });

  // Heartbeat so the server can shut down when this window closes.
  fetch('/api/ping', { method: 'POST' });
  setInterval(() => fetch('/api/ping', { method: 'POST' }).catch(() => {}), 2000);

  // ---- Boot
  if (localStorage.getItem('sidebar-hidden') === '1') document.body.classList.add('sidebar-hidden');
  loadNotes()
    .then(() => (notes.length ? openNote(notes[0].id) : setEditor('')))
    .catch((e) => { toast(e.message, true); setEditor(''); });
})();
