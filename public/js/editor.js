// Простой редактор кода: textarea поверх подсвеченного <pre>.
// Две вкладки (HTML и CSS), у каждой своя история «Отменить».

window.FG = window.FG || {};

(() => {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const span = (cls, s) => (s ? `<span class="t-${cls}">${esc(s)}</span>` : '');

  function valueSpan(v) {
    const t = v.trim();
    if (t && /^[#\w(),.%\s-]+$/.test(t) && !/^\d/.test(t) && window.CSS && CSS.supports('color', t)) {
      const lead = v.slice(0, v.indexOf(t));
      return esc(lead) + `<span class="t-val t-color" style="--sw:${t}">${esc(t)}</span>` + esc(v.slice(lead.length + t.length));
    }
    return span('val', v);
  }

  function hlCSS(src) {
    let out = '';
    let i = 0;
    let depth = 0;
    const n = src.length;
    while (i < n) {
      if (src.startsWith('/*', i)) {
        let e = src.indexOf('*/', i + 2);
        e = e < 0 ? n : e + 2;
        out += span('com', src.slice(i, e));
        i = e;
        continue;
      }
      const ch = src[i];
      if (ch === '{' || ch === '}') {
        depth = ch === '{' ? depth + 1 : Math.max(0, depth - 1);
        out += span('punc', ch);
        i++;
        continue;
      }
      let j = i;
      while (j < n && src[j] !== '{' && src[j] !== '}' && !src.startsWith('/*', j) && !(depth > 0 && src[j] === ';')) j++;
      const chunk = src.slice(i, j);
      if (depth === 0) out += span('sel', chunk);
      else {
        const k = chunk.indexOf(':');
        out += k < 0 ? span('prop', chunk) : span('prop', chunk.slice(0, k)) + span('punc', ':') + valueSpan(chunk.slice(k + 1));
      }
      if (src[j] === ';') {
        out += span('punc', ';');
        j++;
      }
      i = j;
    }
    return out;
  }

  function hlTag(tag) {
    const m = tag.match(/^(<\/?)([\w-]*)([\s\S]*?)(\/?>)?$/);
    if (!m) return span('tag', tag);
    const [, open, name, rest, close = ''] = m;
    let attrs = '';
    let last = 0;
    rest.replace(/([\w-]+)(?:(\s*=\s*)("[^"]*"?|'[^']*'?|[^\s>]+))?/g, (all, a, eq, val, off) => {
      attrs += esc(rest.slice(last, off)) + span('attr', a) + (eq ? span('punc', eq) : '') + (val ? span('str', val) : '');
      last = off + all.length;
      return all;
    });
    attrs += esc(rest.slice(last));
    return span('punc', open) + span('tag', name) + attrs + span('punc', close);
  }

  function hlHTML(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
      if (src.startsWith('<!--', i)) {
        let e = src.indexOf('-->', i + 4);
        e = e < 0 ? n : e + 3;
        out += span('com', src.slice(i, e));
        i = e;
        continue;
      }
      if (src[i] === '<') {
        let e = src.indexOf('>', i);
        e = e < 0 ? n : e + 1;
        out += hlTag(src.slice(i, e));
        i = e;
        continue;
      }
      let j = src.indexOf('<', i);
      if (j < 0) j = n;
      out += span('text', src.slice(i, j));
      i = j;
    }
    return out;
  }

  function exec(cmd, value) {
    try {
      return document.execCommand(cmd, false, value);
    } catch {
      return false;
    }
  }

  FG.createEditor = function (root, docs, onChange) {
    const panesEl = root.querySelector('.panes');
    const tabButtons = [...root.querySelectorAll('[data-tab]')];
    const panes = {};
    let active = 'css';
    let locked = false;

    for (const tab of ['html', 'css']) {
      const pane = document.createElement('div');
      pane.className = 'pane';
      pane.dataset.pane = tab;
      pane.innerHTML = `
        <div class="gutter" aria-hidden="true"></div>
        <div class="code-area">
          <pre class="hl" aria-hidden="true"></pre>
          <div class="line-mark"></div>
          <textarea spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="Код ${tab.toUpperCase()}"></textarea>
        </div>`;
      panesEl.appendChild(pane);
      const p = {
        tab,
        pane,
        ta: pane.querySelector('textarea'),
        pre: pane.querySelector('pre'),
        gutter: pane.querySelector('.gutter'),
        mark: pane.querySelector('.line-mark'),
        markRange: null,
        lines: 0,
      };
      panes[tab] = p;
      p.ta.value = docs[tab];

      p.refresh = () => {
        const v = p.ta.value;
        p.pre.innerHTML = (tab === 'css' ? hlCSS(v) : hlHTML(v)) + '\n\n';
        const lines = v.split('\n').length;
        if (lines !== p.lines) {
          p.lines = lines;
          let g = '';
          for (let i = 1; i <= lines; i++) g += `<span>${i}</span>`;
          p.gutter.innerHTML = g + '<span></span><span></span>';
        }
        sync(p);
      };

      p.ta.addEventListener('input', () => {
        p.refresh();
        onChange(tab, p.ta.value);
      });
      p.ta.addEventListener('scroll', () => sync(p));
      p.ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          insertAtCursor(p, '  ');
        }
      });
      p.refresh();
    }

    function lineHeight(p) {
      return parseFloat(getComputedStyle(p.ta).lineHeight) || 22;
    }

    function padTop(p) {
      return parseFloat(getComputedStyle(p.ta).paddingTop) || 0;
    }

    function sync(p) {
      p.pre.scrollTop = p.ta.scrollTop;
      p.pre.scrollLeft = p.ta.scrollLeft;
      p.gutter.scrollTop = p.ta.scrollTop;
      if (p.markRange) {
        const lh = lineHeight(p);
        const [a, b] = p.markRange;
        p.mark.style.top = `${padTop(p) + a * lh - p.ta.scrollTop}px`;
        p.mark.style.height = `${(b - a + 1) * lh}px`;
      }
    }

    function insertAtCursor(p, text, start, end) {
      p.ta.focus();
      if (start !== undefined) p.ta.setSelectionRange(start, end);
      if (!exec('insertText', text)) {
        p.ta.setRangeText(text, p.ta.selectionStart, p.ta.selectionEnd, 'end');
        p.ta.dispatchEvent(new Event('input'));
      }
    }

    function show(tab) {
      active = tab;
      for (const [t, p] of Object.entries(panes)) p.pane.classList.toggle('active', t === tab);
      for (const b of tabButtons) b.classList.toggle('active', b.dataset.tab === tab);
      sync(panes[tab]);
      root.dispatchEvent(new CustomEvent('tabchange', { detail: tab }));
    }

    for (const b of tabButtons) b.addEventListener('click', () => show(b.dataset.tab));
    show(active);

    return {
      show,
      get active() {
        return active;
      },
      value: (tab) => panes[tab].ta.value,

      // Вставка из палитры. smart: если курсор стоит на слове-значении (gray, white, none),
      // слово заменяется целиком — так новичку хватает двух кликов.
      insert(text, smart) {
        const p = panes[active];
        if (locked) return;
        let { selectionStart: s, selectionEnd: e, value: v } = p.ta;
        if (smart && s === e) {
          const isWord = (c) => /[#\w-]/.test(c || '');
          let a = s;
          let b = s;
          while (a > 0 && isWord(v[a - 1])) a--;
          while (b < v.length && isWord(v[b])) b++;
          const lineStart = v.lastIndexOf('\n', a - 1) + 1;
          const before = v.slice(lineStart, a);
          if (b > a && before.includes(':')) {
            s = a;
            e = b;
          }
        }
        insertAtCursor(p, text, s, e);
      },

      undo() {
        const p = panes[active];
        p.ta.focus();
        exec('undo');
      },

      // Заменить весь текст вкладки (через insertText, чтобы «Отменить» тоже работал).
      replaceAll(tab, text) {
        const p = panes[tab];
        show(tab);
        p.ta.focus();
        p.ta.select();
        if (!exec('insertText', text)) {
          p.ta.value = text;
          p.ta.dispatchEvent(new Event('input'));
        }
        p.ta.setSelectionRange(0, 0);
        p.ta.scrollTop = 0;
      },

      // Тихо заменить текст (новый урок) — без истории.
      setSilently(tab, text) {
        const p = panes[tab];
        p.ta.value = text;
        p.refresh();
      },

      reveal(tab, from, to = from) {
        const p = panes[tab];
        show(tab);
        const lh = lineHeight(p);
        p.markRange = [from, to];
        p.ta.scrollTop = Math.max(0, from * lh - p.ta.clientHeight / 3);
        sync(p);
        p.mark.classList.remove('flash');
        void p.mark.offsetWidth;
        p.mark.classList.add('flash', 'on');
        const lines = p.ta.value.split('\n');
        let pos = 0;
        for (let i = 0; i < from; i++) pos += lines[i].length + 1;
        p.ta.focus({ preventScroll: true });
        p.ta.setSelectionRange(pos, pos);
        clearTimeout(p.markTimer);
        p.markTimer = setTimeout(() => {
          p.mark.classList.remove('on');
          p.markRange = null;
        }, 6000);
      },

      lock(on) {
        locked = on;
        for (const p of Object.values(panes)) p.ta.readOnly = on;
        root.classList.toggle('locked', on);
      },
    };
  };
})();
