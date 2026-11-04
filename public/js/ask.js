// Своё окно подтверждения вместо confirm(). Встроенное окно есть не везде:
// в панели браузера приложения Claude оно сразу отвечает «нет» и ничего не показывает.

window.FG = window.FG || {};

FG.ask = (text, okLabel = 'Да') =>
  new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'ask';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = `
      <div class="ask-card">
        <p></p>
        <div class="ask-btns">
          <button class="btn btn-primary" id="askOk" type="button"></button>
          <button class="btn btn-ghost" id="askNo" type="button">Отмена</button>
        </div>
      </div>`;
    box.querySelector('p').textContent = text;
    box.querySelector('#askOk').textContent = okLabel;

    const done = (answer) => {
      box.remove();
      document.removeEventListener('keydown', onKey);
      resolve(answer);
    };
    const onKey = (e) => e.key === 'Escape' && done(false);
    box.querySelector('#askOk').addEventListener('click', () => done(true));
    box.querySelector('#askNo').addEventListener('click', () => done(false));
    box.addEventListener('mousedown', (e) => e.target === box && done(false));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
    box.querySelector('#askOk').focus();
  });
