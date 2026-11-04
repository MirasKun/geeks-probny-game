// Хаб: держит подключения (SSE) и раздаёт состояние ученикам и преподавателю.
// Транспорт (Node или Cloudflare) передаёт сюда клиентов вида { role, id, pin, send(text) }
// и хранилище store: { save(room), putHistory(entry), deleteHistory(key), listHistory() }.

import { freshRoom, isStale, historyEntry, studentView, adminView, join, beat, progress, adminAction, normalizePhone } from './room.js';

export class Hub {
  constructor(room, { pin, store }) {
    this.room = room;
    this.pin = String(pin ?? 'geeks');
    this.store = store;
    this.clients = new Set();
  }

  isAdmin(pin) {
    return String(pin ?? '') === this.pin;
  }

  frame(data) {
    return `event: state\ndata: ${JSON.stringify(data)}\n\n`;
  }

  broadcast({ students = true, admins = true } = {}) {
    const sv = students && this.frame(studentView(this.room));
    const av = admins && this.frame(adminView(this.room));
    for (const c of this.clients) {
      if (c.role === 'admin') av && c.send(av);
      else sv && c.send(sv);
    }
  }

  // Старый забытый урок (3+ часа без дела) — начинаем новый. История остаётся.
  freshen() {
    if (!isStale(this.room)) return;
    this.archive();
    this.room = freshRoom();
    this.store.save(this.room);
    this.broadcast();
  }

  // Перед новым уроком ещё раз сохраняем всех учеников в историю.
  archive() {
    return Promise.all(Object.keys(this.room.students).map((id) => this.record(id)));
  }

  record(id) {
    const entry = historyEntry(this.room, id);
    return entry && this.store.putHistory(entry);
  }

  connect(c) {
    if (c.role === 'admin' && !this.isAdmin(c.pin)) return false;
    this.freshen();
    // Ученик перезагрузил страницу — старое подключение больше не нужно.
    if (c.role === 'student' && c.id) {
      for (const old of this.clients) if (old.role === 'student' && old.id === c.id) this.clients.delete(old);
    }
    this.clients.add(c);
    c.send('retry: 2000\n\n');
    c.send(this.frame(c.role === 'admin' ? adminView(this.room) : studentView(this.room)));
    if (c.role === 'student' && beat(this.room, c.id) !== null) this.broadcast({ students: false });
    return true;
  }

  disconnect(c) {
    this.clients.delete(c);
  }

  ping() {
    for (const c of this.clients) c.send(': ping\n\n');
  }

  async handle(path, body = {}) {
    switch (path) {
      case '/api/join': {
        this.freshen();
        if (!String(body.name ?? '').trim()) return [400, { error: 'name' }];
        if (!normalizePhone(body.phone)) return [400, { error: 'phone' }];
        // Вкладка осталась от прошлого урока: пусть ученик заново введёт имя.
        if (body.lessonId && body.lessonId !== this.room.lessonId) return [409, { error: 'old lesson' }];
        const id = join(this.room, body);
        if (!id) return [429, { error: 'full' }];
        await Promise.all([this.store.save(this.room), this.record(id)]);
        this.broadcast({ students: false });
        return [200, { id, state: studentView(this.room) }];
      }
      case '/api/beat': {
        const back = beat(this.room, body.id);
        if (back === null) return [404, { error: 'unknown student' }];
        if (back) this.broadcast({ students: false });
        return [200, { ok: true }];
      }
      case '/api/progress': {
        if (!progress(this.room, body)) return [404, { error: 'unknown student' }];
        await Promise.all([this.store.save(this.room), this.record(body.id)]);
        this.broadcast({ students: false });
        return [200, { ok: true }];
      }
      case '/api/admin': {
        if (!this.isAdmin(body.pin)) return [403, { error: 'pin' }];
        switch (body.type) {
          case 'ping':
            return [200, { ok: true }];
          case 'history': {
            const items = (await this.store.listHistory()).sort((a, b) => b.date - a.date);
            return [200, { items }];
          }
          case 'historyDelete':
            await this.store.deleteHistory(String(body.key || ''));
            return [200, { ok: true }];
          case 'kick':
            // «Убрать» — и из урока, и из истории (обычно это тестовые входы).
            await this.store.deleteHistory(`${this.room.lessonId}:${body.id}`);
            adminAction(this.room, body);
            break;
          case 'reset':
            await this.archive();
            this.room = freshRoom();
            break;
          default:
            adminAction(this.room, body);
        }
        await this.store.save(this.room);
        this.broadcast();
        return [200, { ok: true }];
      }
    }
    return [404, { error: 'not found' }];
  }
}
