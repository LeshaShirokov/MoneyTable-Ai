/** Страница «Журнал»: форма операции, таблица с фильтрами, экспорт, демо и очистка. */
(() => {
  'use strict';
  const MT = window.MoneyTable;
  const { state, money, el, $, TYPES } = MT;

  const els = {
    form: $('txForm'), id: $('txId'), amount: $('amount'), category: $('category'), date: $('date'), comment: $('comment'),
    submit: $('submitBtn'), cancel: $('cancelEdit'), formTitle: $('formTitle'),
    fType: $('fType'), fCategory: $('fCategory'), fMonth: $('fMonth'), fSearch: $('fSearch'), fSort: $('fSort'),
    resetFilters: $('resetFilters'), body: $('txBody'), empty: $('emptyState'), listTotals: $('listTotals'),
    exportCsv: $('exportCsv'), loadDemo: $('loadDemo'), clearAll: $('clearAll')
  };

  /* ---------- Форма операции ---------- */
  const currentType = () => els.form.querySelector('input[name="type"]:checked').value;

  function fillCategorySelect(type, selected) {
    els.category.innerHTML = '';
    els.category.append(el('option', { value: '', text: 'Выберите категорию' }));
    state.categories[type].forEach((c) => els.category.append(el('option', { value: c.name, text: c.name })));
    // Редактируемая операция может ссылаться на «Без категории» — сохраняем вариант.
    if (selected && !MT.findCategory(type, selected)) {
      els.category.append(el('option', { value: selected, text: selected }));
    }
    els.category.value = selected || '';
  }

  function validateForm() {
    let first = null;
    const fail = (input, msg) => { MT.setError(input, msg); first = first || input; };
    const amount = MT.parseAmount(els.amount.value);
    if (!(amount > 0)) fail(els.amount, 'Введите сумму больше нуля');
    else if (amount > MT.MAX_AMOUNT) fail(els.amount, 'Слишком большая сумма');
    else MT.setError(els.amount, '');

    if (!els.category.value) fail(els.category, 'Выберите категорию');
    else MT.setError(els.category, '');

    if (!MT.isISODate(els.date.value)) fail(els.date, 'Укажите корректную дату');
    else MT.setError(els.date, '');

    if (first) { first.focus(); return null; }
    return amount;
  }

  function resetForm() {
    els.form.reset();
    els.id.value = '';
    $('typeExpense').checked = true;
    fillCategorySelect('expense');
    els.date.value = MT.todayISO();
    MT.clearErrors(els.amount, els.category, els.date);
    els.submit.textContent = 'Добавить';
    els.formTitle.textContent = 'Новая операция';
    els.cancel.hidden = true;
    render();
  }

  function startEdit(id) {
    const t = state.transactions.find((x) => x.id === id);
    if (!t) return;
    els.id.value = t.id;
    $(t.type === 'income' ? 'typeIncome' : 'typeExpense').checked = true;
    fillCategorySelect(t.type, t.category);
    els.amount.value = t.amount;
    els.date.value = t.date;
    els.comment.value = t.comment;
    MT.clearErrors(els.amount, els.category, els.date);
    els.submit.textContent = 'Сохранить';
    els.formTitle.textContent = 'Редактирование операции';
    els.cancel.hidden = false;
    render();
    els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    els.amount.focus({ preventScroll: true });
  }

  function removeTransaction(id) {
    const t = state.transactions.find((x) => x.id === id);
    if (!t) return;
    if (!confirm(`Удалить операцию «${t.category}» на ${money.format(t.amount)}?`)) return;
    state.transactions = state.transactions.filter((x) => x.id !== id);
    MT.saveTransactions();
    if (els.id.value === id) resetForm(); else render();
    MT.toast('Операция удалена');
  }

  els.form.addEventListener('change', (e) => {
    if (e.target.name === 'type') fillCategorySelect(currentType(), '');
  });
  MT.clearOnInput(els.amount, els.category, els.date);
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = validateForm();
    if (amount === null) return;
    const data = {
      type: currentType(),
      amount,
      category: els.category.value,
      date: els.date.value,
      comment: els.comment.value.trim()
    };
    const existing = els.id.value && state.transactions.find((t) => t.id === els.id.value);
    if (existing) {
      Object.assign(existing, data);
      MT.toast('Операция обновлена');
    } else {
      state.transactions.push({ id: MT.uid(), ...data });
      MT.toast('Операция добавлена');
    }
    MT.saveTransactions();
    resetForm();
  });
  els.cancel.addEventListener('click', resetForm);

  /* ---------- Категории ---------- */
  const categories = MT.createCategoryManager({
    getType: currentType,
    onChange({ action, type, from, to }) {
      if (action === 'rename' || action === 'delete') {
        if (currentType() === type) MT.retargetSelect(els.category, from, to);
        // В фильтре имя общее для обоих типов: переносим выбор, только если старого имени больше нет.
        if (!MT.categoryNameExists(from) && !state.transactions.some((t) => t.category === from)) {
          MT.retargetSelect(els.fCategory, from, to);
        }
      }
      render();
    }
  });

  /* ---------- Фильтры ---------- */
  function getFilters() {
    return {
      type: els.fType.value,
      category: els.fCategory.value,
      month: els.fMonth.value,
      q: els.fSearch.value.trim().toLowerCase(),
      sort: els.fSort.value
    };
  }

  function filteredTransactions(f) {
    const list = state.transactions.filter((t) => {
      if (f.month && t.date.slice(0, 7) !== f.month) return false;
      if (f.type !== 'all' && t.type !== f.type) return false;
      if (f.category !== 'all' && t.category !== f.category) return false;
      if (f.q && `${t.comment} ${t.category}`.toLowerCase().indexOf(f.q) === -1) return false;
      return true;
    });
    list.sort((a, b) => {
      if (f.sort === 'amount-desc') return b.amount - a.amount;
      if (f.sort === 'amount-asc') return a.amount - b.amount;
      const c = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      return f.sort === 'date-asc' ? c : -c;
    });
    return list;
  }

  function refreshCategoryFilter() {
    const current = els.fCategory.value;
    const types = els.fType.value === 'all' ? TYPES : [els.fType.value];
    const names = new Set();
    types.forEach((tp) => state.categories[tp].forEach((c) => names.add(c.name)));
    state.transactions.forEach((t) => { if (types.includes(t.type)) names.add(t.category); });
    els.fCategory.innerHTML = '';
    els.fCategory.append(el('option', { value: 'all', text: 'Все' }));
    Array.from(names).sort((a, b) => a.localeCompare(b, 'ru'))
      .forEach((n) => els.fCategory.append(el('option', { value: n, text: n })));
    els.fCategory.value = names.has(current) ? current : 'all';
  }

  [els.fType, els.fCategory, els.fMonth, els.fSort].forEach((i) => i.addEventListener('change', render));
  els.fSearch.addEventListener('input', render);
  els.resetFilters.addEventListener('click', () => {
    els.fType.value = 'all';
    els.fCategory.value = 'all';
    els.fMonth.value = '';
    els.fSearch.value = '';
    els.fSort.value = 'date-desc';
    render();
  });

  /* ---------- Таблица ---------- */
  function renderTable(list) {
    els.body.innerHTML = '';
    els.empty.hidden = list.length > 0;
    if (!list.length) {
      els.empty.textContent = state.transactions.length
        ? 'Ничего не найдено. Попробуйте изменить фильтры.'
        : 'Операций пока нет. Добавьте первую с помощью формы или загрузите демо-данные.';
    }
    const frag = document.createDocumentFragment();
    list.forEach((t) => {
      const income = t.type === 'income';
      frag.append(el('tr', { class: els.id.value === t.id ? 'is-editing' : false }, [
        el('td', { 'data-label': 'Дата' }, [el('time', { datetime: t.date, text: MT.formatDate(t.date) })]),
        el('td', { 'data-label': 'Категория' }, [
          el('span', { class: 'tag' }, [
            el('span', { class: 'tag__dot', style: `background:${MT.categoryColor(t.type, t.category)}`, 'aria-hidden': 'true' }),
            t.category
          ])
        ]),
        el('td', { 'data-label': 'Комментарий', class: 'comment', text: t.comment || '—' }),
        el('td', { 'data-label': 'Сумма', class: `num amount--${t.type}` }, [
          el('span', { class: 'sr-only', text: income ? 'Доход ' : 'Расход ' }),
          `${income ? '+' : '−'} ${money.format(t.amount)}`
        ]),
        el('td', { class: 'actions-cell' }, [el('div', { class: 'actions' }, [
          el('button', { type: 'button', class: 'btn btn--ghost btn--small', 'data-action': 'edit', 'data-id': t.id, 'aria-label': `Редактировать операцию «${t.category}»`, title: 'Редактировать', text: '✎' }),
          el('button', { type: 'button', class: 'btn btn--danger btn--small', 'data-action': 'delete', 'data-id': t.id, 'aria-label': `Удалить операцию «${t.category}»`, title: 'Удалить', text: '✕' })
        ])])
      ]));
    });
    els.body.append(frag);
  }

  function renderListTotals(list) {
    if (!list.length) { els.listTotals.textContent = ''; return; }
    let income = 0, expense = 0;
    list.forEach((t) => { if (t.type === 'income') income += t.amount; else expense += t.amount; });
    els.listTotals.textContent = `Показано: ${MT.countLabel(list.length)} · доходы ${money.format(MT.round2(income))} · расходы ${money.format(MT.round2(expense))}`;
  }

  els.body.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'edit') startEdit(btn.dataset.id);
    else removeTransaction(btn.dataset.id);
  });

  /* ---------- Отрисовка ---------- */
  function render() {
    // Редактируемую операцию удалили в другой вкладке — выходим из режима редактирования.
    if (els.id.value && !state.transactions.some((t) => t.id === els.id.value)) {
      els.id.value = '';
      els.submit.textContent = 'Добавить';
      els.formTitle.textContent = 'Новая операция';
      els.cancel.hidden = true;
    }
    fillCategorySelect(currentType(), els.category.value);
    refreshCategoryFilter();
    const list = filteredTransactions(getFilters());
    renderTable(list);
    renderListTotals(list);
    categories.refresh();
  }

  /* ---------- Экспорт, демо, очистка ---------- */
  els.exportCsv.addEventListener('click', () => {
    const list = filteredTransactions(getFilters());
    if (!list.length) { MT.toast('Нет операций для экспорта'); return; }
    const rows = [['Дата', 'Тип', 'Категория', 'Комментарий', 'Сумма']];
    list.forEach((t) => rows.push([
      t.date, t.type === 'income' ? 'Доход' : 'Расход', t.category, t.comment,
      (t.type === 'income' ? '' : '-') + MT.csvAmount(t.amount)
    ]));
    MT.downloadCsv(rows, `moneytable-${MT.todayISO()}.csv`);
    MT.toast(`Экспортировано: ${MT.countLabel(list.length)}`);
  });

  els.loadDemo.addEventListener('click', () => {
    if ((state.transactions.length || state.goals.length) && !confirm('Добавить демо-данные к существующим?')) return;
    MT.addDemoData();
    render();
    MT.toast('Демо-данные загружены');
  });

  els.clearAll.addEventListener('click', () => {
    if (!state.transactions.length && !state.goals.length) { MT.toast('Данных уже нет'); return; }
    if (!confirm('Удалить все операции и копилки без возможности восстановления? Категории сохранятся.')) return;
    state.transactions = [];
    state.goals = [];
    MT.saveTransactions();
    MT.saveGoals();
    resetForm();
    MT.toast('Все данные удалены');
  });

  /* ---------- Запуск ---------- */
  els.date.value = MT.todayISO();
  MT.initPage(render);
})();
