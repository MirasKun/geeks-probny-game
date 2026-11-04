// Этап 2 «Бэкенд»: панель магазина, заказы, журнал сервера и авария в server.py.
// Сайт ученика остаётся с его дизайном из этапа 1, меняются только данные в карточках.

window.FG = window.FG || {};

FG.createBackend = function (G) {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tasks = FG.bTasks;
  const bonuses = FG.bBonuses;

  const SITE_CSS = `
    .cards { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)) !important; grid-auto-rows: 1fr !important; }
    .card { display: flex !important; flex-direction: column; align-items: center; min-width: 0; box-sizing: border-box; }
    .card .picture { flex: none; width: 72px; height: 72px; display: flex; align-items: center; justify-content: center; font-size: 56px; line-height: 1; }
    .card .picture img { width: 60px !important; height: 60px !important; }
    .card h3 { flex: none; display: flex; align-items: center; justify-content: center; min-height: 2.6em; margin: 8px 0 4px; line-height: 1.3; overflow-wrap: anywhere; }
    .card .price { flex: none; margin: 4px 0 12px; }
    .card .add-btn, .card .__sold-note { margin-top: auto; }
    .add-btn { display: inline-block !important; }
    .card.__glow { outline: 4px solid #ffe743; outline-offset: 2px; animation: __glow 1.3s ease-in-out infinite; }
    @keyframes __glow { 50% { box-shadow: 0 0 0 8px rgba(255, 231, 67, .45); } }
    .card.__sold { opacity: .55; filter: grayscale(.7); }
    .__sold-note { font-weight: 700; color: #8a8f9c; margin: 8px 0; }
    #__note { position: fixed; left: 50%; top: 14px; transform: translateX(-50%); z-index: 9; background: #1b1c20; color: #ffe743; padding: 10px 18px; border-radius: 12px; font: 700 14px Arial, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.3); white-space: nowrap; }`;

  let active = false;
  let crash = false;
  let tab = 'products';
  let form = null;
  let undoStack = [];
  let lastTask;
  let lastPhase;
  let mode = 'idle'; // idle | task | near | done | bonus | crash
  let lastNear = '';
  let hintCursor = 0;
  let nudgeTimer = null;
  let lostTimer = null;
  let noteTimer = null;
  let codeEd = null;
  let codeError = null;
  let badId = null; // какой товар сейчас неправильный
  let shownStep = '';

  const state = () => G.S.b;

  // ---------- Данные ----------
  function ensure() {
    if (G.S.b) return G.S.b;
    const products = FG.bDefaults();
    // Карточки, которые ученик сам дописал в HTML на этапе 1, тоже становятся товарами.
    const known = products.map((p) => p.name.toLowerCase());
    const page = new DOMParser().parseFromString(G.S.html || '', 'text/html');
    for (const card of [...page.querySelectorAll('.card')].slice(0, 8)) {
      const name = (card.querySelector('h3')?.textContent || '').trim().slice(0, 30);
      if (!name || known.includes(name.toLowerCase())) continue;
      known.push(name.toLowerCase());
      const price = parseInt((card.querySelector('.price')?.textContent || '').replace(/\D/g, ''), 10) || 100;
      products.push({ id: products.length + 1, name, price, pic: (card.querySelector('.picture')?.textContent || '🍽️').trim().slice(0, 4), stock: true });
    }
    G.S.b = {
      products,
      nextId: products.length + 1,
      task: -1,
      done: [],
      hints: [],
      orders: [],
      crashDone: false,
      crashHints: 0,
      crashStarted: false,
      crashFixedCode: '',
      crashCodeNow: '',
      lost: 0,
      final: false,
      bonusIdx: 0,
      bonusDone: 0,
      log: [['info', '* Сервер запущен: http://burgerbro.kg'], ['ok', 'GET /products → 200 OK']],
    };
    return G.S.b;
  }

  function changed() {
    G.save();
    if (!crash && codeEd) codeEd.setSilently('py', FG.serverCode(state().products));
    renderList();
    G.renderHTML();
    check();
    paintPanel();
  }

  function snapshot() {
    undoStack.push(JSON.stringify(state().products));
    if (undoStack.length > 30) undoStack.shift();
    $('#bUndo').disabled = false;
  }

  // ---------- Журнал сервера ----------
  function log(kind, text) {
    const b = state();
    b.log.push([kind, text]);
    if (b.log.length > 40) b.log.splice(0, b.log.length - 40);
    renderLog();
  }

  function renderLog() {
    const box = $('#bLogLines');
    let html = state().log.map(([k, t]) => `<div class="l-${k}">${esc(t)}</div>`).join('');
    if (crash && codeError) {
      html += `<div class="l-err">Traceback (most recent call last):</div>
        <div class="l-err">  File "server.py", <button class="b-line" id="bLineLink" type="button">line ${codeError.line + 1}</button>, in get_products</div>
        <div class="l-err">    ${esc(codeError.source)}</div>
        <div class="l-err"><b>${esc(codeError.error)}</b></div>
        <div class="l-err">GET /products → 500 Internal Server Error</div>`;
    }
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
    const link = $('#bLineLink');
    if (link) link.addEventListener('click', () => openLine());
  }

  function openLine() {
    showTab('code');
    if (codeError) codeEd.reveal('py', codeError.line, codeError.line, true);
  }

  // ---------- Вкладки панели ----------
  function showTab(name) {
    tab = name;
    document.querySelectorAll('[data-btab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.btab === name);
      if (b.dataset.btab === name) b.classList.remove('attn');
    });
    document.querySelectorAll('[data-bpane]').forEach((p) => (p.hidden = p.dataset.bpane !== name));
    if (name === 'code') codeEd.show('py');
    paintPanel();
  }

  // ---------- Что нажать дальше ----------
  function currentItem() {
    const b = state();
    if (b.final || b.task < 0) return null;
    if (!b.done[b.task]) return tasks[b.task];
    return mode === 'bonus' ? bonuses[b.bonusIdx] : null;
  }

  function panelContext() {
    return { tab, form: form && { id: form.id, pic: form.pic, name: $('#bName').value.trim(), price: $('#bPrice').value.trim() } };
  }

  function stepNow() {
    const item = currentItem();
    return item && item.next ? item.next(state(), panelContext()) : null;
  }

  // Подсвечивает следующий шаг. Если ученик уже просил подсказку, сам говорит, что делать дальше.
  function paintPanel() {
    document.querySelectorAll('.b-glow, .b-bad').forEach((x) => x.classList.remove('b-glow', 'b-bad'));
    if (!active || !state()) return;
    if (crash) return;
    const b = state();
    const item = currentItem();
    const step = stepNow();
    const glow = step ? step.glow : item && item.glow ? item.glow(b) : [];
    for (const sel of glow) document.querySelector(sel)?.classList.add('b-glow');
    if (badId !== null) document.querySelector(`[data-pid="${badId}"]`)?.classList.add('b-bad');
    if (step && mode === 'task' && b.hints[b.task] && step.text !== shownStep) sayStep(step);
  }

  function sayStep(step) {
    shownStep = step.text;
    G.botSay(`<span class="hint-step">делай</span>${step.text}`);
  }

  function showGlowCard() {
    G.doc()?.querySelector('.__glow')?.scrollIntoView({ block: 'center' });
  }
  document.querySelectorAll('[data-btab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.btab)));

  // ---------- Товары ----------
  function renderList() {
    const b = state();
    const box = $('#bList');
    box.innerHTML = '';
    for (const p of b.products) {
      const row = document.createElement('div');
      row.className = `b-row ${p.stock ? '' : 'off'}`;
      row.dataset.pid = p.id;
      row.innerHTML = `
        <div class="b-pic">${FG.bPicHtml(p.pic)}</div>
        <div class="b-info"><b></b><span>${p.price} сом</span></div>
        <label class="b-switch" title="В продаже"><input type="checkbox" ${p.stock ? 'checked' : ''}><i></i><small>В продаже</small></label>
        <button class="b-icon" data-act="edit" type="button" title="Изменить">✏️</button>
        <button class="b-icon" data-act="del" type="button" title="Удалить">🗑</button>`;
      row.querySelector('b').textContent = p.name;
      row.querySelector('input').addEventListener('change', (e) => {
        snapshot();
        p.stock = e.target.checked;
        log('ok', `PATCH /products/${p.id} {"stock": ${p.stock}} → 200 OK`);
        changed();
      });
      row.querySelector('[data-act="edit"]').addEventListener('click', () => openForm(p));
      row.querySelector('[data-act="del"]').addEventListener('click', () => {
        snapshot();
        b.products = b.products.filter((x) => x !== p);
        log('ok', `DELETE /products/${p.id} → 200 OK`);
        changed();
      });
      box.appendChild(row);
    }
    $('#bProducts').classList.toggle('down', crash);
    $('#bOrdersPane').classList.toggle('down', crash);
    paintPanel();
  }

  $('#bUndo').addEventListener('click', () => {
    const prev = undoStack.pop();
    if (!prev) return;
    state().products = JSON.parse(prev);
    $('#bUndo').disabled = !undoStack.length;
    log('info', '↶ Вернули как было');
    changed();
  });

  // ---------- Форма товара и полка с картинками ----------
  function renderShelf() {
    const box = $('#bShelf');
    box.innerHTML = '';
    for (const pic of FG.bPics) {
      // Не <button>: в Firefox кнопки нельзя перетаскивать.
      const b = document.createElement('div');
      b.setAttribute('role', 'button');
      b.tabIndex = 0;
      b.className = 'b-tile';
      b.draggable = true;
      b.title = pic.label;
      b.innerHTML = `<span>${FG.bPicHtml(pic.id)}</span><small>${pic.label}</small>`;
      b.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', pic.id);
        e.dataTransfer.effectAllowed = 'copy';
        $('#bDrop').classList.add('ready');
      });
      b.addEventListener('dragend', () => $('#bDrop').classList.remove('ready'));
      // Если перетаскивать неудобно, картинку можно выбрать и кликом.
      b.addEventListener('click', () => setFormPic(pic.id));
      b.addEventListener('keydown', (e) => e.key === 'Enter' && setFormPic(pic.id));
      box.appendChild(b);
    }
  }

  function setFormPic(id) {
    if (!form) return;
    form.pic = id;
    const drop = $('#bDrop');
    drop.classList.add('has');
    drop.innerHTML = `<span class="b-drop-pic">${FG.bPicHtml(id)}</span>`;
    paintPanel();
  }

  function openForm(p) {
    form = p ? { id: p.id, pic: p.pic } : { id: null, pic: '' };
    showTab('products');
    $('#bFormTitle').textContent = p ? 'Изменить товар' : 'Новый товар';
    $('#bName').value = p ? p.name : '';
    $('#bPrice').value = p ? p.price : '';
    $('#bFormErr').textContent = '';
    const drop = $('#bDrop');
    drop.classList.remove('has');
    drop.innerHTML = 'Перетащи<br>картинку<br>сюда';
    if (form.pic) setFormPic(form.pic);
    $('#bForm').hidden = false;
    $('#bShelfWrap').hidden = false;
    $('#editor').classList.add('form-open');
    $('#bName').focus();
    paintPanel();
  }

  function closeForm() {
    form = null;
    $('#bForm').hidden = true;
    $('#bShelfWrap').hidden = true;
    $('#editor').classList.remove('form-open');
    paintPanel();
  }

  $('#bForm').addEventListener('input', paintPanel);
  $('#bAdd').addEventListener('click', () => openForm(null));
  $('#bCancel').addEventListener('click', closeForm);

  const drop = $('#bDrop');
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over', 'ready');
    const id = e.dataTransfer.getData('text/plain');
    if (FG.bPics.some((p) => p.id === id)) setFormPic(id);
  });

  $('#bForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const b = state();
    const name = $('#bName').value.trim().slice(0, 30);
    const price = parseInt($('#bPrice').value, 10);
    if (!name) {
      $('#bName').classList.add('b-bad');
      return ($('#bFormErr').textContent = 'Напиши название товара.');
    }
    if (!(price > 0)) {
      $('#bPrice').classList.add('b-bad');
      return ($('#bFormErr').textContent = 'Напиши цену числом, например 450.');
    }
    snapshot();
    if (form.id) {
      const p = b.products.find((x) => x.id === form.id);
      if (p) Object.assign(p, { name, price, pic: form.pic });
      log('ok', `PUT /products/${form.id} {"name": "${name}", "price": ${price}} → 200 OK`);
    } else {
      b.products.push({ id: b.nextId++, name, price, pic: form.pic, stock: true });
      log('ok', `POST /products {"name": "${name}", "price": ${price}} → 201 Создано`);
    }
    log('ok', 'GET /products → 200 OK');
    closeForm();
    changed();
  });

  // «Вставить слово» из подсказки — для тех, кто пока не умеет менять раскладку.
  $('#assistantText').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fill]');
    if (!b || !active) return;
    if (!form) openForm(null);
    $('#bName').value = b.dataset.fill;
    $('#bPrice').focus();
    paintPanel();
  });

  // ---------- Сайт ----------
  function paintSite(doc) {
    if (!active || !doc || !state()) return;
    if (!doc.getElementById('b-css')) {
      const style = doc.createElement('style');
      style.id = 'b-css';
      style.textContent = SITE_CSS;
      doc.head.appendChild(style);
    }
    let box = doc.querySelector('.cards');
    if (!box) {
      box = doc.createElement('section');
      box.className = 'cards';
      const foot = doc.querySelector('.footer');
      if (foot) foot.before(box);
      else doc.body.appendChild(box);
    }
    const glowId = orderCardId();
    box.innerHTML = state()
      .products.map(
        (p) => `<div class="card ${p.stock ? '' : '__sold'} ${p.id === glowId ? '__glow' : ''}" data-id="${p.id}">
          <div class="picture">${FG.bPicHtml(p.pic)}</div>
          <h3>${esc(p.name)}</h3>
          <p class="price">${p.price} сом</p>
          ${p.stock ? '<button class="add-btn">В корзину</button>' : '<p class="__sold-note">Нет в наличии</p>'}
        </div>`,
      )
      .join('');
  }

  // Какая карточка светится в заказе «Первый заказ».
  function orderCardId() {
    const b = state();
    if (crash || tasks[b.task]?.id !== 'order' || b.done[b.task] || b.final) return null;
    if (b.orders.some((o) => o.task === b.task && o.status === 'new')) return null;
    const list = b.products.filter((p) => p.stock);
    return (list.find((p) => /пицц|pizza/i.test(p.name)) || list[0] || {}).id ?? null;
  }

  function siteNote(text) {
    const doc = G.doc();
    if (!doc) return;
    doc.getElementById('__note')?.remove();
    const n = doc.createElement('div');
    n.id = '__note';
    n.textContent = text;
    doc.body.appendChild(n);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => n.remove(), 3500);
  }

  // Посылка летит между сайтом и панелью — так виден запрос и ответ.
  function packet(fromRect, toRect, emoji) {
    const p = document.createElement('div');
    p.className = 'b-packet';
    p.textContent = emoji;
    p.style.left = `${fromRect.left + fromRect.width / 2}px`;
    p.style.top = `${fromRect.top + fromRect.height / 2}px`;
    document.body.appendChild(p);
    requestAnimationFrame(() => {
      p.style.left = `${toRect.left + toRect.width / 2}px`;
      p.style.top = `${toRect.top + toRect.height / 2}px`;
      p.style.transform = 'translate(-50%, -50%) scale(1.3)';
    });
    setTimeout(() => p.remove(), 950);
  }

  function siteClick(e) {
    if (!active || crash) return;
    const btn = e.target.closest && e.target.closest('.add-btn');
    if (!btn) return;
    e.preventDefault();
    const b = state();
    const product = b.products.find((p) => p.id === Number(btn.closest('.card')?.dataset.id));
    if (!product) return;
    const order = { id: Date.now(), name: product.name, pic: product.pic, status: 'new', task: b.task };
    b.orders.unshift(order);
    if (b.orders.length > 8) b.orders.pop();
    log('ok', `POST /orders {"item": "${product.name}"} → 201 Создано`);
    const f = $('#site').getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    packet({ left: f.left + r.left, top: f.top + r.top, width: r.width, height: r.height }, $('[data-btab="orders"]').getBoundingClientRect(), '📦');
    G.renderHTML();
    siteNote(`⏳ Отправили заказ на сервер: ${product.name}`);
    renderOrders();
    G.save();
    if (tab !== 'orders') $('[data-btab="orders"]').classList.add('attn');
    if (tasks[b.task]?.id === 'order' && !b.done[b.task] && mode !== 'crash' && !b.hints[b.task]) G.botSay('📦 Запрос улетел на сервер! Теперь ты повар: открой вкладку <b>📥 Заказы</b>.');
    paintPanel();
  }

  // ---------- Заказы ----------
  function renderOrders() {
    const b = state();
    const box = $('#bOrders');
    const fresh = b.orders.filter((o) => o.status === 'new').length;
    $('#bOrderCount').textContent = fresh || '';
    $('#bOrderCount').hidden = !fresh;
    if (!b.orders.length) {
      box.innerHTML = '<div class="b-empty"><span>📭</span>Заказов пока нет.<br>Когда клиент нажмёт на сайте «В корзину», заказ придёт сюда.</div>';
      paintPanel();
      return;
    }
    box.innerHTML = '';
    for (const o of b.orders) {
      const row = document.createElement('div');
      row.className = `b-order ${o.status}`;
      row.innerHTML = `
        <div class="b-pic">${FG.bPicHtml(o.pic)}</div>
        <div class="b-info"><b></b><code></code></div>
        ${o.status === 'new' ? '<button class="btn btn-primary" type="button">✅ Принять заказ</button>' : '<span class="b-accepted">Принят ✓</span>'}`;
      row.querySelector('b').textContent = o.name;
      row.querySelector('code').textContent = `POST /orders {"item": "${o.name}"}`;
      const accept = row.querySelector('button');
      if (accept) {
        accept.addEventListener('click', () => {
          o.status = 'accepted';
          log('ok', `Ответ сайту: {"status": "принят"} → 200 OK`);
          const r = accept.getBoundingClientRect();
          packet(r, $('#site').getBoundingClientRect(), '✉️');
          setTimeout(() => siteNote(`✅ Заказ принят: ${o.name}. Уже готовим!`), 700);
          renderOrders();
          G.save();
          check();
        });
      }
      box.appendChild(row);
    }
    paintPanel();
  }

  // ---------- Код сервера ----------
  function setupCode() {
    if (codeEd) return;
    codeEd = FG.createEditor($('#bCode'), { py: FG.serverCode(state().products) }, onCodeChange);
    codeEd.lock(true);
    const letter = document.createElement('button');
    letter.type = 'button';
    letter.className = 'chip';
    letter.textContent = 's';
    letter.title = 'Вставить букву s в конец жёлтой строчки';
    letter.addEventListener('mousedown', (e) => e.preventDefault());
    letter.addEventListener('click', () => {
      if (!crash) return;
      const line = FG.serverFixLine(state().crashFixedCode);
      if (codeEd.caretLine('py') !== line) codeEd.reveal('py', line, line, true);
      codeEd.insert('s');
    });
    $('#bCodeChips').appendChild(letter);
    $('#bCodeUndo').addEventListener('click', () => crash && codeEd.undo());
    $('#bCodeReset').addEventListener('click', () => {
      if (crash && confirm('Вернуть код к моменту аварии?')) codeEd.replaceAll('py', FG.serverBug(state().crashFixedCode));
    });
  }

  function onCodeChange(_, text) {
    if (!crash) return;
    const b = state();
    b.crashCodeNow = text;
    G.save();
    const r = FG.checkServerCode(text, b.crashFixedCode);
    if (r.ok) return completeCrash();
    codeError = r;
    renderLog();
    paintCode();
    if (r.near && r.near !== lastNear) {
      lastNear = r.near;
      G.botSay(r.near, 'warn');
    } else if (!r.near && lastNear) {
      lastNear = '';
      if (b.crashHints) showHint(hintCursor);
      else G.botSay('Теперь нужно исправить жёлтую строчку. Что написать, скажет <b>💡 Подсказка</b>.');
    }
  }

  // Жёлтым: где ошибка. Красным: строчка, которую ученик изменил неправильно.
  function paintCode() {
    if (!codeEd) return;
    if (!crash) return codeEd.setMarks('py', []);
    const b = state();
    const line = FG.serverFixLine(b.crashFixedCode);
    const lines = codeEd.value('py').split('\n');
    const marks = [{ from: line - 1, to: line, kind: 'soft' }];
    if (b.crashHints) marks.push({ from: line, to: line, kind: 'hint' });
    if (codeError && (codeError.line !== line || lines[line] !== FG.serverBugLine)) marks.push({ from: codeError.line, to: codeError.line, kind: 'bad' });
    codeEd.setMarks('py', marks);
    codeEd.scrollToLine('py', line);
  }

  // ---------- Авария ----------
  function setCrashScreen(on) {
    $('#app').classList.toggle('crashing', on);
    $('#downPage').hidden = !on;
    $('#bCodeNote').textContent = on ? 'Сервер лежит! Ошибка в жёлтой строчке: исправь её прямо здесь.' : 'Пока сервер работает, код только для чтения.';
    document.querySelector('[data-btab="code"]').classList.toggle('attn', on);
    clearInterval(lostTimer);
    if (on) {
      lostTimer = setInterval(() => {
        state().lost += 1 + Math.floor(Math.random() * 3);
        $('#downLost').textContent = state().lost;
      }, 1300);
      $('#downLost').textContent = state().lost;
    }
  }

  function startCrash() {
    const b = state();
    const seen = b.crashStarted;
    crash = true;
    b.crashStarted = true;
    if (!b.crashFixedCode) b.crashFixedCode = FG.serverCode(b.products);
    if (!b.crashCodeNow) b.crashCodeNow = FG.serverBug(b.crashFixedCode);
    closeForm();
    codeEd.setSilently('py', b.crashCodeNow);
    codeEd.lock(false);
    const r = FG.checkServerCode(b.crashCodeNow, b.crashFixedCode);
    codeError = r.ok ? null : r;
    setCrashScreen(true);
    renderList();
    renderLog();
    renderTopbar();
    paintCode();
    paintPanel();
    mode = 'crash';
    lastNear = '';
    clearNudge();
    G.botSay('🚨 Сервер упал! Открой вкладку <b>🐍 server.py</b>: строчка с ошибкой там подсвечена жёлтым. Не понятно, что делать? Жми <b>💡 Подсказка</b>.');
    updateHint();
    G.save();
    if (!seen) say();
    armNudge();
  }

  function say() {
    G.customerSay(FG.bCrash.say, { mood: 'angry', actions: [{ label: 'Уже чиню! 🔧', onClick: G.customerLeave }] });
  }

  function stopCrash() {
    crash = false;
    codeError = null;
    setCrashScreen(false);
    paintCode();
    codeEd.lock(true);
    clearNudge();
  }

  function completeCrash() {
    const b = state();
    b.crashDone = true;
    stopCrash();
    b.crashCodeNow = '';
    codeEd.setSilently('py', FG.serverCode(b.products));
    log('info', '* Сервер перезапущен');
    log('ok', 'GET /products → 200 OK');
    const stars = Math.max(1, 3 - Math.min(2, b.crashHints));
    G.addStars(stars);
    G.save();
    G.report();
    G.toast(`🛠 Сервер работает! +${stars} ⭐`);
    G.burst(30);
    G.renderHTML();
    renderList();
    renderTopbar();
    updateHint();
    G.customerSay(FG.bCrash.doneSay, { mood: 'happy', autoHide: 5000 });
    mode = 'done';
    const lost = b.lost ? ` Пока сервер лежал, ушло клиентов: <b>${b.lost}</b>.` : '';
    const open = b.task >= 0 && !b.done[b.task];
    const actions = open
      ? [{ label: 'Вернуться к заказу →', primary: true, onClick: () => { showTab('products'); setTask(b.task, { force: true }); } }]
      : G.isSolo() && b.task + 1 < tasks.length
        ? [{ label: 'Следующий заказ →', primary: true, onClick: () => { showTab('products'); setTask(b.task + 1); } }]
        : [];
    G.botSay(`🎉 ${FG.bCrash.learn}${lost}`, 'good', actions);
    maybeFinal();
  }

  // ---------- Ассистент ----------
  function clearNudge() {
    clearTimeout(nudgeTimer);
    $('#assistant').classList.remove('nudge');
  }
  function armNudge() {
    clearNudge();
    nudgeTimer = setTimeout(() => {
      const b = state();
      const quiet = crash ? !b.crashHints : b.task >= 0 && !b.done[b.task] && !b.hints[b.task];
      if (!active || !quiet) return;
      $('#assistant').classList.add('nudge');
      G.botSay('Застрял(а)? Это нормально, все программисты с этого начинали 🙂 Нажми <b>💡</b>, и я скажу, что сделать дальше.');
    }, 60000);
  }

  function updateHint() {
    const b = state();
    const btn = $('#hintBtn');
    if (b.final || b.task < 0) return (btn.hidden = true);
    if (crash) {
      btn.hidden = false;
      btn.textContent = b.crashHints >= 3 ? '💡 Подсказки' : `💡 Подсказка ${b.crashHints + 1}/3`;
      return;
    }
    if (b.done[b.task]) {
      btn.hidden = !(mode === 'bonus' && bonuses[b.bonusIdx]);
      btn.textContent = '💡 Подсказка';
      return;
    }
    btn.hidden = false;
    btn.textContent = '💡 Что делать?';
  }

  function showHint(level) {
    if (crash) {
      const line = FG.serverFixLine(state().crashFixedCode);
      showTab('code');
      codeEd.reveal('py', line, line, true);
      G.botSay(`<span class="hint-step">${level + 1}/3</span>${FG.bCrash.hints[level]}`);
      paintCode();
      return;
    }
    mode = 'task';
    const step = stepNow();
    if (step) sayStep(step);
    showGlowCard();
    paintPanel();
  }

  function hint() {
    clearNudge();
    const b = state();
    if (!crash && b.task >= 0 && b.done[b.task]) {
      const bonus = bonuses[b.bonusIdx];
      if (bonus) G.botSay(`<span class="bonus-tag">доп. правка</span>${bonus.hint}`);
      paintPanel();
      return;
    }
    const used = crash ? b.crashHints : b.hints[b.task] || 0;
    if (used < 3) {
      if (crash) b.crashHints = used + 1;
      else b.hints[b.task] = used + 1;
      hintCursor = used;
      showHint(used);
      G.save();
      G.report();
    } else {
      if (crash) hintCursor = (hintCursor + 1) % 3;
      showHint(hintCursor);
    }
    updateHint();
  }

  // ---------- Проверка заказов ----------
  function check() {
    const b = state();
    if (!active || crash || b.final || b.task < 0) return;
    const t = tasks[b.task];
    if (!b.done[b.task]) {
      const r = t.check(b) || {};
      badId = r.ok || !r.near ? null : (r.bad ?? null);
      if (r.ok) return completeTask(b.task);
      if (r.near && r.near !== lastNear) {
        lastNear = r.near;
        mode = 'near';
        G.botSay(r.near, 'warn');
      } else if (!r.near && mode === 'near') {
        lastNear = '';
        mode = 'task';
        shownStep = '';
        if (!b.hints[b.task]) G.botSay('Теперь всё в порядке. Что нажать дальше, подсвечено жёлтым.');
      }
      return;
    }
    const bonus = bonuses[b.bonusIdx];
    if (bonus && mode === 'bonus' && bonus.check(b)) {
      b.bonusIdx++;
      b.bonusDone++;
      G.addStars(1);
      G.save();
      G.report();
      G.toast('⭐ Доп. правка сделана! +1');
      offerBonus();
    }
  }

  function completeTask(i) {
    const b = state();
    const t = tasks[i];
    b.done[i] = true;
    const stars = Math.max(1, 3 - Math.min(2, b.hints[i] || 0));
    G.addStars(stars);
    G.save();
    G.report();
    clearNudge();
    lastNear = '';
    renderTopbar();
    updateHint();
    G.toast(`✅ Заказ выполнен! +${stars} ⭐`);
    G.burst(18);
    G.customerSay(t.doneSay, { mood: 'happy', autoHide: 5000 });
    afterDone();
    G.renderHTML();
    paintPanel();
    maybeFinal();
  }

  function maybeFinal() {
    const b = state();
    if (b.final || !b.crashDone || tasks.some((_, i) => !b.done[i])) return;
    setTimeout(showFinal, 1200);
  }

  // Без преподавателя авария случается сама: после второго заказа.
  function soloNext() {
    const b = state();
    if (b.task === 1 && !b.crashDone) return startCrash();
    if (b.task + 1 < tasks.length) setTask(b.task + 1);
  }

  function nextActions() {
    const b = state();
    return G.isSolo() && b.task + 1 < tasks.length ? [{ label: 'Следующий заказ →', primary: true, onClick: soloNext }] : [];
  }

  function afterDone() {
    const b = state();
    const t = tasks[b.task];
    const actions = nextActions();
    if (bonuses[b.bonusIdx]) actions.push({ label: '⭐ Взять доп. правку', onClick: offerBonus });
    const wait = G.isSolo() ? '' : '<br><br>⏳ Ждём остальных. Хочешь ещё звёзд? Возьми доп. правку!';
    mode = 'done';
    G.botSay(`🎉 ${t.learn}${wait}`, 'good', actions);
  }

  function offerBonus() {
    const b = state();
    const bonus = bonuses[b.bonusIdx];
    const actions = nextActions();
    if (!bonus) {
      mode = 'done';
      G.botSay('Все доп. правки сделаны! 🔥 Можешь добавлять любые товары и смотреть, как меняется сайт.', 'good', actions);
      updateHint();
      return;
    }
    mode = 'bonus';
    G.botSay(`<span class="bonus-tag">доп. правка</span>${bonus.say}`, '', actions);
    updateHint();
    check();
    paintPanel();
  }

  // ---------- Переход между заказами ----------
  function setLock(on) {
    const lock = $('#editorLock');
    lock.classList.toggle('off', !on);
  }

  function summon() {
    const t = tasks[state().task];
    if (t) G.customerSay(t.say, { mood: t.mood, actions: [{ label: 'Понял(а), делаю! 👍', onClick: G.customerLeave }] });
  }

  function setTask(n, { quiet = false, force = false } = {}) {
    const b = state();
    n = Math.min(n, tasks.length - 1);
    const isNew = n !== b.task || force;
    b.task = n;
    G.save();
    G.report();
    renderTopbar();
    lastNear = '';
    badId = null;
    shownStep = '';
    if (n < 0) {
      setLock(true);
      G.customerLeave();
      G.botSay('Сейчас будет самое интересное: заглянем за кулисы сайта! Я буду подсказывать, а думать будешь ты 😉');
      updateHint();
      return;
    }
    setLock(false);
    const t = tasks[n];
    if (b.done[n]) {
      afterDone();
      if (isNew && !quiet && !crash) G.customerSay(t.say, { mood: 'happy', autoHide: 4000 });
      updateHint();
      return;
    }
    if (crash) return updateHint();
    mode = 'task';
    G.botSay('Новый заказ от шефа! То, что нужно нажать, светится жёлтым. Не знаешь, что делать? Жми <b>💡 Что делать?</b>');
    updateHint();
    if (isNew && !quiet) summon();
    armNudge();
    check();
    G.renderHTML();
    paintPanel();
    if (tasks[n].id === 'order') showGlowCard();
  }

  function showFinal() {
    const b = state();
    if (b.final) return;
    b.final = true;
    G.save();
    G.report();
    renderTopbar();
    updateHint();
    setLock(false);
    G.burst(60);
    G.customerSay(FG.bFinalSay, { mood: 'happy', actions: [{ label: 'Получить сертификат 🎓', onClick: G.openCert }] });
    G.botSay('Теперь ты знаешь оба мира: <b>фронтенд</b> — то, что видит клиент, и <b>бэкенд</b> — то, что работает за кулисами. Сегодня ты сделал(а) и то и другое сам(а)! 🚀', 'good', [
      { label: '🎓 Сертификат', primary: true, onClick: G.openCert },
    ]);
  }

  // ---------- Верхняя панель ----------
  function renderTopbar() {
    const b = state();
    $('#starCount').textContent = G.S.stars;
    const dots = tasks.map((t, i) => `<span class="${b.done[i] ? 'done' : i === b.task ? 'current' : ''}" title="${t.title}">${b.done[i] ? '✓' : i + 1}</span>`);
    dots.push(`<span class="${b.crashDone ? 'done' : crash ? 'alarm' : ''}" title="Авария">${b.crashDone ? '✓' : '🚨'}</span>`);
    $('#steps').innerHTML = dots.join('');
    const t = tasks[b.task];
    const label = $('#orderLabel');
    const text = $('#orderText');
    const card = $('#orderCard');
    card.classList.toggle('alarm', crash);
    if (crash) {
      label.textContent = '🚨 Авария';
      text.textContent = FG.bCrash.short;
    } else if (b.final) {
      label.textContent = 'Готово';
      text.textContent = 'Шеф доволен! 🎉';
    } else if (!t) {
      label.textContent = 'Этап 2';
      text.textContent = 'Бэкенд: скоро придёт шеф';
    } else {
      label.textContent = `Этап 2 · заказ ${b.task + 1} из ${tasks.length}`;
      text.textContent = b.done[b.task] ? `✓ ${t.short}` : t.short;
    }
    card.classList.toggle('done', !crash && (Boolean(t && b.done[b.task]) || b.final));
  }

  function orderClick() {
    const b = state();
    if (crash) return say();
    if (b.final) return G.openCert();
    if (b.task >= 0) summon();
  }

  // ---------- Вход и выход ----------
  function enter() {
    if (active) return;
    active = true;
    G.fixTypo();
    ensure();
    setupCode();
    renderShelf();
    $('#app').classList.add('stage2');
    G.closeCert();
    G.setChef(true);
    G.editorLock(false);
    $('#lockTitle').textContent = 'Ждём шефа…';
    $('#lockText').textContent = 'Сайт уже красивый, но кто хранит товары и принимает заказы? Этим занимается бэкенд. Скоро сам(а) всё увидишь.';
    $('#bUndo').disabled = true;
    undoStack = [];
    closeForm();
    showTab('products');
    codeEd.setSilently('py', FG.serverCode(state().products));
    renderList();
    renderOrders();
    renderLog();
    lastTask = undefined;
    lastPhase = undefined;
    G.renderHTML();
    setTask(state().task, { quiet: true });
    if (state().final) {
      setLock(false);
      G.botSay('Этап пройден! Можешь добавлять товары и смотреть, как меняется сайт.', 'good', [{ label: '🎓 Сертификат', primary: true, onClick: G.openCert }]);
    }
  }

  function exit() {
    if (!active) return;
    if (crash) stopCrash();
    active = false;
    closeForm();
    clearNudge();
    $('#app').classList.remove('stage2');
    $('#lockTitle').textContent = 'Ждём заказчика…';
    G.setChef(false);
    G.doc()?.getElementById('b-css')?.remove();
    G.renderHTML();
  }

  // Команды от пульта преподавателя.
  function apply(st) {
    enter();
    const b = state();
    if (st.crash && !b.crashDone && !b.final && !crash) startCrash();
    if (!st.crash && crash) {
      stopCrash();
      b.crashStarted = false;
      b.crashFixedCode = '';
      b.crashCodeNow = '';
      codeEd.setSilently('py', FG.serverCode(b.products));
      log('info', '* Сервер подняли');
      G.toast('Сервер снова работает');
      G.renderHTML();
      renderList();
      mode = 'task';
      setTask(b.task, { quiet: true });
    }
    if (st.task !== lastTask || st.phase !== lastPhase) {
      lastTask = st.task;
      lastPhase = st.phase;
      if (st.phase === 'final') {
        if (!b.final) showFinal();
      } else if (!b.final) {
        setTask(st.phase === 'lobby' ? -1 : st.task);
      }
    }
    // «Подсказка всем» от преподавателя
    if (st.hintAll > 0 && !b.final) {
      if (crash && st.hintAll > b.crashHints) {
        b.crashHints = st.hintAll;
        showHint(st.hintAll - 1);
      } else if (!crash && b.task >= 0 && !b.done[b.task] && st.hintAll > (b.hints[b.task] || 0)) {
        b.hints[b.task] = st.hintAll;
        showHint(st.hintAll - 1);
      } else return;
      G.save();
      G.report();
      updateHint();
    }
  }

  return {
    get active() {
      return active;
    },
    enter,
    exit,
    apply,
    hint,
    updateHint,
    renderTopbar,
    orderClick,
    paintSite,
    siteClick,
    soloStart: () => setTask(0),
    onSolo() {
      const b = state();
      if (b.task >= 0 && b.done[b.task] && !crash) afterDone();
    },
  };
};
