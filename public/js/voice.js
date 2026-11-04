// Голос шефа: запись из public/audio/chef-voice.mp3.
// Запись звучит хотя бы раз целиком, а на длинной реплике повторяется с начала.

window.FG = window.FG || {};

(() => {
  const OFF_KEY = 'geeks-voice-off';
  const FILE = 'audio/chef-voice.mp3';
  // В файле есть тишина в начале и в конце: при повторе её пропускаем.
  const SOUND_FROM = 0.12;
  const SOUND_TO = 2.5;

  let ctx = null;
  let bytes = null;
  let clip = null;
  let current = null;
  let userOff = false;
  let classOff = false;
  try {
    userOff = localStorage.getItem(OFF_KEY) === '1';
  } catch {}

  // Файл качаем сразу, чтобы первая реплика не ждала сеть. Без сервера (file://) шеф просто молчит.
  const loading = fetch(FILE)
    .then((res) => (res.ok ? res.arrayBuffer() : null))
    .then((data) => (bytes = data))
    .catch(() => {});

  function decode() {
    loading.then(() => {
      if (!bytes || clip) return;
      const data = bytes;
      bytes = null;
      ctx.decodeAudioData(data).then((buf) => (clip = buf)).catch(() => {});
    });
  }

  // Браузер разрешает звук только после первого клика или нажатия клавиши.
  function unlock() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!ctx) {
      ctx = new Ctx();
      decode();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);

  function stop() {
    if (!current) return;
    const { source, gain } = current;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.05);
    try {
      source.stop(now + 0.06);
    } catch {}
    current = null;
  }

  FG.voice = {
    unlock,
    stop,
    // ms — сколько примерно печатается реплика на экране.
    say(ms) {
      stop();
      if (userOff || classOff || !clip || ctx.state !== 'running') return;
      const length = SOUND_TO - SOUND_FROM;
      const start = ctx.currentTime + 0.03;
      const end = start + Math.max(1, Math.ceil(ms / 1000 / length)) * length;
      const source = ctx.createBufferSource();
      source.buffer = clip;
      source.loop = true;
      source.loopStart = SOUND_FROM;
      source.loopEnd = SOUND_TO;
      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(start, SOUND_FROM);
      source.stop(end);
      current = { source, gain, end };
    },
    get speaking() {
      return Boolean(current && ctx && ctx.currentTime < current.end);
    },
    get ready() {
      return Boolean(clip);
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
  };
})();
