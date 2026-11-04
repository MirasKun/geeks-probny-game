// Заказы заказчика. Каждый заказ:
//   say      — что говорит заказчик
//   hints    — три подсказки ассистента: каждая говорит, что сделать дальше
//   mark     — какой код подсвечивать: tab, block (блок CSS) и line (строка в нём) или find (строка HTML)
//   learn    — что ученик понял (ассистент говорит после выполнения)
//   check    — проверка по готовому сайту: { ok } — сделано, { near } — почти
//   answer   — шпаргалка для преподавателя (видна только в пульте)

window.FG = window.FG || {};

FG.colorUtil = {
  rgb(str) {
    const m = String(str).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/);
    if (!m) return null;
    let a = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (String(m[4]).endsWith('%')) a /= 100;
    return { r: +m[1], g: +m[2], b: +m[3], a };
  },
  hsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    return { h, s, l };
  },
  same(a, b) {
    return a && b && a.r === b.r && a.g === b.g && a.b === b.b;
  },
};

FG.tasks = [
  {
    id: 'button',
    title: 'Оранжевая кнопка',
    short: 'Сделать кнопку «Заказать» оранжевой',
    tab: 'css',
    mood: 'neutral',
    say: 'Привет! Я хозяин бургерной «Burger Bro». Мне сделали сайт, но он какой-то скучный… Начнём с кнопки «Заказать»: она серая, как понедельник. Сделай её ОРАНЖЕВОЙ, как сыр в чизбургере! 🧀',
    doneSay: 'Вот это да! Кнопка — огонь! 🔥 Сразу хочется нажать!',
    hints: [
      'Кнопка серая, потому что в жёлтой строчке написано <code>gray</code>. Замени это слово на <code>orange</code>. Я уже выделил его: просто нажми оранжевый кружок <b>orange</b> под кодом.',
      'Нажми кружок <b>orange</b> в палитре под кодом. Можно и написать <code>orange</code> с клавиатуры, но раскладка должна быть английской.',
      'Жёлтая строчка должна стать такой: <code>background: orange;</code><br>Как только она станет такой, кнопка на сайте слева станет оранжевой и заказ засчитается.',
    ],
    mark: { tab: 'css', block: '.order-btn', line: /^\s*background\s*:/, wrong: 'Эта строчка пока неправильная. Здесь должно быть слово <code>orange</code>: нажми оранжевый кружок под кодом.' },
    learn: 'Ты изменил(а) <b>значение</b> свойства <code>background</code>. Это <b>CSS</b> — «одежда» сайта: цвета, размеры, шрифты. Фронтендеры каждый день меняют такие строчки.',
    answer: 'CSS → .order-btn → background: orange;',
    check(doc, u) {
      const el = doc.querySelector('.order-btn');
      if (!el) return { near: 'Ой, кнопка пропала из HTML! Нажми <b>↶ Отменить</b>, чтобы вернуть её.' };
      const c = u.rgb(u.css(el).backgroundColor);
      if (!c || c.a === 0) return { near: 'У кнопки сейчас нет цвета фона. Нужно слово-цвет после <code>background:</code>' };
      if (c.r === 128 && c.g === 128 && c.b === 128) return {};
      const { h, s, l } = u.hsl(c);
      if (h >= 14 && h <= 48 && s >= 0.45 && l >= 0.3 && l <= 0.8) return { ok: true };
      if (s < 0.2) return { near: 'Цвет поменялся, но он всё ещё серо-скучный. Заказчик хочет <b>оранжевый</b>!' };
      if (h < 14 || h > 330) return { near: 'Хм, это больше похоже на <b>красный</b>. Заказчику нужен оранжевый, как сыр 🧀' };
      if (h > 48 && h < 75) return { near: 'Это скорее <b>жёлтый</b>. Чуть-чуть порыжее!' };
      if (l < 0.3) return { near: 'Слишком тёмный. Попробуй светлее, например <code>orange</code>.' };
      if (l > 0.8) return { near: 'Слишком бледный. Попробуй ярче, например <code>orange</code>.' };
      return { near: 'Красиво, но это не оранжевый 😅 Попробуй <code>orange</code> из палитры.' };
    },
  },
  {
    id: 'bug',
    title: 'Баг! Пропали кнопки',
    short: 'Вернуть кнопки «В корзину»',
    tab: 'css',
    mood: 'angry',
    say: 'КАРАУЛ!!! 😱 Клиенты пишут, что не могут ничего купить! У карточек с едой пропали кнопки «В корзину»! Это баг! Спаси мой бизнес!',
    doneSay: 'УРА! Заказы снова пошли! Ты гений! 🎉',
    hints: [
      'Кнопок не видно, потому что в жёлтой строчке написано <code>none</code> («не показывать»). Замени его на <code>block</code> («показывать»). Слово уже выделено: просто нажми кнопку <b>block</b> под кодом.',
      'Нажми кнопку <b>block</b> под кодом, рядом с <b>px</b> и <b>none</b>. Можно и написать <code>block</code> с клавиатуры, но раскладка должна быть английской.',
      'Жёлтая строчка должна стать такой: <code>display: block;</code><br>Как только она станет такой, на всех карточках слева появятся кнопки «В корзину».',
    ],
    mark: { tab: 'css', block: '.add-btn', line: /^\s*display\s*:/, wrong: 'Эта строчка пока неправильная. Здесь должно быть слово <code>block</code>: нажми кнопку <b>block</b> под кодом.' },
    learn: 'Ты нашёл(ла) и починил(а) <b>баг</b> — ошибку в коде. Искать и чинить баги — большая часть работы любого программиста.',
    answer: 'CSS → .add-btn → удалить display: none; (или display: block;)',
    check(doc, u) {
      const els = [...doc.querySelectorAll('.add-btn')];
      if (!els.length) return { near: 'Кнопки «В корзину» пропали ещё и из HTML! Нажми <b>↶ Отменить</b> во вкладке HTML.' };
      const visible = els.filter((el) => u.css(el).display !== 'none' && u.css(el).visibility !== 'hidden');
      if (visible.length === els.length) return { ok: true };
      if (visible.length) return { near: 'Часть кнопок вернулась, но не все. Проверь каждую карточку.' };
      return {};
    },
  },
  {
    id: 'bg',
    title: 'Свой дизайн',
    short: 'Выбрать цвет фона сайта',
    tab: 'css',
    mood: 'neutral',
    say: 'Последняя просьба! Белый фон какой-то пустой… Выбери цвет фона для всего сайта НА СВОЙ ВКУС. Ты же дизайнер — я тебе доверяю! 🎨',
    doneSay: '',
    hints: [
      'Фон сайта белый, потому что в жёлтой строчке написано <code>white</code>. Замени это слово на любой цвет. Я уже выделил его: просто нажми любой цветной кружок под кодом.',
      'Нажми любой кружок в палитре под кодом. Подойдёт любой цвет, кроме белого, выбирай на свой вкус.',
      'Жёлтая строчка должна стать, например, такой: <code>background: gold;</code><br>Как только цвет поменяется, сайт слева перекрасится и заказ засчитается.',
    ],
    mark: { tab: 'css', block: 'body', line: /^\s*background\s*:/, wrong: 'Браузер не понял этот цвет. Нажми любой цветной кружок под кодом, и строчка исправится сама.' },
    learn: 'Ты сам(а) выбрал(а) дизайн. Фронтенд-разработчик — это и программист, и немного художник.',
    answer: 'CSS → body → background: любой цвет, кроме white',
    check(doc, u) {
      const c = u.rgb(u.css(doc.body).backgroundColor);
      if (!c || c.a === 0) return {};
      if (c.r === 255 && c.g === 255 && c.b === 255) return {};
      return { ok: true };
    },
  },
];

