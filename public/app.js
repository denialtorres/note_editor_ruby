(() => {
  const input = document.getElementById('input');
  const highlight = document.getElementById('highlight');
  const statusEl = document.getElementById('status');
  const wordsEl = document.getElementById('words');
  const toastEl = document.getElementById('toast');

  let filePath = null;
  let fileName = null;
  let savedContent = '';

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
    if (!filePath) statusEl.textContent = 'Unsaved';
    else statusEl.textContent = dirty ? `${fileName} · unsaved changes` : fileName;
    statusEl.classList.toggle('dirty', dirty);
    document.title = (dirty ? '• ' : '') + (fileName || 'Note Editor');
  };

  let toastTimer;
  const toast = (msg, isError = false) => {
    toastEl.textContent = msg;
    toastEl.classList.toggle('error', isError);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
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

  // Wrap the selection in markers, or unwrap it if already wrapped.
  const wrap = (before, after, placeholder) => {
    const v = input.value;
    let s = input.selectionStart;
    let e = input.selectionEnd;
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
    render();
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
    const out = lines.map((l, i) => {
      const bare = l.replace(strip, '');
      return allHave ? bare : make(i) + bare;
    });
    const text = out.join('\n');
    replaceRange(start, end, text);
    input.setSelectionRange(start, start + text.length);
    render();
  };

  const heading = (level) => {
    const { start, end } = lineBounds();
    const lines = input.value.slice(start, end).split('\n');
    const mark = '#'.repeat(level) + ' ';
    const allSame = lines.every((l) => l.startsWith(mark));
    const text = lines.map((l) => (allSame ? l.replace(/^#{1,6} /, '') : mark + l.replace(/^#{1,6} /, ''))).join('\n');
    replaceRange(start, end, text);
    input.setSelectionRange(start, start + text.length);
    render();
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
    render();
  };

  const rule = () => {
    const { end } = lineBounds();
    const atLineStart = end === 0 || input.value[end - 1] === '\n';
    const text = (atLineStart ? '' : '\n') + '\n---\n\n';
    replaceRange(end, end, text);
    render();
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

  // ---- File operations
  const api = async (path, body) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
    return data;
  };

  const loadFile = (data) => {
    filePath = data.path;
    fileName = data.name;
    savedContent = data.content;
    input.value = data.content;
    input.setSelectionRange(0, 0);
    render();
    input.focus();
  };

  const confirmDiscard = () => !isDirty() || confirm('Discard unsaved changes?');

  const newFile = () => {
    if (!confirmDiscard()) return;
    filePath = null;
    fileName = null;
    savedContent = '';
    input.value = '';
    render();
    input.focus();
  };

  const openFile = async () => {
    if (!confirmDiscard()) return;
    try {
      const data = await api('/api/open');
      if (!data.canceled) loadFile(data);
    } catch (e) {
      toast(e.message, true);
    }
    input.focus();
  };

  const saveAs = async () => {
    try {
      const data = await api('/api/save_as', { path: filePath, content: input.value });
      if (data.canceled) return;
      filePath = data.path;
      fileName = data.name;
      savedContent = input.value;
      updateStatus();
      toast('Saved');
    } catch (e) {
      toast(e.message, true);
    }
    input.focus();
  };

  const save = async () => {
    if (!filePath) return saveAs();
    try {
      await api('/api/save', { path: filePath, content: input.value });
      savedContent = input.value;
      updateStatus();
      toast('Saved');
    } catch (e) {
      toast(e.message, true);
    }
  };

  // ---- Wiring
  input.addEventListener('input', render);
  window.addEventListener('resize', render);
  document.getElementById('save-btn').addEventListener('click', save);
  document.getElementById('open-btn').addEventListener('click', openFile);
  document.getElementById('new-btn').addEventListener('click', newFile);

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) {
      if (e.key === 'Tab' && document.activeElement === input) {
        e.preventDefault();
        const { selectionStart: s, selectionEnd: t } = input;
        replaceRange(s, t, '\t');
        render();
      }
      return;
    }
    const key = e.key.toLowerCase();
    const run = (fn) => { e.preventDefault(); fn(); };
    if (e.altKey && ['1', '2', '3'].includes(key)) return run(() => heading(Number(key)));
    if (key === 's' && e.shiftKey) return run(saveAs);
    if (key === 's') return run(save);
    if (key === 'o') return run(openFile);
    if (key === 'b') return run(actions.bold);
    if (key === 'i') return run(actions.italic);
    if (key === 'e') return run(actions.code);
    if (key === 'k') return run(actions.link);
    if (key === 'x' && e.shiftKey) return run(actions.strike);
  });

  window.addEventListener('beforeunload', (e) => {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  // Heartbeat so the server can shut down when this window closes.
  fetch('/api/ping', { method: 'POST' });
  setInterval(() => fetch('/api/ping', { method: 'POST' }).catch(() => {}), 2000);

  // Initial file, if one was passed on the command line.
  fetch('/api/initial')
    .then((r) => r.json())
    .then((data) => (data.path ? loadFile(data) : render()))
    .catch(render);
})();
