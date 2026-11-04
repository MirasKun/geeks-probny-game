// Пульт преподавателя: управляет темпом урока и показывает прогресс учеников.

(() => {
  const $ = (s) => document.querySelector(s);
  let tasks = FG.tasks; // заказы текущего этапа
  const PIN_KEY = 'geeks-frontend-pin';
  const LESSON_MIN = 30;
  const ONLINE_MS = 45000;
  // План по минутам: 0–7 рассказ, 7–25 игра (3 заказа), 25–30 итоги.
  const PLAN = { gameStart: 7, gameEnd: 25 };

  let pin = '';
  let st = null;
  let clockOffset = 0;
  let es = null;

  // ---------- Вход по PIN ----------
  async function tryPin(p) {
    try {
      const res = await api('ping', p);
      return res.ok;
    } catch {
      return false;
    }
  }

  async function api(type, p = pin, extra = {}) {
    return fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, pin: p, ...extra }),
    });
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = $('#pinInput').value.trim();
    $('#loginErr').textContent = '';
    if (await tryPin(p)) start(p);
    else $('#loginErr').textContent = 'Неверный PIN или сервер недоступен';
  });

  (async () => {
    let saved = '';
    try {
      saved = localStorage.getItem(PIN_KEY) || '';
    } catch {}
    // Ссылка вида /pult#1234 или /admin#pin=1234 входит сама, PIN вводить не нужно.
    const hash = location.hash.slice(1);
    const fromLink = new URLSearchParams(hash).get('pin') || (/^\d+$/.test(hash) ? hash : '');
    if (fromLink) {
      window.history.replaceState(null, '', location.pathname);
      saved = fromLink;
    }
    if (saved && (await tryPin(saved))) start(saved);
    else $('#pinInput').focus();
  })();

  function start(p) {
    pin = p;
    try {
      localStorage.setItem(PIN_KEY, p);
    } catch {}
    $('#login').hidden = true;
    $('#admin').hidden = false;
    loadInfo();
    openStream();
    setInterval(renderTimer, 1000);
    setInterval(() => {
      if (st) renderStudents();
      if (!$('.card[data-view="history"]').hidden) loadHistory();
    }, 5000);
  }

  // Новый способ копирования работает не везде (в панели приложения Claude браузер его запрещает),
  // поэтому сначала пробуем старый: он срабатывает прямо в момент клика.
  async function copyText(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(area);
    area.select();
    let done = false;
    try {
      done = document.execCommand('copy');
    } catch {}
    area.remove();
    if (done) return true;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function loadInfo() {
    try {
      const { urls } = await (await fetch('/api/info')).json();
      // На ноутбуке ученикам нужен адрес в Wi-Fi, в интернете — тот адрес, по которому открыт пульт.
      const local = /^(localhost|127\.)/.test(location.hostname);
      const url = local ? urls.find((u) => !u.includes('localhost')) || urls[0] || location.origin : location.origin;
      $('#joinUrl').textContent = url.replace(/^https?:\/\//, '');
      $('#copyUrl').onclick = async () => {
        const copied = await copyText(url);
        $('#copyUrl').textContent = copied ? 'Скопировано ✓' : 'Выделите ссылку и нажмите Ctrl+C';
        if (!copied) window.getSelection().selectAllChildren($('#joinUrl'));
        setTimeout(() => ($('#copyUrl').textContent = 'Копировать'), copied ? 1500 : 4000);
      };
    } catch {
      $('#joinUrl').textContent = location.host;
    }
  }

  function openStream() {
    es = new EventSource(`/api/stream?role=admin&pin=${encodeURIComponent(pin)}`);
    es.addEventListener('state', (e) => {
      const lesson = st && st.lessonId;
      st = JSON.parse(e.data);
      if (lesson && lesson !== st.lessonId) resetView();
      clockOffset = st.now - Date.now();
      setConn(true);
      render();
    });
    es.addEventListener('error', () => setTimeout(() => es.readyState !== EventSource.OPEN && setConn(false), 4000));
  }

  function setConn(ok) {
    $('#conn').className = `conn ${ok ? 'ok' : 'bad'}`;
    $('#connText').textContent = ok ? 'В эфире' : 'Переподключение…';
  }

  // ---------- Кнопки ----------
  const send = (type, extra) => api(type, pin, extra).catch(() => {});
  $('#nextBtn').addEventListener('click', () => {
    if (st && st.stage !== 2 && st.phase === 'final') send('stage', { stage: 2 });
    else send('next');
  });
  $('#crashBtn').addEventListener('click', () => send('crash'));
  document.querySelectorAll('.stab').forEach((b) =>
    b.addEventListener('click', async () => {
      const to = Number(b.dataset.stage);
      if (!st || to === st.stage) return;
      if (await FG.ask(`Перейти на этап ${to} у всех учеников?`, 'Перейти')) send('stage', { stage: to });
    }),
  );
  $('#prevBtn').addEventListener('click', () => send('prev'));
  $('#attentionBtn').addEventListener('click', () => send('attention'));
  $('#cssOffBtn').addEventListener('click', () => send('cssOff'));
  $('#voiceBtn').addEventListener('click', () => send('voice'));
  $('#hintAllBtn').addEventListener('click', () => send('hintAll'));
  $('#finalBtn').addEventListener('click', async () => {
    const text = st && st.stage === 2 ? 'Показать финал всем ученикам? Шеф поблагодарит, и у всех откроется сертификат.' : 'Закончить этап 1 у всех учеников? Заказчик скажет «Наконец-то, мне нравится!»';
    if (await FG.ask(text, 'Показать финал')) send('final');
  });
  $('#startTimer').addEventListener('click', () => send('start'));
  const RESET_LABEL = $('#resetBtn').textContent;
  $('#resetBtn').addEventListener('click', async () => {
    if (!(await FG.ask('Начать новый урок?\nСписок учеников очистится, у учеников код сбросится к началу.\nВсе, кто играл, останутся во вкладке «История».', 'Начать новый урок'))) return;
    const btn = $('#resetBtn');
    btn.disabled = true;
    btn.textContent = 'Начинаем новый урок…';
    let ok = false;
    try {
      ok = (await api('reset')).ok;
    } catch {}
    btn.disabled = false;
    btn.textContent = ok ? '✓ Новый урок начат' : '⚠️ Не получилось: проверьте интернет и нажмите ещё раз';
    setTimeout(() => (btn.textContent = RESET_LABEL), 3000);
  });

  // Новый урок: пульт тоже возвращается к началу.
  function resetView() {
    document.querySelectorAll('.notes-tabs').forEach((n) => n.querySelectorAll('.ntab').forEach((b, i) => b.classList.toggle('active', i === 0)));
    showNote(document.querySelector('.notes-tabs[data-stage="1"] .ntab'));
    $('#histSearch').value = '';
    document.querySelector('.vtab[data-view="live"]').click();
    window.scrollTo(0, 0);
  }

  function showNote(b) {
    b.parentElement.querySelectorAll('.ntab').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.note').forEach((n) => n.classList.toggle('active', n.dataset.note === b.dataset.note));
  }
  document.querySelectorAll('.ntab').forEach((b) => b.addEventListener('click', () => showNote(b)));

  // ---------- Отрисовка ----------
  function render() {
    if (!st) return;
    const stage2 = st.stage === 2;
    tasks = stage2 ? FG.bTasks : FG.tasks;
    const t = st.crash ? FG.bCrash : tasks[st.task];
    const isFinal = st.phase === 'final';
    const hero = stage2 ? 'шефа' : 'заказчика';

    document.querySelectorAll('.stab').forEach((b) => b.classList.toggle('active', Number(b.dataset.stage) === st.stage));
    document.querySelectorAll('.notes-tabs').forEach((n) => {
      const on = Number(n.dataset.stage) === st.stage;
      if (on && n.hidden) showNote(n.querySelector('.ntab.active'));
      n.hidden = !on;
    });
    $('#segGame').textContent = stage2 ? 'Игра · 3 заказа и авария' : 'Игра · 3 заказа';

    $('#phaseLabel').textContent = st.crash ? '🚨 Авария' : isFinal ? 'Финал' : st.phase === 'lobby' ? 'Лобби' : `Заказ ${st.task + 1} из ${tasks.length}`;
    $('#nowTitle').textContent = !st.crash && isFinal ? (stage2 ? 'Шеф доволен 🎉' : 'Заказчик доволен 🎉') : t ? t.title : stage2 ? 'Вы рассказываете про бэкенд' : 'Ученики входят, вы рассказываете';
    $('#nowSay').textContent = !st.crash && isFinal ? (stage2 ? FG.bFinalSay : FG.finalSay) : t ? t.say : '';
    $('#nowAnswer').textContent = (st.crash || !isFinal) && t ? t.answer : '';

    const next = $('#nextBtn');
    next.classList.toggle('final', st.task >= tasks.length - 1 && !isFinal);
    next.classList.toggle('to-stage', !stage2 && isFinal);
    next.disabled = stage2 && isFinal;
    if (isFinal) next.textContent = stage2 ? '✓ Урок завершён' : '➡️ Перейти к этапу 2: бэкенд';
    else if (st.phase === 'lobby') next.textContent = `🧑‍🍳 Выпустить ${hero} · заказ 1`;
    else if (st.task >= tasks.length - 1) next.textContent = stage2 ? '🎉 Финал: шеф доволен' : '🎉 Финал этапа 1: «Наконец-то, мне нравится!»';
    else next.textContent = `🧑‍🍳 Следующий заказ · ${st.task + 2} из ${tasks.length}`;

    const crash = $('#crashBtn');
    crash.hidden = !stage2;
    crash.disabled = st.phase !== 'task';
    crash.classList.toggle('on', st.crash);
    crash.textContent = st.crash ? '✅ Поднять сервер (отменить аварию)' : st.crashUsed ? '🚨 Уронить сервер ещё раз' : '🚨 Уронить сервер';

    $('#prevBtn').disabled = st.phase === 'lobby';
    $('#attentionBtn').classList.toggle('on', st.attention);
    $('#cssOffBtn').hidden = stage2;
    $('#cssOffBtn').classList.toggle('on', st.cssOff);
    $('#cssOffBtn').textContent = st.cssOff ? '🎨 Включить CSS обратно' : '🦴 Выключить CSS у всех';
    $('#voiceBtn').classList.toggle('on', st.voiceOff);
    $('#voiceBtn').textContent = st.voiceOff ? '🔊 Включить звук' : '🔇 Выключить звук';
    $('#hintAllBtn').disabled = st.phase !== 'task' || (st.hintAll || 0) >= 3;
    $('#hintAllBtn').textContent = st.phase === 'task' ? `💡 Подсказка всем · ${Math.min(3, (st.hintAll || 0) + 1)}/3` : '💡 Подсказка всем';
    $('#finalBtn').disabled = isFinal;
    $('#finalBtn').textContent = stage2 ? '🎉 Финал для всех' : '🎉 Закончить этап 1';
    $('#startTimer').textContent = st.startedAt ? '⟲ Сбросить таймер' : '▶ Запустить таймер';

    renderStudents();
    renderTimer();
  }

  function renderStudents() {
    const now = Date.now() + clockOffset;
    const list = st.students.map((s) => ({ ...s, online: now - (s.lastSeen || 0) < ONLINE_MS }));
    const cur = st.task;
    const stage2 = st.stage === 2;
    const doneOf = (s) => (stage2 ? s.doneB : s.done) || [];
    const hintsOf = (s) => (stage2 ? s.hintsB : s.hints) || [];
    const status = (s) => {
      if (st.phase === 'final' || (stage2 ? s.finalB : s.final)) return 'done';
      if (st.crash) return s.crashFixed ? 'done' : (s.crashHints || 0) >= 2 ? 'help' : 'work';
      if (cur < 0) return 'idle';
      if (doneOf(s)[cur]) return 'done';
      if ((hintsOf(s)[cur] || 0) >= 2) return 'help';
      return 'work';
    };
    const order = { help: 0, work: 1, idle: 2, done: 3 };
    list.sort((a, b) => (a.online === b.online ? 0 : a.online ? -1 : 1) || order[status(a)] - order[status(b)] || a.name.localeCompare(b.name, 'ru'));

    const online = list.filter((s) => s.online).length;
    const doneCount = st.crash ? st.students.filter((s) => s.crashFixed).length : cur >= 0 ? st.students.filter((s) => doneOf(s)[cur]).length : 0;
    $('#summary').textContent = !list.length
      ? 'Пока никого'
      : st.crash
        ? `Починили сервер: ${doneCount} из ${list.length} · онлайн ${online}`
        : cur >= 0
          ? `Сделали заказ ${cur + 1}: ${doneCount} из ${list.length} · онлайн ${online}`
          : `Вошли: ${list.length} · онлайн ${online}`;
    $('#progressFill').style.width = list.length && (cur >= 0 || st.crash) ? `${(doneCount / list.length) * 100}%` : '0%';
    $('#empty').hidden = list.length > 0;

    const box = $('#students');
    box.innerHTML = '';
    for (const s of list) {
      const card = document.createElement('div');
      const stt = status(s);
      card.className = `st ${stt === 'done' ? 'done' : stt === 'help' ? 'help' : ''} ${s.online ? '' : 'offline'}`;
      const hints = hintsOf(s).reduce((a, b) => a + b, 0) + (stage2 ? s.crashHints || 0 : 0);
      let cells = tasks
        .map((_, i) => `<i class="${doneOf(s)[i] ? 'd' : i === cur ? 'c' : ''}">${doneOf(s)[i] ? '✓' : i + 1}</i>`)
        .join('');
      if (stage2) cells += `<i class="${s.crashFixed ? 'd' : st.crash ? 'c' : ''}">${s.crashFixed ? '✓' : '🚨'}</i>`;
      card.innerHTML = `
        <button class="st-kick" title="Убрать из списка">×</button>
        <div class="st-name"><span class="conn ${s.online ? 'ok' : ''}"></span><span></span></div>
        <div class="st-phone"></div>
        <div class="st-cells">${cells}</div>
        <div class="st-meta"><span>⭐ ${s.stars || 0}</span><span>💡 ${hints}</span>${stt === 'help' ? '<span style="color:var(--orange)">подойдите</span>' : ''}</div>`;
      card.querySelector('.st-name span:last-child').textContent = s.name;
      card.querySelector('.st-phone').textContent = s.phone || '';
      card.querySelector('.st-kick').addEventListener('click', async () => {
        if (await FG.ask(`Убрать «${s.name}» из урока и из истории?`, 'Убрать')) send('kick', { id: s.id });
      });
      box.appendChild(card);
    }
  }

  function renderTimer() {
    if (!st) return;
    const needle = $('#needle');
    const ended = st.endedAt;
    if (!st.startedAt) {
      $('#timer').textContent = '00:00';
      $('#timer').classList.remove('over');
      needle.classList.remove('on');
      $('#pace').innerHTML = 'Нажмите <b>▶ Запустить таймер</b>, когда начнёте рассказывать. Таймер запустится и сам, когда вы выпустите заказчика.';
      return;
    }
    // После финала таймер останавливается.
    const sec = Math.max(0, Math.floor(((ended || Date.now() + clockOffset) - st.startedAt) / 1000));
    const min = sec / 60;
    $('#timer').textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    $('#timer').classList.toggle('over', min >= LESSON_MIN);
    needle.classList.add('on');
    needle.style.left = `calc(${Math.min(100, (min / LESSON_MIN) * 100)}% - 1px)`;

    let tip;
    if (ended) tip = st.stage === 2 ? `Этап 2 завершён за <b>${Math.round(min)} мин</b>. Перед следующим уроком нажмите «🔄 Новый урок».` : `Этап 1 завершён за <b>${Math.round(min)} мин</b>. Когда будете готовы, переходите к этапу 2.`;
    else if (st.crash) tip = 'Сервер упал у всех. Следите, кто уже починил, и при необходимости нажмите «💡 Подсказка всем».';
    else if (min < PLAN.gameStart && st.phase !== 'lobby') tip = 'Игра началась раньше плана — значит, на заказы будет больше времени 👍';
    else if (min < PLAN.gameStart) tip =`Сейчас по плану — <b>рассказ</b>. Через ${Math.ceil(PLAN.gameStart - min)} мин выпускайте заказчика.`;
    else if (min < PLAN.gameEnd) {
      const per = (PLAN.gameEnd - PLAN.gameStart) / tasks.length;
      const planned = Math.min(tasks.length - 1, Math.floor((min - PLAN.gameStart) / per));
      const actual = st.phase === 'lobby' ? -1 : st.phase === 'final' ? tasks.length : st.task;
      const diff = actual - planned;
      tip = `По плану сейчас <b>заказ ${planned + 1}</b>. ` + (diff < 0 ? 'Вы немного отстаёте — можно переходить дальше.' : diff > 0 ? 'Вы идёте с опережением 👍' : 'Идёте точно по плану 👌');
      if (st.stage === 2 && !st.crashUsed && min >= 17) tip += ' Самое время для <b>🚨 аварии</b>!';
    } else if (min < LESSON_MIN) tip = st.stage === 2 ? 'Пора к <b>итогам</b>: нажмите «🎉 Финал для всех» и подведите итоги.' : 'Пора к <b>итогам</b> этапа: нажмите «🎉 Закончить этап 1».';
    else tip = '<b>Время урока вышло.</b>';
    $('#pace').innerHTML = tip;
  }

  // ---------- История ----------
  let history = [];
  const pad = (n) => String(n).padStart(2, '0');
  const dayOf = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' });
  const timeOf = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  // Новые записи хранят оба этапа, старые — только фронтенд.
  const passed = (h) => (h.totalB ? h.finalB : h.final || h.done >= h.total);
  const result = (h) => {
    const front = `Фронтенд ${h.done}/${h.total}`;
    if (!h.totalB) return passed(h) ? `✓ прошёл · ${front}` : front;
    const back = `Бэкенд ${h.doneB}/${h.totalB}${h.crashFixed ? ' · 🚨 починил' : ''}`;
    return `${h.finalB ? '✓ ' : ''}${front} · ${back}`;
  };

  document.querySelectorAll('.vtab').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.vtab').forEach((x) => x.classList.toggle('active', x === b));
      document.querySelectorAll('.students-col .card[data-view]').forEach((c) => (c.hidden = c.dataset.view !== b.dataset.view));
      if (b.dataset.view === 'history') loadHistory();
    }),
  );
  $('#histSearch').addEventListener('input', renderHistory);

  async function loadHistory() {
    try {
      history = (await (await api('history')).json()).items || [];
    } catch {
      $('#histSummary').textContent = 'Не удалось загрузить';
      return;
    }
    renderHistory();
  }

  function renderHistory() {
    const q = $('#histSearch').value.trim().toLowerCase();
    const list = history.filter((h) => !q || h.name.toLowerCase().includes(q) || (h.phone || '').replace(/\s/g, '').includes(q.replace(/\s/g, '')));
    const count = history.filter(passed).length;
    $('#histSummary').textContent = history.length ? `Играли: ${history.length} · прошли оба этапа: ${count}` : 'Пока никого';
    $('#histEmpty').hidden = history.length > 0;

    const box = $('#hist');
    box.innerHTML = '';
    let day = null;
    let group;
    for (const h of list) {
      const d = dayOf(h.date);
      if (d !== day) {
        day = d;
        group = document.createElement('div');
        group.className = 'hist-day';
        group.innerHTML = `<div class="hist-date"></div>`;
        group.firstChild.textContent = d;
        box.appendChild(group);
      }
      const row = document.createElement('div');
      row.className = `hist-row ${passed(h) ? 'ok' : ''}`;
      row.innerHTML = `<span class="hist-time">${timeOf(h.date)}</span><span class="hist-name"></span><span class="hist-phone"></span><span class="hist-res"></span><button class="hist-del" title="Удалить из истории">×</button>`;
      row.querySelector('.hist-name').textContent = h.name;
      row.querySelector('.hist-phone').textContent = h.phone || '—';
      row.querySelector('.hist-res').textContent = result(h);
      row.querySelector('.hist-del').addEventListener('click', async () => {
        if (!(await FG.ask(`Удалить «${h.name}» из истории?`, 'Удалить'))) return;
        await api('historyDelete', pin, { key: h.key }).catch(() => {});
        history = history.filter((x) => x.key !== h.key);
        renderHistory();
      });
      group.appendChild(row);
    }
  }

  // CSV с «;» и BOM — Excel сразу открывает русские буквы и колонки.
  $('#histCsv').addEventListener('click', () => {
    const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Дата', 'Время', 'Имя', 'Телефон', 'Фронтенд', 'Бэкенд', 'Починил сервер', 'Прошёл до конца']];
    for (const h of history) {
      const d = new Date(h.date);
      rows.push([`${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`, timeOf(h.date), h.name, h.phone || '', `${h.done} из ${h.total}`, h.totalB ? `${h.doneB} из ${h.totalB}` : '', h.crashFixed ? 'да' : 'нет', passed(h) ? 'да' : 'нет']);
    }
    const blob = new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `geeks-frontend-история-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
})();
