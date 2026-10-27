/* Применяет сохранённую тему до отрисовки страницы, чтобы не было мигания. */
(function () {
  try {
    var t = localStorage.getItem('moneytable-theme');
    if (t !== 'dark' && t !== 'light') {
      t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* localStorage недоступен */ }
})();
