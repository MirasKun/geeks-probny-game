// Заказы заказчика. Каждый заказ:
//   say      — что говорит заказчик
//   hints    — три подсказки ассистента: от намёка к готовому ответу
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
      'Сначала найдём кнопку. Нажми <b>🔍 Лупа</b> вверху редактора и наведи мышку на кнопку «Заказать» на сайте. Кликни по ней — увидишь, где она в коде.',
      'Кнопку в CSS зовут <code>.order-btn</code>. В её блоке есть строчка <code>background: gray;</code> — это цвет фона кнопки. <code>gray</code> по-английски «серый».',
      'Дважды кликни по слову <code>gray</code>, чтобы его выделить, и нажми на <b>оранжевый кружок</b> в палитре внизу. Или просто напиши <code>orange</code>.',
    ],
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
    id: 'typo',
    title: 'Опечатка',
    short: 'Исправить опечатку в заголовке',
    tab: 'html',
    mood: 'shy',
    say: 'Слушай, тут неловко вышло… В большом заголовке написано «бугреры» вместо «бургеры»! Люди смеются 😳 Исправь, пожалуйста!',
    doneSay: 'Фух, спасибо! Теперь всё грамотно, не стыдно показать маме.',
    hints: [
      'Тексты на сайте живут не в CSS, а в <b>HTML</b>. Открой вкладку <b>HTML</b> вверху редактора.',
      'Найди строчку <code>&lt;h1 class="title"&gt;</code> — это заголовок. Текст между <code>&lt;h1&gt;</code> и <code>&lt;/h1&gt;</code> показывается на сайте.',
      'Там написано «бу<b>гр</b>еры». Поменяй две буквы местами, чтобы стало «бу<b>рг</b>еры». Только не трогай <code>&lt;h1&gt;</code> и <code>&lt;/h1&gt;</code>.',
    ],
    learn: '<b>HTML</b> — это «скелет» сайта: тексты, кнопки, картинки. Теги вроде <code>&lt;h1&gt;…&lt;/h1&gt;</code> — как коробочки, в которые кладут содержимое.',
    answer: 'HTML → <h1 class="title">Самые сочные бургеры в городе</h1>',
    check(doc) {
      const el = doc.querySelector('h1');
      if (!el) return { near: 'Ой, заголовок пропал! Скорее всего, случайно стёрся тег <code>&lt;h1&gt;</code>. Нажми <b>↶ Отменить</b>.' };
      const t = el.textContent.toLowerCase().replace(/ё/g, 'е');
      if (t.includes('бургер') && !t.includes('бугрер')) return { ok: true };
      if (!t.includes('бугрер')) return { near: `Сейчас в заголовке: «${el.textContent.trim().slice(0, 60)}». Нужно, чтобы там было слово <b>«бургеры»</b>.` };
      return {};
    },
  },
  {
    id: 'size',
    title: 'Крупный заголовок',
    short: 'Сделать заголовок крупнее',
    tab: 'css',
    mood: 'neutral',
    say: 'Моя бабушка открыла сайт и говорит: «Ничего не вижу, внучок!» 👵 Заголовок слишком мелкий. Сделай его ПОКРУПНЕЕ!',
    doneSay: 'Бабушка видит! Бабушка довольна! 👵❤️',
    hints: [
      'Размер текста в CSS называется <code>font-size</code> — по-английски «размер шрифта». Найди его у заголовка.',
      'Заголовок в CSS зовут <code>.title</code> (можно найти лупой 🔍). Там стоит <code>font-size: 18px;</code>. <b>px</b> — пиксели, крошечные точки экрана.',
      'Поменяй число <code>18</code> на побольше, например <code>48</code>. Буквы <code>px</code> оставь.',
    ],
    learn: 'Числа с <code>px</code> — так фронтендеры задают размеры всего на сайте: текста, отступов, кнопок, картинок.',
    answer: 'CSS → .title → font-size: 48px;',
    check(doc, u) {
      const el = doc.querySelector('.title') || doc.querySelector('h1');
      if (!el) return { near: 'Заголовок пропал из HTML. Нажми <b>↶ Отменить</b>.' };
      const fs = parseFloat(u.css(el).fontSize);
      if (fs >= 36 && fs <= 120) return { ok: true };
      if (fs > 120) return { near: 'Ого! Теперь он огромный и не помещается 😂 Чуть поменьше — например, 48px.' };
      if (fs > 18) return { near: 'Уже лучше! Но бабушка всё ещё щурится 👵 Ещё крупнее!' };
      if (fs < 18) return { near: 'Наоборот, стало ещё меньше! Нужно число <b>больше</b> 18.' };
      return {};
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
      'Кнопки есть в HTML — посмотри, там три <code>&lt;button class="add-btn"&gt;</code>. Значит, их <b>спрятали в CSS</b> 🕵️',
      'Найди в CSS блок <code>.add-btn</code>. Какая строчка там может прятать кнопку? Слово <code>none</code> по-английски значит «ничего».',
      '<code>display: none;</code> значит «не показывать». Поменяй <code>none</code> на <code>block</code> или удали эту строчку целиком.',
    ],
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
      'Цвет фона всей страницы задаётся в самом первом блоке CSS — <code>body</code>. Это «тело» сайта, вся страница целиком.',
      'В блоке <code>body</code> найди строчку <code>background: white;</code>.',
      'Поменяй <code>white</code> на любой цвет из палитры. Попробуй несколько и выбери самый красивый! Светлые цвета вроде <code>#fff3e0</code> смотрятся аккуратно.',
    ],
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
    say: 'Закругли углы у карточек с едой — сейчас они острые, можно порезаться 😄',
    hint: 'В блоке <code>.card</code> есть <code>border-radius: 0px;</code>. Поставь, например, <code>20px</code>.',
    check(doc, u) {
      const el = doc.querySelector('.card');
      return el && parseFloat(u.css(el).borderTopLeftRadius) >= 8;
    },
  },
  {
    say: 'Поменяй цвет цен на карточках. Хочу, чтобы цены выделялись по-другому!',
    hint: 'Найди блок <code>.price</code> и строчку <code>color</code>. Поменяй значение на цвет из палитры.',
    check(doc, u) {
      const el = doc.querySelector('.price');
      return el && !FG.colorUtil.same(u.rgb(u.css(el).color), { r: 232, g: 69, b: 44 });
    },
  },
  {
    say: 'Покрась шапку сайта (полоску сверху с логотипом) в другой цвет.',
    hint: 'Шапка — это <code>.header</code>. У неё есть <code>background: #2b2118;</code>. Поменяй значение на любой цвет.',
    check(doc, u) {
      const el = doc.querySelector('.header');
      return el && !FG.colorUtil.same(u.rgb(u.css(el).backgroundColor), { r: 43, g: 33, b: 24 });
    },
  },
  {
    say: 'Сделай ещё одну карточку с новым блюдом! Например, 🌯 шаурму.',
    hint: 'Во вкладке HTML скопируй целую карточку — от <code>&lt;div class="card"&gt;</code> до её <code>&lt;/div&gt;</code> — и вставь ниже. Поменяй название и цену.',
    check(doc) {
      return doc.querySelectorAll('.card').length >= 4;
    },
  },
];

FG.finalSay = 'О, НАКОНЕЦ-ТО! Мне нравится, как выглядит сайт! 😍 Теперь у «Burger Bro» лучший сайт в городе. Ты настоящий фронтенд-разработчик. Держи сертификат!';
