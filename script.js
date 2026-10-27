(function () {
  'use strict';

  var STORAGE_KEY = 'moneytable-transactions';
  var THEME_KEY = 'moneytable-theme';
  var INIT_KEY = 'moneytable-initialized';

  var CATEGORIES = {
    expense: ['Продукты', 'Кафе и рестораны', 'Транспорт', 'Жильё и ЖКХ', 'Здоровье', 'Развлечения', 'Одежда', 'Связь и интернет', 'Подарки', 'Другое'],
    income: ['Зарплата', 'Фриланс', 'Подарки', 'Проценты и кешбэк', 'Другое']
  };

  var COLORS = ['#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#a855f7', '#ec4899', '#84cc16', '#f97316', '#64748b'];

  var money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 });
  var dateFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
  var monthFmt = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    form: $('txForm'), id: $('txId'), amount: $('amount'), category: $('category'), date: $('date'), comment: $('comment'),
    submit: $('submitBtn'), cancel: $('cancelEdit'), formTitle: $('formTitle'),
    sumBalance: $('sumBalance'), sumIncome: $('sumIncome'), sumExpense: $('sumExpense'),
    countIncome: $('countIncome'), countExpense: $('countExpense'), periodLabel: $('periodLabel'),
    fType: $('fType'), fCategory: $('fCategory'), fMonth: $('fMonth'), fSearch: $('fSearch'), fSort: $('fSort'),
    resetFilters: $('resetFilters'), body: $('txBody'), empty: $('emptyState'),
    chart: $('chart'), legend: $('legend'),
    exportCsv: $('exportCsv'), loadDemo: $('loadDemo'), clearAll: $('clearAll'),
    themeToggle: $('themeToggle'), toast: $('toast')
  };

  var transactions = [];

  /* ---------- Utils ---------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseISO(s) {
    var p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function plural(n, forms) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'class') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }
  function svgEl(tag, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }
  var toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('is-visible'); }, 2500);
  }
  function categoryColor(name) {
    var all = CATEGORIES.expense.concat(CATEGORIES.income.filter(function (c) { return CATEGORIES.expense.indexOf(c) === -1; }));
    var i = all.indexOf(name);
    if (i === -1) {
      var h = 0;
      for (var j = 0; j < name.length; j++) h = (h * 31 + name.charCodeAt(j)) >>> 0;
      i = h;
    }
    return COLORS[i % COLORS.length];
  }

  /* ---------- Storage ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : [];
      transactions = Array.isArray(data) ? data.filter(function (t) {
        return t && (t.type === 'income' || t.type === 'expense') && isFinite(t.amount) && /^\d{4}-\d{2}-\d{2}$/.test(t.date);
      }) : [];
    } catch (e) {
      transactions = [];
    }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); }
    catch (e) { toast('Не удалось сохранить данные'); }
  }

  function demoData() {
    var now = new Date();
    function d(monthsAgo, day) {
      var x = new Date(now.getFullYear(), now.getMonth() - monthsAgo, Math.min(day, 28));
      if (x > now) x = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
    }
    var rows = [
      ['income', 120000, 'Зарплата', d(0, 5), 'Аванс и зарплата'],
      ['income', 25000, 'Фриланс', d(0, 12), 'Лендинг для клиента'],
      ['expense', 35000, 'Жильё и ЖКХ', d(0, 3), 'Аренда квартиры'],
      ['expense', 8420.5, 'Продукты', d(0, 6), 'Закупка на неделю'],
      ['expense', 2350, 'Кафе и рестораны', d(0, 8), 'Ужин с друзьями'],
      ['expense', 1800, 'Транспорт', d(0, 10), 'Проездной на месяц'],
      ['expense', 650, 'Связь и интернет', d(0, 11), 'Мобильная связь'],
      ['expense', 4990, 'Развлечения', d(0, 14), 'Билеты в театр'],
      ['expense', 3200, 'Здоровье', d(0, 15), 'Аптека'],
      ['income', 115000, 'Зарплата', d(1, 5), 'Зарплата'],
      ['expense', 35000, 'Жильё и ЖКХ', d(1, 3), 'Аренда квартиры'],
      ['expense', 11250, 'Продукты', d(1, 9), 'Продукты'],
      ['expense', 7600, 'Одежда', d(1, 18), 'Куртка'],
      ['expense', 3000, 'Подарки', d(1, 21), 'Подарок маме']
    ];
    return rows.map(function (r) {
      return { id: uid(), type: r[0], amount: r[1], category: r[2], date: r[3], comment: r[4] };
    });
  }

  /* ---------- Theme ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    els.themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
    els.themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }
  els.themeToggle.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });

  /* ---------- Form ---------- */
  function currentType() {
    return els.form.querySelector('input[name="type"]:checked').value;
  }
  function fillCategorySelect(type, selected) {
    els.category.innerHTML = '';
    els.category.appendChild(el('option', { value: '', text: 'Выберите категорию' }));
    CATEGORIES[type].forEach(function (c) {
      var o = el('option', { value: c, text: c });
      if (c === selected) o.selected = true;
      els.category.appendChild(o);
    });
    if (selected && CATEGORIES[type].indexOf(selected) === -1) {
      var extra = el('option', { value: selected, text: selected });
      extra.selected = true;
      els.category.appendChild(extra);
    }
  }
  function setError(input, msg) {
    var err = $(input.id + 'Error');
    if (err) err.textContent = msg || '';
    if (msg) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  function validate() {
    var ok = true, first = null;
    var amount = parseFloat(String(els.amount.value).replace(',', '.'));
    if (!els.amount.value || !isFinite(amount) || amount <= 0) {
      setError(els.amount, 'Введите сумму больше нуля'); ok = false; first = first || els.amount;
    } else if (amount > 1e12) {
      setError(els.amount, 'Слишком большая сумма'); ok = false; first = first || els.amount;
    } else setError(els.amount, '');

    if (!els.category.value) {
      setError(els.category, 'Выберите категорию'); ok = false; first = first || els.category;
    } else setError(els.category, '');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(els.date.value)) {
      setError(els.date, 'Укажите дату'); ok = false; first = first || els.date;
    } else if (els.date.value > '2100-01-01' || els.date.value < '1970-01-01') {
      setError(els.date, 'Некорректная дата'); ok = false; first = first || els.date;
    } else setError(els.date, '');

    if (first) first.focus();
    return ok ? Math.round(amount * 100) / 100 : null;
  }
  function resetForm() {
    els.form.reset();
    els.id.value = '';
    $('typeExpense').checked = true;
    fillCategorySelect('expense');
    els.date.value = todayISO();
    [els.amount, els.category, els.date].forEach(function (i) { setError(i, ''); });
    els.submit.textContent = 'Добавить';
    els.formTitle.textContent = 'Новая операция';
    els.cancel.hidden = true;
    render();
  }

  els.form.addEventListener('change', function (e) {
    if (e.target.name === 'type') fillCategorySelect(currentType(), els.category.value);
  });
  [els.amount, els.category, els.date].forEach(function (i) {
    i.addEventListener('input', function () { if (i.getAttribute('aria-invalid')) setError(i, ''); });
  });

  els.form.addEventListener('submit', function (e) {
    e.preventDefault();
    var amount = validate();
    if (amount === null) return;
    var data = {
      type: currentType(),
      amount: amount,
      category: els.category.value,
      date: els.date.value,
      comment: els.comment.value.trim()
    };
    if (els.id.value) {
      var t = transactions.find(function (x) { return x.id === els.id.value; });
      if (t) Object.assign(t, data);
      toast('Операция обновлена');
    } else {
      data.id = uid();
      transactions.push(data);
      toast('Операция добавлена');
    }
    save();
    resetForm();
  });
  els.cancel.addEventListener('click', resetForm);

  function startEdit(id) {
    var t = transactions.find(function (x) { return x.id === id; });
    if (!t) return;
    els.id.value = t.id;
    $(t.type === 'income' ? 'typeIncome' : 'typeExpense').checked = true;
    fillCategorySelect(t.type, t.category);
    els.amount.value = t.amount;
    els.date.value = t.date;
    els.comment.value = t.comment || '';
    els.submit.textContent = 'Сохранить';
    els.formTitle.textContent = 'Редактирование операции';
    els.cancel.hidden = false;
    render();
    els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    els.amount.focus({ preventScroll: true });
  }

  function removeTx(id) {
    var t = transactions.find(function (x) { return x.id === id; });
    if (!t) return;
    if (!confirm('Удалить операцию «' + t.category + '» на ' + money.format(t.amount) + '?')) return;
    transactions = transactions.filter(function (x) { return x.id !== id; });
    if (els.id.value === id) resetForm();
    save();
    render();
    toast('Операция удалена');
  }

  /* ---------- Filters ---------- */
  function getFilters() {
    return {
      type: els.fType.value,
      category: els.fCategory.value,
      month: els.fMonth.value,
      q: els.fSearch.value.trim().toLowerCase(),
      sort: els.fSort.value
    };
  }
  function inPeriod(t, f) { return !f.month || t.date.slice(0, 7) === f.month; }

  function filtered(f) {
    var list = transactions.filter(function (t) {
      if (!inPeriod(t, f)) return false;
      if (f.type !== 'all' && t.type !== f.type) return false;
      if (f.category !== 'all' && t.category !== f.category) return false;
      if (f.q && (t.comment + ' ' + t.category).toLowerCase().indexOf(f.q) === -1) return false;
      return true;
    });
    var s = f.sort;
    list.sort(function (a, b) {
      if (s === 'amount-desc') return b.amount - a.amount;
      if (s === 'amount-asc') return a.amount - b.amount;
      var c = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      return s === 'date-asc' ? c : -c;
    });
    return list;
  }

  function refreshCategoryFilter() {
    var current = els.fCategory.value;
    var set = {};
    transactions.forEach(function (t) { set[t.category] = true; });
    var cats = Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'ru'); });
    els.fCategory.innerHTML = '';
    els.fCategory.appendChild(el('option', { value: 'all', text: 'Все' }));
    cats.forEach(function (c) { els.fCategory.appendChild(el('option', { value: c, text: c })); });
    els.fCategory.value = cats.indexOf(current) !== -1 ? current : 'all';
  }

  [els.fType, els.fCategory, els.fMonth, els.fSort].forEach(function (i) { i.addEventListener('change', render); });
  els.fSearch.addEventListener('input', render);
  els.resetFilters.addEventListener('click', function () {
    els.fType.value = 'all'; els.fCategory.value = 'all'; els.fMonth.value = ''; els.fSearch.value = ''; els.fSort.value = 'date-desc';
    render();
  });

  /* ---------- Render ---------- */
  function renderSummary(f) {
    var inc = 0, exp = 0, ci = 0, ce = 0;
    transactions.forEach(function (t) {
      if (!inPeriod(t, f)) return;
      if (t.type === 'income') { inc += t.amount; ci++; } else { exp += t.amount; ce++; }
    });
    var bal = inc - exp;
    els.sumIncome.textContent = money.format(inc);
    els.sumExpense.textContent = money.format(exp);
    els.sumBalance.textContent = money.format(bal);
    els.sumBalance.style.color = bal < 0 ? 'var(--expense)' : '';
    els.countIncome.textContent = ci + ' ' + plural(ci, ['операция', 'операции', 'операций']);
    els.countExpense.textContent = ce + ' ' + plural(ce, ['операция', 'операции', 'операций']);
    if (f.month) {
      var label = monthFmt.format(parseISO(f.month + '-01'));
      els.periodLabel.textContent = 'За ' + label.replace(/\s*г\.$/, '');
    } else {
      els.periodLabel.textContent = 'За всё время';
    }
  }

  function renderTable(list) {
    els.body.innerHTML = '';
    els.empty.hidden = list.length > 0;
    if (!list.length) {
      els.empty.textContent = transactions.length
        ? 'Ничего не найдено. Попробуйте изменить фильтры.'
        : 'Операций пока нет. Добавьте первую с помощью формы или загрузите демо-данные.';
    }
    var frag = document.createDocumentFragment();
    list.forEach(function (t) {
      var sign = t.type === 'income' ? '+' : '−';
      var editBtn = el('button', { type: 'button', class: 'btn btn--ghost btn--small', 'data-action': 'edit', 'data-id': t.id, 'aria-label': 'Редактировать операцию ' + t.category, title: 'Редактировать', text: '✎' });
      var delBtn = el('button', { type: 'button', class: 'btn btn--danger btn--small', 'data-action': 'delete', 'data-id': t.id, 'aria-label': 'Удалить операцию ' + t.category, title: 'Удалить', text: '✕' });
      var row = el('tr', { class: els.id.value === t.id ? 'is-editing' : '' }, [
        el('td', { 'data-label': 'Дата' }, [el('time', { datetime: t.date, text: dateFmt.format(parseISO(t.date)) })]),
        el('td', { 'data-label': 'Категория' }, [
          el('span', { class: 'tag' }, [el('span', { class: 'tag__dot', style: 'background:' + categoryColor(t.category), 'aria-hidden': 'true' }), document.createTextNode(t.category)])
        ]),
        el('td', { 'data-label': 'Комментарий', class: 'comment', text: t.comment || '—' }),
        el('td', { 'data-label': 'Сумма', class: 'num amount--' + t.type }, [
          el('span', { class: 'sr-only', text: t.type === 'income' ? 'Доход ' : 'Расход ' }),
          document.createTextNode(sign + ' ' + money.format(t.amount))
        ]),
        el('td', { class: 'actions-cell' }, [el('div', { class: 'actions' }, [editBtn, delBtn])])
      ]);
      frag.appendChild(row);
    });
    els.body.appendChild(frag);
  }

  els.body.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    if (btn.getAttribute('data-action') === 'edit') startEdit(id);
    else removeTx(id);
  });

  function arcPath(cx, cy, r, ri, a0, a1) {
    var large = a1 - a0 > Math.PI ? 1 : 0;
    function pt(rad, a) { return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]; }
    var p0 = pt(r, a0), p1 = pt(r, a1), p2 = pt(ri, a1), p3 = pt(ri, a0);
    return 'M' + p0[0] + ' ' + p0[1] +
      ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1[0] + ' ' + p1[1] +
      ' L' + p2[0] + ' ' + p2[1] +
      ' A' + ri + ' ' + ri + ' 0 ' + large + ' 0 ' + p3[0] + ' ' + p3[1] + ' Z';
  }

  function renderChart(f) {
    var byCat = {}, total = 0;
    transactions.forEach(function (t) {
      if (t.type !== 'expense' || !inPeriod(t, f)) return;
      byCat[t.category] = (byCat[t.category] || 0) + t.amount;
      total += t.amount;
    });
    var items = Object.keys(byCat).map(function (k) { return { name: k, value: byCat[k] }; })
      .sort(function (a, b) { return b.value - a.value; });

    var svg = els.chart;
    var svgTitle = $('chartDesc');
    Array.prototype.slice.call(svg.childNodes).forEach(function (n) { if (n !== svgTitle) svg.removeChild(n); });
    els.legend.innerHTML = '';

    var cx = 100, cy = 100, r = 90, ri = 58;
    if (!items.length) {
      svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: (r + ri) / 2, fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': r - ri }));
      els.legend.appendChild(el('li', { class: 'legend__empty', text: 'Нет расходов за выбранный период' }));
    } else {
      var a = -Math.PI / 2;
      items.forEach(function (it) {
        var frac = it.value / total;
        var color = categoryColor(it.name);
        var shape;
        if (frac >= 0.9999) {
          shape = svgEl('circle', { cx: cx, cy: cy, r: (r + ri) / 2, fill: 'none', stroke: color, 'stroke-width': r - ri });
        } else {
          var a1 = a + frac * Math.PI * 2;
          shape = svgEl('path', { d: arcPath(cx, cy, r, ri, a, a1), fill: color });
          a = a1;
        }
        var title = svgEl('title', {});
        title.textContent = it.name + ': ' + money.format(it.value) + ' (' + Math.round(frac * 100) + '%)';
        shape.appendChild(title);
        svg.appendChild(shape);

        els.legend.appendChild(el('li', {}, [
          el('span', { class: 'legend__dot', style: 'background:' + color, 'aria-hidden': 'true' }),
          el('span', { text: it.name }),
          el('span', { class: 'legend__value' }, [
            document.createTextNode(money.format(it.value)),
            el('span', { class: 'legend__pct', text: (frac * 100).toFixed(frac < 0.1 ? 1 : 0).replace('.', ',') + '%' })
          ])
        ]));
      });
    }
    var l1 = svgEl('text', { x: cx, y: cy - 6, 'text-anchor': 'middle', class: 'chart__center-label' });
    l1.textContent = 'Всего расходов';
    var l2 = svgEl('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', class: 'chart__center-value' });
    l2.textContent = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', notation: total >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: 0 }).format(total);
    svg.appendChild(l1);
    svg.appendChild(l2);
    var desc = items.length
      ? 'Расходы по категориям: ' + items.map(function (it) { return it.name + ' ' + money.format(it.value); }).join(', ')
      : 'Нет расходов за выбранный период';
    svgTitle.textContent = desc;
  }

  function render() {
    refreshCategoryFilter();
    var f = getFilters();
    renderSummary(f);
    renderTable(filtered(f));
    renderChart(f);
  }

  /* ---------- Toolbar ---------- */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // защита от CSV-инъекций
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  els.exportCsv.addEventListener('click', function () {
    var list = filtered(getFilters());
    if (!list.length) { toast('Нет операций для экспорта'); return; }
    var lines = [['Дата', 'Тип', 'Категория', 'Комментарий', 'Сумма'].join(';')];
    list.forEach(function (t) {
      lines.push([t.date, t.type === 'income' ? 'Доход' : 'Расход', t.category, t.comment, (t.type === 'income' ? '' : '-') + t.amount.toFixed(2).replace('.', ',')].map(csvCell).join(';'));
    });
    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: 'moneytable-' + todayISO() + '.csv' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Экспортировано: ' + list.length + ' ' + plural(list.length, ['операция', 'операции', 'операций']));
  });

  els.loadDemo.addEventListener('click', function () {
    if (transactions.length && !confirm('Добавить демо-операции к существующим?')) return;
    transactions = transactions.concat(demoData());
    save();
    render();
    toast('Демо-данные загружены');
  });

  els.clearAll.addEventListener('click', function () {
    if (!transactions.length) { toast('Список уже пуст'); return; }
    if (!confirm('Удалить все операции без возможности восстановления?')) return;
    transactions = [];
    save();
    resetForm();
    toast('Все операции удалены');
  });

  /* ---------- Init ---------- */
  function init() {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    load();
    try {
      if (!localStorage.getItem(INIT_KEY)) {
        if (!transactions.length) { transactions = demoData(); save(); }
        localStorage.setItem(INIT_KEY, '1');
      }
    } catch (e) {}
    resetForm();
  }

  init();
})();
