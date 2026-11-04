// Короткий адрес игры: всё, что приходит сюда, отдаёт основной Worker geeks-frontend.
// Сама игра, урок и история живут там, здесь нет ни данных, ни логики.

export default {
  fetch: (request, env) => env.APP.fetch(request),
};
