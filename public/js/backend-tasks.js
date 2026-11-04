// Этап 2 «Бэкенд»: задания шефа, картинки на полке и учебный server.py.
// Настоящий сервер здесь не запускается: код проверяется как текст, ученик ничего не сломает.

window.FG = window.FG || {};

(() => {
  const low = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
  const find = (b, word) => b.products.find((p) => low(p.name).includes(word));
  const isPizzaName = (s) => low(s).includes('пицц') || low(s).includes('pizza');
  const isPizza = (p) => isPizzaName(p.name);
  const SAVE = '#bForm button[type=submit]';
  const openTab = (name, title) => ({ text: `Открой вкладку <b>${title}</b> вверху панели.`, glow: [`[data-btab=${name}]`] });
  const editBtn = (p) => `[data-pid="${p.id}"] [data-act=edit]`;

  // ---------- Картинки на полке у ассистента ----------
  // Пиццы рисуем по пикселям, как и персонажей.
  function svgUrl(body, size) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${body}</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  const dot = (x, y, c, w = 1, h = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;

  function round(sauce, cheese, toppings) {
    let out = '';
    for (let y = 0; y < 17; y++) {
      for (let x = 0; x < 17; x++) {
        const d = Math.hypot(x - 8, y - 8);
        if (d > 8.4) continue;
        out += dot(x, y, d > 7.4 ? '#a9682a' : d > 6.4 ? '#d99a4e' : d > 5.8 ? sauce : cheese);
      }
    }
    return svgUrl(out + toppings.map((t) => dot(...t)).join(''), 17);
  }

  function slice() {
    let out = '';
    for (let y = 1; y < 16; y++) {
      const half = Math.round((16 - y) / 2.1);
      for (let x = 8 - half; x <= 8 + half; x++) {
        const edge = Math.abs(x - 8) === half;
        out += dot(x, y, y < 3 ? '#a9682a' : edge ? '#e8a93f' : '#ffd35a');
      }
    }
    return svgUrl(out + [[6, 5, '#d8382a', 2, 2], [10, 6, '#d8382a', 2, 2], [8, 9, '#d8382a', 2, 2]].map((t) => dot(...t)).join(''), 17);
  }

  const RED = '#d8382a';
  const GREEN = '#3e9b3a';
  const BROWN = '#8b6a4a';
  const BEIGE = '#e8d5b5';
  const BLACK = '#2b2118';

  FG.bPics = [
    {
      id: 'pepperoni',
      label: 'Пепперони',
      pizza: true,
      url: round(RED, '#ffd35a', [[5, 4, RED, 2, 2], [10, 4, RED, 2, 2], [3, 8, RED, 2, 2], [8, 7, RED, 2, 2], [12, 8, RED, 2, 2], [5, 11, RED, 2, 2], [10, 11, RED, 2, 2]]),
    },
    {
      id: 'margherita',
      label: 'Маргарита',
      pizza: true,
      url: round(RED, '#fff0b8', [[6, 5, RED, 2, 1], [11, 6, RED, 1, 2], [4, 9, RED, 2, 1], [9, 10, RED, 2, 1], [8, 4, GREEN, 1, 2], [5, 7, GREEN, 2, 1], [11, 9, GREEN, 1, 2], [7, 12, GREEN, 2, 1]]),
    },
    {
      id: 'mushroom',
      label: 'С грибами',
      pizza: true,
      url: round('#c9402f', '#ffcf6b', [[5, 5, BEIGE, 2, 2], [6, 7, BROWN], [10, 5, BEIGE, 2, 2], [11, 7, BROWN], [4, 10, BEIGE, 2, 2], [5, 12, BROWN], [10, 10, BEIGE, 2, 2], [11, 12, BROWN], [8, 8, BLACK], [7, 3, BLACK], [13, 8, BLACK]]),
    },
    { id: 'slice', label: 'Кусочек', pizza: true, url: slice() },
    { id: '🌭', label: 'Хот-дог' },
    { id: '🥗', label: 'Салат' },
    { id: '👟', label: 'Кроссовок' },
  ];

  // Картинка товара: либо нарисованная, либо эмодзи.
  FG.bPicHtml = (id) => {
    const pic = FG.bPics.find((p) => p.id === id && p.url);
    if (pic) return `<img src="${pic.url}" alt="${pic.label}" style="width:1em;height:1em;image-rendering:pixelated;display:inline-block;vertical-align:middle">`;
    return id || '🍽️';
  };

  // ---------- Что продаём в начале ----------
  FG.bDefaults = () => [
    { id: 1, name: 'Чизбургер', price: 290, pic: '🍔', stock: true },
    { id: 2, name: 'Картошка фри', price: 120, pic: '🍟', stock: true },
    { id: 3, name: 'Лимонад', price: 90, pic: '🥤', stock: true },
  ];

  // ---------- Заказы шефа ----------
  FG.bTasks = [
    {
      id: 'pizza',
      title: 'Новый товар: пицца',
      short: 'Добавить пиццу за 450 сом',
      mood: 'happy',
      say: 'Слушай, мама научила меня готовить ПИЦЦУ! 🍕 Хочу продавать её за 450 сом. В код сайта лезть не надо: для этого есть панель управления. Добавь новый товар!',
      doneSay: 'Вот она, красавица! 🍕 И никакого кода не понадобилось!',
      // next — что ученику сделать прямо сейчас: текст подсказки и что подсветить на панели.
      next(b, c) {
        if (c.tab !== 'products') return openTab('products', '🛒 Товары');
        const p = b.products.find(isPizza);
        if (!c.form) {
          if (p) return { text: 'В пицце что-то не так. Нажми ✏️ в её строчке и исправь.', glow: [editBtn(p)] };
          return { text: 'Нажми жёлтую кнопку <b>➕ Добавить товар</b>. Откроется форма для нового товара.', glow: ['#bAdd'] };
        }
        if (!isPizzaName(c.form.name)) return { text: 'В поле <b>Название</b> напиши слово Пицца. <button class="b-fill" data-fill="Пицца" type="button">Вставить слово «Пицца»</button>', glow: ['#bName'] };
        if (Number(c.form.price) !== 450) return { text: 'В поле <b>Цена</b> напиши число <b>450</b>.', glow: ['#bPrice'] };
        if (!FG.bPics.find((x) => x.id === c.form.pic)?.pizza) return { text: 'Теперь картинка: возьми мышкой пиццу на полке внизу и перетащи её на квадрат в форме.', glow: ['#bDrop'] };
        return { text: 'Всё заполнено! Нажми <b>Сохранить</b>, и пицца появится на сайте слева.', glow: [SAVE] };
      },
      learn: 'Товар появился на сайте без единой строчки HTML! Панель отправила <b>запрос</b>, а сервер сохранил пиццу в <b>базу данных</b>. Загляни во вкладку <b>🐍 server.py</b>: твоя пицца теперь там.',
      answer: 'Товары → ➕ → «Пицца», 450, перетащить картинку → Сохранить',
      check(b) {
        const p = b.products.find(isPizza);
        if (!p) return {};
        if (Number(p.price) !== 450) return { bad: p.id, near: `Пицца есть, но цена ${p.price} сом. Шеф просил <b>450</b>. Нажми ✏️ у пиццы и поправь.` };
        const pic = FG.bPics.find((x) => x.id === p.pic);
        if (!p.pic) return { bad: p.id, near: 'Пицца без картинки! Клиент не поймёт, что это. Нажми ✏️ и перетащи картинку с полки.' };
        if (!pic || !pic.pizza) return { bad: p.id, near: 'На этой картинке точно не пицца 😂 Нажми ✏️ и выбери картинку с пиццей.' };
        return { ok: true };
      },
    },
    {
      id: 'price',
      title: 'Новая цена',
      short: 'Лимонад теперь 120 сом',
      mood: 'neutral',
      say: 'Поставщик поднял цены 😤 Лимонад теперь стоит 120 сом, а не 90. Поменяй цену, пока я не разорился!',
      doneSay: 'Отлично! Цена сразу обновилась у всех клиентов.',
      next(b, c) {
        if (c.tab !== 'products') return openTab('products', '🛒 Товары');
        const p = find(b, 'лимонад');
        if (!p) return { text: 'Лимонад пропал из списка. Нажми <b>↶ Отменить</b>, чтобы вернуть его.', glow: ['#bUndo'] };
        if (!c.form) return { text: 'Найди строчку <b>Лимонад</b> и нажми в ней ✏️. Откроется форма этого товара.', glow: [editBtn(p)] };
        if (c.form.id !== p.id) return { text: 'Это форма другого товара. Нажми <b>Отмена</b>, а потом ✏️ в строчке Лимонад.', glow: ['#bCancel'] };
        if (Number(c.form.price) !== 120) return { text: 'В поле <b>Цена</b> сотри 90 и напиши <b>120</b>.', glow: ['#bPrice'] };
        return { text: 'Цена верная! Нажми <b>Сохранить</b>.', glow: [SAVE] };
      },
      learn: 'Цена лежит в одном месте — в <b>базе данных</b>. Поменял(а) один раз, и все клиенты сразу видят новую цену. Представь, если бы её пришлось менять в коде на каждой странице!',
      answer: 'Товары → ✏️ у Лимонада → цена 120 → Сохранить',
      check(b) {
        const p = find(b, 'лимонад');
        if (!p) return { near: 'Ой, Лимонад пропал из списка! Нажми <b>↶ Отменить</b>, чтобы вернуть его.' };
        if (Number(p.price) === 120) return { ok: true };
        if (Number(p.price) !== 90) return { bad: p.id, near: `Сейчас Лимонад стоит ${p.price} сом. Шеф сказал <b>120</b>.` };
        return {};
      },
    },
    {
      id: 'order',
      title: 'Первый заказ',
      short: 'Заказать пиццу и принять заказ',
      mood: 'neutral',
      say: 'Проверим, работает ли всё по-настоящему! Притворись клиентом: нажми на сайте «В корзину» у пиццы. А потом стань поваром и прими этот заказ у себя в панели.',
      doneSay: 'Заказ принят, клиент доволен! Всё работает! 🎉',
      next(b, c) {
        const fresh = b.orders.find((o) => o.task === b.task && o.status === 'new');
        if (fresh) {
          if (c.tab !== 'orders') return openTab('orders', '📥 Заказы');
          return { text: 'Заказ пришёл! Нажми <b>✅ Принять заказ</b>.', glow: ['#bOrders .b-order.new .btn'] };
        }
        const pizza = b.products.some((p) => isPizza(p) && p.stock);
        return { text: `На сайте слева нажми <b>В корзину</b> у ${pizza ? 'пиццы' : 'любого товара'}. Нужная карточка светится жёлтым, а если её не видно, прокрути сайт вниз.`, glow: [] };
      },
      learn: 'Это главный путь в интернете: кнопка на сайте (<b>фронтенд</b>) отправила <b>запрос</b>, сервер (<b>бэкенд</b>) его обработал и прислал <b>ответ</b>. Так работают все магазины, соцсети и банки.',
      answer: 'Сайт → «В корзину» у пиццы → Заказы → ✅ Принять заказ',
      check(b) {
        return b.orders.some((o) => o.task === b.task && o.status === 'accepted') ? { ok: true } : {};
      },
    },
  ];

  // ---------- Авария ----------
  FG.bCrash = {
    title: 'Авария! Сервер упал',
    short: 'Найти ошибку в server.py и починить сервер',
    say: 'ААА!!! 😡 САЙТ НЕ ОТКРЫВАЕТСЯ! Клиенты звонят и кричат! Я вчера полез в server.py и что-то там поправил… Сервер упал! Чини быстрее, я теряю клиентов!',
    doneSay: 'Ты спас мой бизнес! 🙏 Обещаю: больше никогда не полезу в код!',
    hints: [
      'Сервер упал из-за одной буквы. Список товаров называется <code>products</code>, а в жёлтой строчке написано <code>product</code>, без <b>s</b>. Добавь её: курсор уже стоит в конце строчки, просто нажми кнопку <b>s</b> под кодом.',
      'Нажми кнопку <b>s</b> под кодом. Больше ничего менять не нужно.',
      'Жёлтая строчка должна стать такой: <code>return products</code><br>Как только она станет такой, сервер заработает сам. Если что-то пошло не так, нажми <b>↶ Отменить</b>.',
    ],
    learn: 'Одна буква уронила весь сервер! Ты прочитал(а) журнал, нашёл(ла) строку и исправил(а) её. Это называется <b>отладка</b>, и этим бэкенд-разработчики занимаются каждый день.',
    answer: 'server.py → в get_products: return products (добавить букву s)',
  };

  // Доп. правки для тех, кто сделал заказ раньше остальных.
  FG.bBonuses = [
    {
      say: 'Беда! Картошка кончилась 🍟 Только не удаляй её: завтра привезут. Просто сними с продажи.',
      hint: 'В строчке <b>Картошка фри</b> нажми на зелёный переключатель <b>В продаже</b>, чтобы он выключился.',
      glow: (b) => {
        const p = find(b, 'картошк');
        return p ? [`[data-pid="${p.id}"] .b-switch`] : [];
      },
      check: (b) => {
        const p = find(b, 'картошк');
        return Boolean(p && !p.stock);
      },
    },
    {
      say: 'Добавь в меню что-нибудь от себя: любой товар, любая цена!',
      hint: 'Нажми <b>➕ Добавить товар</b>, напиши любое название и цену, потом нажми Сохранить.',
      glow: () => ['#bAdd'],
      check: (b) => b.products.length >= 5,
    },
    {
      say: 'Сегодня акция! Сделай Чизбургер за 250 сом.',
      hint: 'Нажми ✏️ в строчке Чизбургер, в поле Цена напиши <b>250</b> и нажми Сохранить.',
      glow: (b) => {
        const p = find(b, 'чизбургер');
        return p ? [editBtn(p)] : [];
      },
      check: (b) => Number((find(b, 'чизбургер') || {}).price) === 250,
    },
    {
      say: 'Наш лимонад особенный. Переименуй его в «Домашний лимонад».',
      hint: 'Нажми ✏️ в строчке Лимонад, в поле Название напиши «Домашний лимонад» и нажми Сохранить.',
      glow: (b) => {
        const p = find(b, 'лимонад');
        return p ? [editBtn(p)] : [];
      },
      check: (b) => low((find(b, 'лимонад') || {}).name).includes('домашн'),
    },
  ];

  FG.bFinalSay = 'Вот это команда! Сайт красивый, товары на месте, заказы идут, сервер работает. У «Burger Bro» теперь свой разработчик. Это ты! Держи сертификат! 🎓';

  // ---------- Учебный server.py ----------
  const pyProduct = (p) => `    {"name": ${JSON.stringify(p.name)}, "price": ${p.price}, "stock": ${p.stock ? 'True' : 'False'}},`;

  FG.serverCode = (products) =>
    `# server.py — кухня сайта Burger Bro 🍳
# Этот код гости не видят, он работает на сервере.

# Список всех товаров. Он называется products:
products = [
${products.map(pyProduct).join('\n')}
]

# Сайт спрашивает: «Какие у вас есть товары?»
# Сервер отвечает и отдаёт список products:
def get_products():
    return products
`;

  const GOOD_LINE = '    return products';
  const BAD_LINE = '    return product';

  FG.serverBug = (code) => code.replace(`${GOOD_LINE}\n`, `${BAD_LINE}\n`);
  FG.serverBugLine = BAD_LINE;
  FG.serverFixLine = (fixed) => fixed.split('\n').indexOf(GOOD_LINE);

  // Проверяем код как текст и пишем ошибку так, как её написал бы Python.
  FG.checkServerCode = (text, fixed) => {
    const a = text.split('\n').map((l) => l.trimEnd());
    const b = fixed.split('\n').map((l) => l.trimEnd());
    const line = b.indexOf(GOOD_LINE);
    const crash = (at, source, error) => ({ line: at, source: source.trim(), error });
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] === b[i]) continue;
      if (i !== line) {
        return {
          ...crash(i, a[i] || '', 'SyntaxError: invalid syntax'),
          near: `Ошибка уже в другой строке (${i + 1}): похоже, её случайно изменили. Нажми <b>↶ Отменить</b>, чтобы вернуть как было.`,
        };
      }
      const src = a[i] || '';
      if (/[а-яё]/i.test(src)) {
        return {
          ...crash(i, src, 'SyntaxError: invalid syntax'),
          near: 'В строчке появились русские буквы: компьютер их тут не поймёт. Нажми <b>↶ Отменить</b>, а потом кнопку <b>s</b> под кодом.',
        };
      }
      const word = src.trim().match(/^return\s+(\w+)$/);
      if (word && word[1] === 'products') {
        if (src.replace(/\s+/g, ' ').trim() === GOOD_LINE.trim() && /^ {4}\S/.test(src)) continue;
        return {
          ...crash(i, src, 'IndentationError: unexpected indent'),
          near: 'Слово уже правильное! Но в Python важны пробелы в начале строки: нужно ровно <b>4 пробела</b>, как было.',
        };
      }
      if (word) {
        const hint = word[1].startsWith('prod') ? ` Did you mean: 'products'?` : '';
        return crash(i, src, `NameError: name '${word[1]}' is not defined.${hint}`);
      }
      return { ...crash(i, src, 'SyntaxError: invalid syntax'), near: 'В этой строке должно быть <code>return products</code>.' };
    }
    return { ok: true };
  };
})();
