// Состояние урока. Один и тот же код работает и в Cloudflare, и на ноутбуке.

export const TASKS = 3; // этап 1: фронтенд
export const TASKS_B = 3; // этап 2: бэкенд (плюс авария по кнопке)

const rid = () => Math.random().toString(36).slice(2, 10);
const clean = (v, max = 40) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const int = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
const list = (v, max = TASKS) => (Array.isArray(v) ? v.slice(0, max) : []);
const stageTasks = (r) => ((r.stage || 1) === 2 ? TASKS_B : TASKS);
const hintKey = (r) => (r.crash ? 'crash' : `${r.stage || 1}:${r.task}`);

// Номер в Кыргызстане: 9 цифр после +996. Принимаем и 0700 123 456, и +996 700 123 456.
// Пробелы оставляем: так Excel показывает номер как текст, а не как 9,97E+11.
export function normalizePhone(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('996')) d = d.slice(3);
  if (d.length === 10 && d.startsWith('0')) d = d.slice(1);
  if (d.length !== 9) return '';
  return `+996 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

export function freshRoom() {
  return {
    lessonId: rid(),
    stage: 1, // 1 — фронтенд, 2 — бэкенд
    phase: 'lobby', // lobby → task → final
    task: -1,
    crash: false, // авария на этапе 2: сервер упал у всех
    crashUsed: false,
    saved: {}, // где остановились на другом этапе
    attention: false,
    cssOff: false,
    voiceOff: false, // преподаватель выключил звук у всех
    hintAll: {},
    startedAt: null,
    endedAt: null,
    touchedAt: Date.now(),
    students: {},
  };
}

// Если в уроке никто ничего не делал 3 часа, следующий вход начинает новый урок сам.
const IDLE_MS = 3 * 60 * 60 * 1000;

export function isStale(r) {
  const last = r.touchedAt || Math.max(r.startedAt || 0, ...Object.values(r.students).map((s) => s.lastSeen || 0));
  const used = r.phase !== 'lobby' || Object.keys(r.students).length > 0;
  return used && Date.now() - last > IDLE_MS;
}

// Запись для истории: кто, когда и сколько заказов сделал.
export function historyEntry(r, id) {
  const s = r.students[id];
  if (!s) return null;
  return {
    key: `${r.lessonId}:${id}`,
    lessonId: r.lessonId,
    name: s.name,
    phone: s.phone || '',
    date: s.joinedAt,
    done: s.done.filter(Boolean).length,
    total: TASKS,
    final: s.final,
    doneB: (s.doneB || []).filter(Boolean).length,
    totalB: TASKS_B,
    crashFixed: Boolean(s.crashFixed),
    finalB: Boolean(s.finalB),
  };
}

export function studentView(r) {
  return {
    lessonId: r.lessonId,
    stage: r.stage || 1,
    phase: r.phase,
    task: r.task,
    crash: Boolean(r.crash),
    attention: r.attention,
    cssOff: r.cssOff,
    voiceOff: Boolean(r.voiceOff),
    hintAll: r.hintAll[hintKey(r)] || 0,
  };
}

// Ученик считается онлайн, если присылал сигнал за последние 45 секунд.
export const ONLINE_MS = 45000;

export function adminView(r) {
  return {
    ...studentView(r),
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    crashUsed: Boolean(r.crashUsed),
    now: Date.now(),
    students: Object.entries(r.students).map(([id, s]) => ({ id, ...s })),
  };
}

export function join(r, { id, name, phone } = {}) {
  name = clean(name);
  phone = normalizePhone(phone);
  r.touchedAt = Date.now();
  if (id && r.students[id]) {
    r.students[id].name = name;
    r.students[id].phone = phone;
    r.students[id].lastSeen = Date.now();
    return id;
  }
  if (Object.keys(r.students).length >= 300) return null;
  id = rid();
  r.students[id] = { name, phone, done: [], hints: [], doneB: [], hintsB: [], crashHints: 0, crashFixed: false, finalB: false, bonus: 0, stars: 0, final: false, joinedAt: Date.now(), lastSeen: Date.now() };
  return id;
}

// Возвращает true, если ученик был офлайн и снова появился.
export function beat(r, id) {
  const s = r.students[id];
  if (!s) return null;
  const wasOffline = Date.now() - (s.lastSeen || 0) > ONLINE_MS;
  s.lastSeen = Date.now();
  return wasOffline;
}

export function progress(r, p = {}) {
  const s = r.students[p.id];
  if (!s) return false;
  s.lastSeen = r.touchedAt = Date.now();
  s.done = list(p.done).map(Boolean);
  s.hints = list(p.hints).map((n) => int(n, 0, 3));
  s.bonus = int(p.bonus, 0, 20);
  s.stars = int(p.stars, 0, 99);
  s.final = Boolean(p.final);
  s.doneB = list(p.doneB, TASKS_B).map(Boolean);
  s.hintsB = list(p.hintsB, TASKS_B).map((n) => int(n, 0, 3));
  s.crashHints = int(p.crashHints, 0, 3);
  s.crashFixed = Boolean(p.crashFixed);
  s.finalB = Boolean(p.finalB);
  return true;
}

// Переход между этапами. Запоминаем, где остановились, чтобы можно было вернуться.
function switchStage(r, to) {
  const from = r.stage || 1;
  if (to === from || (to !== 1 && to !== 2)) return;
  r.saved = r.saved || {};
  r.saved[from] = { phase: r.phase, task: r.task, startedAt: r.startedAt, endedAt: r.endedAt };
  const back = r.saved[to] || { phase: 'lobby', task: -1, startedAt: null, endedAt: null };
  r.stage = to;
  Object.assign(r, back);
  r.crash = false;
  r.attention = false;
  r.cssOff = false;
}

export function adminAction(r, a = {}) {
  r.touchedAt = Date.now();
  switch (a.type) {
    case 'stage':
      switchStage(r, Number(a.stage));
      break;
    case 'crash':
      if ((r.stage || 1) !== 2 || r.phase !== 'task') break;
      r.crash = !r.crash;
      if (r.crash) r.crashUsed = true;
      break;
    case 'start':
      r.startedAt = Date.now();
      r.endedAt = null;
      break;
    case 'next':
      if (r.phase === 'final') break;
      if (r.task >= stageTasks(r) - 1) {
        r.phase = 'final';
        r.crash = false;
        r.endedAt = Date.now();
      } else {
        r.task += 1;
        r.phase = 'task';
      }
      r.attention = false;
      r.cssOff = false;
      if (!r.startedAt) r.startedAt = Date.now();
      break;
    case 'prev':
      if (r.phase === 'final') {
        r.phase = 'task';
        r.endedAt = null;
      } else if (r.task > 0) r.task -= 1;
      else {
        r.task = -1;
        r.phase = 'lobby';
      }
      break;
    case 'attention':
      r.attention = !r.attention;
      break;
    case 'cssOff':
      r.cssOff = !r.cssOff;
      break;
    case 'voice':
      r.voiceOff = !r.voiceOff;
      break;
    case 'hintAll':
      if (r.task >= 0) r.hintAll[hintKey(r)] = Math.min(3, (r.hintAll[hintKey(r)] || 0) + 1);
      break;
    case 'final':
      r.phase = 'final';
      r.crash = false;
      r.attention = false;
      r.cssOff = false;
      if (r.startedAt && !r.endedAt) r.endedAt = Date.now();
      break;
    case 'kick':
      delete r.students[a.id];
      break;
  }
}
