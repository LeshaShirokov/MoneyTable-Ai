/**
 * MoneyTable — общий модуль для всех страниц.
 * Хранилище и миграция, состояние, форматирование, категории, копилки (расчёты),
 * тема, диалоги, CSV и менеджер категорий. Экспортируется в window.MoneyTable.
 */
(function (global) {
  'use strict';

  /* =========================================================
   * Константы
   * ======================================================= */
  const KEYS = {
    transactions: 'moneytable-transactions',
    categories: 'moneytable-categories',
    goals: 'moneytable-goals',
    theme: 'moneytable-theme',
    initialized: 'moneytable-initialized'
  };
  const TYPES = ['expense', 'income'];
  const UNCATEGORIZED = 'Без категории';
  const NEUTRAL_COLOR = '#94a3b8';
  const MAX_CATEGORY_NAME = 30;
  const MAX_GOAL_NAME = 40;
  const MAX_AMOUNT = 1e12;
  const DEFAULT_CATEGORIES = {
    expense: ['Продукты', 'Кафе и рестораны', 'Транспорт', 'Жильё и ЖКХ', 'Здоровье', 'Развлечения', 'Одежда', 'Связь и интернет', 'Подарки', 'Другое'],
    income: ['Зарплата', 'Фриланс', 'Подарки', 'Проценты и кешбэк', 'Другое']
  };
  const COLORS = ['#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#a855f7', '#ec4899', '#84cc16', '#f97316', '#64748b'];
  const PLURAL_OPS = ['операция', 'операции', 'операций'];

  const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 });
  const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
  const monthFmt = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

  /** Общее состояние страницы (загружается из localStorage). */
  const state = {
    transactions: [],
    categories: { expense: [], income: [] },
    goals: []
  };

  /* =========================================================
   * Утилиты
   * ======================================================= */
  const $ = (id) => document.getElementById(id);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => toISO(new Date());
  const currentMonth = () => todayISO().slice(0, 7);
  const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= '1970-01-01' && s <= '2100-12-31';
  const isMonth = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const formatDate = (s) => dateFmt.format(parseISO(s));
  /** «октябрь 2026» для значения YYYY-MM. */
  const formatMonth = (m) => monthFmt.format(parseISO(`${m}-01`)).replace(/\s*г\.$/, '');
  /** Сдвигает YYYY-MM на delta месяцев. */
  const shiftMonth = (m, delta) => {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const round2 = (n) => Math.round(n * 100) / 100;
  const parseAmount = (v) => {
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? round2(n) : NaN;
  };
  const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  const cleanName = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const sameName = (a, b) => a.toLocaleLowerCase('ru') === b.toLocaleLowerCase('ru');
  const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

  function plural(n, forms) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }
  const countLabel = (n) => `${n} ${plural(n, PLURAL_OPS)}`;

  /** Создаёт DOM-элемент. attrs: text, class, остальные — атрибуты (false/null пропускаются). */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === false || v == null) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    children.forEach((c) => { if (c != null && c !== false) node.append(c); });
    return node;
  }
  function svgEl(tag, attrs = {}, text) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text != null) node.textContent = text;
    return node;
  }

  let toastTimer;
  function toast(msg) {
    const box = $('toast');
    if (!box) return;
    box.textContent = msg;
    box.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('is-visible'), 2500);
  }

  /** Показывает ошибку в элементе #<id>Error и помечает поле aria-invalid. */
  function setError(input, msg) {
    const err = $(`${input.id}Error`);
    if (err) err.textContent = msg || '';
    if (msg) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  const clearErrors = (...inputs) => inputs.forEach((i) => setError(i, ''));
  /** Снимает ошибку с поля, как только пользователь начинает его править. */
  const clearOnInput = (...inputs) => inputs.forEach((i) => i.addEventListener('input', () => setError(i, '')));

  /** Меняет значение (и подпись) выбранного option, чтобы выбор пережил перерисовку. */
  function retargetSelect(select, from, to) {
    if (!select || select.value !== from) return;
    const opt = Array.from(select.options).find((o) => o.value === from);
    if (opt) { opt.value = to; opt.textContent = to; select.value = to; }
  }

  /* =========================================================
   * Хранилище и миграция
   * ======================================================= */
  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { toast('Не удалось сохранить данные'); }
  }
  const saveTransactions = () => writeJSON(KEYS.transactions, state.transactions);
  const saveCategories = () => writeJSON(KEYS.categories, state.categories);
  const saveGoals = () => writeJSON(KEYS.goals, state.goals);

  function normalizeTransaction(t) {
    if (!t || (t.type !== 'income' && t.type !== 'expense')) return null;
    const amount = Number(t.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !isISODate(t.date)) return null;
    return {
      id: typeof t.id === 'string' && t.id ? t.id : uid(),
      type: t.type,
      amount: round2(amount),
      category: cleanName(t.category) || UNCATEGORIZED,
      date: t.date,
      comment: typeof t.comment === 'string' ? t.comment : ''
    };
  }

  function normalizeGoal(g) {
    if (!g) return null;
    const name = cleanName(g.name);
    const target = Number(g.target);
    if (!name || !Number.isFinite(target) || target <= 0) return null;
    const history = (Array.isArray(g.history) ? g.history : []).map((h) => {
      if (!h || (h.kind !== 'deposit' && h.kind !== 'withdraw')) return null;
      const amount = Number(h.amount);
      if (!Number.isFinite(amount) || amount <= 0 || !isISODate(h.date)) return null;
      return {
        id: typeof h.id === 'string' && h.id ? h.id : uid(),
        kind: h.kind,
        amount: round2(amount),
        date: h.date,
        comment: typeof h.comment === 'string' ? h.comment : ''
      };
    }).filter(Boolean);
    return {
      id: typeof g.id === 'string' && g.id ? g.id : uid(),
      name: name.slice(0, MAX_GOAL_NAME),
      target: round2(target),
      deadline: isISODate(g.deadline) ? g.deadline : '',
      emoji: typeof g.emoji === 'string' ? g.emoji.trim().slice(0, 8) : '',
      color: isColor(g.color) ? g.color.toLowerCase() : COLORS[0],
      createdAt: isISODate(g.createdAt) ? g.createdAt : todayISO(),
      history
    };
  }

  /** Добавляет категорию в список, если имя валидно и не занято. */
  function pushCategory(list, type, { id, name, color } = {}) {
    const cleaned = cleanName(name);
    if (!cleaned || sameName(cleaned, UNCATEGORIZED) || list.some((c) => sameName(c.name, cleaned))) return null;
    const offset = type === 'income' ? 3 : 0;
    const cat = {
      id: typeof id === 'string' && id ? id : uid(),
      name: cleaned,
      color: isColor(color) ? color.toLowerCase() : COLORS[(list.length + offset) % COLORS.length]
    };
    list.push(cat);
    return cat;
  }

  /** Гарантирует, что у каждой операции есть категория в списке (миграция старых данных). */
  function ensureTransactionCategories() {
    let changed = false;
    state.transactions.forEach((t) => {
      if (t.category !== UNCATEGORIZED && !findCategory(t.type, t.category)) {
        changed = pushCategory(state.categories[t.type], t.type, { name: t.category }) !== null || changed;
      }
    });
    return changed;
  }

  /**
   * Загружает данные из localStorage. Старые данные (без категорий) мигрируют:
   * берутся стандартные категории плюс все названия, уже встречающиеся в операциях.
   * persist=false — только прочитать (используется при синхронизации между вкладками).
   */
  function loadState({ persist = true } = {}) {
    const rawTx = readJSON(KEYS.transactions);
    state.transactions = Array.isArray(rawTx) ? rawTx.map(normalizeTransaction).filter(Boolean) : [];

    const rawCats = readJSON(KEYS.categories);
    TYPES.forEach((type) => {
      const list = [];
      const source = rawCats && Array.isArray(rawCats[type])
        ? rawCats[type]
        : DEFAULT_CATEGORIES[type].map((name) => ({ name }));
      source.forEach((c) => c && pushCategory(list, type, c));
      if (!list.length) DEFAULT_CATEGORIES[type].forEach((name) => pushCategory(list, type, { name }));
      state.categories[type] = list;
    });
    ensureTransactionCategories();

    const rawGoals = readJSON(KEYS.goals);
    state.goals = Array.isArray(rawGoals) ? rawGoals.map(normalizeGoal).filter(Boolean) : [];

    if (persist) {
      saveCategories();
      saveTransactions();
    }
  }

  /* =========================================================
   * Категории — логика
   * ======================================================= */
  function findCategory(type, name) {
    return state.categories[type].find((c) => c.name === name) || null;
  }
  function categoryColor(type, name) {
    const cat = findCategory(type, name) || findCategory(type === 'income' ? 'expense' : 'income', name);
    return cat ? cat.color : NEUTRAL_COLOR;
  }
  const categoryNameExists = (name) => TYPES.some((tp) => findCategory(tp, name));
  function countUsage(type, name) {
    return state.transactions.filter((t) => t.type === type && t.category === name).length;
  }
  function validateCategoryName(type, name, exceptId) {
    if (!name) return 'Введите название категории';
    if (name.length > MAX_CATEGORY_NAME) return `Не длиннее ${MAX_CATEGORY_NAME} символов`;
    if (sameName(name, UNCATEGORIZED)) return `«${UNCATEGORIZED}» — служебное название`;
    if (state.categories[type].some((c) => c.id !== exceptId && sameName(c.name, name))) return 'Такая категория уже есть';
    return '';
  }

  /** Возвращает текст ошибки или ''. */
  function addCategory(type, rawName, color) {
    const name = cleanName(rawName);
    const error = validateCategoryName(type, name);
    if (error) return error;
    pushCategory(state.categories[type], type, { name, color });
    saveCategories();
    return '';
  }

  /** Переименовывает категорию и все её операции. Возвращает { error } или { from, to }. */
  function renameCategory(type, id, rawName) {
    const cat = state.categories[type].find((c) => c.id === id);
    if (!cat) return { error: 'Категория не найдена' };
    const name = cleanName(rawName);
    if (name === cat.name) return { from: name, to: name };
    const error = validateCategoryName(type, name, id);
    if (error) return { error };
    const from = cat.name;
    cat.name = name;
    state.transactions.forEach((t) => { if (t.type === type && t.category === from) t.category = name; });
    saveCategories();
    saveTransactions();
    return { from, to: name };
  }

  /** Удаляет категорию, перенося её операции в target. */
  function deleteCategory(type, id, target) {
    const list = state.categories[type];
    const cat = list.find((c) => c.id === id);
    if (!cat) return null;
    state.transactions.forEach((t) => { if (t.type === type && t.category === cat.name) t.category = target; });
    state.categories[type] = list.filter((c) => c.id !== id);
    saveCategories();
    saveTransactions();
    return cat.name;
  }

  /* =========================================================
   * Расчёты: итоги и копилки
   * ======================================================= */
  const findGoal = (id) => state.goals.find((g) => g.id === id) || null;
  const goalSaved = (g) => round2(g.history.reduce((s, h) => s + (h.kind === 'deposit' ? h.amount : -h.amount), 0));
  const goalDone = (g) => goalSaved(g) >= g.target;
  const totalInGoals = () => round2(state.goals.reduce((s, g) => s + goalSaved(g), 0));

  /** Доходы и расходы за месяц YYYY-MM (или за всё время, если month пустой). */
  function totals(month) {
    const r = { income: 0, expense: 0, incomeCount: 0, expenseCount: 0 };
    state.transactions.forEach((t) => {
      if (month && t.date.slice(0, 7) !== month) return;
      r[t.type] += t.amount;
      r[`${t.type}Count`] += 1;
    });
    r.income = round2(r.income);
    r.expense = round2(r.expense);
    return r;
  }
  /** Свободный остаток: баланс за всё время минус деньги в копилках. */
  function freeBalance() {
    const all = totals('');
    return round2(all.income - all.expense - totalInGoals());
  }

  /* =========================================================
   * Демо-данные
   * ======================================================= */
  function demoDate(monthsAgo, day) {
    const now = new Date();
    let d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, Math.min(day, 28));
    if (d > now) d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return toISO(d);
  }
  function demoTransactions() {
    const rows = [
      ['income', 120000, 'Зарплата', demoDate(0, 5), 'Аванс и зарплата'],
      ['income', 25000, 'Фриланс', demoDate(0, 12), 'Лендинг для клиента'],
      ['expense', 35000, 'Жильё и ЖКХ', demoDate(0, 3), 'Аренда квартиры'],
      ['expense', 8420.5, 'Продукты', demoDate(0, 6), 'Закупка на неделю'],
      ['expense', 2350, 'Кафе и рестораны', demoDate(0, 8), 'Ужин с друзьями'],
      ['expense', 1800, 'Транспорт', demoDate(0, 10), 'Проездной на месяц'],
      ['expense', 650, 'Связь и интернет', demoDate(0, 11), 'Мобильная связь'],
      ['expense', 4990, 'Развлечения', demoDate(0, 14), 'Билеты в театр'],
      ['expense', 3200, 'Здоровье', demoDate(0, 15), 'Аптека'],
      ['income', 115000, 'Зарплата', demoDate(1, 5), 'Зарплата'],
      ['expense', 35000, 'Жильё и ЖКХ', demoDate(1, 3), 'Аренда квартиры'],
      ['expense', 11250, 'Продукты', demoDate(1, 9), 'Продукты'],
      ['expense', 7600, 'Одежда', demoDate(1, 18), 'Куртка'],
      ['expense', 3000, 'Подарки', demoDate(1, 21), 'Подарок маме']
    ];
    return rows.map(([type, amount, category, date, comment]) => ({ id: uid(), type, amount, category, date, comment }));
  }
  function demoGoals() {
    const now = new Date();
    const deadline = toISO(new Date(now.getFullYear(), now.getMonth() + 6, 1));
    return [
      {
        name: 'Отпуск на море', target: 150000, deadline, emoji: '🏖️', color: '#06b6d4',
        history: [
          { kind: 'deposit', amount: 20000, date: demoDate(1, 6), comment: 'С зарплаты' },
          { kind: 'deposit', amount: 15000, date: demoDate(0, 6), comment: 'С зарплаты' }
        ]
      },
      {
        name: 'Подушка безопасности', target: 30000, deadline: '', emoji: '🛟', color: '#10b981',
        history: [
          { kind: 'deposit', amount: 20000, date: demoDate(1, 7), comment: '' },
          { kind: 'deposit', amount: 12000, date: demoDate(0, 13), comment: 'Гонорар' },
          { kind: 'withdraw', amount: 2000, date: demoDate(0, 15), comment: 'Аптека' }
        ]
      }
    ].map(normalizeGoal);
  }
  /** Добавляет демо-операции (и демо-копилки, если копилок нет) к текущим данным. */
  function addDemoData() {
    state.transactions = state.transactions.concat(demoTransactions());
    if (!state.goals.length) state.goals = demoGoals();
    ensureTransactionCategories();
    saveTransactions();
    saveGoals();
    saveCategories();
  }
  /** При самом первом визите (на любой странице) показываем демо-данные. */
  function seedOnFirstVisit() {
    try {
      if (localStorage.getItem(KEYS.initialized)) return;
      if (!state.transactions.length && !state.goals.length) addDemoData();
      localStorage.setItem(KEYS.initialized, '1');
    } catch (e) { /* localStorage недоступен */ }
  }

  /* =========================================================
   * Тема
   * ======================================================= */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = $('themeToggle');
    if (!btn) return;
    btn.setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
    btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }
  function initTheme() {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    const btn = $('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(KEYS.theme, next); } catch (e) { /* приватный режим */ }
    });
  }

  /* =========================================================
   * Диалоги (нативный <dialog> с запасным вариантом)
   * ======================================================= */
  const focusStack = [];
  const supportsModal = (dlg) => typeof dlg.showModal === 'function';
  const isOpen = (dlg) => dlg.hasAttribute('open');

  function restoreFocus() {
    const prev = focusStack.pop();
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus();
  }
  function openDialog(dlg, focusTarget) {
    focusStack.push(document.activeElement);
    if (supportsModal(dlg)) { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
    const first = focusTarget || dlg.querySelector('input:not([type=hidden]):not([type=radio]), select');
    if (first) first.focus();
  }
  function closeDialog(dlg) {
    if (supportsModal(dlg)) { if (dlg.open) dlg.close(); }
    else if (isOpen(dlg)) { dlg.removeAttribute('open'); restoreFocus(); }
  }
  /** Закрытие по крестику/кнопке [data-close], клику по подложке и восстановление фокуса. */
  function registerDialog(dlg) {
    if (dlg.dataset.registered) return;
    dlg.dataset.registered = '1';
    dlg.addEventListener('close', restoreFocus);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) closeDialog(dlg);
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = Array.from(document.querySelectorAll('dialog[open]')).filter((d) => !supportsModal(d));
    if (open.length) closeDialog(open[open.length - 1]);
  });

  /* =========================================================
   * Кольцевая диаграмма (SVG)
   * ======================================================= */
  function arcPath(cx, cy, r, ri, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (rad, a) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`;
    return `M${pt(r, a0)} A${r} ${r} 0 ${large} 1 ${pt(r, a1)} L${pt(ri, a1)} A${ri} ${ri} 0 ${large} 0 ${pt(ri, a0)} Z`;
  }

  /**
   * Рисует кольцевую диаграмму и легенду. items: [{ name, value, color }] (уже отсортированы).
   * desc — <title> внутри svg (сохраняется), title — подпись для описания, centerLabel — текст в центре.
   */
  function drawDonut({ svg, desc, legend, items, title, centerLabel, emptyText }) {
    const total = items.reduce((s, it) => s + it.value, 0);
    Array.from(svg.childNodes).forEach((n) => { if (n !== desc) svg.removeChild(n); });
    legend.innerHTML = '';

    const cx = 100, cy = 100, r = 90, ri = 58;
    if (!items.length) {
      svg.append(svgEl('circle', { cx, cy, r: (r + ri) / 2, fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': r - ri }));
      legend.append(el('li', { class: 'legend__empty', text: emptyText }));
    }
    let a = -Math.PI / 2;
    items.forEach((it) => {
      const frac = it.value / total;
      let shape;
      if (frac >= 0.9999) {
        shape = svgEl('circle', { cx, cy, r: (r + ri) / 2, fill: 'none', stroke: it.color, 'stroke-width': r - ri });
      } else {
        const a1 = a + frac * Math.PI * 2;
        shape = svgEl('path', { d: arcPath(cx, cy, r, ri, a, a1), fill: it.color });
        a = a1;
      }
      shape.append(svgEl('title', {}, `${it.name}: ${money.format(it.value)} (${Math.round(frac * 100)}%)`));
      svg.append(shape);

      legend.append(el('li', {}, [
        el('span', { class: 'legend__dot', style: `background:${it.color}`, 'aria-hidden': 'true' }),
        el('span', { text: it.name }),
        el('span', { class: 'legend__value' }, [
          money.format(it.value),
          el('span', { class: 'legend__pct', text: `${(frac * 100).toFixed(frac < 0.1 ? 1 : 0).replace('.', ',')}%` })
        ])
      ]));
    });
    svg.append(
      svgEl('text', { x: cx, y: cy - 6, 'text-anchor': 'middle', class: 'chart__center-label' }, centerLabel),
      svgEl('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', class: 'chart__center-value' },
        new Intl.NumberFormat('ru-RU', {
          style: 'currency', currency: 'RUB', notation: total >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: 0
        }).format(total))
    );
    desc.textContent = items.length
      ? `${title}: ${items.map((it) => `${it.name} ${money.format(it.value)}`).join(', ')}`
      : emptyText;
  }

  /* =========================================================
   * CSV
   * ======================================================= */
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    // Защита от CSV-инъекций; обычные числа (в том числе отрицательные) оставляем как есть.
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  const csvAmount = (n) => n.toFixed(2).replace('.', ',');
  function downloadCsv(rows, filename) {
    const content = '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* =========================================================
   * Менеджер категорий (диалог создаётся по требованию)
   * ======================================================= */
  const CATEGORY_DIALOGS = `
  <dialog class="dialog" id="catDialog" aria-labelledby="catDialogTitle">
    <div class="dialog__body">
      <div class="dialog__head">
        <h2 id="catDialogTitle">Категории</h2>
        <button type="button" class="btn btn--icon" data-close aria-label="Закрыть">✕</button>
      </div>
      <fieldset class="segmented">
        <legend class="sr-only">Тип категорий</legend>
        <input type="radio" name="catType" id="catTypeExpense" value="expense" checked>
        <label for="catTypeExpense">Расходы</label>
        <input type="radio" name="catType" id="catTypeIncome" value="income">
        <label for="catTypeIncome">Доходы</label>
      </fieldset>
      <p class="field__error" id="catError" role="alert"></p>
      <ul class="cat-list" id="catList" aria-label="Список категорий"></ul>
      <form class="cat-add" id="catAddForm" novalidate>
        <input type="color" class="color-input" id="catNewColor" value="#6366f1" aria-label="Цвет новой категории">
        <input type="text" class="input" id="catNewName" maxlength="${MAX_CATEGORY_NAME}" placeholder="Новая категория" aria-label="Название новой категории" aria-describedby="catNewNameError" autocomplete="off">
        <button type="submit" class="btn btn--primary">Добавить</button>
        <span class="field__error cat-add__error" id="catNewNameError" role="alert"></span>
      </form>
      <p class="dialog__note">Переименование обновит все операции этой категории. Изменения сохраняются сразу.</p>
    </div>
  </dialog>
  <dialog class="dialog dialog--small" id="catDelDialog" aria-labelledby="catDelTitle">
    <form class="dialog__body" id="catDelForm" novalidate>
      <div class="dialog__head">
        <h2 id="catDelTitle">Удалить категорию</h2>
        <button type="button" class="btn btn--icon" data-close aria-label="Закрыть">✕</button>
      </div>
      <p id="catDelText"></p>
      <div class="field">
        <label for="catDelTarget">Перенести операции в</label>
        <select id="catDelTarget"></select>
      </div>
      <div class="dialog__actions">
        <button type="button" class="btn btn--ghost" data-close>Отмена</button>
        <button type="submit" class="btn btn--danger">Удалить и перенести</button>
      </div>
    </form>
  </dialog>`;

  /**
   * Подключает менеджер категорий к кнопкам [data-open-categories].
   * getType() — какой тип показать при открытии; onChange(change) вызывается после
   * каждого изменения: { action: 'add'|'rename'|'color'|'delete', type, from, to }.
   * Возвращает { open, refresh } — refresh перерисовывает список, если диалог открыт.
   */
  function createCategoryManager({ getType = () => 'expense', onChange = () => {} } = {}) {
    document.body.insertAdjacentHTML('beforeend', CATEGORY_DIALOGS);
    const els = {
      dialog: $('catDialog'), list: $('catList'), error: $('catError'),
      addForm: $('catAddForm'), newName: $('catNewName'), newColor: $('catNewColor'),
      delDialog: $('catDelDialog'), delForm: $('catDelForm'), delText: $('catDelText'), delTarget: $('catDelTarget')
    };
    registerDialog(els.dialog);
    registerDialog(els.delDialog);
    let pendingDelete = null;

    const managerType = () => els.dialog.querySelector('input[name="catType"]:checked').value;
    const findById = (type, id) => state.categories[type].find((c) => c.id === id) || null;

    function render() {
      const type = managerType();
      const focusedKey = els.list.contains(document.activeElement) ? document.activeElement.dataset.key : null;
      els.list.innerHTML = '';
      state.categories[type].forEach((cat) => {
        const used = countUsage(type, cat.name);
        els.list.append(el('li', { class: 'cat-item', 'data-id': cat.id }, [
          el('input', {
            type: 'color', class: 'color-input', value: cat.color, 'data-role': 'color', 'data-key': `color:${cat.id}`,
            'aria-label': `Цвет категории «${cat.name}»`
          }),
          el('input', {
            type: 'text', class: 'input', value: cat.name, maxlength: MAX_CATEGORY_NAME, 'data-role': 'name',
            'data-key': `name:${cat.id}`, 'aria-label': `Название категории «${cat.name}»`, autocomplete: 'off'
          }),
          el('span', { class: 'cat-item__count', text: used ? countLabel(used) : 'не используется' }),
          el('button', {
            type: 'button', class: 'btn btn--danger btn--small', 'data-role': 'delete', 'data-key': `delete:${cat.id}`,
            'aria-label': `Удалить категорию «${cat.name}»`, title: 'Удалить', text: '✕'
          })
        ]));
      });
      if (focusedKey) {
        const again = els.list.querySelector(`[data-key="${focusedKey}"]`);
        if (again) again.focus();
      }
      els.newColor.value = COLORS[(state.categories[type].length + (type === 'income' ? 3 : 0)) % COLORS.length];
    }

    function changed(change) {
      onChange(change);
      if (isOpen(els.dialog)) render();
    }

    function open() {
      const type = getType() === 'income' ? 'income' : 'expense';
      $(type === 'income' ? 'catTypeIncome' : 'catTypeExpense').checked = true;
      els.error.textContent = '';
      els.newName.value = '';
      setError(els.newName, '');
      render();
      openDialog(els.dialog, els.newName);
    }

    document.querySelectorAll('[data-open-categories]').forEach((btn) => btn.addEventListener('click', open));

    els.dialog.addEventListener('change', (e) => {
      if (e.target.name !== 'catType') return;
      els.error.textContent = '';
      render();
    });

    els.list.addEventListener('change', (e) => {
      const item = e.target.closest('.cat-item');
      if (!item) return;
      const type = managerType();
      const cat = findById(type, item.dataset.id);
      if (!cat) return;

      if (e.target.dataset.role === 'name') {
        const res = renameCategory(type, cat.id, e.target.value);
        if (res.error) {
          els.error.textContent = `«${cleanName(e.target.value) || '…'}»: ${res.error}`;
          e.target.value = cat.name;
          return;
        }
        els.error.textContent = '';
        if (res.from !== res.to) {
          changed({ action: 'rename', type, from: res.from, to: res.to });
          toast('Категория переименована');
        } else {
          e.target.value = cat.name;
        }
      } else if (e.target.dataset.role === 'color' && isColor(e.target.value)) {
        cat.color = e.target.value.toLowerCase();
        saveCategories();
        changed({ action: 'color', type, from: cat.name, to: cat.name });
      }
    });

    els.list.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.dataset.role === 'name') {
        e.preventDefault();
        e.target.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    els.list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-role="delete"]');
      if (!btn) return;
      const type = managerType();
      const cat = findById(type, btn.closest('.cat-item').dataset.id);
      if (!cat) return;
      if (state.categories[type].length <= 1) {
        els.error.textContent = 'Должна остаться хотя бы одна категория';
        return;
      }
      const used = countUsage(type, cat.name);
      if (!used) {
        if (!confirm(`Удалить категорию «${cat.name}»?`)) return;
        deleteCategory(type, cat.id, UNCATEGORIZED);
        els.error.textContent = '';
        changed({ action: 'delete', type, from: cat.name, to: UNCATEGORIZED });
        toast('Категория удалена');
        return;
      }
      pendingDelete = { type, id: cat.id };
      els.delText.textContent = `Категория «${cat.name}» используется в ${used} ${plural(used, ['операции', 'операциях', 'операциях'])}. Куда перенести их?`;
      els.delTarget.innerHTML = '';
      state.categories[type].filter((c) => c.id !== cat.id)
        .forEach((c) => els.delTarget.append(el('option', { value: c.name, text: c.name })));
      els.delTarget.append(el('option', { value: UNCATEGORIZED, text: UNCATEGORIZED }));
      openDialog(els.delDialog, els.delTarget);
    });

    els.delForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const pending = pendingDelete;
      pendingDelete = null;
      closeDialog(els.delDialog);
      if (!pending) return;
      const target = els.delTarget.value || UNCATEGORIZED;
      const from = deleteCategory(pending.type, pending.id, target);
      els.error.textContent = '';
      if (from !== null) {
        changed({ action: 'delete', type: pending.type, from, to: target });
        toast(`Категория удалена, операции перенесены в «${target}»`);
      }
    });

    els.addForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const type = managerType();
      const name = cleanName(els.newName.value);
      const error = addCategory(type, name, els.newColor.value);
      if (error) {
        setError(els.newName, error);
        els.newName.focus();
        return;
      }
      setError(els.newName, '');
      els.newName.value = '';
      changed({ action: 'add', type, from: name, to: name });
      els.newName.focus();
      toast('Категория добавлена');
    });
    clearOnInput(els.newName);

    return { open, refresh: () => { if (isOpen(els.dialog)) render(); } };
  }

  /* =========================================================
   * Запуск страницы
   * ======================================================= */
  const DATA_KEYS = [KEYS.transactions, KEYS.categories, KEYS.goals];

  /**
   * Общая инициализация: тема, диалоги, загрузка данных, демо при первом визите,
   * синхронизация между вкладками и при возврате по истории. render() — отрисовка страницы.
   * Страница со своими данными передаёт { keys, reload }: при изменении этих ключей
   * в другой вкладке (и при возврате из bfcache) вызывается reload() перед render().
   */
  function initPage(render, { keys = [], reload = null } = {}) {
    initTheme();
    document.querySelectorAll('dialog').forEach(registerDialog);
    loadState();
    seedOnFirstVisit();

    const resync = () => {
      loadState({ persist: false });
      if (reload) reload();
      render();
    };
    global.addEventListener('storage', (e) => {
      if (e.key === KEYS.theme) {
        if (e.newValue === 'dark' || e.newValue === 'light') applyTheme(e.newValue);
      } else if (e.key === null || DATA_KEYS.includes(e.key) || keys.includes(e.key)) {
        resync();
      }
    });
    // Страница восстановлена из bfcache (кнопка «назад») — данные могли измениться на другой странице.
    global.addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      try {
        const saved = localStorage.getItem(KEYS.theme);
        if (saved === 'dark' || saved === 'light') applyTheme(saved);
      } catch (err) { /* localStorage недоступен */ }
      resync();
    });
    render();
  }

  global.MoneyTable = Object.freeze({
    // константы
    TYPES, COLORS, MAX_GOAL_NAME, MAX_AMOUNT,
    // состояние и форматирование
    state, money, countLabel, plural,
    // утилиты
    $, el, svgEl, uid, todayISO, currentMonth, isISODate, isMonth, parseISO, formatDate, formatMonth, shiftMonth,
    round2, parseAmount, isColor, cleanName, sameName, byDateDesc,
    toast, setError, clearErrors, clearOnInput, retargetSelect,
    // хранилище
    readJSON, writeJSON, saveTransactions, saveGoals, normalizeGoal, addDemoData, demoDate,
    // категории
    findCategory, categoryColor, categoryNameExists, createCategoryManager,
    // расчёты
    totals, freeBalance, findGoal, goalSaved, goalDone, totalInGoals,
    // диалоги и CSV
    openDialog, closeDialog, csvAmount, downloadCsv, drawDonut,
    initPage
  });
})(window);
