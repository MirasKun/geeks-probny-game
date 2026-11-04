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

  function hlPY(src) {
    return src
      .split('\n')
      .map((line) => {
        const m = line.match(/^(\s*)(#.*)$/);
        if (m) return esc(m[1]) + span('com', m[2]);
        return line
          .split(/("(?:[^"\\]|\\.)*"?)/)
          .map((part, i) => {
            if (i % 2) return span('str', part);
            return esc(part)
              .replace(/\b(def|return|from|import)\b/g, '<span class="t-tag">$1</span>')
              .replace(/\b(True|False)\b/g, '<span class="t-attr">$1</span>')
              .replace(/\b(\d+)\b/g, '<span class="t-val">$1</span>')
              .replace(/(@\w+[.\w]*)/g, '<span class="t-prop">$1</span>');
          })
          .join('');
      })
      .join('\n');
  }
  const HL = { css: hlCSS, html: hlHTML, py: hlPY };

  function exec(cmd, value) {
    try {
      return document.execCommand(cmd, false, value);
    } catch {
      return false;
    }
  }

  // Какие строки в now изменились по сравнению с base (сравнение по строкам).
  // Удалённую строку показать нельзя, поэтому отмечаем ту, что встала на её место.
  FG.changedLines = (base, now) => {
    if (base === now) return [];
    const a = base.split('\n');
    const b = now.split('\n');
    const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    const out = new Set();
    let i = 0;
    let j = 0;
    const same = () => i < a.length && j < b.length && a[i] === b[j];
    while (i < a.length || j < b.length) {
      if (same()) {
        i++;
        j++;
        continue;
      }
      let added = false;
      while ((i < a.length || j < b.length) && !same()) {
        if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
          out.add(j++);
          added = true;
        } else i++;
      }
      if (!added) out.add(Math.min(j, b.length - 1));
    }
    return [...out];
  };

  FG.createEditor = function (root, docs, onChange) {
    const panesEl = root.querySelector('.panes');
    const tabButtons = [...root.querySelectorAll('[data-tab]')];
    const panes = {};
    const tabs = Object.keys(docs);
    let active = tabs.includes('css') ? 'css' : tabs[0];
    let locked = false;

    for (const tab of tabs) {
      const pane = document.createElement('div');
      pane.className = 'pane';
      pane.dataset.pane = tab;
      pane.innerHTML = `
        <div class="gutter" aria-hidden="true"></div>
        <div class="code-area">
          <pre class="hl" aria-hidden="true"></pre>
          <div class="marks"></div>
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
        marks: pane.querySelector('.marks'),
        marksList: [],
        wantLine: null,
        markRange: null,
        lines: 0,
      };
      panes[tab] = p;
      p.ta.value = docs[tab];

      p.refresh = () => {
        const v = p.ta.value;
        p.pre.innerHTML = HL[tab](v) + '\n\n';
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
      p.marks.style.transform = `translateY(${-p.ta.scrollTop}px)`;
      p.marks.style.setProperty('--sx', `${-p.ta.scrollLeft}px`);
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

    function scrollTo(p, line) {
      // Скрытую вкладку прокрутить нельзя: запоминаем и прокручиваем, когда откроют.
      if (!p.ta.clientHeight) {
        p.wantLine = line;
        return;
      }
      p.wantLine = null;
      p.ta.scrollTop = Math.max(0, line * lineHeight(p) - p.ta.clientHeight / 3);
    }

    function drawMarks(p) {
      const lh = lineHeight(p);
      const top = padTop(p);
      const left = parseFloat(getComputedStyle(p.ta).paddingLeft) || 0;
      p.marks.innerHTML = p.marksList
        .map((m) => {
          const word = m.col === undefined ? '' : `left:calc(${left}px + ${m.col}ch);width:${m.len}ch;`;
          return `<div class="code-mark ${m.kind}" style="top:${top + m.from * lh}px;height:${(m.to - m.from + 1) * lh}px;${word}"></div>`;
        })
        .join('');
      for (const b of tabButtons) if (b.dataset.tab === p.tab) b.classList.toggle('has-bad', p.marksList.some((m) => m.kind === 'bad'));
    }

    function show(tab) {
      active = tab;
      for (const [t, p] of Object.entries(panes)) p.pane.classList.toggle('active', t === tab);
      for (const b of tabButtons) b.classList.toggle('active', b.dataset.tab === tab);
      if (panes[tab].wantLine !== null) scrollTo(panes[tab], panes[tab].wantLine);
      drawMarks(panes[tab]);
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

      // Показать строки. caret: false — только показать, курсор не трогать.
      reveal(tab, from, to = from, caret = true) {
        const p = panes[tab];
        show(tab);
        const lh = lineHeight(p);
        p.markRange = [from, to];
        p.ta.scrollTop = Math.max(0, from * lh - p.ta.clientHeight / 3);
        sync(p);
        p.mark.classList.remove('flash');
        void p.mark.offsetWidth;
        p.mark.classList.add('flash', 'on');
        if (caret) {
          const lines = p.ta.value.split('\n');
          let pos = 0;
          for (let i = 0; i < from; i++) pos += lines[i].length + 1;
          p.ta.focus({ preventScroll: true });
          p.ta.setSelectionRange(pos, pos);
        }
        clearTimeout(p.markTimer);
        p.markTimer = setTimeout(() => {
          p.mark.classList.remove('on');
          p.markRange = null;
        }, 6000);
      },

      // Подсветка строк: [{ from, to, kind: 'soft' | 'hint' | 'bad' | 'word', col, len }].
      // Номера строк с нуля. col и len отмечают одно слово в строке (только для 'word').
      setMarks(tab, list) {
        const p = panes[tab];
        p.marksList = list;
        drawMarks(p);
        sync(p);
      },

      scrollToLine(tab, line) {
        scrollTo(panes[tab], line);
        sync(panes[tab]);
      },

      lock(on) {
        locked = on;
        for (const p of Object.values(panes)) p.ta.readOnly = on;
        root.classList.toggle('locked', on);
      },
    };
  };
})();
