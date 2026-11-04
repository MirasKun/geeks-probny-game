// Пиксельные персонажи: заказчик (хозяин бургерной) и ассистент-робот «Бит».
// Рисуются из текстовых карт в SVG — без картинок, работает офлайн.

window.FG = window.FG || {};

(() => {
  const PALETTE = {
    K: '#241a14', // контур
    R: '#e5432d', // кепка
    r: '#b8321f',
    Y: '#FFE743', // фирменный жёлтый
    y: '#d9c22c',
    S: '#f5c09a', // кожа
    E: '#241a14', // глаза
    H: '#5a3520', // усы
    M: '#8a2b1c', // рот
    p: '#f28b82', // румянец
    T: '#FFE743', // футболка
    t: '#d9c22c',
    W: '#ffffff', // фартук
    w: '#dcdce6',
    P: '#2C2E35', // штаны
    B: '#111114', // ботинки
    G: '#3a3d46',
    C: '#7fe7ff', // глаза робота
  };

  const HEAD = [
    '.....KKKKKK.....',
    '....KRRRRRRK....',
    '...KRRRYYRRRK...',
    '...KRRRRRRRRK...',
    '..KKrrrrrrrrKKK.',
    '...KSSSSSSSSK...',
  ];
  const FACE = {
    neutral: ['...KSSSSSSSSK...', '...KSEESSEESK...', '...KSSSSSSSSK...', '...KSHHHHHHSK...', '...KSSSMMSSSK...'],
    happy: ['...KSSSSSSSSK...', '...KSEESSEESK...', '...KpSSSSSSpK...', '...KSHHHHHHSK...', '...KSMMMMMMSK...'],
    shy: ['...KSSSSSSSSK...', '...KSSESSESSK...', '...KppSSSSppK...', '...KSHHHHHHSK...', '...KSSSMMSSSK...'],
    angry: ['...KSKKSSKKSK...', '...KSEESSEESK...', '...KSSSSSSSSK...', '...KSHHHHHHSK...', '...KSSMMMMSSK...'],
  };
  const BODY = [
    '....KSSSSSSK....',
    '...KKTTTTTTKK...',
    '..KTTTWWWWTTTK..',
    '.KTTKWWWWWWKTTK.',
    '.KSSKWwWWwWKSSK.',
    '.KKKKWWWWWWKKKK.',
    '....KWWWWWWK....',
    '....KPPPPPPK....',
    '....KPPKKPPK....',
  ];
  const LEGS_A = ['....KPPKKPPK....', '...KBBBKKBBBK...', '...KKKKKKKKKK...'];
  const LEGS_B = ['...KPPK..KPPK...', '..KBBBK..KBBBK..', '..KKKKK..KKKKK..'];

  const BOT = [
    '.....KK.....',
    '.....YK.....',
    '..KKKKKKKK..',
    '.KYYYYYYYYK.',
    'KKYKKYYKKYKK',
    'KGYKCYYKCYGK',
    '.KYYYYYYYYK.',
    '.KYYKKKKYYK.',
    '.KyYYYYYYyK.',
    '..KKKKKKKK..',
  ];

  // Склеиваем соседние пиксели одного цвета в один прямоугольник.
  function rects(rows, y0 = 0) {
    let out = '';
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        let w = 1;
        while (row[x + w] === ch) w++;
        if (ch !== '.' && PALETTE[ch]) out += `<rect x="${x}" y="${y + y0}" width="${w}" height="1" fill="${PALETTE[ch]}"/>`;
        x += w;
      }
    });
    return out;
  }

  FG.pixel = {
    customer(mood = 'neutral') {
      const top = [...HEAD, ...(FACE[mood] || FACE.neutral), ...BODY];
      const h = top.length + 3;
      return `<svg viewBox="0 0 16 ${h}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
        ${rects(top)}
        <g class="legs-a">${rects(LEGS_A, top.length)}</g>
        <g class="legs-b">${rects(LEGS_B, top.length)}</g>
      </svg>`;
    },
    bot() {
      return `<svg viewBox="0 0 12 10" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${rects(BOT)}</svg>`;
    },
  };
})();
