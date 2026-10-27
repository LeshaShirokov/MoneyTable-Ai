/** Страница «Копилки»: цели, пополнение и снятие, история, экспорт. */
(() => {
  'use strict';
  const MT = window.MoneyTable;
  const { state, money, el, $, COLORS, MAX_GOAL_NAME } = MT;
  const PLURAL_DAYS = ['день', 'дня', 'дней'];

  const els = {
    inGoals: $('sumInGoals'), inGoalsHint: $('inGoalsHint'), free: $('sumFree'), freeHint: $('freeHint'),
    goalsCount: $('sumGoals'), goalsHint: $('goalsHint'),
    list: $('goalsList'), empty: $('goalsEmpty'), add: $('addGoal'), exportCsv: $('exportGoalsCsv'),
    goalDialog: $('goalDialog'), goalForm: $('goalForm'), goalDialogTitle: $('goalDialogTitle'), goalSubmit: $('goalSubmit'),
    goalId: $('goalId'), goalName: $('goalName'), goalTarget: $('goalTarget'), goalDeadline: $('goalDeadline'),
    goalEmoji: $('goalEmoji'), goalColor: $('goalColor'),
    moveDialog: $('moveDialog'), moveForm: $('moveForm'), moveTitle: $('moveTitle'), moveHint: $('moveHint'),
    moveGoalId: $('moveGoalId'), moveAmount: $('moveAmount'), moveDate: $('moveDate'), moveComment: $('moveComment'),
    moveSubmit: $('moveSubmit')
  };
  /** id копилок с раскрытой историей — сохраняется между перерисовками. */
  const openHistory = new Set();

  /* ---------- Сводка ---------- */
  function renderSummary() {
    const inGoals = MT.totalInGoals();
    const free = MT.freeBalance();
    const done = state.goals.filter(MT.goalDone).length;
    const target = MT.round2(state.goals.reduce((s, g) => s + g.target, 0));
    els.inGoals.textContent = money.format(inGoals);
    els.inGoalsHint.textContent = state.goals.length ? `из ${money.format(target)} по всем целям` : 'Копилок пока нет';
    els.free.textContent = money.format(free);
    els.free.classList.toggle('is-negative', free < 0);
    els.freeHint.textContent = 'Баланс за всё время минус копилки';
    els.goalsCount.textContent = String(state.goals.length);
    els.goalsHint.textContent = state.goals.length ? `Достигнуто: ${done} из ${state.goals.length}` : 'Создайте первую цель';
  }

  /* ---------- Список копилок ---------- */
  function deadlineInfo(g, saved) {
    if (!g.deadline) return { text: 'Без срока', late: false, perMonth: 0 };
    const days = Math.round((MT.parseISO(g.deadline) - MT.parseISO(MT.todayISO())) / 86400000);
    let text = `до ${MT.formatDate(g.deadline)}`;
    let late = false;
    let perMonth = 0;
    if (saved < g.target) {
      if (days < 0) { text += ' · срок прошёл'; late = true; }
      else if (days === 0) text += ' · сегодня';
      else {
        text += ` · осталось ${days} ${MT.plural(days, PLURAL_DAYS)}`;
        perMonth = (g.target - saved) / Math.max(1, days / 30.44);
      }
    }
    return { text, late, perMonth };
  }

  function renderHistory(g) {
    const history = g.history.slice().sort(MT.byDateDesc);
    const items = history.length
      ? history.map((h) => el('li', {}, [
        el('time', { class: 'history__date', datetime: h.date, text: MT.formatDate(h.date) }),
        el('span', { class: 'history__comment', text: h.comment || (h.kind === 'deposit' ? 'Пополнение' : 'Снятие') }),
        el('span', {
          class: `history__amount amount--${h.kind === 'deposit' ? 'income' : 'expense'}`,
          text: `${h.kind === 'deposit' ? '+' : '−'} ${money.format(h.amount)}`
        })
      ]))
      : [el('li', { class: 'history__empty', text: 'Пока нет операций' })];
    return el('details', { class: 'goal__history', 'data-goal': g.id, open: openHistory.has(g.id) }, [
      el('summary', { text: `История (${history.length})` }),
      el('ul', { class: 'history' }, items)
    ]);
  }

  function renderGoal(g) {
    const saved = MT.goalSaved(g);
    const done = saved >= g.target;
    const pct = Math.min(100, Math.floor((saved / g.target) * 100));
    const info = deadlineInfo(g, saved);
    const titleId = `goal-title-${g.id}`;
    let hint = done ? 'Цель достигнута 🎉' : `Осталось накопить: ${money.format(MT.round2(g.target - saved))}`;
    if (!done && info.perMonth) hint += ` · ≈ ${money.format(Math.ceil(info.perMonth))} в месяц`;
    const action = (name, cls, text, label, extra = {}) =>
      el('button', { type: 'button', class: `btn ${cls}`, 'data-action': name, 'data-id': g.id, text, 'aria-label': `${label} «${g.name}»`, ...extra });

    return el('article', {
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
          action('edit', 'btn--ghost btn--small', '✎', 'Редактировать копилку', { title: 'Редактировать' }),
          action('delete', 'btn--danger btn--small', '✕', 'Удалить копилку', { title: 'Удалить' })
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
        action('deposit', 'btn--primary btn--small btn--grow', '+ Пополнить', 'Пополнить копилку'),
        action('withdraw', 'btn--ghost btn--small btn--grow', '− Снять', 'Снять из копилки', { disabled: saved <= 0 })
      ]),
      renderHistory(g)
    ]);
  }

  function render() {
    renderSummary();
    // Незавершённые цели — первыми.
    const list = state.goals.slice().sort((a, b) => Number(MT.goalDone(a)) - Number(MT.goalDone(b)));
    els.list.innerHTML = '';
    els.empty.hidden = list.length > 0;
    list.forEach((g) => els.list.append(renderGoal(g)));
  }

  els.list.addEventListener('toggle', (e) => {
    const id = e.target.dataset && e.target.dataset.goal;
    if (!id) return;
    if (e.target.open) openHistory.add(id); else openHistory.delete(id);
  }, true);

  els.list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const g = MT.findGoal(btn.dataset.id);
    if (!g) return;
    const action = btn.dataset.action;
    if (action === 'deposit' || action === 'withdraw') openMoveDialog(g, action);
    else if (action === 'edit') openGoalDialog(g);
    else if (action === 'delete') removeGoal(g);
  });

  /* ---------- Создание и редактирование ---------- */
  function openGoalDialog(goal) {
    els.goalForm.reset();
    MT.clearErrors(els.goalName, els.goalTarget, els.goalDeadline);
    els.goalId.value = goal ? goal.id : '';
    els.goalDialogTitle.textContent = goal ? 'Редактирование копилки' : 'Новая копилка';
    els.goalSubmit.textContent = goal ? 'Сохранить' : 'Создать';
    els.goalName.value = goal ? goal.name : '';
    els.goalTarget.value = goal ? goal.target : '';
    els.goalDeadline.value = goal ? goal.deadline : '';
    els.goalEmoji.value = goal ? goal.emoji : '';
    els.goalColor.value = goal ? goal.color : COLORS[state.goals.length % COLORS.length];
    MT.openDialog(els.goalDialog, els.goalName);
  }
  els.add.addEventListener('click', () => openGoalDialog(null));
  MT.clearOnInput(els.goalName, els.goalTarget, els.goalDeadline);

  els.goalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    let first = null;
    const fail = (input, msg) => { MT.setError(input, msg); first = first || input; };
    const name = MT.cleanName(els.goalName.value);
    const target = MT.parseAmount(els.goalTarget.value);
    const deadline = els.goalDeadline.value;
    const editingId = els.goalId.value;

    if (!name) fail(els.goalName, 'Введите название');
    else if (name.length > MAX_GOAL_NAME) fail(els.goalName, `Не длиннее ${MAX_GOAL_NAME} символов`);
    else if (state.goals.some((g) => g.id !== editingId && MT.sameName(g.name, name))) fail(els.goalName, 'Копилка с таким названием уже есть');
    else MT.setError(els.goalName, '');

    if (!(target > 0)) fail(els.goalTarget, 'Введите сумму цели больше нуля');
    else if (target > MT.MAX_AMOUNT) fail(els.goalTarget, 'Слишком большая сумма');
    else MT.setError(els.goalTarget, '');

    if (deadline && !MT.isISODate(deadline)) fail(els.goalDeadline, 'Некорректная дата');
    else MT.setError(els.goalDeadline, '');

    if (first) { first.focus(); return; }

    const data = {
      name, target, deadline,
      emoji: els.goalEmoji.value.trim().slice(0, 8),
      color: MT.isColor(els.goalColor.value) ? els.goalColor.value.toLowerCase() : COLORS[0]
    };
    const goal = editingId && MT.findGoal(editingId);
    if (goal) {
      Object.assign(goal, data);
      MT.toast('Копилка обновлена');
    } else {
      state.goals.push(MT.normalizeGoal({ ...data, id: MT.uid(), createdAt: MT.todayISO(), history: [] }));
      MT.toast('Копилка создана');
    }
    MT.saveGoals();
    MT.closeDialog(els.goalDialog);
    render();
  });

  function removeGoal(g) {
    const saved = MT.goalSaved(g);
    const note = saved > 0 ? ` Накопленные ${money.format(saved)} вернутся в свободный остаток.` : '';
    if (!confirm(`Удалить копилку «${g.name}» вместе с историей?${note}`)) return;
    state.goals = state.goals.filter((x) => x.id !== g.id);
    openHistory.delete(g.id);
    MT.saveGoals();
    render();
    MT.toast('Копилка удалена');
  }

  /* ---------- Пополнение и снятие ---------- */
  const moveKind = () => els.moveForm.querySelector('input[name="moveKind"]:checked').value;

  function updateMoveHint() {
    const g = MT.findGoal(els.moveGoalId.value);
    if (!g) return;
    const deposit = moveKind() === 'deposit';
    els.moveSubmit.textContent = deposit ? 'Пополнить' : 'Снять';
    els.moveHint.textContent = deposit
      ? `Накоплено ${money.format(MT.goalSaved(g))} из ${money.format(g.target)}. Свободный остаток: ${money.format(MT.freeBalance())}.`
      : `Можно снять не больше ${money.format(MT.goalSaved(g))}.`;
    MT.setError(els.moveAmount, '');
  }

  function openMoveDialog(g, kind) {
    els.moveForm.reset();
    MT.clearErrors(els.moveAmount, els.moveDate);
    els.moveGoalId.value = g.id;
    els.moveTitle.textContent = `${g.emoji || '🎯'} ${g.name}`;
    $(kind === 'withdraw' ? 'moveWithdraw' : 'moveDeposit').checked = true;
    els.moveDate.value = MT.todayISO();
    updateMoveHint();
    MT.openDialog(els.moveDialog, els.moveAmount);
  }
  els.moveForm.addEventListener('change', (e) => { if (e.target.name === 'moveKind') updateMoveHint(); });
  MT.clearOnInput(els.moveAmount, els.moveDate);

  els.moveForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const g = MT.findGoal(els.moveGoalId.value);
    if (!g) { MT.closeDialog(els.moveDialog); return; }
    const kind = moveKind();
    const amount = MT.parseAmount(els.moveAmount.value);
    const saved = MT.goalSaved(g);
    let first = null;
    const fail = (input, msg) => { MT.setError(input, msg); first = first || input; };

    if (!(amount > 0)) fail(els.moveAmount, 'Введите сумму больше нуля');
    else if (amount > MT.MAX_AMOUNT) fail(els.moveAmount, 'Слишком большая сумма');
    else if (kind === 'withdraw' && amount > saved) fail(els.moveAmount, `Нельзя снять больше, чем накоплено: ${money.format(saved)}`);
    else MT.setError(els.moveAmount, '');

    if (!MT.isISODate(els.moveDate.value)) fail(els.moveDate, 'Укажите корректную дату');
    else MT.setError(els.moveDate, '');

    if (first) { first.focus(); return; }

    if (kind === 'deposit') {
      const free = MT.freeBalance();
      if (amount > free && !confirm(`Сумма больше свободного остатка (${money.format(free)}). Всё равно пополнить копилку?`)) return;
    }

    g.history.push({ id: MT.uid(), kind, amount, date: els.moveDate.value, comment: els.moveComment.value.trim() });
    MT.saveGoals();
    MT.closeDialog(els.moveDialog);
    render();
    const doneNow = kind === 'deposit' && saved < g.target && MT.goalSaved(g) >= g.target;
    MT.toast(doneNow ? `Цель «${g.name}» достигнута! 🎉` : kind === 'deposit' ? 'Копилка пополнена' : 'Деньги сняты из копилки');
  });

  /* ---------- Экспорт ---------- */
  els.exportCsv.addEventListener('click', () => {
    if (!state.goals.length) { MT.toast('Нет копилок для экспорта'); return; }
    const rows = [['Копилка', 'Цель', 'Срок', 'Накоплено', 'Дата', 'Операция', 'Сумма', 'Комментарий']];
    state.goals.forEach((g) => {
      const base = [g.name, MT.csvAmount(g.target), g.deadline, MT.csvAmount(MT.goalSaved(g))];
      if (!g.history.length) rows.push([...base, '', '', '', '']);
      g.history.slice().sort((a, b) => MT.byDateDesc(b, a)).forEach((h) => rows.push([
        ...base, h.date, h.kind === 'deposit' ? 'Пополнение' : 'Снятие',
        (h.kind === 'deposit' ? '' : '-') + MT.csvAmount(h.amount), h.comment
      ]));
    });
    MT.downloadCsv(rows, `moneytable-goals-${MT.todayISO()}.csv`);
    MT.toast('Копилки экспортированы');
  });

  MT.initPage(render);
})();
