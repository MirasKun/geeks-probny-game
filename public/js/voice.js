// Голос заказчика: смешное бормотание без настоящих слов.
// Файлов со звуком нет: голос синтезируется прямо в браузере, по гласным из реплики.

window.FG = window.FG || {};

(() => {
  const OFF_KEY = 'geeks-voice-off';

  // Две главные частоты гласной: именно они отличают «а» от «и».
  const A = [800, 1250];
  const O = [520, 900];
  const U = [340, 800];
  const E = [560, 1800];
  const I = [320, 2300];
  const Y = [380, 1600];
  const VOWELS = { а: A, я: A, a: A, о: O, ё: O, o: O, у: U, ю: U, u: U, э: E, е: E, e: E, и: I, i: I, ы: Y };

  const MOODS = {
    neutral: { pitch: 170, rate: 1, volume: 0.85 },
    happy: { pitch: 205, rate: 1.08, volume: 0.9 },
    angry: { pitch: 235, rate: 1.2, volume: 1 },
    shy: { pitch: 150, rate: 0.9, volume: 0.65 },
  };

  // Случайность зависит от текста: одна и та же реплика звучит одинаково.
  function randomFrom(text) {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => {
      h = Math.imul(h ^ (h >>> 15), 2147483647) + 12345;
      return ((h >>> 0) % 10000) / 10000;
    };
  }

  // Реплика → слоги: какая гласная, на какой высоте и когда.
  function syllables(text, mood, ms) {
    const m = MOODS[mood] || MOODS.neutral;
    const rnd = randomFrom(text);
    const letters = text.toLowerCase().match(/[аяaоёoуюuэеeиiы]/g) || ['а', 'о'];
    const length = 0.125 / m.rate;
    const out = [];
    let t = 0;
    let left = 0;
    let base = m.pitch;
    while (t < ms / 1000 - length) {
      // Новое «слово» из 2–4 слогов: короткая пауза и другая высота.
      if (left === 0) {
        left = 2 + Math.floor(rnd() * 3);
        if (t > 0) t += 0.05 + rnd() * 0.05;
        base = m.pitch * (0.9 + rnd() * 0.3);
      }
      const letter = letters[Math.floor((out.length / (ms / 1000 / length)) * letters.length) % letters.length];
      const squeak = rnd() > 0.92 ? 1.45 : 1;
      out.push({ t, length, vowel: VOWELS[letter], pitch: base * (left % 2 ? 1.1 : 0.94) * squeak });
      t += length;
      left--;
    }
    // В конце реплики с «!» или «?» голос взлетает.
    const last = out[out.length - 1];
    if (last && /[!?]\s*\S{0,3}\s*$/.test(text)) last.pitch *= 1.3;
    return { list: out, end: t, volume: m.volume };
  }

  // Собирает голос в любом аудиоконтексте и возвращает функцию остановки.
  function build(ctx, dest, start, text, mood, ms) {
    const { list, end, volume } = syllables(text, mood, ms);
    const stopAt = start + end + 0.08;

    const buzz = ctx.createOscillator();
    buzz.type = 'sawtooth';
    const edge = ctx.createOscillator();
    edge.type = 'square';
    edge.detune.value = 9;
    const edgeGain = ctx.createGain();
    edgeGain.gain.value = 0.22;

    const wobble = ctx.createOscillator();
    wobble.frequency.value = 7;
    const wobbleGain = ctx.createGain();
    wobbleGain.gain.value = 5;
    wobble.connect(wobbleGain);
    wobbleGain.connect(buzz.frequency);
    wobbleGain.connect(edge.frequency);

    const amp = ctx.createGain();
    amp.gain.value = 0;
    buzz.connect(amp);
    edge.connect(edgeGain);
    edgeGain.connect(amp);

    const low = ctx.createBiquadFilter();
    low.type = 'bandpass';
    low.Q.value = 5;
    const high = ctx.createBiquadFilter();
    high.type = 'bandpass';
    high.Q.value = 8;
    const highGain = ctx.createGain();
    highGain.gain.value = 0.55;
    amp.connect(low);
    amp.connect(high);
    high.connect(highGain);

    const out = ctx.createGain();
    out.gain.value = volume * 1.7;
    low.connect(out);
    highGain.connect(out);
    out.connect(dest);

    for (const s of list) {
      const a = start + s.t;
      // Голос подъезжает к ноте снизу, а гласная открывается: получается «ва-ба-бу».
      buzz.frequency.setValueAtTime(s.pitch * 0.9, a);
      buzz.frequency.linearRampToValueAtTime(s.pitch, a + 0.04);
      edge.frequency.setValueAtTime(s.pitch * 0.9, a);
      edge.frequency.linearRampToValueAtTime(s.pitch, a + 0.04);
      low.frequency.setValueAtTime(240, a);
      low.frequency.setTargetAtTime(s.vowel[0], a + 0.012, 0.018);
      high.frequency.setValueAtTime(Math.min(800, s.vowel[1]), a);
      high.frequency.setTargetAtTime(s.vowel[1], a + 0.012, 0.022);
      amp.gain.setValueAtTime(0.0001, a);
      amp.gain.linearRampToValueAtTime(1, a + 0.014);
      amp.gain.setValueAtTime(1, a + s.length * 0.62);
      amp.gain.linearRampToValueAtTime(0.0001, a + s.length * 0.96);
    }

    for (const o of [buzz, edge, wobble]) {
      o.start(start);
      o.stop(stopAt);
    }
    return {
      end: stopAt,
      stop() {
        const now = ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.linearRampToValueAtTime(0, now + 0.04);
        for (const o of [buzz, edge, wobble]) {
          try {
            o.stop(now + 0.06);
          } catch {}
        }
      },
    };
  }

  let ctx = null;
  let master = null;
  let current = null;
  let userOff = false;
  let classOff = false;
  try {
    userOff = localStorage.getItem(OFF_KEY) === '1';
  } catch {}

  // Браузер разрешает звук только после первого клика или нажатия клавиши.
  function unlock() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!ctx) {
      ctx = new Ctx();
      master = ctx.createDynamicsCompressor();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);

  function stop() {
    if (current) current.stop();
    current = null;
  }

  FG.voice = {
    unlock,
    stop,
    // ms — сколько примерно длится реплика на экране.
    say(text, mood, ms) {
      stop();
      if (userOff || classOff || !ctx || ctx.state !== 'running' || !text) return;
      current = build(ctx, master, ctx.currentTime + 0.03, text, mood, Math.max(900, ms));
    },
    get speaking() {
      return Boolean(current && ctx && ctx.currentTime < current.end);
    },
    get off() {
      return userOff || classOff;
    },
    get classOff() {
      return classOff;
    },
    setUserOff(on) {
      userOff = on;
      try {
        if (on) localStorage.setItem(OFF_KEY, '1');
        else localStorage.removeItem(OFF_KEY);
      } catch {}
      if (on) stop();
    },
    setClassOff(on) {
      classOff = on;
      if (on) stop();
    },
    // Для проверки: звук реплики без колонок, в виде данных.
    async render(text, mood, ms) {
      const seconds = Math.max(900, ms) / 1000 + 0.5;
      const off = new OfflineAudioContext(1, Math.ceil(seconds * 44100), 44100);
      const comp = off.createDynamicsCompressor();
      comp.connect(off.destination);
      build(off, comp, 0.03, text, mood, Math.max(900, ms));
      return off.startRendering();
    },
  };
})();
