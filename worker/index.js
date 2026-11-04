// Cloudflare Worker: статику отдаёт Workers Assets (папка public),
// а всё /api/* уходит в один Durable Object — «класс», где живёт состояние урока.

import { DurableObject } from 'cloudflare:workers';
import { Hub } from '../lib/hub.js';
import { freshRoom } from '../lib/room.js';

const STREAM_MS = 5 * 60 * 1000;

const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export class Classroom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.timer = null;
    ctx.blockConcurrencyWhile(async () => {
      const room = (await ctx.storage.get('room')) || freshRoom();
      // История: каждая запись под своим ключом h:<урок>:<ученик>, чтобы не упереться в размер.
      const store = {
        save: (r) => ctx.storage.put('room', r),
        putHistory: (e) => ctx.storage.put(`h:${e.key}`, e),
        deleteHistory: (key) => ctx.storage.delete(`h:${key}`),
        listHistory: async () => [...(await ctx.storage.list({ prefix: 'h:' })).values()],
      };
      this.hub = new Hub(room, { pin: env.ADMIN_PIN, store });
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/stream') return this.stream(url);
    if (url.pathname === '/api/info') return json(200, { urls: [url.origin] });
    if (request.method !== 'POST') return json(405, { error: 'method' });
    let body = {};
    try {
      body = await request.json();
    } catch {}
    const [status, data] = await this.hub.handle(url.pathname, body);
    return json(status, data);
  }

  stream(url) {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    const client = {
      role: url.searchParams.get('role') === 'admin' ? 'admin' : 'student',
      id: url.searchParams.get('id'),
      pin: url.searchParams.get('pin'),
      send: (text) => writer.write(enc.encode(text)).catch(() => this.drop(client)),
    };
    if (!this.hub.connect(client)) return json(403, { error: 'pin' });
    this.keepAlive();
    // Через 5 минут закрываем поток, браузер сам переподключится за 2 секунды.
    // Без этого вечные подключения не дают Cloudflare включить новую версию после deploy.
    setTimeout(() => {
      this.drop(client);
      writer.close().catch(() => {});
    }, STREAM_MS);
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  drop(client) {
    client.send = () => Promise.resolve();
    this.hub.disconnect(client);
  }

  keepAlive() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.hub.clients.size) {
        clearInterval(this.timer);
        this.timer = null;
        return;
      }
      this.hub.ping();
    }, 15000);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const room = env.ROOM.get(env.ROOM.idFromName('classroom'));
      return room.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
