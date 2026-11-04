// Состояние урока. Один и тот же код работает и в Cloudflare, и на ноутбуке.

export const TASKS = 5;

const rid = () => Math.random().toString(36).slice(2, 10);
const clean = (v, max = 40) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const int = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
const list = (v) => (Array.isArray(v) ? v.slice(0, TASKS) : []);

export function freshRoom() {
  return {
    lessonId: rid(),
    phase: 'lobby', // lobby → task → final
    task: -1,
    attention: false,
    cssOff: false,
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
    date: s.joinedAt,
    done: s.done.filter(Boolean).length,
    total: TASKS,
    final: s.final,
  };
}

export function studentView(r) {
  return {
    lessonId: r.lessonId,
    phase: r.phase,
    task: r.task,
    attention: r.attention,
    cssOff: r.cssOff,
    hintAll: r.hintAll[r.task] || 0,
  };
}

// Ученик считается онлайн, если присылал сигнал за последние 45 секунд.
export const ONLINE_MS = 45000;

export function adminView(r) {
  return {
    ...studentView(r),
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    now: Date.now(),
    students: Object.entries(r.students).map(([id, s]) => ({ id, ...s })),
  };
}

export function join(r, { id, name } = {}) {
  name = clean(name) || 'Гость';
  r.touchedAt = Date.now();
  if (id && r.students[id]) {
    r.students[id].name = name;
    r.students[id].lastSeen = Date.now();
    return id;
  }
  if (Object.keys(r.students).length >= 300) return null;
  id = rid();
  r.students[id] = { name, done: [], hints: [], bonus: 0, stars: 0, final: false, joinedAt: Date.now(), lastSeen: Date.now() };
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
  return true;
}

export function adminAction(r, a = {}) {
  r.touchedAt = Date.now();
  switch (a.type) {
    case 'start':
      r.startedAt = Date.now();
      r.endedAt = null;
      break;
    case 'next':
      if (r.phase === 'final') break;
      if (r.task >= TASKS - 1) {
        r.phase = 'final';
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
    case 'hintAll':
      if (r.task >= 0) r.hintAll[r.task] = Math.min(3, (r.hintAll[r.task] || 0) + 1);
      break;
    case 'final':
      r.phase = 'final';
      r.attention = false;
      r.cssOff = false;
      if (r.startedAt && !r.endedAt) r.endedAt = Date.now();
      break;
    case 'kick':
      delete r.students[a.id];
      break;
  }
}