// Доп. правки для тех, кто сделал заказ раньше остальных.
FG.bonuses = [
  {
    say: 'Ой, в большом заголовке написано «бугреры» вместо «бургеры»! Исправь, пожалуйста 😳',
    hint: 'В жёлтой строчке поменяй местами две буквы: вместо «бу<b>гр</b>еры» должно быть «бу<b>рг</b>еры». Теги <code>&lt;h1&gt;</code> вокруг текста не трогай.',
    mark: { tab: 'html', find: /<h1/ },
    check(doc) {
      const t = (doc.querySelector('h1')?.textContent || '').toLowerCase();
      return t.includes('бургер') && !t.includes('бугрер');
    },
  },
  {
    say: 'Заголовок мелковат: бабушка не видит 👵 Сделай его крупнее!',
    hint: 'В жёлтой строчке поменяй число <code>18</code> на <code>48</code>. Буквы <code>px</code> оставь.',
    mark: { tab: 'css', block: '.title', line: /font-size/ },
    check(doc, u) {
      const el = doc.querySelector('.title') || doc.querySelector('h1');
      const fs = el ? parseFloat(u.css(el).fontSize) : 0;
      return fs >= 36 && fs <= 120;
    },
  },
  {
    say: 'Закругли углы у карточек с едой — сейчас они острые, можно порезаться 😄',
    hint: 'В жёлтой строчке поменяй <code>0px</code> на <code>20px</code>.',
    mark: { tab: 'css', block: '.card', line: /border-radius/ },
    check(doc, u) {
      const el = doc.querySelector('.card');
      return el && parseFloat(u.css(el).borderTopLeftRadius) >= 8;
    },
  },
  {
    say: 'Поменяй цвет цен на карточках. Хочу, чтобы цены выделялись по-другому!',
    hint: 'Кликни два раза по цвету в жёлтой строчке и нажми любой кружок в палитре под кодом.',
    mark: { tab: 'css', block: '.price', line: /^\s*color\s*:/ },
    check(doc, u) {
      const el = doc.querySelector('.price');
      return el && !FG.colorUtil.same(u.rgb(u.css(el).color), { r: 232, g: 69, b: 44 });
    },
  },
  {
    say: 'Покрась шапку сайта (полоску сверху с логотипом) в другой цвет.',
    hint: 'Кликни два раза по цвету в жёлтой строчке и нажми любой кружок в палитре под кодом.',
    mark: { tab: 'css', block: '.header', line: /^\s*background\s*:/ },
    check(doc, u) {
      const el = doc.querySelector('.header');
      return el && !FG.colorUtil.same(u.rgb(u.css(el).backgroundColor), { r: 43, g: 33, b: 24 });
    },
  },
  {
    say: 'Сделай ещё одну карточку с новым блюдом! Например, 🌯 шаурму.',
    hint: 'Выдели мышкой целую карточку: от <code>&lt;div class="card"&gt;</code> до её <code>&lt;/div&gt;</code>. Нажми Ctrl+C, поставь курсор ниже и нажми Ctrl+V. Потом поменяй название и цену.',
    mark: { tab: 'html', find: /class="cards"/ },
    check(doc) {
      return doc.querySelectorAll('.card').length >= 4;
    },
  },
];

FG.finalSay = 'О, НАКОНЕЦ-ТО! Мне нравится, как выглядит сайт! 😍 Теперь у «Burger Bro» лучший сайт в городе. Ты настоящий фронтенд-разработчик. Но сайт — это только то, что видит гость. Скоро покажу тебе кухню!';
