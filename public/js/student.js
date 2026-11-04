// Игровая оболочка ученика. Ученики её не трогают — они меняют только HTML и CSS сайта.

(() => {
  const $ = (s) => document.querySelector(s);
  const tasks = FG.tasks;
  const bonuses = FG.bonuses;
  const color = FG.colorUtil;
  const STORE = 'geeks-frontend-game';

  // ---------- Сохранение прогресса в браузере ----------
  const blank = () => ({
    id: null,
    name: '',
    phone: '',
    lessonId: null,
    html: FG.starter.html,
    css: FG.starter.css,
    task: -1,
    done: [],
    hints: [],
    stars: 0,
    base: null, // код на момент начала заказа: с ним сравниваем, что ученик изменил
    bonusIdx: 0,
    bonusDone: 0,
    final: false,
    stage: 1,
    b: null, // прогресс этапа 2 (см. backend.js)
  });
  let S = blank();
  try {
    Object.assign(S, JSON.parse(localStorage.getItem(STORE)) || {});
  } catch {}
  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(S));
    } catch {}
  };

  // Имя спрашиваем при каждом новом открытии сайта. Перезагрузка вкладки его не спрашивает.
  const SESSION = 'geeks-frontend-session';
  const hasSession = () => {
    try {
      return sessionStorage.getItem(SESSION) === '1';
    } catch {
      return false;
    }
  };
  const setSession = (on) => {
    try {
      if (on) sessionStorage.setItem(SESSION, '1');
      else sessionStorage.removeItem(SESSION);
    } catch {}
  };

  // ---------- Состояние связи ----------
  let mode = 'connecting'; // connecting | server | solo
  let lastServerTask;
  let lastPhase;
  let es = null;
  let offlineTimer = null;
  let typedName = false; // имя только что ввели на экране входа

  // ---------- Элементы ----------
  const el = {
    join: $('#join'),
    app: $('#app'),
    stage: $('#stage'),
    frame: $('#site'),
    orderCard: $('#orderCard'),
    orderLabel: $('#orderLabel'),
    orderText: $('#orderText'),
    steps: $('#steps'),
    starCount: $('#starCount'),
    stars: $('#stars'),
    conn: $('#conn'),
    whoName: $('#whoName'),
    customer: $('#customer'),
    sprite: $('#customerSprite'),
    bubbleText: $('#bubbleText'),
    bubbleActions: $('#bubbleActions'),
    assistant: $('#assistant'),
    assistantText: $('#assistantText'),
    assistantActions: $('#assistantActions'),
    hintBtn: $('#hintBtn'),
    lupaBtn: $('#lupaBtn'),
    lupaTip: $('#lupaTip'),
    lupaPop: $('#lupaPop'),
    lock: $('#editorLock'),
    lockText: $('#lockText'),
    soloStart: $('#soloStart'),
    attention: $('#attention'),
    final: $('#final'),
    skeleton: $('#skeletonBanner'),
    toast: $('#toast'),
  };

  // ---------- Персонажи ----------
  $('#joinSprite').innerHTML = FG.pixel.customer('happy');
  $('#bot').innerHTML = FG.pixel.bot();
  el.sprite.innerHTML = FG.pixel.customer('neutral');

  // ---------- Сайт заказчика в iframe ----------
  let doc = null;
  const SHELL_CSS = `
    .__lupa { outline: 3px dashed #FFE743 !important; outline-offset: 3px !important; box-shadow: 0 0 0 9999px rgba(20,21,25,.18) !important; }
    html { scroll-behavior: smooth; }`;
  el.frame.srcdoc = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style id="user-css"></style><style>${SHELL_CSS}</style></head><body></body></html>`;
  el.frame.addEventListener('load', () => {
    doc = el.frame.contentDocument;
    renderCSS();
    renderHTML();
    bindLupa();
    scheduleCheck();
  });

  let cssOff = false;
  function renderCSS() {
    if (!doc) return;
    const style = doc.getElementById('user-css');
    style.textContent = S.css;
    style.media = cssOff ? 'not all' : 'all';
  }
  function renderHTML() {
    if (!doc) return;
    const y = doc.scrollingElement ? doc.scrollingElement.scrollTop : 0;
    doc.body.innerHTML = S.html;
    backend.paintSite(doc);
    if (doc.scrollingElement) doc.scrollingElement.scrollTop = y;
  }

  // ---------- Редактор ----------
  let htmlTimer;
  const editor = FG.createEditor($('#editor'), { html: S.html, css: S.css }, (tab, value) => {
    S[tab] = value;
    save();
    if (tab === 'css') renderCSS();
    else {
      clearTimeout(htmlTimer);
      htmlTimer = setTimeout(renderHTML, 200);
    }
    scheduleCheck();
  });

  const PALETTE = [
    ['orange', '#ffa500'],
    ['tomato', '#ff6347'],
    ['gold', '#ffd700'],
    ['seagreen', '#2e8b57'],
    ['skyblue', '#87ceeb'],
    ['royalblue', '#4169e1'],
    ['orchid', '#da70d6'],
    ['hotpink', '#ff69b4'],
    ['#fff3e0', '#fff3e0'],
    ['#2b2118', '#2b2118'],
  ];
  const CHIPS = { css: ['px', 'none', 'block', 'bold', 'center'], html: ['<b>', '</b>', '🍔', '🔥', '😋'] };

  const palette = $('#palette');
  for (const [name, c] of PALETTE) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.setProperty('--c', c);
    b.title = `Вставить цвет ${name}`;
    b.innerHTML = `<i></i>${name}`;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => insertWord(name, true));
    palette.appendChild(b);
  }
  function renderChips(tab) {
    const box = $('#chips');
    box.innerHTML = '';
    palette.hidden = tab !== 'css';
    for (const word of CHIPS[tab]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = word;
      b.title = 'Вставить в код';
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => insertWord(word, tab === 'css' && word !== 'px'));
      box.appendChild(b);
    }
  }
  $('#editor').addEventListener('tabchange', (e) => {
    renderChips(e.detail);
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('attn'));
  });
  renderChips(editor.active);

  $('#undoBtn').addEventListener('click', () => editor.undo());
  $('#resetBtn').addEventListener('click', () => {
    const tab = editor.active;
    if (!confirm(`Вернуть весь код во вкладке ${tab.toUpperCase()} к самому началу?\nВсе изменения в этой вкладке пропадут (но кнопка «Отменить» сможет их вернуть).`)) return;
    if (S.base) S.base[tab] = FG.starter[tab];
    editor.replaceAll(tab, FG.starter[tab]);
  });

  // ---------- Лупа ----------
  const TAG_NAMES = {
    body: 'вся страница',
    header: 'шапка сайта',
    nav: 'меню',
    a: 'ссылка',
    section: 'раздел',
    div: 'блок',
    h1: 'главный заголовок',
    h3: 'заголовок',
    p: 'текст',
    button: 'кнопка',
    footer: 'подвал сайта',
    img: 'картинка',
    b: 'жирный текст',
  };
  let lupaOn = false;
  let lupaTarget = null;

  function setLupa(on) {
    lupaOn = on;
    el.lupaBtn.classList.toggle('on', on);
    el.lupaBtn.classList.remove('pulse');
    el.stage.classList.toggle('lupa-on', on);
    if (!on) {
      clearLupaTarget();
      el.lupaTip.classList.remove('on');
    }
  }
  el.lupaBtn.addEventListener('click', () => {
    el.lupaPop.classList.remove('on');
    setLupa(!lupaOn);
  });

  function clearLupaTarget() {
    if (lupaTarget) lupaTarget.classList.remove('__lupa');
    lupaTarget = null;
  }
  function label(node) {
    const tag = node.tagName.toLowerCase();
    const cls = [...node.classList].filter((c) => c !== '__lupa');
    return { tag, selector: cls.length ? `.${cls[0]}` : tag, human: TAG_NAMES[tag] || `тег <${tag}>` };
  }
  function frameRect(node) {
    const f = el.frame.getBoundingClientRect();
    const s = el.stage.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return { x: f.left - s.left + r.left, y: f.top - s.top + r.top, w: r.width, h: r.height, stageW: s.width, stageH: s.height };
  }

  function bindLupa() {
    doc.addEventListener('mousemove', (e) => {
      if (!lupaOn || el.lupaPop.classList.contains('on')) return;
      const t = e.target.nodeType === 1 ? e.target : e.target.parentElement;
      if (!t || t === doc.documentElement) return;
      if (t !== lupaTarget) {
        clearLupaTarget();
        lupaTarget = t;
        t.classList.add('__lupa');
      }
      const { selector, human } = label(t);
      el.lupaTip.innerHTML = `<b>${selector}</b> — ${human}<small>Кликни, чтобы найти в коде</small>`;
      const r = frameRect(t);
      const tipW = el.lupaTip.offsetWidth;
      let x = Math.min(Math.max(8, r.x), r.stageW - tipW - 8);
      let y = r.y - 52;
      if (y < 50) y = r.y + Math.min(r.h, 200) + 8;
      el.lupaTip.style.left = `${x}px`;
      el.lupaTip.style.top = `${y}px`;
      el.lupaTip.classList.add('on');
    });
    doc.addEventListener('mouseleave', () => {
      if (el.lupaPop.classList.contains('on')) return;
      clearLupaTarget();
      el.lupaTip.classList.remove('on');
    });
    doc.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a');
      if (a) e.preventDefault();
      backend.siteClick(e);
      if (!lupaOn || !lupaTarget) return;
      e.preventDefault();
      openLupaPop(lupaTarget);
    });
  }

  function cssRange(sel) {
    const lines = S.css.split('\n');
    const re = new RegExp(`(^|[\\s,>])${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s,{:.>]|$)`);
    const start = lines.findIndex((l) => l.includes('{') && re.test(l.split('{')[0]));
    if (start < 0) return null;
    let end = start;
    while (end < lines.length - 1 && !lines[end].includes('}')) end++;
    return { sel, start, end };
  }

  function findCssRule(node) {
    const { tag } = label(node);
    const candidates = [...[...node.classList].filter((c) => c !== '__lupa').map((c) => `.${c}`), tag];
    for (const sel of candidates) {
      const range = cssRange(sel);
      if (range) return range;
    }
    return null;
  }
  function findHtmlLine(node) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'body') return null;
    const idx = [...doc.body.querySelectorAll(tag)].indexOf(node);
    const re = new RegExp(`<${tag}(\\s|>|$)`, 'i');
    const lines = S.html.split('\n');
    let seen = -1;
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i]) && ++seen === idx) return i;
    }
    return null;
  }

  function openLupaPop(node) {
    const { selector, human } = label(node);
    const rule = findCssRule(node);
    const line = findHtmlLine(node);
    el.lupaTip.classList.remove('on');
    el.lupaPop.innerHTML = `
      <div class="pop-title"><b>${selector}</b> — ${human}</div>
      <p>У каждого элемента есть <b>HTML</b> (что это такое) и <b>CSS</b> (как он выглядит). Куда смотрим?</p>
      <div class="pop-btns">
        <button class="btn btn-html" data-go="html" ${line === null ? 'disabled' : ''}>HTML · что это</button>
        <button class="btn btn-css" data-go="css" ${rule ? '' : 'disabled'}>CSS · как выглядит</button>
      </div>`;
    const r = frameRect(node);
    const x = Math.min(Math.max(8, r.x), r.stageW - 320);
    let y = r.y + Math.min(r.h, 160) + 10;
    if (y > r.stageH - 170) y = Math.max(50, r.y - 170);
    el.lupaPop.style.left = `${x}px`;
    el.lupaPop.style.top = `${y}px`;
    el.lupaPop.classList.add('on');
    el.lupaPop.querySelectorAll('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.go === 'css') editor.reveal('css', rule.start, rule.end);
        else editor.reveal('html', line, line);
        el.lupaPop.classList.remove('on');
        setLupa(false);
      }),
    );
  }
  document.addEventListener('mousedown', (e) => {
    if (el.lupaPop.classList.contains('on') && !el.lupaPop.contains(e.target)) {
      el.lupaPop.classList.remove('on');
      clearLupaTarget();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      el.lupaPop.classList.remove('on');
      setLupa(false);
    }
  });

  // ---------- Заказчик ----------
  let typeTimer = null;
  let customerHideTimer = null;

  let chef = false;
  function setMood(mood) {
    el.sprite.innerHTML = FG.pixel.customer(mood, chef);
    el.customer.classList.toggle('happy', mood === 'happy');
    el.customer.classList.toggle('angry', mood === 'angry');
  }

  function walk(inside) {
    return new Promise((resolve) => {
      const c = el.customer;
      const already = c.classList.contains('in') === inside;
      if (already) return resolve();
      c.classList.toggle('leaving', !inside);
      c.classList.add('walking');
      c.classList.toggle('in', inside);
      const done = () => {
        c.classList.remove('walking', 'leaving');
        resolve();
      };
      const t = setTimeout(done, 1600);
      c.addEventListener(
        'transitionend',
        (e) => {
          if (e.target !== c) return;
          clearTimeout(t);
          done();
        },
        { once: true },
      );
    });
  }

  let sayToken = 0;
  async function customerSay(text, { mood = 'neutral', actions = [], autoHide = 0 } = {}) {
    const token = ++sayToken;
    clearTimeout(customerHideTimer);
    clearInterval(typeTimer);
    el.customer.classList.remove('talking');
    el.bubbleActions.innerHTML = '';
    setMood('neutral');
    FG.voice.stop();
    await walk(true);
    if (token !== sayToken) return;
    setMood(mood);
    el.customer.classList.add('talking');
    FG.voice.say(text.length * 14);

    // Печатаем текст по буквам. Клик по облачку — показать сразу.
    let i = 0;
    const finish = () => {
      clearInterval(typeTimer);
      el.bubbleText.textContent = text;
      el.bubbleActions.innerHTML = '';
      for (const a of actions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-primary';
        b.textContent = a.label;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          a.onClick();
        });
        el.bubbleActions.appendChild(b);
      }
    };
    el.bubbleText.innerHTML = '<span class="caret"></span>';
    typeTimer = setInterval(() => {
      i += 2;
      if (i >= text.length) return finish();
      el.bubbleText.innerHTML = '';
      el.bubbleText.append(text.slice(0, i));
      el.bubbleText.insertAdjacentHTML('beforeend', '<span class="caret"></span>');
    }, 28);
    $('#bubble').onclick = () => {
      if (i >= text.length) return;
      i = text.length;
      FG.voice.stop();
      finish();
    };
    if (autoHide) customerHideTimer = setTimeout(customerLeave, autoHide);
  }

  async function customerLeave() {
    const token = ++sayToken;
    clearInterval(typeTimer);
    FG.voice.stop();
    el.customer.classList.remove('talking');
    await new Promise((r) => setTimeout(r, 250));
    if (token !== sayToken) return;
    await walk(false);
    setMood('neutral');
  }

  // ---------- Ассистент ----------
  let assistantMode = 'idle'; // idle | task | near | done | bonus
  let nudgeTimer = null;

  function botSay(html, kind = '', actions = []) {
    el.assistantText.className = `assistant-text ${kind}`;
    el.assistantText.innerHTML = html;
    el.assistantText.scrollTop = 0;
    el.assistantActions.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${a.primary ? 'btn-primary' : 'btn-ghost'}`;
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      el.assistantActions.appendChild(b);
    }
  }

  function updateHintBtn() {
    if (backend.active) return backend.updateHint();
    const t = S.task;
    if (t < 0 || S.final) return (el.hintBtn.hidden = true);
    if (S.done[t]) {
      el.hintBtn.hidden = !(assistantMode === 'bonus' && bonuses[S.bonusIdx]);
      el.hintBtn.textContent = '💡 Подсказка';
      return;
    }
    el.hintBtn.hidden = false;
    const used = S.hints[t] || 0;
    el.hintBtn.textContent = used >= 3 ? '💡 Подсказки' : `💡 Подсказка ${used + 1}/3`;
  }

  function showHint(level) {
    const t = tasks[S.task];
    botSay(`<span class="hint-step">${level + 1}/3</span>${t.hints[level]}`);
    assistantMode = 'task';
    goToTarget(true);
    paintMarks();
  }

  // ---------- Подсветка кода ----------
  let bonusHinted = false;

  function activeItem() {
    if (S.task < 0 || S.final) return null;
    if (!S.done[S.task]) return tasks[S.task];
    return assistantMode === 'bonus' ? bonuses[S.bonusIdx] : null;
  }

  // Где в коде нужное место. Ищем каждый раз заново: строки могли сдвинуться.
  function targetOf(item) {
    const m = item && item.mark;
    if (!m) return null;
    const lines = S[m.tab].split('\n');
    if (m.find) {
      const line = lines.findIndex((l) => m.find.test(l));
      return line < 0 ? null : { tab: m.tab, from: line, to: line, line };
    }
    const range = cssRange(m.block);
    if (!range) return null;
    let line = null;
    for (let i = range.start; i <= range.end; i++) if (m.line.test(lines[i])) line = i;
    return { tab: m.tab, from: range.start, to: range.end, line };
  }

  // Рисует подсветку и сообщает, что ученик изменил не так.
  function paintMarks() {
    const item = activeItem();
    const isTask = Boolean(item) && !S.done[S.task];
    const marks = { html: [], css: [] };
    const found = { target: false, other: false, cyrillic: false };
    const t = targetOf(item);
    const hinted = isTask ? (S.hints[S.task] || 0) > 0 : bonusHinted;
    if (t) {
      marks[t.tab].push({ from: t.from, to: t.to, kind: 'soft' });
      if (hinted && t.line !== null) marks[t.tab].push({ from: t.line, to: t.line, kind: 'hint' });
    }
    if (isTask && S.base) {
      for (const tab of ['html', 'css']) {
        const lines = S[tab].split('\n');
        for (const line of FG.changedLines(S.base[tab], S[tab])) {
          marks[tab].push({ from: line, to: line, kind: 'bad' });
          if (t && t.tab === tab && t.line === line) found.target = true;
          else found.other = true;
          if (tab === 'css' && /[а-яё]/i.test((lines[line] || '').replace(/\/\*.*?\*\//g, ''))) found.cyrillic = true;
        }
      }
    }
    editor.setMarks('html', marks.html);
    editor.setMarks('css', marks.css);
    return found;
  }

  // Показать нужное место в коде. select — ещё и выделить слово, которое надо заменить.
  function goToTarget(select) {
    const item = activeItem();
    const t = targetOf(item);
    if (!t) return;
    const line = t.line === null ? t.from : t.line;
    editor.show(t.tab);
    editor.scrollToLine(t.tab, line);
    if (select && t.line !== null) selectValue(item, t);
  }

  function selectValue(item, t) {
    const text = S[t.tab].split('\n')[t.line];
    const m = item.mark.block ? text.match(/^(.*?:\s*)(.*?)\s*;?\s*$/) : null;
    if (m && m[2]) editor.selectInLine(t.tab, t.line, m[1].length, m[1].length + m[2].length);
  }

  // Палитра и кнопки-слова: после подсказки слово ложится точно в нужную строчку,
  // даже если курсор случайно ушёл в другое место.
  function insertWord(word, smart) {
    const item = activeItem();
    const t = targetOf(item);
    const hinted = item && !S.done[S.task] && (S.hints[S.task] || 0) > 0;
    if (hinted && smart && t && t.line !== null && t.tab === editor.active) selectValue(item, t);
    editor.insert(word, smart);
  }

  let hintCursor = 0;
  el.hintBtn.addEventListener('click', () => {
    if (backend.active) return backend.hint();
    clearNudge();
    const t = S.task;
    if (t < 0) return;
    if (S.done[t]) {
      const bonus = bonuses[S.bonusIdx];
      if (bonus) botSay(`<span class="bonus-tag">доп. правка</span>${bonus.hint}`);
      bonusHinted = true;
      goToTarget(false);
      paintMarks();
      return;
    }
    const used = S.hints[t] || 0;
    if (used < 3) {
      S.hints[t] = used + 1;
      showHint(used);
      hintCursor = used;
      save();
      report();
    } else {
      hintCursor = (hintCursor + 1) % 3;
      showHint(hintCursor);
    }
    updateHintBtn();
  });

  function clearNudge() {
    clearTimeout(nudgeTimer);
    el.assistant.classList.remove('nudge');
  }
  function armNudge() {
    clearNudge();
    nudgeTimer = setTimeout(() => {
      if (backend.active || S.task < 0 || S.done[S.task] || (S.hints[S.task] || 0) > 0) return;
      el.assistant.classList.add('nudge');
      botSay('Не знаешь, с чего начать? Это нормально — все программисты так начинали 🙂 Нажми <b>💡 Подсказка</b>, я помогу.');
    }, 60000);
  }

  // ---------- Проверка заданий ----------
  const util = { css: (node) => doc.defaultView.getComputedStyle(node), rgb: color.rgb, hsl: color.hsl };
  let checkTimer;
  let lastNear = '';

  function scheduleCheck() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(runCheck, 450);
  }

  function runCheck() {
    if (!doc || cssOff || backend.active || S.task < 0 || S.final) return;
    const t = tasks[S.task];
    if (!S.done[S.task]) {
      let r = {};
      try {
        r = t.check(doc, util) || {};
      } catch {}
      if (r.ok) return completeTask(S.task);
      const bad = paintMarks();
      if (bad.cyrillic) r.near = 'В коде появились русские буквы, компьютер их тут не поймёт. Нажми <b>↶ Отменить</b>, а потом кружок или кнопку под кодом.';
      else if (!r.near && bad.target) r.near = t.mark.wrong;
      else if (!r.near && bad.other) r.near = 'Красную строчку менять не нужно. Нажми <b>↶ Отменить</b>, чтобы вернуть как было.';
      if (r.near && r.near !== lastNear) {
        lastNear = r.near;
        assistantMode = 'near';
        botSay(r.near, 'warn');
      } else if (!r.near && assistantMode === 'near') {
        lastNear = '';
        assistantMode = 'task';
        if (S.hints[S.task]) showHint(hintCursor);
        else botSay('Теперь всё в порядке. Что менять дальше, подсвечено жёлтым. Нужна помощь? Жми <b>💡 Подсказка</b>.');
      }
      return;
    }
    const bonus = bonuses[S.bonusIdx];
    if (bonus && assistantMode === 'bonus') {
      let ok = false;
      try {
        ok = bonus.check(doc, util);
      } catch {}
      if (ok) {
        S.bonusIdx++;
        S.bonusDone++;
        addStars(1);
        save();
        report();
        toast('⭐ Доп. правка сделана! +1');
        offerBonus();
      }
    }
  }

  function addStars(n) {
    S.stars += n;
    el.starCount.textContent = S.stars;
    el.stars.classList.remove('pop');
    void el.stars.offsetWidth;
    el.stars.classList.add('pop');
  }

  let toastTimer;
  function toast(text) {
    el.toast.textContent = text;
    el.toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('on'), 2600);
  }

  function completeTask(i) {
    const t = tasks[i];
    S.done[i] = true;
    const stars = Math.max(1, 3 - Math.min(2, S.hints[i] || 0));
    addStars(stars);
    save();
    report();
    clearNudge();
    lastNear = '';
    renderTopbar();
    updateHintBtn();
    toast(`✅ Заказ выполнен! +${stars} ⭐`);
    burst(18);

    if (i === tasks.length - 1) {
      botSay(t.learn, 'good');
      setTimeout(() => showFinal(), 900);
      return;
    }
    customerSay(t.doneSay, { mood: 'happy', autoHide: 5000 });
    afterDone();
  }

  function afterDone() {
    const t = tasks[S.task];
    const next = S.task + 1 < tasks.length;
    const solo = mode === 'solo';
    const actions = [];
    if (solo && next) actions.push({ label: 'Следующий заказ →', primary: true, onClick: () => setTask(S.task + 1) });
    const bonus = bonuses[S.bonusIdx];
    if (bonus) actions.push({ label: '⭐ Взять доп. правку', onClick: offerBonus });
    const wait = solo ? '' : '<br><br>⏳ Ждём, пока остальные тоже сделают заказ. Хочешь ещё звёзд — возьми доп. правку!';
    assistantMode = 'done';
    botSay(`🎉 ${t.learn}${wait}`, 'good', actions);
    paintMarks();
  }

  function offerBonus() {
    const bonus = bonuses[S.bonusIdx];
    const actions = mode === 'solo' && S.task + 1 < tasks.length ? [{ label: 'Следующий заказ →', primary: true, onClick: () => setTask(S.task + 1) }] : [];
    if (!bonus) {
      assistantMode = 'done';
      paintMarks();
      botSay('Ты сделал(а) все доп. правки! 🔥 Поэкспериментируй: меняй цвета и размеры и смотри, что получится.', 'good', actions);
      updateHintBtn();
      return;
    }
    assistantMode = 'bonus';
    bonusHinted = false;
    botSay(`<span class="bonus-tag">доп. правка</span>${bonus.say}`, '', actions);
    goToTarget(false);
    paintMarks();
    updateHintBtn();
    scheduleCheck();
  }

  // ---------- Переход между заказами ----------
  function setTask(n, { quiet = false } = {}) {
    n = Math.min(n, tasks.length - 1);
    const changed = n !== S.task;
    S.task = n;
    save();
    report();
    renderTopbar();
    updateHintBtn();
    lastNear = '';
    if (n < 0) {
      paintMarks();
      editor.lock(true);
      el.lock.classList.remove('off');
      customerLeave();
      botSay('Привет! Я <b>Бит</b>, твой ассистент. Когда придёт заказчик, я буду подсказывать — но думать будешь ты 😉');
      return;
    }
    editor.lock(false);
    el.lock.classList.add('off');
    const t = tasks[n];
    if (S.done[n]) {
      afterDone();
      if (changed && !quiet) customerSay(t.say, { mood: 'happy', autoHide: 4000 });
      return;
    }
    assistantMode = 'task';
    if (!S.base || S.base.task !== n) S.base = { task: n, html: S.html, css: S.css };
    save();
    botSay('Новый заказ! Код, который нужно поменять, подсвечен жёлтым. Не знаешь, что делать? Жми <b>💡 Подсказка</b>, и я скажу, что нажать.');
    goToTarget(false);
    paintMarks();
    if (changed && !quiet) summonCustomer();
    armNudge();
    scheduleCheck();
  }

  function summonCustomer() {
    const t = tasks[S.task];
    if (!t) return;
    customerSay(t.say, { mood: t.mood, actions: [{ label: 'Понял(а), делаю! 👍', onClick: customerLeave }] });
  }
  el.orderCard.addEventListener('click', () => {
    if (backend.active) return backend.orderClick();
    if (S.final) return showFinal(true);
    if (S.task >= 0) summonCustomer();
  });

  function renderTopbar() {
    if (backend.active) return backend.renderTopbar();
    el.starCount.textContent = S.stars;
    el.steps.innerHTML = tasks
      .map((t, i) => `<span class="${S.done[i] ? 'done' : i === S.task ? 'current' : ''}" title="${t.title}">${S.done[i] ? '✓' : i + 1}</span>`)
      .join('');
    const t = tasks[S.task];
    if (S.final) {
      el.orderLabel.textContent = 'Этап 1 пройден';
      el.orderText.textContent = 'Заказчик доволен! Дальше — бэкенд 🎉';
    } else if (!t) {
      el.orderLabel.textContent = 'Ждём';
      el.orderText.textContent = 'Скоро придёт первый заказ';
    } else {
      el.orderLabel.textContent = `Заказ ${S.task + 1} из ${tasks.length}`;
      el.orderText.textContent = S.done[S.task] ? `✓ ${t.short}` : t.short;
    }
    el.orderCard.classList.toggle('done', Boolean(t && S.done[S.task]) || S.final);
  }

  // ---------- Этап 2 ----------
  const backend = FG.createBackend({
    get S() {
      return S;
    },
    save,
    report,
    customerSay,
    customerLeave,
    botSay,
    fixTypo,
    toast,
    burst,
    addStars,
    renderHTML,
    openCert,
    doc: () => doc,
    isSolo: () => mode === 'solo',
    closeCert: () => el.final.classList.remove('on'),
    editorLock: (on) => editor.lock(on),
    setChef(on) {
      chef = on;
      $('#bubbleName').textContent = on ? 'Шеф · Burger Bro' : 'Заказчик · Burger Bro';
      setMood('neutral');
    },
  });

  // ---------- Финал ----------
  const SKILLS = [
    'Цвет кнопки — свойство <code>background</code>',
    'Починка бага — <code>display: none</code>',
    'Свой дизайн сайта — цвет фона <code>body</code>',
  ];
  const SKILLS_B = [
    'Новый товар в панели и <b>база данных</b>',
    'Изменение цены на сервере',
    'Запрос и ответ: заказ от клиента',
  ];

  // Опечатка теперь в доп. правке, поэтому к концу этапа убираем её сами:
  // кто не взял правку, не должен оставаться с «бугрерами» на сайте.
  function fixTypo() {
    if (!S.html.includes('бугрер')) return;
    S.html = S.html.replace(/бугрер/g, 'бургер');
    editor.setSilently('html', S.html);
    renderHTML();
    save();
  }

  let finalShown = false;
  async function showFinal(again) {
    S.final = true;
    fixTypo();
    paintMarks();
    save();
    report();
    renderTopbar();
    updateHintBtn();
    editor.lock(false);
    el.lock.classList.add('off');
    if (!again && !finalShown) {
      finalShown = true;
      burst(60);
      await customerSay(FG.finalSay, { mood: 'happy', actions: [{ label: 'Этап 1 пройден! 🎉', onClick: openCert }] });
      botSay('Вот так и работают фронтенд-разработчики: заказчик просит — ты меняешь HTML и CSS — сайт становится лучше. Сегодня ты сделал(а) это сам(а)! 🚀', 'good', stageOneActions());
      return;
    }
    openCert();
  }

  // Без преподавателя на этап 2 ученик переходит сам.
  function stageOneActions() {
    const actions = [{ label: '🎉 Мой результат', primary: true, onClick: openCert }];
    if (mode === 'solo') actions.push({ label: 'Дальше: этап 2 →', onClick: goStageTwo });
    return actions;
  }

  function goStageTwo() {
    S.stage = 2;
    save();
    backend.enter();
    el.soloStart.hidden = false;
  }

  function openCert() {
    customerLeave();
    const b = backend.active ? S.b : null;
    $('#certName').textContent = S.name || 'Стажёр';
    $('#certKicker').textContent = b ? 'Сертификат стажёра' : 'Этап 1 из 2 пройден';
    $('#certStamp').innerHTML = b ? 'ЗАКАЗ<br>СДАН' : 'ЭТАП<br>1 ✓';
    $('#certRole').textContent = b ? 'Frontend и Backend · первый заказ «Burger Bro»' : 'Frontend-разработчик · первый заказ «Burger Bro»';
    let items = SKILLS.map((s, i) => `<li class="${S.done[i] ? '' : 'miss'}">${s}</li>`);
    if (b) {
      items = [
        `<li class="${S.done.filter(Boolean).length ? '' : 'miss'}">Фронтенд: HTML и CSS, заказов сделано ${S.done.filter(Boolean).length} из ${tasks.length}</li>`,
        ...SKILLS_B.map((s, i) => `<li class="${b.done[i] ? '' : 'miss'}">${s}</li>`),
        `<li class="${b.crashDone ? '' : 'miss'}">Починка сервера — ошибка в <code>server.py</code></li>`,
      ];
    }
    $('#certList').innerHTML = items.join('');
    const extra = S.bonusDone + (b ? b.bonusDone : 0);
    $('#certStars').textContent = `⭐ ${S.stars} ${plural(S.stars, 'звезда', 'звезды', 'звёзд')}${extra ? ` · доп. правок: ${extra}` : ''}`;
    el.final.classList.add('on');
    burst(80, $('#confetti'));
  }
  $('#certClose').addEventListener('click', () => el.final.classList.remove('on'));

  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function burst(count, box = document.body) {
    const colors = ['#FFE743', '#ff9f43', '#3ddc84', '#ff7ac6', '#8db2ff', '#ffffff'];
    const holder = box === document.body ? document.createElement('div') : box;
    if (box === document.body) {
      holder.className = 'confetti';
      holder.style.position = 'fixed';
      holder.style.zIndex = 70;
      document.body.appendChild(holder);
    }
    for (let i = 0; i < count; i++) {
      const c = document.createElement('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = `${1.8 + Math.random() * 1.8}s`;
      c.style.animationDelay = `${Math.random() * 0.5}s`;
      c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      holder.appendChild(c);
    }
    setTimeout(() => (box === document.body ? holder.remove() : (holder.innerHTML = '')), 4200);
  }

  // ---------- Связь с преподавателем ----------
  let reportTimer;
  function report() {
    if (mode !== 'server' || !S.id) return;
    clearTimeout(reportTimer);
    reportTimer = setTimeout(async () => {
      try {
        const res = await post('/api/progress', {
          id: S.id,
          done: tasks.map((_, i) => Boolean(S.done[i])),
          hints: tasks.map((_, i) => S.hints[i] || 0),
          bonus: S.bonusDone + (S.b ? S.b.bonusDone : 0),
          stars: S.stars,
          final: S.final,
          doneB: FG.bTasks.map((_, i) => Boolean(S.b && S.b.done[i])),
          hintsB: FG.bTasks.map((_, i) => (S.b && S.b.hints[i]) || 0),
          crashHints: S.b ? S.b.crashHints : 0,
          crashFixed: Boolean(S.b && S.b.crashDone),
          finalB: Boolean(S.b && S.b.final),
        });
        if (res.status === 404) backToJoin();
      } catch {}
    }, 300);
  }

  async function post(path, body) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      return await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  }

  async function rejoin() {
    const res = await post('/api/join', { id: S.id, name: S.name, phone: S.phone, lessonId: S.lessonId });
    if (res.status === 409) {
      if (typedName) {
        // Имя только что ввели, а прогресс остался от прошлого урока: начинаем заново.
        resetProgress();
        return rejoin();
      }
      return backToJoin();
    }
    if (!res.ok) throw new Error('join failed');
    const data = await res.json();
    S.id = data.id;
    save();
    return data;
  }

  // Начался новый урок: следующий ученик должен ввести своё имя.
  function backToJoin() {
    if (es) es.close();
    setSession(false);
    S = blank();
    save();
    location.reload();
    return new Promise(() => {});
  }

  function resetProgress() {
    const { name, phone } = S;
    S = Object.assign(blank(), { name, phone });
    backend.exit();
    finalShown = false;
    el.final.classList.remove('on');
    editor.setSilently('html', S.html);
    editor.setSilently('css', S.css);
    renderCSS();
    renderHTML();
    renderTopbar();
    setTask(-1, { quiet: true });
    save();
  }

  function setConn(state) {
    el.conn.className = `conn ${state === 'ok' ? 'ok' : state === 'bad' ? 'bad' : ''}`;
    el.conn.title = { ok: 'На связи с преподавателем', bad: 'Связь пропала, переподключаемся…', solo: 'Автономный режим' }[state];
  }

  function goSolo(reason) {
    if (mode === 'solo') return;
    mode = 'solo';
    setConn('solo');
    el.soloStart.hidden = false;
    el.lockText.textContent = 'Игра в автономном режиме: заказы будут приходить по очереди, когда ты выполнишь предыдущий.';
    if (reason) toast(reason);
    if (backend.active) return backend.onSolo();
    if (S.final) return botSay('Этап 1 пройден! Можно идти дальше.', 'good', stageOneActions());
    if (S.task >= 0 && S.done[S.task]) afterDone();
  }
  el.soloStart.addEventListener('click', () => {
    if (backend.active) backend.soloStart();
    else setTask(0);
  });

  async function connect() {
    if (location.protocol === 'file:') return goSolo();
    try {
      const data = await rejoin();
      typedName = false;
      await applyState(data.state);
    } catch {
      return goSolo();
    }
    mode = 'server';
    openStream();
    // Сигнал «я здесь» для пульта. Заодно замечает пропавший интернет, даже если поток молчит.
    setInterval(() => {
      if (!S.id) return;
      post('/api/beat', { id: S.id })
        .then((res) => {
          if (res.status === 404) return backToJoin();
          if (res.ok) serverAlive();
        })
        .catch(serverLost);
    }, 15000);
  }

  function serverAlive() {
    clearTimeout(offlineTimer);
    offlineTimer = null;
    if (mode === 'solo') {
      mode = 'server';
      el.soloStart.hidden = true;
      report();
    }
    setConn('ok');
    if (es && es.readyState === EventSource.CLOSED) openStream();
  }

  function serverLost() {
    setConn('bad');
    if (!offlineTimer) offlineTimer = setTimeout(() => goSolo('Связь с преподавателем пропала — продолжай сам(а)!'), 20000);
  }

  function openStream() {
    es = new EventSource(`/api/stream?id=${encodeURIComponent(S.id)}`);
    es.addEventListener('state', (e) => {
      serverAlive();
      applyState(JSON.parse(e.data));
    });
    es.addEventListener('open', () => setConn('ok'));
    es.addEventListener('error', () => {
      // Сервер иногда сам перезапускает поток — короткий разрыв не показываем.
      setTimeout(() => es.readyState !== EventSource.OPEN && setConn('bad'), 4000);
      if (!offlineTimer) offlineTimer = setTimeout(() => goSolo('Связь с преподавателем пропала — продолжай сам(а)!'), 20000);
    });
  }

  async function applyState(st) {
    if (!st) return;

    // Преподаватель начал новый урок — снова экран с именем.
    if (S.lessonId && st.lessonId !== S.lessonId) return backToJoin();
    S.lessonId = st.lessonId;
    save();

    el.attention.classList.toggle('on', st.attention);
    FG.voice.setClassOff(st.voiceOff);
    renderSound();
    if (st.cssOff !== cssOff) {
      cssOff = st.cssOff;
      renderCSS();
      el.skeleton.classList.toggle('on', cssOff);
      if (!cssOff) scheduleCheck();
    }

    if (st.stage === 2) {
      S.stage = 2;
      lastServerTask = undefined;
      lastPhase = undefined;
      el.soloStart.hidden = true;
      backend.apply(st);
      return;
    }
    if (backend.active) {
      S.stage = 1;
      backend.exit();
      save();
      lastServerTask = undefined;
      lastPhase = undefined;
    }

    if (st.task !== lastServerTask || st.phase !== lastPhase) {
      lastServerTask = st.task;
      lastPhase = st.phase;
      if (st.phase === 'final') {
        if (st.task >= 0 && S.task < st.task) setTask(st.task, { quiet: true });
        if (!S.final) showFinal();
      } else {
        // Сам(а) сделал(а) все заказы — финал остаётся, даже если преподаватель ещё не нажал «Финал».
        if (S.final && S.done[tasks.length - 1]) return;
        if (S.final) {
          S.final = false;
          el.final.classList.remove('on');
        }
        setTask(st.phase === 'lobby' ? -1 : st.task);
      }
    }

    // «Подсказка всем» от преподавателя
    if (S.task >= 0 && !S.done[S.task] && st.hintAll > (S.hints[S.task] || 0)) {
      S.hints[S.task] = st.hintAll;
      save();
      report();
      showHint(st.hintAll - 1);
      updateHintBtn();
    }
  }

  // ---------- Звук ----------
  const soundBtn = $('#soundBtn');
  function renderSound() {
    soundBtn.textContent = FG.voice.off ? '🔇' : '🔊';
    soundBtn.disabled = FG.voice.classOff;
    soundBtn.title = FG.voice.classOff ? 'Преподаватель выключил звук' : FG.voice.off ? 'Включить голос заказчика' : 'Выключить голос заказчика';
  }
  soundBtn.addEventListener('click', () => {
    FG.voice.setUserOff(!FG.voice.off);
    renderSound();
  });
  renderSound();

  // ---------- Вход ----------
  function enterApp() {
    el.join.hidden = true;
    el.app.hidden = false;
    el.whoName.textContent = S.name;
    setConn('bad');
    if (S.stage === 2) backend.enter();
    else {
      renderTopbar();
      setTask(S.task, { quiet: true });
      if (S.final) finalShown = true;
    }
    connect().then(() => {
      if (mode === 'solo' && !backend.active && S.task >= 0 && !S.done[S.task] && !S.final) summonCustomer();
    });
  }

  // Только цифры после +996: 700 123 456. Лишнее из вставленного номера убираем.
  function phoneDigits(v) {
    let d = v.replace(/\D/g, '');
    if (d.startsWith('996') && d.length > 9) d = d.slice(3);
    if (d.startsWith('0')) d = d.slice(1);
    return d.slice(0, 9);
  }
  $('#phoneInput').addEventListener('input', (e) => {
    const d = phoneDigits(e.target.value);
    e.target.value = [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(' ');
    e.target.classList.remove('bad');
    $('#joinErr').textContent = '';
  });
  $('#nameInput').addEventListener('input', (e) => {
    e.target.classList.remove('bad');
    $('#joinErr').textContent = '';
  });

  $('#joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#nameInput').value.trim().slice(0, 30);
    if (name.length < 2) {
      $('#joinErr').textContent = 'Напиши своё имя, без него войти нельзя 🙂';
      $('#nameInput').classList.add('bad');
      $('#nameInput').focus();
      return;
    }
    const digits = phoneDigits($('#phoneInput').value);
    if (digits.length !== 9) {
      $('#joinErr').textContent = 'Напиши номер телефона: 9 цифр после +996, например 700 123 456.';
      $('#phoneInput').classList.add('bad');
      $('#phoneInput').focus();
      return;
    }
    const phone = `+996 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    // То же имя и номер в том же браузере — продолжаем с того места (например, случайно закрыли вкладку).
    if (S.name.toLowerCase() !== name.toLowerCase() || (S.phone && S.phone !== phone)) {
      S = blank();
      editor.setSilently('html', S.html);
      editor.setSilently('css', S.css);
      renderCSS();
      renderHTML();
    }
    S.phone = phone;
    S.name = name;
    typedName = true;
    setSession(true);
    save();
    enterApp();
  });

  if (S.name && S.phone && hasSession()) enterApp();
  else {
    el.join.hidden = false;
    setTimeout(() => $('#nameInput').focus(), 100);
  }
})();
