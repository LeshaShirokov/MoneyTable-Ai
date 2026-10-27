/**
 * Страница «Инвестиции»: операции по брокерским счетам, портфель по средней цене,
 * реализованный и (по ручным ценам) нереализованный результат, структура и пополнения.
 * Данные хранятся отдельно от журнала доходов и расходов и не влияют на баланс.
 */
(() => {
  'use strict';
  const MT = window.MoneyTable;
  const { money, el, svgEl, $ } = MT;

  /* ---------- Константы ---------- */
  const KEYS = {
    accounts: 'moneytable-invest-accounts',
    operations: 'moneytable-invest-operations',
    prices: 'moneytable-invest-prices',
    initialized: 'moneytable-invest-initialized'
  };
  const DEFAULT_ACCOUNT = 'Основной брокерский счёт';
  const MAX_ACCOUNT_NAME = 40;
  const MAX_TICKER = 24;
  const MAX_COMMENT = 120;
  const MAX_QTY = 1e9;
  const EPS = 1e-9;
  const FLOW_MONTHS = 12;

  /** sign — направление движения денег по счёту; trade — сделка (кол-во × цена); security — нужна бумага. */
  const OP_TYPES = {
    deposit: { label: 'Пополнение счёта', sign: 1, color: '#16a34a' },
    withdraw: { label: 'Вывод средств', sign: -1, color: '#e11d48' },
    buy: { label: 'Покупка', sign: -1, trade: true, security: true, color: '#6366f1' },
    sell: { label: 'Продажа', sign: 1, trade: true, security: true, color: '#f59e0b' },
    dividend: { label: 'Дивиденды', sign: 1, security: true, color: '#10b981' },
    coupon: { label: 'Купоны', sign: 1, security: true, color: '#06b6d4' },
    fee: { label: 'Комиссия', sign: -1, noFee: true, color: '#94a3b8' },
    tax: { label: 'Налог', sign: -1, noFee: true, color: '#a855f7' }
  };
  const ASSET_CLASSES = { stock: 'Акции', bond: 'Облигации', fund: 'Фонды/ETF', currency: 'Валюта', other: 'Другое' };
  const CLASS_COLORS = { stock: '#6366f1', bond: '#10b981', fund: '#f59e0b', currency: '#06b6d4', other: '#64748b' };
  const CASH_COLOR = '#94a3b8';

  const qtyFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 8 });
  const priceFmt = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2, maximumFractionDigits: 6 });
  // Средняя цена — расчётная, поэтому округляем до 4 знаков (введённые цены показываем как есть).
  const avgFmt = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const pctFmt = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 });
  const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
  const shortMonth = new Intl.DateTimeFormat('ru-RU', { month: 'short' });

  /** Данные страницы (localStorage, отдельные ключи). */
  const inv = { accounts: [], operations: [], prices: {} };

  /* ---------- Утилиты ---------- */
  const roundQty = (n) => Math.round(n * 1e8) / 1e8;
  const roundPrice = (n) => Math.round(n * 1e6) / 1e6;
  const parseNum = (v) => {
    const s = String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.');
    return s === '' ? NaN : Number(s);
  };
  const cleanTicker = (s) => MT.cleanName(s).toLocaleUpperCase('ru').slice(0, MAX_TICKER);
  const hasSecurity = (type) => !!OP_TYPES[type].security;
  const isTrade = (type) => !!OP_TYPES[type].trade;
  const defaultClass = (type) => (type === 'coupon' ? 'bond' : 'stock');
  const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money.format(Math.abs(n))}`;
  const findAccount = (id) => inv.accounts.find((a) => a.id === id) || null;
  const accountName = (id) => (findAccount(id) || { name: '—' }).name;
  /** Движение денег на счёте от операции. */
  const cashDelta = (op) => MT.round2(OP_TYPES[op.type].sign * op.amount - op.fee);
  const opTitle = (op) => `${OP_TYPES[op.type].label}${op.ticker ? ` ${op.ticker}` : ''}`;

  /* ---------- Хранилище ---------- */
  function normalizeOperation(o) {
    if (!o || !OP_TYPES[o.type] || !MT.isISODate(o.date) || !findAccount(o.accountId)) return null;
    const type = o.type;
    const op = {
      id: typeof o.id === 'string' && o.id ? o.id : MT.uid(),
      accountId: o.accountId, type, date: o.date,
      ticker: '', assetClass: '', quantity: 0, price: 0, amount: 0, fee: 0,
      comment: typeof o.comment === 'string' ? o.comment.slice(0, MAX_COMMENT) : ''
    };
    if (hasSecurity(type)) {
      op.ticker = cleanTicker(o.ticker);
      if (!op.ticker) return null;
      op.assetClass = ASSET_CLASSES[o.assetClass] ? o.assetClass : defaultClass(type);
    }
    if (isTrade(type)) {
      const q = Number(o.quantity), p = Number(o.price);
      if (!(q > 0) || !(p > 0) || q > MAX_QTY || p > MT.MAX_AMOUNT) return null;
      op.quantity = roundQty(q);
      op.price = roundPrice(p);
      op.amount = MT.round2(op.quantity * op.price);
      if (!(op.amount > 0)) return null;
    } else {
      const a = Number(o.amount);
      if (!(a > 0) || a > MT.MAX_AMOUNT) return null;
      op.amount = MT.round2(a);
    }
    if (!OP_TYPES[type].noFee) {
      const f = Number(o.fee);
      op.fee = Number.isFinite(f) && f > 0 && f <= MT.MAX_AMOUNT ? MT.round2(f) : 0;
    }
    return op;
  }

  function uniqueAccountName(base) {
    let name = base;
    for (let i = 2; inv.accounts.some((a) => MT.sameName(a.name, name)); i += 1) name = `${base} ${i}`;
    return name;
  }

  /** Загружает данные. Операции счёта, которого нет в списке, не теряются: счёт восстанавливается. */
  function loadInvest({ persist = false } = {}) {
    const rawAccounts = MT.readJSON(KEYS.accounts);
    inv.accounts = [];
    (Array.isArray(rawAccounts) ? rawAccounts : []).forEach((a) => {
      const name = MT.cleanName(a && a.name).slice(0, MAX_ACCOUNT_NAME);
      const id = a && typeof a.id === 'string' && a.id ? a.id : MT.uid();
      if (!name || findAccount(id) || inv.accounts.some((x) => MT.sameName(x.name, name))) return;
      inv.accounts.push({ id, name });
    });
    const accountsValid = inv.accounts.length > 0;
    if (!accountsValid) inv.accounts.push({ id: MT.uid(), name: DEFAULT_ACCOUNT });

    let recovered = false;
    const rawOps = MT.readJSON(KEYS.operations);
    inv.operations = (Array.isArray(rawOps) ? rawOps : []).map((o) => {
      if (!o || typeof o !== 'object') return null;
      let accountId = o.accountId;
      if (typeof accountId !== 'string' || !accountId) accountId = inv.accounts[0].id;
      else if (!findAccount(accountId)) {
        inv.accounts.push({ id: accountId, name: uniqueAccountName('Восстановленный счёт') });
        recovered = true;
      }
      return normalizeOperation({ ...o, accountId });
    }).filter(Boolean);

    const rawPrices = MT.readJSON(KEYS.prices);
    inv.prices = {};
    if (rawPrices && typeof rawPrices === 'object' && !Array.isArray(rawPrices)) {
      Object.entries(rawPrices).forEach(([t, p]) => {
        const ticker = cleanTicker(t), price = Number(p);
        if (ticker && price > 0 && price <= MT.MAX_AMOUNT) inv.prices[ticker] = roundPrice(price);
      });
    }
    // Повреждённые записи операций не перезаписываем (их можно восстановить вручную), а счета — сохраняем.
    if (persist && (!accountsValid || recovered)) saveAccounts();
  }
  const saveAccounts = () => MT.writeJSON(KEYS.accounts, inv.accounts);
  const saveOperations = () => MT.writeJSON(KEYS.operations, inv.operations);
  const savePrices = () => MT.writeJSON(KEYS.prices, inv.prices);

  /* ---------- Расчёт портфеля ---------- */
  /** Хронологический порядок: по дате, при равной дате — в порядке ввода. */
  function chronological(ops) {
    return ops.map((op, i) => [op, i])
      .sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[1] - b[1]))
      .map(([op]) => op);
  }

  /**
   * Пересчитывает все операции. accountId — '' для всех счетов.
   * Позиции ведутся по каждому счёту отдельно, метод средней цены: комиссия покупки входит
   * в стоимость, комиссия продажи уменьшает выручку. Продажа сверх остатка не учитывается
   * и возвращается в error (первая такая операция).
   */
  function computePortfolio(ops, accountId) {
    const r = { cash: 0, deposited: 0, withdrawn: 0, income: 0, costs: 0, realized: 0, positions: new Map(), error: null };
    chronological(ops).forEach((op) => {
      const mine = !accountId || op.accountId === accountId;
      if (isTrade(op.type)) {
        const key = `${op.accountId}\u0000${op.ticker}`;
        let pos = r.positions.get(key);
        if (!pos) {
          pos = { accountId: op.accountId, ticker: op.ticker, assetClass: op.assetClass, qty: 0, cost: 0 };
          r.positions.set(key, pos);
        }
        if (op.type === 'buy') {
          pos.qty = roundQty(pos.qty + op.quantity);
          pos.cost += op.amount + op.fee;
          pos.assetClass = op.assetClass;
        } else {
          if (op.quantity > pos.qty + EPS) {
            if (!r.error) r.error = { op, held: pos.qty };
            return;
          }
          const costPart = pos.qty > 0 ? (pos.cost * op.quantity) / pos.qty : 0;
          pos.qty = roundQty(pos.qty - op.quantity);
          pos.cost -= costPart;
          if (pos.qty <= EPS) { pos.qty = 0; pos.cost = 0; }
          if (mine) r.realized += op.amount - op.fee - costPart;
        }
      }
      if (!mine) return;
      r.cash += cashDelta(op);
      r.costs += op.fee + (op.type === 'fee' || op.type === 'tax' ? op.amount : 0);
      if (op.type === 'deposit') r.deposited += op.amount;
      else if (op.type === 'withdraw') r.withdrawn += op.amount;
      else if (op.type === 'dividend' || op.type === 'coupon') r.income += op.amount;
    });
    ['cash', 'deposited', 'withdrawn', 'income', 'costs', 'realized'].forEach((k) => { r[k] = MT.round2(r[k]); });
    return r;
  }

  /** Открытые позиции, объединённые по тикеру (для «Все счета» — по всем счетам). */
  function holdingsOf(portfolio, accountId) {
    const byTicker = new Map();
    portfolio.positions.forEach((pos) => {
      if (pos.qty <= EPS || (accountId && pos.accountId !== accountId)) return;
      const h = byTicker.get(pos.ticker) || { ticker: pos.ticker, assetClass: pos.assetClass, qty: 0, cost: 0 };
      h.qty = roundQty(h.qty + pos.qty);
      h.cost += pos.cost;
      byTicker.set(pos.ticker, h);
    });
    const list = Array.from(byTicker.values()).map((h) => {
      const price = inv.prices[h.ticker] || null;
      const cost = MT.round2(h.cost);
      const value = price ? MT.round2(h.qty * price) : null;
      return { ...h, cost, avg: h.cost / h.qty, price, value, estimate: value === null ? cost : value, pnl: value === null ? null : MT.round2(value - cost) };
    });
    const total = list.reduce((s, h) => s + h.estimate, 0);
    list.forEach((h) => { h.share = total > 0 ? h.estimate / total : 0; });
    return list.sort((a, b) => b.estimate - a.estimate || a.ticker.localeCompare(b.ticker, 'ru'));
  }

  /**
   * Проверяет список операций после изменения. Возвращает текст ошибки или ''.
   * Уже существовавшее нарушение (например, из повреждённых данных) не блокирует другие правки.
   */
  function oversellError(candidate, changedId) {
    const after = computePortfolio(candidate, '').error;
    if (!after) return '';
    const before = computePortfolio(inv.operations, '').error;
    if (before && before.op.id === after.op.id && after.op.id !== changedId) return '';
    const { op, held } = after;
    const where = `на ${MT.formatDate(op.date)} на счёте «${accountName(op.accountId)}»`;
    const have = held > 0 ? `есть только ${qtyFmt.format(held)} шт.` : 'этой бумаги нет';
    const base = `Нельзя продать ${qtyFmt.format(op.quantity)} шт. ${op.ticker}: ${where} ${have}`;
    return op.id === changedId ? base : `Изменение нарушит более позднюю продажу. ${base}`;
  }

  /* ---------- Элементы ---------- */
  const els = {
    accFilter: $('accFilter'),
    sumCash: $('sumCash'), cashHint: $('cashHint'), sumInvested: $('sumInvested'), investedHint: $('investedHint'),
    sumDeposited: $('sumDeposited'), depositedHint: $('depositedHint'), sumIncome: $('sumIncomeInv'), incomeHint: $('incomeHint'),
    sumCosts: $('sumCosts'), sumRealized: $('sumRealized'),
    holdBody: $('holdBody'), holdEmpty: $('holdEmpty'), holdTotals: $('holdTotals'), dataWarning: $('dataWarning'),
    structChart: $('structChart'), structDesc: $('structDesc'), structLegend: $('structLegend'),
    flowChart: $('flowChart'), flowDesc: $('flowDesc'), flowNote: $('flowNote'), flowTitle: $('flowTitle'),
    form: $('opForm'), id: $('opId'), account: $('opAccount'), type: $('opType'), date: $('opDate'),
    ticker: $('opTicker'), tickerList: $('tickerList'), assetClass: $('opClass'), qty: $('opQty'), price: $('opPrice'),
    amount: $('opAmount'), amountLabel: $('opAmountLabel'), fee: $('opFee'), comment: $('opComment'),
    securityFields: $('securityFields'), tradeFields: $('tradeFields'), feeField: $('feeField'), holdHint: $('holdHint'),
    formError: $('opFormError'), submit: $('opSubmit'), cancel: $('opCancel'), formTitle: $('formTitle'),
    fType: $('fType'), fClass: $('fClass'), fTicker: $('fTicker'), fFrom: $('fFrom'), fTo: $('fTo'),
    fSort: $('fSort'), fSearch: $('fSearch'), resetFilters: $('resetFilters'),
    opsBody: $('opsBody'), opsEmpty: $('opsEmpty'), opsError: $('opsError'), listTotals: $('listTotals'),
    exportCsv: $('exportCsv'), loadDemo: $('loadDemo'), clear: $('clearInvest'),
    accDialog: $('accDialog'), accList: $('accList'), accError: $('accError'),
    accAddForm: $('accAddForm'), accNewName: $('accNewName')
  };
  const currentAccount = () => (findAccount(els.accFilter.value) ? els.accFilter.value : '');
  const showOpsError = (msg) => { els.opsError.textContent = msg; els.opsError.hidden = !msg; };

  /* ---------- Форма операции ---------- */
  function updateFormFields() {
    const type = els.type.value;
    const trade = isTrade(type);
    els.securityFields.hidden = !hasSecurity(type);
    els.tradeFields.hidden = !trade;
    els.feeField.hidden = !!OP_TYPES[type].noFee;
    els.amount.readOnly = trade;
    els.amountLabel.textContent = trade ? 'Сумма сделки, ₽ (авто)' : 'Сумма, ₽';
    if (trade) updateTradeAmount();
    // Скрытые поля не должны держать старые ошибки.
    if (!hasSecurity(type)) MT.setError(els.ticker, '');
    if (!trade) MT.clearErrors(els.qty, els.price);
    if (OP_TYPES[type].noFee) MT.setError(els.fee, '');
    updateHoldHint();
  }

  function updateTradeAmount() {
    const q = parseNum(els.qty.value), p = parseNum(els.price.value);
    els.amount.value = q > 0 && p > 0 ? MT.round2(roundQty(q) * roundPrice(p)).toFixed(2) : '';
  }

  function updateHoldHint() {
    const type = els.type.value;
    const ticker = cleanTicker(els.ticker.value);
    if (!isTrade(type) || !ticker || !findAccount(els.account.value)) { els.holdHint.textContent = ''; return; }
    const pos = computePortfolio(inv.operations, els.account.value).positions.get(`${els.account.value}\u0000${ticker}`);
    if (pos && pos.qty > EPS) {
      els.holdHint.textContent = `На счёте сейчас: ${qtyFmt.format(pos.qty)} шт. ${ticker}, средняя цена ${avgFmt.format(pos.cost / pos.qty)}`;
    } else {
      els.holdHint.textContent = type === 'sell' ? `${ticker}: на этом счёте позиции нет` : '';
    }
  }

  function fillAccountSelects() {
    const filterValue = currentAccount();
    els.accFilter.innerHTML = '';
    els.accFilter.append(el('option', { value: '', text: 'Все счета' }));
    inv.accounts.forEach((a) => els.accFilter.append(el('option', { value: a.id, text: a.name })));
    els.accFilter.value = filterValue;

    const formValue = els.account.value;
    els.account.innerHTML = '';
    inv.accounts.forEach((a) => els.account.append(el('option', { value: a.id, text: a.name })));
    els.account.value = findAccount(formValue) ? formValue : (filterValue || inv.accounts[0].id);
  }

  function knownTickers() {
    return Array.from(new Set(inv.operations.filter((o) => o.ticker).map((o) => o.ticker))).sort((a, b) => a.localeCompare(b, 'ru'));
  }
  function refreshTickerOptions() {
    const tickers = knownTickers();
    els.tickerList.innerHTML = '';
    tickers.forEach((t) => els.tickerList.append(el('option', { value: t })));
    const current = els.fTicker.value;
    els.fTicker.innerHTML = '';
    els.fTicker.append(el('option', { value: 'all', text: 'Все' }));
    tickers.forEach((t) => els.fTicker.append(el('option', { value: t, text: t })));
    els.fTicker.value = tickers.includes(current) ? current : 'all';
  }

  function validateForm() {
    let first = null;
    const fail = (input, msg) => { MT.setError(input, msg); first = first || input; };
    const type = els.type.value;
    const data = {
      accountId: els.account.value, type, date: els.date.value, ticker: '', assetClass: '',
      quantity: 0, price: 0, amount: 0, fee: 0, comment: els.comment.value.trim().slice(0, MAX_COMMENT)
    };
    MT.clearErrors(els.date, els.ticker, els.qty, els.price, els.amount, els.fee);
    els.formError.textContent = '';

    if (!findAccount(data.accountId)) fail(els.account, 'Выберите счёт');
    if (!MT.isISODate(data.date)) fail(els.date, 'Укажите корректную дату');
    if (hasSecurity(type)) {
      data.ticker = cleanTicker(els.ticker.value);
      data.assetClass = ASSET_CLASSES[els.assetClass.value] ? els.assetClass.value : defaultClass(type);
      if (!data.ticker) fail(els.ticker, 'Укажите тикер или название бумаги');
    }
    if (isTrade(type)) {
      const q = parseNum(els.qty.value), p = parseNum(els.price.value);
      if (!(q > 0)) fail(els.qty, 'Количество должно быть больше нуля');
      else if (q > MAX_QTY) fail(els.qty, 'Слишком большое количество');
      else data.quantity = roundQty(q);
      if (!(p > 0)) fail(els.price, 'Цена должна быть больше нуля');
      else if (p > MT.MAX_AMOUNT) fail(els.price, 'Слишком большая цена');
      else data.price = roundPrice(p);
      if (data.quantity && data.price) {
        data.amount = MT.round2(data.quantity * data.price);
        if (!(data.amount > 0)) fail(els.qty, 'Сумма сделки меньше 1 копейки');
        else if (data.amount > MT.MAX_AMOUNT) fail(els.qty, 'Слишком большая сумма сделки');
      }
    } else {
      const a = MT.parseAmount(els.amount.value);
      if (!(a > 0)) fail(els.amount, 'Введите сумму больше нуля');
      else if (a > MT.MAX_AMOUNT) fail(els.amount, 'Слишком большая сумма');
      else data.amount = a;
    }
    if (!OP_TYPES[type].noFee && String(els.fee.value).trim() !== '') {
      const f = MT.parseAmount(els.fee.value);
      if (!(f >= 0)) fail(els.fee, 'Комиссия не может быть отрицательной');
      else if (f > MT.MAX_AMOUNT) fail(els.fee, 'Слишком большая комиссия');
      else data.fee = f;
    }
    if (first) { first.focus(); return null; }
    return data;
  }

  function setEditMode(editing) {
    els.submit.textContent = editing ? 'Сохранить' : 'Добавить';
    els.formTitle.textContent = editing ? 'Редактирование операции' : 'Новая операция';
    els.cancel.hidden = !editing;
  }

  function resetForm() {
    const account = els.account.value;
    els.form.reset();
    els.id.value = '';
    els.account.value = currentAccount() || (findAccount(account) ? account : inv.accounts[0].id);
    els.date.value = MT.todayISO();
    MT.clearErrors(els.date, els.ticker, els.qty, els.price, els.amount, els.fee);
    els.formError.textContent = '';
    setEditMode(false);
    updateFormFields();
    render();
  }

  function startEdit(id) {
    const op = inv.operations.find((o) => o.id === id);
    if (!op) return;
    els.form.reset();
    els.id.value = op.id;
    els.account.value = op.accountId;
    els.type.value = op.type;
    els.date.value = op.date;
    els.ticker.value = op.ticker;
    els.assetClass.value = op.assetClass || defaultClass(op.type);
    els.qty.value = op.quantity || '';
    els.price.value = op.price || '';
    els.amount.value = op.amount.toFixed(2);
    els.fee.value = op.fee ? op.fee.toFixed(2) : '';
    els.comment.value = op.comment;
    MT.clearErrors(els.date, els.ticker, els.qty, els.price, els.amount, els.fee);
    els.formError.textContent = '';
    setEditMode(true);
    updateFormFields();
    render();
    els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    els.type.focus({ preventScroll: true });
  }

  function removeOperation(id) {
    const op = inv.operations.find((o) => o.id === id);
    if (!op) return;
    if (!confirm(`Удалить операцию «${opTitle(op)}» от ${MT.formatDate(op.date)} на ${money.format(op.amount)}?`)) return;
    const candidate = inv.operations.filter((o) => o.id !== id);
    const error = oversellError(candidate, null);
    if (error) { showOpsError(`Операцию нельзя удалить. ${error}`); return; }
    showOpsError('');
    inv.operations = candidate;
    saveOperations();
    if (els.id.value === id) resetForm(); else render();
    MT.toast('Операция удалена');
  }

  els.type.addEventListener('change', () => {
    if (!els.id.value && hasSecurity(els.type.value)) {
      const known = inv.operations.find((o) => o.ticker && o.ticker === cleanTicker(els.ticker.value));
      els.assetClass.value = known ? known.assetClass : defaultClass(els.type.value);
    }
    updateFormFields();
  });
  els.ticker.addEventListener('change', () => {
    // Для знакомой бумаги подставляем её класс актива.
    const ticker = cleanTicker(els.ticker.value);
    const known = chronological(inv.operations).reverse().find((o) => o.ticker === ticker && isTrade(o.type));
    if (known) els.assetClass.value = known.assetClass;
    updateHoldHint();
  });
  els.ticker.addEventListener('input', updateHoldHint);
  els.account.addEventListener('change', updateHoldHint);
  [els.qty, els.price].forEach((i) => i.addEventListener('input', updateTradeAmount));
  MT.clearOnInput(els.date, els.ticker, els.qty, els.price, els.amount, els.fee);
  els.form.addEventListener('input', () => { els.formError.textContent = ''; });

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = validateForm();
    if (!data) return;
    const editing = els.id.value && inv.operations.find((o) => o.id === els.id.value);
    const id = editing ? editing.id : MT.uid();
    const op = normalizeOperation({ ...data, id });
    const candidate = editing
      ? inv.operations.map((o) => (o.id === id ? op : o))
      : inv.operations.concat([op]);
    const error = oversellError(candidate, id);
    if (error) {
      if (op.type === 'sell' && error.startsWith('Нельзя')) { MT.setError(els.qty, error); els.qty.focus(); }
      else els.formError.textContent = error;
      return;
    }
    inv.operations = candidate;
    saveOperations();
    showOpsError('');
    MT.toast(editing ? 'Операция обновлена' : 'Операция добавлена');
    resetForm();
  });
  els.cancel.addEventListener('click', resetForm);

  /* ---------- Счета ---------- */
  function validateAccountName(name, exceptId) {
    if (!name) return 'Введите название счёта';
    if (name.length > MAX_ACCOUNT_NAME) return `Не длиннее ${MAX_ACCOUNT_NAME} символов`;
    if (inv.accounts.some((a) => a.id !== exceptId && MT.sameName(a.name, name))) return 'Счёт с таким названием уже есть';
    return '';
  }
  const countOps = (accountId) => inv.operations.filter((o) => o.accountId === accountId).length;

  function renderAccounts() {
    const focusedKey = els.accList.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    els.accList.innerHTML = '';
    inv.accounts.forEach((a) => {
      const used = countOps(a.id);
      els.accList.append(el('li', { class: 'cat-item acc-item', 'data-id': a.id }, [
        el('input', {
          type: 'text', class: 'input', value: a.name, maxlength: MAX_ACCOUNT_NAME, 'data-role': 'name',
          'data-key': `acc-name:${a.id}`, 'aria-label': `Название счёта «${a.name}»`, autocomplete: 'off'
        }),
        el('span', { class: 'cat-item__count', text: used ? MT.countLabel(used) : 'нет операций' }),
        el('button', {
          type: 'button', class: 'btn btn--danger btn--small', 'data-role': 'delete', 'data-key': `acc-del:${a.id}`,
          'aria-label': `Удалить счёт «${a.name}»`, title: 'Удалить', text: '✕'
        })
      ]));
    });
    if (focusedKey) {
      const again = els.accList.querySelector(`[data-key="${focusedKey}"]`);
      if (again) again.focus();
    }
  }

  function openAccounts() {
    els.accError.textContent = '';
    els.accNewName.value = '';
    MT.setError(els.accNewName, '');
    renderAccounts();
    MT.openDialog(els.accDialog, els.accNewName);
  }
  document.querySelectorAll('[data-open-accounts]').forEach((b) => b.addEventListener('click', openAccounts));

  els.accAddForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = MT.cleanName(els.accNewName.value);
    const error = validateAccountName(name);
    if (error) { MT.setError(els.accNewName, error); els.accNewName.focus(); return; }
    inv.accounts.push({ id: MT.uid(), name });
    saveAccounts();
    els.accNewName.value = '';
    MT.setError(els.accNewName, '');
    els.accError.textContent = '';
    render();
    els.accNewName.focus();
    MT.toast('Счёт добавлен');
  });
  MT.clearOnInput(els.accNewName);

  els.accList.addEventListener('change', (e) => {
    if (e.target.dataset.role !== 'name') return;
    const account = findAccount(e.target.closest('.acc-item').dataset.id);
    if (!account) return;
    const name = MT.cleanName(e.target.value);
    if (name === account.name) { e.target.value = name; return; }
    const error = validateAccountName(name, account.id);
    if (error) {
      els.accError.textContent = `«${name || '…'}»: ${error}`;
      e.target.value = account.name;
      return;
    }
    els.accError.textContent = '';
    account.name = name;
    saveAccounts();
    render();
    MT.toast('Счёт переименован');
  });
  els.accList.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.role === 'name') {
      e.preventDefault();
      e.target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  els.accList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role="delete"]');
    if (!btn) return;
    const account = findAccount(btn.closest('.acc-item').dataset.id);
    if (!account) return;
    if (inv.accounts.length <= 1) { els.accError.textContent = 'Должен остаться хотя бы один счёт'; return; }
    const used = countOps(account.id);
    const what = used ? ` и ${used} ${MT.plural(used, ['его операцию', 'его операции', 'его операций'])}` : '';
    if (!confirm(`Удалить счёт «${account.name}»${what}? Это нельзя отменить.`)) return;
    inv.accounts = inv.accounts.filter((a) => a.id !== account.id);
    inv.operations = inv.operations.filter((o) => o.accountId !== account.id);
    saveAccounts();
    saveOperations();
    els.accError.textContent = '';
    if (els.id.value && !inv.operations.some((o) => o.id === els.id.value)) resetForm(); else render();
    MT.toast('Счёт удалён');
  });

  /* ---------- Фильтры ---------- */
  function getFilters() {
    return {
      account: currentAccount(), type: els.fType.value, assetClass: els.fClass.value, ticker: els.fTicker.value,
      from: MT.isISODate(els.fFrom.value) ? els.fFrom.value : '', to: MT.isISODate(els.fTo.value) ? els.fTo.value : '',
      q: els.fSearch.value.trim().toLocaleLowerCase('ru'), sort: els.fSort.value
    };
  }

  function filteredOperations(f) {
    const list = inv.operations.filter((o) => {
      if (f.account && o.accountId !== f.account) return false;
      if (f.type !== 'all' && o.type !== f.type) return false;
      if (f.assetClass !== 'all' && o.assetClass !== f.assetClass) return false;
      if (f.ticker !== 'all' && o.ticker !== f.ticker) return false;
      if (f.from && o.date < f.from) return false;
      if (f.to && o.date > f.to) return false;
      if (f.q) {
        const text = `${o.ticker} ${o.comment} ${accountName(o.accountId)} ${OP_TYPES[o.type].label} ${ASSET_CLASSES[o.assetClass] || ''}`;
        if (!text.toLocaleLowerCase('ru').includes(f.q)) return false;
      }
      return true;
    });
    const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    const order = chronological(list);
    const pos = new Map(order.map((o, i) => [o.id, i]));
    list.sort((a, b) => {
      if (f.sort === 'amount-desc') return b.amount - a.amount;
      if (f.sort === 'amount-asc') return a.amount - b.amount;
      if (f.sort === 'ticker') return a.ticker.localeCompare(b.ticker, 'ru') || byDate(b, a);
      const c = pos.get(a.id) - pos.get(b.id);
      return f.sort === 'date-asc' ? c : -c;
    });
    return list;
  }

  [els.accFilter, els.fType, els.fClass, els.fTicker, els.fFrom, els.fTo, els.fSort].forEach((i) => i.addEventListener('change', render));
  els.accFilter.addEventListener('change', () => {
    if (!els.id.value && currentAccount()) { els.account.value = currentAccount(); updateHoldHint(); }
  });
  els.fSearch.addEventListener('input', render);
  els.resetFilters.addEventListener('click', () => {
    els.fType.value = 'all';
    els.fClass.value = 'all';
    els.fTicker.value = 'all';
    els.fFrom.value = '';
    els.fTo.value = '';
    els.fSearch.value = '';
    els.fSort.value = 'date-desc';
    render();
  });

  /* ---------- Сводка ---------- */
  function setValue(node, value, { signedValue = false, negativeIsBad = true } = {}) {
    node.textContent = signedValue ? signed(value) : money.format(value);
    node.classList.toggle('is-negative', negativeIsBad && value < 0);
    node.classList.toggle('is-positive', signedValue && value > 0);
  }

  function renderSummary(p, holdings, accountId) {
    setValue(els.sumCash, p.cash);
    els.cashHint.textContent = p.cash < 0 ? 'Отрицательный остаток: проверьте пополнения' : 'Свободные деньги у брокера';
    const invested = MT.round2(holdings.reduce((s, h) => s + h.cost, 0));
    setValue(els.sumInvested, invested);
    els.investedHint.textContent = `${holdings.length} ${MT.plural(holdings.length, ['позиция', 'позиции', 'позиций'])} · по средней цене покупки`;
    setValue(els.sumDeposited, p.deposited);
    els.depositedHint.textContent = `Выведено: ${money.format(p.withdrawn)} · чистыми ${money.format(MT.round2(p.deposited - p.withdrawn))}`;
    setValue(els.sumIncome, p.income);
    els.incomeHint.textContent = accountId ? `На счёте «${accountName(accountId)}»` : 'По всем счетам';
    setValue(els.sumCosts, p.costs);
    setValue(els.sumRealized, p.realized, { signedValue: true });
  }

  /* ---------- Портфель ---------- */
  function renderHoldings(holdings, portfolio) {
    els.holdBody.innerHTML = '';
    els.holdEmpty.hidden = holdings.length > 0;
    holdings.forEach((h) => {
      const pnlPct = h.pnl === null || !h.cost ? '' : ` (${pctFmt.format(h.pnl / h.cost)})`;
      els.holdBody.append(el('tr', {}, [
        el('td', { 'data-label': 'Бумага', class: 'cell-main' }, [
          el('span', { class: 'ticker', text: h.ticker }),
          el('span', { class: 'tag tag--small' }, [
            el('span', { class: 'tag__dot', style: `background:${CLASS_COLORS[h.assetClass]}`, 'aria-hidden': 'true' }),
            ASSET_CLASSES[h.assetClass]
          ])
        ]),
        el('td', { 'data-label': 'Кол-во', class: 'num', text: `${qtyFmt.format(h.qty)} шт.` }),
        el('td', { 'data-label': 'Ср. цена', class: 'num', text: avgFmt.format(h.avg) }),
        el('td', { 'data-label': 'Стоимость покупки', class: 'num', text: money.format(h.cost) }),
        el('td', { 'data-label': 'Доля', class: 'num', text: pctFmt.format(h.share) }),
        el('td', { 'data-label': 'Текущая цена (вручную)', class: 'num' }, [
          el('input', {
            type: 'number', class: 'input input--price', inputmode: 'decimal', min: '0', step: 'any', placeholder: 'нет',
            value: h.price ? String(h.price) : false, 'data-ticker': h.ticker, 'data-key': `price:${h.ticker}`,
            'aria-label': `Текущая цена ${h.ticker}, ₽ (вводится вручную)`
          })
        ]),
        el('td', { 'data-label': 'Оценка', class: 'num', text: h.value === null ? '—' : money.format(h.value) }),
        el('td', {
          'data-label': 'Нереализ. результат',
          class: `num${h.pnl > 0 ? ' amount--income' : h.pnl < 0 ? ' amount--expense' : ''}`,
          text: h.pnl === null ? 'нет цены' : `${signed(h.pnl)}${pnlPct}`
        })
      ]));
    });

    const priced = holdings.filter((h) => h.value !== null);
    const estimate = MT.round2(holdings.reduce((s, h) => s + h.estimate, 0));
    const pnl = MT.round2(priced.reduce((s, h) => s + h.pnl, 0));
    els.holdTotals.textContent = holdings.length
      ? `Оценка бумаг: ${money.format(estimate)} (по ручным ценам; без цены — по стоимости покупки) · с деньгами на счёте: ${money.format(MT.round2(estimate + portfolio.cash))} · нереализованный результат: ${signed(pnl)} по ${priced.length} из ${holdings.length} ${MT.plural(holdings.length, ['позиции', 'позиций', 'позиций'])}`
      : '';

    const err = portfolio.error;
    els.dataWarning.hidden = !err;
    els.dataWarning.textContent = err
      ? `Внимание: продажа ${err.op.ticker} от ${MT.formatDate(err.op.date)} превышает остаток (${qtyFmt.format(err.held)} шт.) и не учтена в расчётах. Исправьте или удалите её.`
      : '';
  }

  els.holdBody.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-ticker]');
    if (!input) return;
    const ticker = input.dataset.ticker;
    const raw = String(input.value).trim();
    const value = parseNum(raw);
    const bad = input.validity && input.validity.badInput; // в поле набран не-число: браузер отдаёт ''
    if (raw === '' && !bad) delete inv.prices[ticker];
    else if (value > 0 && value <= MT.MAX_AMOUNT) inv.prices[ticker] = roundPrice(value);
    else {
      input.setAttribute('aria-invalid', 'true');
      MT.toast('Цена должна быть больше нуля');
      return;
    }
    savePrices();
    render();
  });
  els.holdBody.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input[data-ticker]')) {
      e.preventDefault();
      e.target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  /* ---------- Диаграммы ---------- */
  const structBy = () => document.querySelector('input[name="structBy"]:checked').value;
  document.querySelectorAll('input[name="structBy"]').forEach((r) => r.addEventListener('change', render));

  function renderStructure(holdings, cash) {
    const byClass = structBy() === 'class';
    const groups = new Map();
    holdings.forEach((h, i) => {
      const key = byClass ? h.assetClass : h.ticker;
      const g = groups.get(key) || {
        name: byClass ? ASSET_CLASSES[key] : key,
        color: byClass ? CLASS_COLORS[key] : MT.COLORS[i % MT.COLORS.length],
        value: 0
      };
      g.value += h.estimate;
      groups.set(key, g);
    });
    const items = Array.from(groups.values()).filter((g) => g.value > 0).sort((a, b) => b.value - a.value);
    if (cash > 0) items.push({ name: 'Деньги на счёте', color: CASH_COLOR, value: cash });
    items.forEach((it) => { it.value = MT.round2(it.value); });
    MT.drawDonut({
      svg: els.structChart, desc: els.structDesc, legend: els.structLegend, items,
      title: byClass ? 'Структура портфеля по классам активов' : 'Структура портфеля по бумагам',
      centerLabel: 'Портфель', emptyText: 'Портфель пуст: добавьте пополнение и покупку'
    });
  }

  function renderFlow(accountId) {
    const last = MT.currentMonth();
    const months = Array.from({ length: FLOW_MONTHS }, (_, i) => MT.shiftMonth(last, i - FLOW_MONTHS + 1));
    const data = months.map((m) => ({ month: m, deposit: 0, withdraw: 0 }));
    const index = new Map(months.map((m, i) => [m, i]));
    inv.operations.forEach((o) => {
      if ((o.type !== 'deposit' && o.type !== 'withdraw') || (accountId && o.accountId !== accountId)) return;
      const i = index.get(o.date.slice(0, 7));
      if (i !== undefined) data[i][o.type] += o.amount;
    });
    const max = Math.max(1, ...data.map((d) => Math.max(d.deposit, d.withdraw)));

    const svg = els.flowChart;
    Array.from(svg.childNodes).forEach((n) => { if (n !== els.flowDesc) svg.removeChild(n); });
    const W = 600, left = 80, top = 14, base = 196, h = base - top;
    const colW = (W - left) / months.length;
    const barW = Math.min(18, colW / 3);
    [0, 0.5, 1].forEach((k) => {
      const y = base - h * k;
      svg.append(
        svgEl('line', { x1: left, x2: W, y1: y, y2: y, class: k ? 'bars__grid' : 'bars__axis' }),
        svgEl('text', { x: left - 8, y: y + 4, 'text-anchor': 'end', class: 'bars__tick' }, compact.format(max * k))
      );
    });
    data.forEach((d, i) => {
      const x0 = left + colW * i;
      [['deposit', -1, 'income', 'Пополнения'], ['withdraw', 1, 'expense', 'Выводы']].forEach(([key, side, cls, label]) => {
        const v = MT.round2(d[key]);
        const bh = v ? Math.max(2, (v / max) * h) : 0;
        const bar = svgEl('rect', {
          x: x0 + colW / 2 + (side < 0 ? -barW - 1 : 1), y: base - bh, width: barW, height: bh, rx: 3,
          class: `bars__bar bars__bar--${cls}`
        });
        bar.append(svgEl('title', {}, `${MT.formatMonth(d.month)} — ${label}: ${money.format(v)}`));
        svg.append(bar);
      });
      svg.append(svgEl('text', { x: x0 + colW / 2, y: base + 20, 'text-anchor': 'middle', class: 'bars__label bars__label--dense' },
        shortMonth.format(MT.parseISO(`${d.month}-01`)).replace('.', '').slice(0, 3)));
    });
    const sumDep = MT.round2(data.reduce((s, d) => s + d.deposit, 0));
    const sumWd = MT.round2(data.reduce((s, d) => s + d.withdraw, 0));
    els.flowTitle.textContent = `Пополнения и выводы: ${MT.formatMonth(months[0])} — ${MT.formatMonth(last)}`;
    els.flowNote.textContent = `За ${FLOW_MONTHS} месяцев: внесено ${money.format(sumDep)}, выведено ${money.format(sumWd)}`;
    els.flowDesc.textContent = `Пополнения и выводы по месяцам: ${data
      .filter((d) => d.deposit || d.withdraw)
      .map((d) => `${MT.formatMonth(d.month)} — внесено ${money.format(MT.round2(d.deposit))}, выведено ${money.format(MT.round2(d.withdraw))}`)
      .join('; ') || 'операций нет'}`;
  }

  /* ---------- Таблица операций ---------- */
  function renderTable(list) {
    els.opsBody.innerHTML = '';
    els.opsEmpty.hidden = list.length > 0;
    if (!list.length) {
      els.opsEmpty.textContent = inv.operations.length
        ? 'Ничего не найдено. Попробуйте изменить фильтры.'
        : 'Операций пока нет. Добавьте пополнение счёта и первую покупку или загрузите демо-данные.';
    }
    const multiAccount = inv.accounts.length > 1;
    const frag = document.createDocumentFragment();
    list.forEach((op) => {
      const def = OP_TYPES[op.type];
      const flow = def.sign * op.amount;
      frag.append(el('tr', { class: els.id.value === op.id ? 'is-editing' : false }, [
        el('td', { 'data-label': 'Дата', class: 'cell-date' }, [el('time', { datetime: op.date, text: MT.formatDate(op.date) })]),
        el('td', { 'data-label': 'Операция', class: 'cell-main' }, [
          el('span', { class: 'tag' }, [
            el('span', { class: 'tag__dot', style: `background:${def.color}`, 'aria-hidden': 'true' }),
            def.label
          ]),
          multiAccount ? el('span', { class: 'cell-sub', text: accountName(op.accountId) }) : null
        ]),
        el('td', { 'data-label': 'Бумага' }, op.ticker
          ? [el('span', { class: 'ticker', text: op.ticker }), el('span', { class: 'cell-sub', text: ASSET_CLASSES[op.assetClass] })]
          : ['—']),
        el('td', { 'data-label': 'Кол-во × цена', class: 'num num--light', text: isTrade(op.type) ? `${qtyFmt.format(op.quantity)} × ${priceFmt.format(op.price)}` : '—' }),
        el('td', { 'data-label': 'Сумма', class: `num amount--${flow > 0 ? 'income' : 'expense'}`, text: signed(flow) }),
        el('td', { 'data-label': 'Комиссия', class: 'num num--light', text: op.fee ? money.format(op.fee) : '—' }),
        el('td', { 'data-label': 'Комментарий', class: 'comment', text: op.comment || '—' }),
        el('td', { class: 'actions-cell' }, [el('div', { class: 'actions' }, [
          el('button', { type: 'button', class: 'btn btn--ghost btn--small', 'data-action': 'edit', 'data-id': op.id, 'aria-label': `Редактировать операцию «${opTitle(op)}» от ${MT.formatDate(op.date)}`, title: 'Редактировать', text: '✎' }),
          el('button', { type: 'button', class: 'btn btn--danger btn--small', 'data-action': 'delete', 'data-id': op.id, 'aria-label': `Удалить операцию «${opTitle(op)}» от ${MT.formatDate(op.date)}`, title: 'Удалить', text: '✕' })
        ])])
      ]));
    });
    els.opsBody.append(frag);
  }

  function renderListTotals(list) {
    if (!list.length) { els.listTotals.textContent = ''; return; }
    const flow = MT.round2(list.reduce((s, o) => s + cashDelta(o), 0));
    els.listTotals.textContent = `Показано: ${MT.countLabel(list.length)} · движение денег с учётом комиссий: ${signed(flow)}`;
  }

  els.opsBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'edit') startEdit(btn.dataset.id);
    else removeOperation(btn.dataset.id);
  });

  /* ---------- Отрисовка ---------- */
  function render() {
    const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
    // Редактируемую операцию удалили в другой вкладке — выходим из режима редактирования.
    if (els.id.value && !inv.operations.some((o) => o.id === els.id.value)) {
      els.id.value = '';
      setEditMode(false);
    }
    fillAccountSelects();
    refreshTickerOptions();
    const accountId = currentAccount();
    const portfolio = computePortfolio(inv.operations, accountId);
    const holdings = holdingsOf(portfolio, accountId);
    renderSummary(portfolio, holdings, accountId);
    renderHoldings(holdings, portfolio);
    renderStructure(holdings, portfolio.cash);
    renderFlow(accountId);
    const list = filteredOperations(getFilters());
    renderTable(list);
    renderListTotals(list);
    updateHoldHint();
    if (els.accDialog.hasAttribute('open')) renderAccounts();
    if (focusKey && !document.activeElement.dataset.key) {
      const again = document.querySelector(`[data-key="${focusKey}"]`);
      if (again) again.focus();
    }
  }

  /* ---------- Экспорт, демо, очистка ---------- */
  const csvNum = (n, digits) => (digits ? Number(n.toFixed(digits)).toString().replace('.', ',') : MT.csvAmount(n));
  els.exportCsv.addEventListener('click', () => {
    const list = filteredOperations(getFilters());
    if (!list.length) { MT.toast('Нет операций для экспорта'); return; }
    const rows = [['Дата', 'Счёт', 'Операция', 'Бумага', 'Класс актива', 'Количество', 'Цена', 'Сумма', 'Комиссия', 'Движение денег', 'Комментарий']];
    list.forEach((o) => rows.push([
      o.date, accountName(o.accountId), OP_TYPES[o.type].label, o.ticker, ASSET_CLASSES[o.assetClass] || '',
      isTrade(o.type) ? csvNum(o.quantity, 8) : '', isTrade(o.type) ? csvNum(o.price, 6) : '',
      MT.csvAmount(o.amount), MT.csvAmount(o.fee), MT.csvAmount(cashDelta(o)), o.comment
    ]));
    MT.downloadCsv(rows, `moneytable-investments-${MT.todayISO()}.csv`);
    MT.toast(`Экспортировано: ${MT.countLabel(list.length)}`);
  });

  function ensureAccount(name) {
    const found = inv.accounts.find((a) => MT.sameName(a.name, name));
    if (found) return found.id;
    const account = { id: MT.uid(), name };
    inv.accounts.push(account);
    return account.id;
  }

  function addDemo() {
    const main = ensureAccount(DEFAULT_ACCOUNT);
    const iis = ensureAccount('ИИС');
    const d = MT.demoDate;
    const rows = [
      [main, 'deposit', d(5, 3), { amount: 150000 }, 'Перевод с карты'],
      [main, 'buy', d(5, 4), { ticker: 'SBER', assetClass: 'stock', quantity: 200, price: 270.5, fee: 16.23 }, ''],
      [main, 'buy', d(5, 4), { ticker: 'ОФЗ 26238', assetClass: 'bond', quantity: 50, price: 612.4, fee: 9.19 }, ''],
      [main, 'buy', d(4, 10), { ticker: 'TMOS', assetClass: 'fund', quantity: 5000, price: 6.42, fee: 9.63 }, 'Фонд на индекс'],
      [iis, 'deposit', d(4, 1), { amount: 50000 }, 'Взнос на ИИС'],
      [iis, 'buy', d(4, 2), { ticker: 'LQDT', assetClass: 'fund', quantity: 30000, price: 1.62 }, 'Фонд денежного рынка'],
      [iis, 'buy', d(3, 6), { ticker: 'USD', assetClass: 'currency', quantity: 10, price: 92.5 }, ''],
      [main, 'buy', d(3, 12), { ticker: 'SBER', assetClass: 'stock', quantity: 100, price: 295, fee: 8.85 }, ''],
      [main, 'coupon', d(3, 20), { ticker: 'ОФЗ 26238', assetClass: 'bond', amount: 1745 }, ''],
      [main, 'sell', d(2, 15), { ticker: 'SBER', assetClass: 'stock', quantity: 120, price: 312.8, fee: 11.26 }, 'Частичная фиксация'],
      [main, 'tax', d(2, 15), { amount: 398 }, 'НДФЛ с продажи'],
      [main, 'fee', d(1, 1), { amount: 299 }, 'Обслуживание счёта'],
      [main, 'dividend', d(1, 18), { ticker: 'SBER', assetClass: 'stock', amount: 6640 }, 'После удержания налога'],
      [main, 'withdraw', d(0, 5), { amount: 10000 }, 'На карту']
    ];
    rows.forEach(([accountId, type, date, extra, comment]) => {
      const op = normalizeOperation({ id: MT.uid(), accountId, type, date, comment, ...extra });
      if (op) inv.operations.push(op);
    });
    const demoPrices = { SBER: 305.2, 'ОФЗ 26238': 598.1, TMOS: 7.05, LQDT: 1.71 };
    Object.entries(demoPrices).forEach(([t, p]) => { if (!inv.prices[t]) inv.prices[t] = p; });
    saveAccounts();
    saveOperations();
    savePrices();
  }

  els.loadDemo.addEventListener('click', () => {
    if (inv.operations.length && !confirm('Добавить демо-операции к существующим?')) return;
    addDemo();
    render();
    MT.toast('Демо-данные загружены');
  });

  els.clear.addEventListener('click', () => {
    if (!inv.operations.length && inv.accounts.length <= 1 && !Object.keys(inv.prices).length) { MT.toast('Данных уже нет'); return; }
    if (!confirm('Удалить все инвестиционные операции, счета и ручные цены? Журнал, копилки и категории не изменятся.')) return;
    inv.accounts = [{ id: MT.uid(), name: DEFAULT_ACCOUNT }];
    inv.operations = [];
    inv.prices = {};
    saveAccounts();
    saveOperations();
    savePrices();
    els.accFilter.value = '';
    showOpsError('');
    resetForm();
    MT.toast('Инвестиционные данные удалены');
  });

  /* ---------- Запуск ---------- */
  loadInvest({ persist: true });
  try {
    if (!localStorage.getItem(KEYS.initialized)) {
      if (!inv.operations.length) addDemo();
      localStorage.setItem(KEYS.initialized, '1');
    }
  } catch (e) { /* localStorage недоступен */ }
  els.date.value = MT.todayISO();
  fillAccountSelects();
  updateFormFields();
  MT.initPage(render, { keys: [KEYS.accounts, KEYS.operations, KEYS.prices], reload: loadInvest });
})();
