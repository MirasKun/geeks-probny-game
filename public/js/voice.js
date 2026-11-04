// Звуки игры: голос шефа и сирена, когда падает сервер. Записи лежат в public/audio.
// Голос звучит хотя бы раз целиком, а на длинной реплике повторяется с начала.

window.FG = window.FG || {};

(() => {
  const OFF_KEY = 'geeks-voice-off';
  const FILES = { voice: 'audio/chef-voice.mp3', siren: 'audio/siren.mp3' };
  // В файле голоса есть тишина в начале и в конце: при повторе её пропускаем.
  const VOICE_FROM = 0.12;
  const VOICE_TO = 2.5;
  // В конце файла сирены тоже тишина.
  const SIREN_LENGTH = 2.2;

  let ctx = null;
  const clips = {};
  let current = null;
  let sirenNow = null;
  let userOff = false;
  let classOff = false;
  try {
    userOff = localStorage.getItem(OFF_KEY) === '1';
  } catch {}

  // Файлы качаем сразу, чтобы первый звук не ждал сеть. Без сервера (file://) звука просто нет.
  const loading = Object.entries(FILES).map(([key, file]) =>
    fetch(file)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .catch(() => null)
      .then((data) => [key, data]),
  );

  function decode() {
    for (const item of loading) {
      item.then(([key, data]) => {
        if (data) ctx.decodeAudioData(data).then((buf) => (clips[key] = buf)).catch(() => {});
      });
    }
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

  const canPlay = (key) => !userOff && !classOff && clips[key] && ctx.state === 'running';

  function play(key, offset, stopAt) {
    const source = ctx.createBufferSource();
    source.buffer = clips[key];
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime + 0.03;
    source.start(start, offset);
    source.stop(start + stopAt);
    return { source, gain, end: start + stopAt };
  }

  function silence(sound) {
    const now = ctx.currentTime;
    sound.gain.gain.setValueAtTime(sound.gain.gain.value, now);
    sound.gain.gain.linearRampToValueAtTime(0, now + 0.05);
    try {
      sound.source.stop(now + 0.06);
    } catch {}
  }

  function stop() {
    if (current) silence(current);
    current = null;
  }

  function stopSiren() {
    if (sirenNow) silence(sirenNow);
    sirenNow = null;
  }

  const isPlaying = (sound) => Boolean(sound && ctx && ctx.currentTime < sound.end);

  FG.voice = {
    unlock,
    stop,
    stopSiren,
    // ms — сколько примерно печатается реплика на экране.
    say(ms) {
      stop();
      if (!canPlay('voice')) return;
      const length = VOICE_TO - VOICE_FROM;
      const times = Math.max(1, Math.ceil(ms / 1000 / length));
      current = play('voice', VOICE_FROM, times * length);
      current.source.loop = true;
      current.source.loopStart = VOICE_FROM;
      current.source.loopEnd = VOICE_TO;
    },
    siren() {
      stopSiren();
      if (canPlay('siren')) sirenNow = play('siren', 0, SIREN_LENGTH);
    },
    get speaking() {
      return isPlaying(current);
    },
    get sirenPlaying() {
      return isPlaying(sirenNow);
    },
    get ready() {
      return Boolean(clips.voice && clips.siren);
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
      if (on) {
        stop();
        stopSiren();
      }
    },
    setClassOff(on) {
      classOff = on;
      if (on) {
        stop();
        stopSiren();
      }
    },
  };
})();
