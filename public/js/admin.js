// Пульт преподавателя: управляет темпом урока и показывает прогресс учеников.

(() => {
  const $ = (s) => document.querySelector(s);
  const tasks = FG.tasks;
  const PIN_KEY = 'geeks-frontend-pin';
  const LESSON_MIN = 30;
  const ONLINE_MS = 45000;
  // План по минутам: 0–7 рассказ, 7–25 игра (5 заказов), 25–30 итоги.
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
    // Ссылка вида /admin#pin=1234 входит сама, PIN вводить не нужно.
    const fromLink = new URLSearchParams(location.hash.slice(1)).get('pin');
    if (fromLink) {
      history.replaceState(null, '', location.pathname);
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

  async function loadInfo() {
    try {
      const { urls } = await (await fetch('/api/info')).json();
      const url = urls.find((u) => !u.includes('localhost')) || urls[0] || location.origin;
      $('#joinUrl').textContent = url.replace(/^https?:\/\//, '');
      $('#copyUrl').onclick = () => {
        navigator.clipboard?.writeText(url);
        $('#copyUrl').textContent = 'Скопировано ✓';
        setTimeout(() => ($('#copyUrl').textContent = 'Копировать'), 1500);
      };
    } catch {
      $('#joinUrl').textContent = location.host;
    }
  }

  function openStream() {
    es = new EventSource(`/api/stream?role=admin&pin=${encodeURIComponent(pin)}`);
    es.addEventListener('state', (e) => {
      st = JSON.parse(e.data);
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
  $('#nextBtn').addEventListener('click', () => send('next'));
  $('#prevBtn').addEventListener('click', () => send('prev'));
  $('#attentionBtn').addEventListener('click', () => send('attention'));
  $('#cssOffBtn').addEventListener('click', () => send('cssOff'));
  $('#hintAllBtn').addEventListener('click', () => send('hintAll'));
  $('#finalBtn').addEventListener('click', () => {
    if (confirm('Показать финал всем ученикам? Заказчик скажет «Наконец-то!», и у всех откроется сертификат.')) send('final');
  });
  $('#startTimer').addEventListener('click', () => send('start'));
  $('#resetBtn').addEventListener('click', () => {
    if (confirm('Начать новый урок?\nСписок учеников очистится, у учеников код сбросится к началу.\nВсе, кто играл, останутся во вкладке «История».')) send('reset');
  });

  document.querySelectorAll('.ntab').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.ntab').forEach((x) => x.classList.toggle('active', x === b));
      document.querySelectorAll('.note').forEach((n) => n.classList.toggle('active', n.dataset.note === b.dataset.note));
    }),
  );

  // ---------- Отрисовка ----------
  function render() {
    if (!st) return;
    const t = tasks[st.task];
    const isFinal = st.phase === 'final';

    $('#phaseLabel').textContent = isFinal ? 'Финал' : st.phase === 'lobby' ? 'Лобби' : `Заказ ${st.task + 1} из ${tasks.length}`;
    $('#nowTitle').textContent = isFinal ? 'Заказчик доволен 🎉' : t ? t.title : 'Ученики входят, вы рассказываете';
    $('#nowSay').textContent = isFinal ? FG.finalSay : t ? t.say : '';
    $('#nowAnswer').textContent = !isFinal && t ? t.answer : '';

    const next = $('#nextBtn');
    next.classList.toggle('final', st.task >= tasks.length - 1 && !isFinal);
    next.disabled = isFinal;
    if (isFinal) next.textContent = '✓ Урок завершён';
    else if (st.phase === 'lobby') next.textContent = '🧑‍🍳 Выпустить заказчика · заказ 1';
    else if (st.task >= tasks.length - 1) next.textContent = '🎉 Финал: «Наконец-то, мне нравится!»';
    else next.textContent = `🧑‍🍳 Следующий заказ · ${st.task + 2} из ${tasks.length}`;

    $('#prevBtn').disabled = st.phase === 'lobby';
    $('#attentionBtn').classList.toggle('on', st.attention);
    $('#cssOffBtn').classList.toggle('on', st.cssOff);
    $('#cssOffBtn').textContent = st.cssOff ? '🎨 Включить CSS обратно' : '🦴 Выключить CSS у всех';
    $('#hintAllBtn').disabled = st.phase !== 'task' || (st.hintAll || 0) >= 3;
    $('#hintAllBtn').textContent = st.phase === 'task' ? `💡 Подсказка всем · ${Math.min(3, (st.hintAll || 0) + 1)}/3` : '💡 Подсказка всем';
    $('#finalBtn').disabled = isFinal;
    $('#startTimer').textContent = st.startedAt ? '⟲ Сбросить таймер' : '▶ Запустить таймер';

    renderStudents();
    renderTimer();
  }

  function renderStudents() {
    const now = Date.now() + clockOffset;
    const list = st.students.map((s) => ({ ...s, online: now - (s.lastSeen || 0) < ONLINE_MS }));
    const cur = st.task;
    const status = (s) => {
      if (st.phase === 'final' || s.final) return 'done';
      if (cur < 0) return 'idle';
      if (s.done[cur]) return 'done';
      if ((s.hints[cur] || 0) >= 2) return 'help';
      return 'work';
    };
    const order = { help: 0, work: 1, idle: 2, done: 3 };
    list.sort((a, b) => (a.online === b.online ? 0 : a.online ? -1 : 1) || order[status(a)] - order[status(b)] || a.name.localeCompare(b.name, 'ru'));

    const online = list.filter((s) => s.online).length;
    const doneCount = cur >= 0 ? st.students.filter((s) => s.done[cur]).length : 0;
    $('#summary').textContent = !list.length
      ? 'Пока никого'
      : cur >= 0
        ? `Сделали заказ ${cur + 1}: ${doneCount} из ${list.length} · онлайн ${online}`
        : `Вошли: ${list.length} · онлайн ${online}`;
    $('#progressFill').style.width = list.length && cur >= 0 ? `${(doneCount / list.length) * 100}%` : '0%';
    $('#empty').hidden = list.length > 0;

    const box = $('#students');
    box.innerHTML = '';
    for (const s of list) {
      const card = document.createElement('div');
      const stt = status(s);
      card.className = `st ${stt === 'done' ? 'done' : stt === 'help' ? 'help' : ''} ${s.online ? '' : 'offline'}`;
      const hints = (s.hints || []).reduce((a, b) => a + b, 0);
      const cells = tasks
        .map((_, i) => `<i class="${s.done[i] ? 'd' : i === cur ? 'c' : ''}">${s.done[i] ? '✓' : i + 1}</i>`)
        .join('');
      card.innerHTML = `
        <button class="st-kick" title="Убрать из списка">×</button>
        <div class="st-name"><span class="conn ${s.online ? 'ok' : ''}"></span><span></span></div>
        <div class="st-cells">${cells}</div>
        <div class="st-meta"><span>⭐ ${s.stars || 0}</span><span>💡 ${hints}</span>${s.bonus ? `<span>+${s.bonus} доп.</span>` : ''}${stt === 'help' ? '<span style="color:var(--orange)">подойдите</span>' : ''}</div>`;
      card.querySelector('.st-name span:last-child').textContent = s.name;
      card.querySelector('.st-kick').addEventListener('click', () => {
        if (confirm(`Убрать «${s.name}» из урока и из истории?`)) send('kick', { id: s.id });
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
    if (ended) tip = `Урок завершён за <b>${Math.round(min)} мин</b>. Перед следующим уроком нажмите «🔄 Новый урок».`;
    else if (min < PLAN.gameStart && st.phase !== 'lobby') tip = 'Игра началась раньше плана — значит, на заказы будет больше времени 👍';
    else if (min < PLAN.gameStart) tip =`Сейчас по плану — <b>рассказ</b>. Через ${Math.ceil(PLAN.gameStart - min)} мин выпускайте заказчика.`;
    else if (min < PLAN.gameEnd) {
      const per = (PLAN.gameEnd - PLAN.gameStart) / tasks.length;
      const planned = Math.min(tasks.length - 1, Math.floor((min - PLAN.gameStart) / per));
      const actual = st.phase === 'lobby' ? -1 : st.phase === 'final' ? tasks.length : st.task;
      const diff = actual - planned;
      tip = `По плану сейчас <b>заказ ${planned + 1}</b>. ` + (diff < 0 ? 'Вы немного отстаёте — можно переходить дальше.' : diff > 0 ? 'Вы идёте с опережением 👍' : 'Идёте точно по плану 👌');
    } else if (min < LESSON_MIN) tip = 'Пора к <b>итогам</b>: нажмите «🎉 Финал для всех» и подведите итоги.';
    else tip = '<b>Время урока вышло.</b>';
    $('#pace').innerHTML = tip;
  }

  // ---------- История ----------
  let history = [];
  const pad = (n) => String(n).padStart(2, '0');
  const dayOf = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' });
  const timeOf = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const result = (h) => (h.final || h.done >= h.total ? `✓ прошёл · ${h.done}/${h.total}` : `${h.done}/${h.total} заказов`);

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
    const list = history.filter((h) => !q || h.name.toLowerCase().includes(q));
    const passed = history.filter((h) => h.final || h.done >= h.total).length;
    $('#histSummary').textContent = history.length ? `Играли: ${history.length} · прошли до конца: ${passed}` : 'Пока никого';
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
      row.className = `hist-row ${h.final || h.done >= h.total ? 'ok' : ''}`;
      row.innerHTML = `<span class="hist-time">${timeOf(h.date)}</span><span class="hist-name"></span><span class="hist-res"></span><button class="hist-del" title="Удалить из истории">×</button>`;
      row.querySelector('.hist-name').textContent = h.name;
      row.querySelector('.hist-res').textContent = result(h);
      row.querySelector('.hist-del').addEventListener('click', async () => {
        if (!confirm(`Удалить «${h.name}» из истории?`)) return;
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
    const rows = [['Дата', 'Время', 'Имя', 'Заказов сделано', 'Прошёл до конца']];
    for (const h of history) {
      const d = new Date(h.date);
      rows.push([`${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`, timeOf(h.date), h.name, `${h.done} из ${h.total}`, h.final || h.done >= h.total ? 'да' : 'нет']);
    }
    const blob = new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `geeks-frontend-история-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
})();
