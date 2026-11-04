// Стартовый код сайта заказчика — то, что ученики видят в редакторе.
// Здесь специально спрятаны «проблемы» для заданий: серая кнопка, опечатка,
// мелкий заголовок, спрятанные кнопки «В корзину» и скучный белый фон.

window.FG = window.FG || {};

FG.starter = {
  html: `<!-- Шапка сайта -->
<header class="header">
  <div class="logo">🍔 Burger Bro</div>
  <nav class="menu">
    <a href="#">Меню</a>
    <a href="#">Доставка</a>
    <a href="#">Контакты</a>
  </nav>
</header>

<!-- Главный блок -->
<section class="hero">
  <div class="hero-pic">🍔</div>
  <h1 class="title">Самые сочные бугреры в городе</h1>
  <p class="subtitle">Жарим на огне и привозим за 30 минут</p>
  <button class="order-btn">Заказать</button>
</section>

<!-- Карточки с едой -->
<section class="cards">
  <div class="card">
    <div class="picture">🍔</div>
    <h3>Чизбургер</h3>
    <p class="price">290 сом</p>
    <button class="add-btn">В корзину</button>
  </div>

  <div class="card">
    <div class="picture">🍟</div>
    <h3>Картошка фри</h3>
    <p class="price">120 сом</p>
    <button class="add-btn">В корзину</button>
  </div>

  <div class="card">
    <div class="picture">🥤</div>
    <h3>Лимонад</h3>
    <p class="price">90 сом</p>
    <button class="add-btn">В корзину</button>
  </div>
</section>

<!-- Подвал сайта -->
<footer class="footer">© 2026 Burger Bro</footer>
`,

  css: `/* ===== Вся страница ===== */
body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: white;
  color: #2b2118;
}

/* ===== Шапка ===== */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 40px;
  background: #2b2118;
  color: white;
}

.logo {
  font-size: 24px;
  font-weight: bold;
}

.menu a {
  color: white;
  margin-left: 24px;
  text-decoration: none;
}

/* ===== Главный блок ===== */
.hero {
  text-align: center;
  padding: 40px 40px 56px;
}

.hero-pic {
  font-size: 80px;
}

/* Заголовок */
.title {
  font-size: 18px;
  margin: 8px 0;
}

.subtitle {
  color: #7a6a5c;
  font-size: 18px;
  margin-bottom: 28px;
}

/* Кнопка «Заказать» */
.order-btn {
  background: gray;
  color: white;
  border: none;
  padding: 16px 44px;
  font-size: 18px;
  border-radius: 10px;
  cursor: pointer;
}

/* ===== Карточки с едой ===== */
.cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  padding: 0 40px 56px;
}

.card {
  background: white;
  border: 2px solid #eeeeee;
  border-radius: 0px;
  padding: 24px;
  text-align: center;
}

.picture {
  font-size: 56px;
}

.price {
  color: #e8452c;
  font-size: 20px;
  font-weight: bold;
}

/* Кнопка «В корзину» */
.add-btn {
  display: none;
  background: #2b2118;
  color: white;
  border: none;
  padding: 10px 22px;
  border-radius: 8px;
  cursor: pointer;
}

/* ===== Подвал ===== */
.footer {
  text-align: center;
  padding: 24px;
  color: #7a6a5c;
}
`,
};
