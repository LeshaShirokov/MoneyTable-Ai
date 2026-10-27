(() => {
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
  const DEFAULT_CATEGORIES = {
    expense: ['Продукты', 'Кафе и рестораны', 'Транспорт', 'Жильё и ЖКХ', 'Здоровье', 'Развлечения', 'Одежда', 'Связь и интернет', 'Подарки', 'Другое'],
    income: ['Зарплата', 'Фриланс', 'Подарки', 'Проценты и кешбэк', 'Другое']
  };
  const COLORS = ['#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#a855f7', '#ec4899', '#84cc16', '#f97316', '#64748b'];
  const PLURAL_OPS = ['операция', 'операции', 'операций'];
  const PLURAL_DAYS = ['день', 'дня', 'дней'];

  const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 });
  const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
  const monthFmt = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

  /* =========================================================
   * Состояние и элементы
   * ======================================================= */
  const state = {
    transactions: [],
    categories: { expense: [], income: [] },
    goals: []
  };
  const ui = {
    openHistory: new Set(),
    pendingCategoryDelete: null
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    // форма операции
    form: $('txForm'), id: $('txId'), amount: $('amount'), category: $('category'), date: $('date'), comment: $('comment'),
    submit: $('submitBtn'), cancel: $('cancelEdit'), formTitle: $('formTitle'),
    // сводка
    sumBalance: $('sumBalance'), sumIncome: $('sumIncome'), sumExpense: $('sumExpense'), sumFree: $('sumFree'),
    countIncome: $('countIncome'), countExpense: $('countExpense'), periodLabel: $('periodLabel'), freeHint: $('freeHint'),
    // фильтры и таблица
    fType: $('fType'), fCategory: $('fCategory'), fMonth: $('fMonth'), fSearch: $('fSearch'), fSort: $('fSort'),
    resetFilters: $('resetFilters'), body: $('txBody'), empty: $('emptyState'),
    // диаграмма
    chart: $('chart'), chartDesc: $('chartDesc'), legend: $('legend'),
    // панель инструментов
    exportCsv: $('exportCsv'), loadDemo: $('loadDemo'), clearAll: $('clearAll'),
    themeToggle: $('themeToggle'), toast: $('toast'),
    // категории
    catDialog: $('catDialog'), catList: $('catList'), catError: $('catError'),
    catAddForm: $('catAddForm'), catNewName: $('catNewName'), catNewColor: $('catNewColor'),
    catDelDialog: $('catDelDialog'), catDelForm: $('catDelForm'), catDelText: $('catDelText'), catDelTarget: $('catDelTarget'),
    // копилки
    goalsList: $('goalsList'), goalsEmpty: $('goalsEmpty'), addGoal: $('addGoal'), exportGoalsCsv: $('exportGoalsCsv'),
    goalDialog: $('goalDialog'), goalForm: $('goalForm'), goalDialogTitle: $('goalDialogTitle'), goalSubmit: $('goalSubmit'),
    goalId: $('goalId'), goalName: $('goalName'), goalTarget: $('goalTarget'), goalDeadline: $('goalDeadline'),
    goalEmoji: $('goalEmoji'), goalColor: $('goalColor'),
    moveDialog: $('moveDialog'), moveForm: $('moveForm'), moveTitle: $('moveTitle'), moveHint: $('moveHint'),
    moveGoalId: $('moveGoalId'), moveAmount: $('moveAmount'), moveDate: $('moveDate'), moveComment: $('moveComment'),
    moveSubmit: $('moveSubmit')
  };

  /* =========================================================
   * Утилиты
   * ======================================================= */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => toISO(new Date());
  const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= '1970-01-01' && s <= '2100-12-31';
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const formatDate = (s) => dateFmt.format(parseISO(s));
  const round2 = (n) => Math.round(n * 100) / 100;
  const parseAmount = (v) => {
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? round2(n) : NaN;
  };
  const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  const cleanName = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const sameName = (a, b) => a.toLocaleLowerCase('ru') === b.toLocaleLowerCase('ru');

  function plural(n, forms) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }
  const countLabel = (n) => `${n} ${plural(n, PLURAL_OPS)}`;

  /** Создаёт DOM-элемент. attrs: text, class, остальные — атрибуты. */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === false || v == null) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    children.forEach((c) => { if (c) node.append(c); });
    return node;
  }
  function svgEl(tag, attrs = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 2500);
  }

  function setError(input, msg) {
    const err = $(`${input.id}Error`);
    if (err) err.textContent = msg || '';
    if (msg) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  function clearErrors(...inputs) { inputs.forEach((i) => setError(i, '')); }

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

  function loadState() {
    const rawTx = readJSON(KEYS.transactions);
    state.transactions = Array.isArray(rawTx) ? rawTx.map(normalizeTransaction).filter(Boolean) : [];

    // Категории: сохранённые пользователем или стандартные (для данных старой версии)
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

    saveCategories();
    saveTransactions();
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

  /** Меняет значение (и подпись) выбранного option, чтобы выбор пережил перерисовку. */
  function retargetSelect(select, from, to) {
    if (select.value !== from) return;
    const opt = Array.from(select.options).find((o) => o.value === from);
    if (opt) { opt.value = to; opt.textContent = to; select.value = to; }
  }

  function addCategory(type, rawName, color) {
    const name = cleanName(rawName);
    const error = validateCategoryName(type, name);
    if (error) return error;
    pushCategory(state.categories[type], type, { name, color });
    saveCategories();
    return '';
  }

  function renameCategory(type, id, rawName) {
    const cat = state.categories[type].find((c) => c.id === id);
    if (!cat) return 'Категория не найдена';
    const name = cleanName(rawName);
    if (name === cat.name) return '';
    const error = validateCategoryName(type, name, id);
    if (error) return error;
    const old = cat.name;
    cat.name = name;
    state.transactions.forEach((t) => { if (t.type === type && t.category === old) t.category = name; });
    if (currentType() === type) retargetSelect(els.category, old, name);
    if (!TYPES.some((tp) => findCategory(tp, old)) && !state.transactions.some((t) => t.category === old)) {
      retargetSelect(els.fCategory, old, name);
    }
    saveCategories();
    saveTransactions();
    return '';
  }

  function deleteCategory(type, id, target) {
    const list = state.categories[type];
    const cat = list.find((c) => c.id === id);
    if (!cat) return;
    state.transactions.forEach((t) => { if (t.type === type && t.category === cat.name) t.category = target; });
    if (currentType() === type) retargetSelect(els.category, cat.name, target);
    state.categories[type] = list.filter((c) => c.id !== id);
    saveCategories();
    saveTransactions();
  }

  /* =========================================================
   * Копилки — логика
   * ======================================================= */
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

  const findGoal = (id) => state.goals.find((g) => g.id === id) || null;
  const goalSaved = (g) => round2(g.history.reduce((s, h) => s + (h.kind === 'deposit' ? h.amount : -h.amount), 0));
  const goalDone = (g) => goalSaved(g) >= g.target;
  const totalInGoals = () => round2(state.goals.reduce((s, g) => s + goalSaved(g), 0));

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

  /* =========================================================
   * Тема
   * ======================================================= */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    els.themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
    els.themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }
  els.themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(KEYS.theme, next); } catch (e) { /* приватный режим */ }
  });

  /* =========================================================
   * Диалоги (нативный <dialog> с запасным вариантом)
   * ======================================================= */
  const focusStack = [];
  const supportsModal = (dlg) => typeof dlg.showModal === 'function';

  function openDialog(dlg, focusTarget) {
    focusStack.push(document.activeElement);
    if (supportsModal(dlg)) { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
    const first = focusTarget || dlg.querySelector('input:not([type=hidden]):not([type=radio]), select');
    if (first) first.focus();
  }
  function closeDialog(dlg) {
    if (supportsModal(dlg)) { if (dlg.open) dlg.close(); }
    else if (dlg.hasAttribute('open')) { dlg.removeAttribute('open'); restoreFocus(); }
  }
  function restoreFocus() {
    const prev = focusStack.pop();
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus();
  }
  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.addEventListener('close', restoreFocus);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) closeDialog(dlg);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = Array.from(document.querySelectorAll('dialog[open]')).filter((d) => !supportsModal(d));
    if (open.length) closeDialog(open[open.length - 1]);
  });

  /* =========================================================
   * Форма операции
   * ======================================================= */
  const currentType = () => els.form.querySelector('input[name="type"]:checked').value;

  function fillCategorySelect(type, selected) {
    els.category.innerHTML = '';
    els.category.append(el('option', { value: '', text: 'Выберите категорию' }));
    state.categories[type].forEach((c) => els.category.append(el('option', { value: c.name, text: c.name })));
    if (selected && !findCategory(type, selected)) {
      els.category.append(el('option', { value: selected, text: selected }));
    }
    els.category.value = selected || '';
  }

  function validateTransactionForm() {
    let first = null;
    const fail = (input, msg) => { setError(input, msg); first = first || input; };
    const amount = parseAmount(els.amount.value);
    if (!(amount > 0)) fail(els.amount, 'Введите сумму больше нуля');
    else if (amount > 1e12) fail(els.amount, 'Слишком большая сумма');
    else setError(els.amount, '');

    if (!els.category.value) fail(els.category, 'Выберите категорию');
    else setError(els.category, '');

    if (!isISODate(els.date.value)) fail(els.date, 'Укажите корректную дату');
    else setError(els.date, '');

    if (first) { first.focus(); return null; }
    return amount;
  }

  function resetForm() {
    els.form.reset();
    els.id.value = '';
    $('typeExpense').checked = true;
    fillCategorySelect('expense');
    els.date.value = todayISO();
    clearErrors(els.amount, els.category, els.date);
    els.submit.textContent = 'Добавить';
    els.formTitle.textContent = 'Новая операция';
    els.cancel.hidden = true;
    render();
  }

  els.form.addEventListener('change', (e) => {
    if (e.target.name === 'type') fillCategorySelect(currentType(), '');
  });
  [els.amount, els.category, els.date].forEach((input) => {
    input.addEventListener('input', () => { if (input.hasAttribute('aria-invalid')) setError(input, ''); });
  });

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = validateTransactionForm();
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
      toast('Операция обновлена');
    } else {
      state.transactions.push({ id: uid(), ...data });
      toast('Операция добавлена');
    }
    saveTransactions();
    resetForm();
  });
  els.cancel.addEventListener('click', resetForm);

  function startEdit(id) {
    const t = state.transactions.find((x) => x.id === id);
    if (!t) return;
    els.id.value = t.id;
    $(t.type === 'income' ? 'typeIncome' : 'typeExpense').checked = true;
    fillCategorySelect(t.type, t.category);
    els.amount.value = t.amount;
    els.date.value = t.date;
    els.comment.value = t.comment;
    clearErrors(els.amount, els.category, els.date);
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
    saveTransactions();
    if (els.id.value === id) resetForm(); else render();
    toast('Операция удалена');
  }

  /* =========================================================
   * Менеджер категорий — интерфейс
   * ======================================================= */
  const managerType = () => els.catDialog.querySelector('input[name="catType"]:checked').value;

  function renderCategoryManager() {
    const type = managerType();
    const focusedKey = document.activeElement && els.catList.contains(document.activeElement)
      ? document.activeElement.dataset.key : null;

    els.catList.innerHTML = '';
    state.categories[type].forEach((cat) => {
      const used = countUsage(type, cat.name);
      els.catList.append(el('li', { class: 'cat-item', 'data-id': cat.id }, [
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
      const again = els.catList.querySelector(`[data-key="${focusedKey}"]`);
      if (again) again.focus();
    }
    const nextColor = COLORS[(state.categories[type].length + (type === 'income' ? 3 : 0)) % COLORS.length];
    els.catNewColor.value = nextColor;
  }

  function openCategoryManager() {
    const type = currentType();
    $(type === 'income' ? 'catTypeIncome' : 'catTypeExpense').checked = true;
    els.catError.textContent = '';
    els.catNewName.value = '';
    setError(els.catNewName, '');
    renderCategoryManager();
    openDialog(els.catDialog, els.catNewName);
  }

  document.querySelectorAll('[data-open-categories]').forEach((btn) => btn.addEventListener('click', openCategoryManager));

  els.catDialog.addEventListener('change', (e) => {
    if (e.target.name === 'catType') {
      els.catError.textContent = '';
      renderCategoryManager();
    }
  });

  els.catList.addEventListener('change', (e) => {
    const item = e.target.closest('.cat-item');
    if (!item) return;
    const type = managerType();
    const id = item.dataset.id;
    const cat = state.categories[type].find((c) => c.id === id);
    if (!cat) return;

    if (e.target.dataset.role === 'name') {
      const error = renameCategory(type, id, e.target.value);
      if (error) {
        els.catError.textContent = `«${cleanName(e.target.value) || '…'}»: ${error}`;
        e.target.value = cat.name;
        return;
      }
      els.catError.textContent = '';
      render();
      toast('Категория переименована');
    } else if (e.target.dataset.role === 'color' && isColor(e.target.value)) {
      cat.color = e.target.value.toLowerCase();
      saveCategories();
      render();
    }
  });

  els.catList.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.role === 'name') {
      e.preventDefault();
      e.target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  els.catList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role="delete"]');
    if (!btn) return;
    const type = managerType();
    const cat = state.categories[type].find((c) => c.id === btn.closest('.cat-item').dataset.id);
    if (!cat) return;
    if (state.categories[type].length <= 1) {
      els.catError.textContent = 'Должна остаться хотя бы одна категория';
      return;
    }
    const used = countUsage(type, cat.name);
    if (!used) {
      if (!confirm(`Удалить категорию «${cat.name}»?`)) return;
      deleteCategory(type, cat.id, UNCATEGORIZED);
      els.catError.textContent = '';
      render();
      toast('Категория удалена');
      return;
    }
    ui.pendingCategoryDelete = { type, id: cat.id };
    els.catDelText.textContent = `Категория «${cat.name}» используется в ${used} ${plural(used, ['операции', 'операциях', 'операциях'])}. Куда перенести их?`;
    els.catDelTarget.innerHTML = '';
    state.categories[type].filter((c) => c.id !== cat.id)
      .forEach((c) => els.catDelTarget.append(el('option', { value: c.name, text: c.name })));
    els.catDelTarget.append(el('option', { value: UNCATEGORIZED, text: UNCATEGORIZED }));
    openDialog(els.catDelDialog, els.catDelTarget);
  });

  els.catDelForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const pending = ui.pendingCategoryDelete;
    ui.pendingCategoryDelete = null;
    if (pending) {
      const target = els.catDelTarget.value || UNCATEGORIZED;
      deleteCategory(pending.type, pending.id, target);
      toast(`Категория удалена, операции перенесены в «${target}»`);
    }
    closeDialog(els.catDelDialog);
    els.catError.textContent = '';
    render();
  });

  els.catAddForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = managerType();
    const error = addCategory(type, els.catNewName.value, els.catNewColor.value);
    if (error) {
      setError(els.catNewName, error);
      els.catNewName.focus();
      return;
    }
    setError(els.catNewName, '');
    els.catNewName.value = '';
    render();
    els.catNewName.focus();
    toast('Категория добавлена');
  });
  els.catNewName.addEventListener('input', () => setError(els.catNewName, ''));

  /* =========================================================
   * Копилки — интерфейс
   * ======================================================= */
  function goalDeadlineInfo(g, saved) {
    if (!g.deadline) return { text: 'Без срока', late: false, perMonth: 0 };
    const today = parseISO(todayISO());
    const days = Math.round((parseISO(g.deadline) - today) / 86400000);
    let text = `до ${formatDate(g.deadline)}`;
    let late = false;
    let perMonth = 0;
    if (saved < g.target) {
      if (days < 0) { text += ' · срок прошёл'; late = true; }
      else if (days === 0) text += ' · сегодня';
      else {
        text += ` · осталось ${days} ${plural(days, PLURAL_DAYS)}`;
        perMonth = (g.target - saved) / Math.max(1, days / 30.44);
      }
    }
    return { text, late, perMonth };
  }

  function renderGoals() {
    const list = state.goals.slice().sort((a, b) => Number(goalDone(a)) - Number(goalDone(b)));
    els.goalsList.innerHTML = '';
    els.goalsEmpty.hidden = list.length > 0;

    list.forEach((g) => {
      const saved = goalSaved(g);
      const done = saved >= g.target;
      const pct = Math.min(100, Math.floor((saved / g.target) * 100));
      const info = goalDeadlineInfo(g, saved);
      const left = round2(g.target - saved);
      const titleId = `goal-title-${g.id}`;

      let hint = done ? 'Цель достигнута 🎉' : `Осталось накопить: ${money.format(left)}`;
      if (!done && info.perMonth) hint += ` · ≈ ${money.format(Math.ceil(info.perMonth))} в месяц`;

      const history = g.history.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      const historyList = el('ul', { class: 'history' }, history.length
        ? history.map((h) => el('li', {}, [
          el('time', { class: 'history__date', datetime: h.date, text: formatDate(h.date) }),
          el('span', { class: 'history__comment', text: h.comment || (h.kind === 'deposit' ? 'Пополнение' : 'Снятие') }),
          el('span', {
            class: `history__amount amount--${h.kind === 'deposit' ? 'income' : 'expense'}`,
            text: `${h.kind === 'deposit' ? '+' : '−'} ${money.format(h.amount)}`
          })
        ]))
        : [el('li', { class: 'history__empty', text: 'Пока нет операций' })]);

      const details = el('details', { class: 'goal__history', 'data-goal': g.id, open: ui.openHistory.has(g.id) }, [
        el('summary', { text: `История (${history.length})` }),
        historyList
      ]);

      els.goalsList.append(el('article', {
        class: `goal${done ? ' goal--done' : ''}`, style: `--goal-color:${g.color}`, 'aria-labelledby': titleId
      }, [
        el('div', { class: 'goal__head' }, [
          el('span', { class: 'goal__emoji', 'aria-hidden': 'true', text: g.emoji || '🎯' }),
          el('div', {}, [
            el('div', { class: 'goal__title-row' }, [
              el('h3', { class: 'goal__name', id: titleId, text: g.name }),
              done ? el('span', { class: 'badge', text: '✓ Достигнута' }) : null
            ]),
            el('p', { class: `goal__meta${info.late ? ' goal__meta--late' : ''}`, text: info.text })
          ]),
          el('div', { class: 'goal__tools' }, [
            el('button', { type: 'button', class: 'btn btn--ghost btn--small', 'data-action': 'edit', 'data-id': g.id, text: '✎', title: 'Редактировать', 'aria-label': `Редактировать копилку «${g.name}»` }),
            el('button', { type: 'button', class: 'btn btn--danger btn--small', 'data-action': 'delete', 'data-id': g.id, text: '✕', title: 'Удалить', 'aria-label': `Удалить копилку «${g.name}»` })
          ])
        ]),
        el('div', {
          class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100',
          'aria-valuenow': String(pct), 'aria-label': `Прогресс копилки «${g.name}»`,
          'aria-valuetext': `${pct}%: ${money.format(saved)} из ${money.format(g.target)}`
        }, [el('div', { class: 'progress__bar', style: `width:${pct}%` })]),
        el('p', { class: 'goal__amounts' }, [
          el('span', {}, [el('strong', { text: money.format(saved) }), ` из ${money.format(g.target)}`]),
          el('span', { class: 'goal__pct', text: `${pct}%` })
        ]),
        el('p', { class: 'goal__hint', text: hint }),
        el('div', { class: 'goal__actions' }, [
          el('button', { type: 'button', class: 'btn btn--primary btn--small btn--grow', 'data-action': 'deposit', 'data-id': g.id, text: '+ Пополнить', 'aria-label': `Пополнить копилку «${g.name}»` }),
          el('button', { type: 'button', class: 'btn btn--ghost btn--small btn--grow', 'data-action': 'withdraw', 'data-id': g.id, text: '− Снять', disabled: saved <= 0, 'aria-label': `Снять из копилки «${g.name}»` })
        ]),
        details
      ]));
    });
  }

  // запоминаем раскрытую историю между перерисовками
  els.goalsList.addEventListener('toggle', (e) => {
    const id = e.target.dataset && e.target.dataset.goal;
    if (!id) return;
    if (e.target.open) ui.openHistory.add(id); else ui.openHistory.delete(id);
  }, true);

  els.goalsList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const g = findGoal(btn.dataset.id);
    if (!g) return;
    const action = btn.dataset.action;
    if (action === 'deposit' || action === 'withdraw') openMoveDialog(g, action);
    else if (action === 'edit') openGoalDialog(g);
    else if (action === 'delete') removeGoal(g);
  });

  function openGoalDialog(goal) {
    els.goalForm.reset();
    clearErrors(els.goalName, els.goalTarget, els.goalDeadline);
    els.goalId.value = goal ? goal.id : '';
    els.goalDialogTitle.textContent = goal ? 'Редактирование копилки' : 'Новая копилка';
    els.goalSubmit.textContent = goal ? 'Сохранить' : 'Создать';
    els.goalName.value = goal ? goal.name : '';
    els.goalTarget.value = goal ? goal.target : '';
    els.goalDeadline.value = goal ? goal.deadline : '';
    els.goalEmoji.value = goal ? goal.emoji : '';
    els.goalColor.value = goal ? goal.color : COLORS[state.goals.length % COLORS.length];
    openDialog(els.goalDialog, els.goalName);
  }
  els.addGoal.addEventListener('click', () => openGoalDialog(null));
  [els.goalName, els.goalTarget, els.goalDeadline].forEach((i) => i.addEventListener('input', () => setError(i, '')));

  els.goalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    let first = null;
    const fail = (input, msg) => { setError(input, msg); first = first || input; };
    const name = cleanName(els.goalName.value);
    const target = parseAmount(els.goalTarget.value);
    const deadline = els.goalDeadline.value;
    const editingId = els.goalId.value;

    if (!name) fail(els.goalName, 'Введите название');
    else if (name.length > MAX_GOAL_NAME) fail(els.goalName, `Не длиннее ${MAX_GOAL_NAME} символов`);
    else if (state.goals.some((g) => g.id !== editingId && sameName(g.name, name))) fail(els.goalName, 'Копилка с таким названием уже есть');
    else setError(els.goalName, '');

    if (!(target > 0)) fail(els.goalTarget, 'Введите сумму цели больше нуля');
    else if (target > 1e12) fail(els.goalTarget, 'Слишком большая сумма');
    else setError(els.goalTarget, '');

    if (deadline && !isISODate(deadline)) fail(els.goalDeadline, 'Некорректная дата');
    else setError(els.goalDeadline, '');

    if (first) { first.focus(); return; }

    const data = {
      name, target, deadline,
      emoji: els.goalEmoji.value.trim().slice(0, 8),
      color: isColor(els.goalColor.value) ? els.goalColor.value.toLowerCase() : COLORS[0]
    };
    const goal = editingId && findGoal(editingId);
    if (goal) {
      Object.assign(goal, data);
      toast('Копилка обновлена');
    } else {
      state.goals.push(normalizeGoal({ ...data, id: uid(), createdAt: todayISO(), history: [] }));
      toast('Копилка создана');
    }
    saveGoals();
    closeDialog(els.goalDialog);
    render();
  });

  function removeGoal(g) {
    const saved = goalSaved(g);
    const note = saved > 0 ? ` Накопленные ${money.format(saved)} вернутся в свободный остаток.` : '';
    if (!confirm(`Удалить копилку «${g.name}» вместе с историей?${note}`)) return;
    state.goals = state.goals.filter((x) => x.id !== g.id);
    ui.openHistory.delete(g.id);
    saveGoals();
    render();
    toast('Копилка удалена');
  }

  const moveKind = () => els.moveForm.querySelector('input[name="moveKind"]:checked').value;

  function updateMoveHint() {
    const g = findGoal(els.moveGoalId.value);
    if (!g) return;
    const deposit = moveKind() === 'deposit';
    els.moveSubmit.textContent = deposit ? 'Пополнить' : 'Снять';
    els.moveHint.textContent = deposit
      ? `Накоплено ${money.format(goalSaved(g))} из ${money.format(g.target)}. Свободный остаток: ${money.format(freeBalance())}.`
      : `Можно снять не больше ${money.format(goalSaved(g))}.`;
    setError(els.moveAmount, '');
  }

  function openMoveDialog(g, kind) {
    els.moveForm.reset();
    clearErrors(els.moveAmount, els.moveDate);
    els.moveGoalId.value = g.id;
    els.moveTitle.textContent = `${g.emoji || '🎯'} ${g.name}`;
    $(kind === 'withdraw' ? 'moveWithdraw' : 'moveDeposit').checked = true;
    els.moveDate.value = todayISO();
    updateMoveHint();
    openDialog(els.moveDialog, els.moveAmount);
  }
  els.moveForm.addEventListener('change', (e) => { if (e.target.name === 'moveKind') updateMoveHint(); });
  [els.moveAmount, els.moveDate].forEach((i) => i.addEventListener('input', () => setError(i, '')));

  els.moveForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const g = findGoal(els.moveGoalId.value);
    if (!g) { closeDialog(els.moveDialog); return; }
    const kind = moveKind();
    const amount = parseAmount(els.moveAmount.value);
    const saved = goalSaved(g);
    let first = null;
    const fail = (input, msg) => { setError(input, msg); first = first || input; };

    if (!(amount > 0)) fail(els.moveAmount, 'Введите сумму больше нуля');
    else if (amount > 1e12) fail(els.moveAmount, 'Слишком большая сумма');
    else if (kind === 'withdraw' && amount > saved) fail(els.moveAmount, `Нельзя снять больше, чем накоплено: ${money.format(saved)}`);
    else setError(els.moveAmount, '');

    if (!isISODate(els.moveDate.value)) fail(els.moveDate, 'Укажите корректную дату');
    else setError(els.moveDate, '');

    if (first) { first.focus(); return; }

    if (kind === 'deposit') {
      const free = freeBalance();
      if (amount > free && !confirm(`Сумма больше свободного остатка (${money.format(free)}). Всё равно пополнить копилку?`)) return;
    }

    g.history.push({ id: uid(), kind, amount, date: els.moveDate.value, comment: els.moveComment.value.trim() });
    saveGoals();
    closeDialog(els.moveDialog);
    render();
    const doneNow = kind === 'deposit' && saved < g.target && goalSaved(g) >= g.target;
    toast(doneNow ? `Цель «${g.name}» достигнута! 🎉` : kind === 'deposit' ? 'Копилка пополнена' : 'Деньги сняты из копилки');
  });

  /* =========================================================
   * Фильтры
   * ======================================================= */
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
    const type = els.fType.value;
    const types = type === 'all' ? TYPES : [type];
    const names = new Set();
    types.forEach((tp) => state.categories[tp].forEach((c) => names.add(c.name)));
    state.transactions.forEach((t) => { if (types.includes(t.type)) names.add(t.category); });
    const sorted = Array.from(names).sort((a, b) => a.localeCompare(b, 'ru'));
    els.fCategory.innerHTML = '';
    els.fCategory.append(el('option', { value: 'all', text: 'Все' }));
    sorted.forEach((n) => els.fCategory.append(el('option', { value: n, text: n })));
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

  /* =========================================================
   * Отрисовка
   * ======================================================= */
  function renderSummary(f) {
    const t = totals(f.month);
    const balance = round2(t.income - t.expense);
    const inGoals = totalInGoals();
    const free = freeBalance();

    els.sumIncome.textContent = money.format(t.income);
    els.sumExpense.textContent = money.format(t.expense);
    els.sumBalance.textContent = money.format(balance);
    els.sumBalance.style.color = balance < 0 ? 'var(--expense)' : '';
    els.sumFree.textContent = money.format(free);
    els.sumFree.style.color = free < 0 ? 'var(--expense)' : '';
    els.countIncome.textContent = countLabel(t.incomeCount);
    els.countExpense.textContent = countLabel(t.expenseCount);
    els.freeHint.textContent = `За всё время, в копилках: ${money.format(inGoals)}`;
    els.periodLabel.textContent = f.month
      ? `За ${monthFmt.format(parseISO(`${f.month}-01`)).replace(/\s*г\.$/, '')}`
      : 'За всё время';
  }

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
        el('td', { 'data-label': 'Дата' }, [el('time', { datetime: t.date, text: formatDate(t.date) })]),
        el('td', { 'data-label': 'Категория' }, [
          el('span', { class: 'tag' }, [
            el('span', { class: 'tag__dot', style: `background:${categoryColor(t.type, t.category)}`, 'aria-hidden': 'true' }),
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

  els.body.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'edit') startEdit(btn.dataset.id);
    else removeTransaction(btn.dataset.id);
  });

  function arcPath(cx, cy, r, ri, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (rad, a) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`;
    return `M${pt(r, a0)} A${r} ${r} 0 ${large} 1 ${pt(r, a1)} L${pt(ri, a1)} A${ri} ${ri} 0 ${large} 0 ${pt(ri, a0)} Z`;
  }

  function renderChart(f) {
    const byCat = new Map();
    let total = 0;
    state.transactions.forEach((t) => {
      if (t.type !== 'expense' || (f.month && t.date.slice(0, 7) !== f.month)) return;
      byCat.set(t.category, (byCat.get(t.category) || 0) + t.amount);
      total += t.amount;
    });
    const items = Array.from(byCat, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const svg = els.chart;
    Array.from(svg.childNodes).forEach((n) => { if (n !== els.chartDesc) svg.removeChild(n); });
    els.legend.innerHTML = '';

    const cx = 100, cy = 100, r = 90, ri = 58;
    if (!items.length) {
      svg.append(svgEl('circle', { cx, cy, r: (r + ri) / 2, fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': r - ri }));
      els.legend.append(el('li', { class: 'legend__empty', text: 'Нет расходов за выбранный период' }));
    } else {
      let a = -Math.PI / 2;
      items.forEach((it) => {
        const frac = it.value / total;
        const color = categoryColor('expense', it.name);
        let shape;
        if (frac >= 0.9999) {
          shape = svgEl('circle', { cx, cy, r: (r + ri) / 2, fill: 'none', stroke: color, 'stroke-width': r - ri });
        } else {
          const a1 = a + frac * Math.PI * 2;
          shape = svgEl('path', { d: arcPath(cx, cy, r, ri, a, a1), fill: color });
          a = a1;
        }
        const title = svgEl('title');
        title.textContent = `${it.name}: ${money.format(it.value)} (${Math.round(frac * 100)}%)`;
        shape.append(title);
        svg.append(shape);

        els.legend.append(el('li', {}, [
          el('span', { class: 'legend__dot', style: `background:${color}`, 'aria-hidden': 'true' }),
          el('span', { text: it.name }),
          el('span', { class: 'legend__value' }, [
            money.format(it.value),
            el('span', { class: 'legend__pct', text: `${(frac * 100).toFixed(frac < 0.1 ? 1 : 0).replace('.', ',')}%` })
          ])
        ]));
      });
    }
    const label = svgEl('text', { x: cx, y: cy - 6, 'text-anchor': 'middle', class: 'chart__center-label' });
    label.textContent = 'Всего расходов';
    const value = svgEl('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', class: 'chart__center-value' });
    value.textContent = new Intl.NumberFormat('ru-RU', {
      style: 'currency', currency: 'RUB', notation: total >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: 0
    }).format(total);
    svg.append(label, value);
    els.chartDesc.textContent = items.length
      ? `Расходы по категориям: ${items.map((it) => `${it.name} ${money.format(it.value)}`).join(', ')}`
      : 'Нет расходов за выбранный период';
  }

  function render() {
    fillCategorySelect(currentType(), els.category.value);
    refreshCategoryFilter();
    const f = getFilters();
    renderSummary(f);
    renderTable(filteredTransactions(f));
    renderChart(f);
    renderGoals();
    if (els.catDialog.hasAttribute('open')) renderCategoryManager();
  }

  /* =========================================================
   * Экспорт, демо, очистка
   * ======================================================= */
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // защита от CSV-инъекций
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

  els.exportCsv.addEventListener('click', () => {
    const list = filteredTransactions(getFilters());
    if (!list.length) { toast('Нет операций для экспорта'); return; }
    const rows = [['Дата', 'Тип', 'Категория', 'Комментарий', 'Сумма']];
    list.forEach((t) => rows.push([
      t.date, t.type === 'income' ? 'Доход' : 'Расход', t.category, t.comment,
      (t.type === 'income' ? '' : '-') + csvAmount(t.amount)
    ]));
    downloadCsv(rows, `moneytable-${todayISO()}.csv`);
    toast(`Экспортировано: ${countLabel(list.length)}`);
  });

  els.exportGoalsCsv.addEventListener('click', () => {
    if (!state.goals.length) { toast('Нет копилок для экспорта'); return; }
    const rows = [['Копилка', 'Цель', 'Срок', 'Накоплено', 'Дата', 'Операция', 'Сумма', 'Комментарий']];
    state.goals.forEach((g) => {
      const base = [g.name, csvAmount(g.target), g.deadline, csvAmount(goalSaved(g))];
      if (!g.history.length) rows.push([...base, '', '', '', '']);
      g.history.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).forEach((h) => rows.push([
        ...base, h.date, h.kind === 'deposit' ? 'Пополнение' : 'Снятие',
        (h.kind === 'deposit' ? '' : '-') + csvAmount(h.amount), h.comment
      ]));
    });
    downloadCsv(rows, `moneytable-goals-${todayISO()}.csv`);
    toast('Копилки экспортированы');
  });

  els.loadDemo.addEventListener('click', () => {
    if ((state.transactions.length || state.goals.length) && !confirm('Добавить демо-данные к существующим?')) return;
    state.transactions = state.transactions.concat(demoTransactions());
    if (!state.goals.length) state.goals = demoGoals();
    if (ensureTransactionCategories()) saveCategories();
    saveTransactions();
    saveGoals();
    render();
    toast('Демо-данные загружены');
  });

  els.clearAll.addEventListener('click', () => {
    if (!state.transactions.length && !state.goals.length) { toast('Данных уже нет'); return; }
    if (!confirm('Удалить все операции и копилки без возможности восстановления? Категории сохранятся.')) return;
    state.transactions = [];
    state.goals = [];
    ui.openHistory.clear();
    saveTransactions();
    saveGoals();
    resetForm();
    toast('Все данные удалены');
  });

  /* =========================================================
   * Запуск
   * ======================================================= */
  function init() {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    loadState();
    try {
      if (!localStorage.getItem(KEYS.initialized)) {
        if (!state.transactions.length && !state.goals.length) {
          state.transactions = demoTransactions();
          state.goals = demoGoals();
          ensureTransactionCategories();
          saveTransactions();
          saveGoals();
          saveCategories();
        }
        localStorage.setItem(KEYS.initialized, '1');
      }
    } catch (e) { /* localStorage недоступен */ }
    resetForm();
  }

  init();
})();
