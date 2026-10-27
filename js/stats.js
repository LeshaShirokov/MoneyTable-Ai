/** Страница «Статистика»: сводка за период, диаграмма по категориям и сравнение по месяцам. */
(() => {
  'use strict';
  const MT = window.MoneyTable;
  const { state, money, el, svgEl, $ } = MT;
  const MONTHS_IN_CHART = 6;
  const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
  const shortMonth = new Intl.DateTimeFormat('ru-RU', { month: 'short' });

  const els = {
    period: $('period'), prev: $('periodPrev'), next: $('periodNext'), all: $('periodAll'), periodLabel: $('periodLabel'),
    sumBalance: $('sumBalance'), sumIncome: $('sumIncome'), sumExpense: $('sumExpense'), sumFree: $('sumFree'),
    countIncome: $('countIncome'), countExpense: $('countExpense'), freeHint: $('freeHint'),
    chartTitle: $('chartTitle'), chart: $('chart'), chartDesc: $('chartDesc'), legend: $('legend'),
    monthly: $('monthly'), monthlyDesc: $('monthlyDesc'), monthlyTitle: $('monthlyTitle')
  };
  const LABELS = {
    expense: { title: 'Расходы по категориям', total: 'Всего расходов', empty: 'Нет расходов за выбранный период' },
    income: { title: 'Доходы по категориям', total: 'Всего доходов', empty: 'Нет доходов за выбранный период' }
  };

  const chartType = () => document.querySelector('input[name="chartType"]:checked').value;
  const period = () => (MT.isMonth(els.period.value) ? els.period.value : '');

  /* ---------- Период ---------- */
  function setPeriod(month) {
    els.period.value = month;
    render();
  }
  els.period.addEventListener('change', render);
  els.prev.addEventListener('click', () => setPeriod(MT.shiftMonth(period() || MT.currentMonth(), period() ? -1 : 0)));
  els.next.addEventListener('click', () => setPeriod(MT.shiftMonth(period() || MT.currentMonth(), period() ? 1 : 0)));
  els.all.addEventListener('click', () => setPeriod(''));

  /* ---------- Сводка ---------- */
  function renderSummary(month) {
    const t = MT.totals(month);
    const balance = MT.round2(t.income - t.expense);
    const free = MT.freeBalance();
    els.sumIncome.textContent = money.format(t.income);
    els.sumExpense.textContent = money.format(t.expense);
    els.sumBalance.textContent = money.format(balance);
    els.sumBalance.classList.toggle('is-negative', balance < 0);
    els.sumFree.textContent = money.format(free);
    els.sumFree.classList.toggle('is-negative', free < 0);
    els.countIncome.textContent = MT.countLabel(t.incomeCount);
    els.countExpense.textContent = MT.countLabel(t.expenseCount);
    els.freeHint.textContent = `За всё время, в копилках: ${money.format(MT.totalInGoals())}`;
    els.periodLabel.textContent = month ? `За ${MT.formatMonth(month)}` : 'За всё время';
    els.all.setAttribute('aria-pressed', month ? 'false' : 'true');
  }

  /* ---------- Кольцевая диаграмма ---------- */
  function arcPath(cx, cy, r, ri, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (rad, a) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`;
    return `M${pt(r, a0)} A${r} ${r} 0 ${large} 1 ${pt(r, a1)} L${pt(ri, a1)} A${ri} ${ri} 0 ${large} 0 ${pt(ri, a0)} Z`;
  }

  function renderDonut(month, type) {
    const labels = LABELS[type];
    const byCat = new Map();
    let total = 0;
    state.transactions.forEach((t) => {
      if (t.type !== type || (month && t.date.slice(0, 7) !== month)) return;
      byCat.set(t.category, (byCat.get(t.category) || 0) + t.amount);
      total += t.amount;
    });
    const items = Array.from(byCat, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    els.chartTitle.textContent = labels.title;
    const svg = els.chart;
    Array.from(svg.childNodes).forEach((n) => { if (n !== els.chartDesc) svg.removeChild(n); });
    els.legend.innerHTML = '';

    const cx = 100, cy = 100, r = 90, ri = 58;
    if (!items.length) {
      svg.append(svgEl('circle', { cx, cy, r: (r + ri) / 2, fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': r - ri }));
      els.legend.append(el('li', { class: 'legend__empty', text: labels.empty }));
    }
    let a = -Math.PI / 2;
    items.forEach((it) => {
      const frac = it.value / total;
      const color = MT.categoryColor(type, it.name);
      let shape;
      if (frac >= 0.9999) {
        shape = svgEl('circle', { cx, cy, r: (r + ri) / 2, fill: 'none', stroke: color, 'stroke-width': r - ri });
      } else {
        const a1 = a + frac * Math.PI * 2;
        shape = svgEl('path', { d: arcPath(cx, cy, r, ri, a, a1), fill: color });
        a = a1;
      }
      shape.append(svgEl('title', {}, `${it.name}: ${money.format(it.value)} (${Math.round(frac * 100)}%)`));
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
    svg.append(
      svgEl('text', { x: cx, y: cy - 6, 'text-anchor': 'middle', class: 'chart__center-label' }, labels.total),
      svgEl('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', class: 'chart__center-value' },
        new Intl.NumberFormat('ru-RU', {
          style: 'currency', currency: 'RUB', notation: total >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: 0
        }).format(total))
    );
    els.chartDesc.textContent = items.length
      ? `${labels.title}: ${items.map((it) => `${it.name} ${money.format(it.value)}`).join(', ')}`
      : labels.empty;
  }

  /* ---------- Доходы и расходы по месяцам ---------- */
  function renderMonthly(month) {
    const last = month || MT.currentMonth();
    const months = Array.from({ length: MONTHS_IN_CHART }, (_, i) => MT.shiftMonth(last, i - MONTHS_IN_CHART + 1));
    const data = months.map((m) => ({ month: m, ...MT.totals(m) }));
    const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));

    const svg = els.monthly;
    Array.from(svg.childNodes).forEach((n) => { if (n !== els.monthlyDesc) svg.removeChild(n); });

    const W = 600, left = 80, top = 14, base = 196, h = base - top;
    const colW = (W - left) / months.length;
    const barW = Math.min(26, colW / 3.4);

    // Сетка: 0, 50 %, 100 % от максимума
    [0, 0.5, 1].forEach((k) => {
      const y = base - h * k;
      svg.append(
        svgEl('line', { x1: left, x2: W, y1: y, y2: y, class: k ? 'bars__grid' : 'bars__axis' }),
        svgEl('text', { x: left - 8, y: y + 4, 'text-anchor': 'end', class: 'bars__tick' }, compact.format(max * k))
      );
    });

    data.forEach((d, i) => {
      const x0 = left + colW * i;
      const g = svgEl('g', { class: `bars__col${d.month === month ? ' is-selected' : ''}` });
      g.append(svgEl('rect', { x: x0 + 4, y: top - 6, width: colW - 8, height: base - top + 32, rx: 8, class: 'bars__bg' }));
      [['income', -1], ['expense', 1]].forEach(([type, side]) => {
        const v = d[type];
        const bh = v ? Math.max(2, (v / max) * h) : 0;
        const bar = svgEl('rect', {
          x: x0 + colW / 2 + (side < 0 ? -barW - 2 : 2), y: base - bh, width: barW, height: bh, rx: 4,
          class: `bars__bar bars__bar--${type}`
        });
        bar.append(svgEl('title', {}, `${type === 'income' ? 'Доходы' : 'Расходы'}: ${money.format(v)}`));
        g.append(bar);
      });
      g.append(svgEl('text', { x: x0 + colW / 2, y: base + 20, 'text-anchor': 'middle', class: 'bars__label' },
        shortMonth.format(MT.parseISO(`${d.month}-01`)).replace('.', '')));
      // Колонка — кнопка: выбирает месяц как период.
      const label = `${MT.formatMonth(d.month)}: доходы ${money.format(d.income)}, расходы ${money.format(d.expense)}. Показать этот месяц`;
      const hit = svgEl('rect', {
        x: x0 + 4, y: top - 6, width: colW - 8, height: base - top + 32, rx: 8, class: 'bars__hit',
        role: 'button', tabindex: '0', 'aria-label': label, 'aria-pressed': d.month === month ? 'true' : 'false', 'data-month': d.month
      });
      hit.append(svgEl('title', {}, label));
      g.append(hit);
      svg.append(g);
    });

    els.monthlyTitle.textContent = `Доходы и расходы: ${MT.formatMonth(months[0])} — ${MT.formatMonth(last)}`;
    els.monthlyDesc.textContent = `Доходы и расходы по месяцам: ${data
      .map((d) => `${MT.formatMonth(d.month)} — доходы ${money.format(d.income)}, расходы ${money.format(d.expense)}`).join('; ')}`;
  }

  function pickMonthFromChart(e) {
    const hit = e.target.closest('[data-month]');
    if (!hit) return;
    if (e.type === 'keydown') {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
    }
    const m = hit.getAttribute('data-month');
    setPeriod(period() === m ? '' : m);
    const again = els.monthly.querySelector(`[data-month="${m}"]`);
    if (again && e.type === 'keydown') again.focus();
  }
  els.monthly.addEventListener('click', pickMonthFromChart);
  els.monthly.addEventListener('keydown', pickMonthFromChart);

  /* ---------- Отрисовка ---------- */
  const categories = MT.createCategoryManager({ getType: chartType, onChange: render });
  document.querySelectorAll('input[name="chartType"]').forEach((r) => r.addEventListener('change', render));

  function render() {
    const month = period();
    renderSummary(month);
    renderDonut(month, chartType());
    renderMonthly(month);
    categories.refresh();
  }

  MT.initPage(render);
})();
