// Summary view: one day's totals vs target, macros, per-meal entries, 7-day chart.

import { state, MEALS, getDay, currentWeight } from '../store.js';
import { macroTargets, mealBudgets, sumEntries, addDays, fromKey } from '../calc.js';
import { esc, h, progressBar, kcal, g } from '../ui.js';
import { barChart } from '../chart.js';
import { todayKey, dayTarget, validDate, entryRow, openEntryEditor, deleteEntryConfirm } from './home.js';

export const title = 'סיכום יומי';

const MACROS = [
  { key: 'protein', label: 'חלבון', color: '--protein' },
  { key: 'carbs', label: 'פחמימות', color: '--carbs' },
  { key: 'fat', label: 'שומן', color: '--fat' },
];

function longDate(key) {
  return fromKey(key).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function render(container, params, ctx) {
  let date = validDate(params.date) || todayKey();

  const root = h('<div class="hs-summary"></div>');
  container.appendChild(root);

  function setDate(d) {
    const today = todayKey();
    date = d > today ? today : d;
    try { history.replaceState(null, '', date === today ? '#summary' : `#summary?date=${date}`); } catch {}
    draw();
  }

  function draw() {
    const today = todayKey();
    const isToday = date === today;
    const target = dayTarget();
    const day = getDay(date);
    const sum = sumEntries(day);
    const mt = macroTargets(target, state.settings.dietType, currentWeight());
    const budgets = mealBudgets(target, state.settings.mealPct);

    // --- totals
    let totals;
    if (target) {
      const left = target - sum.kcal;
      totals = `${progressBar(sum.kcal, target)}
        <p class="hs-total-note ${left < 0 ? 'hs-over' : ''}">${left >= 0
          ? `נשארו <b class="num">${kcal(left)}</b> קק״ל`
          : `חריגה של <b class="num">${kcal(-left)}</b> קק״ל`}</p>`;
    } else {
      totals = `<p class="muted">עדיין לא הוגדר יעד יומי.</p>
        <button type="button" class="btn small" data-act="settings">להגדרת יעד</button>`;
    }

    // --- macros
    const macroRows = MACROS.map(m => {
      const v = sum[m.key], t = mt ? mt[m.key] : null;
      const isMax = m.key === 'carbs' && mt && mt.carbsIsMax;
      const right = t == null
        ? `<span><span class="num">${g(v)}</span> ג׳</span>`
        : isMax
          ? `<span><span class="num">${g(v)}</span> ג׳ · עד <span class="num">${Math.round(t)}</span> ג׳</span>`
          : `<span><span class="num">${g(v)}</span> / <span class="num">${Math.round(t)}</span> ג׳</span>`;
      return `<div class="hs-macro">
        <div class="spread"><span><i class="hs-dot" style="background:var(${m.color})"></i>${m.label}${isMax ? ' <small class="muted">(תקרה)</small>' : ''}</span>${right}</div>
        ${t != null ? progressBar(v, t, { color: `var(${m.color})` }) : ''}
      </div>`;
    }).join('');

    // --- meals
    const meals = MEALS.map((name, i) => {
      const entries = day.filter(e => e.meal === i);
      const s = sumEntries(entries).kcal, b = budgets[i];
      return `<section class="card hs-mealsec">
        <div class="hs-mealhead">
          <h3>${name}</h3>
          <span class="muted"><span class="num">${kcal(s)}${b != null ? ` / ${kcal(b)}` : ''}</span> קק״ל</span>
          <button type="button" class="btn small ghost" data-act="add" data-meal="${i}" aria-label="הוספה ל${name}">+ הוספה</button>
        </div>
        ${b != null && (s || entries.length) ? progressBar(s, b) : ''}
        ${entries.length ? `<ul class="list hs-entries">${entries.map(entryRow).join('')}</ul>` : ''}
      </section>`;
    }).join('');

    // --- 7-day chart ending at `date`
    const bars = [];
    for (let i = 6; i >= 0; i--) {
      const k = addDays(date, -i);
      const [, mo, d] = k.split('-');
      bars.push({ label: `${+d}/${+mo}`, value: sumEntries(getDay(k)).kcal });
    }

    root.innerHTML = `
      <section class="card hs-datenav">
        <div class="hs-datenav-row">
          <button type="button" class="btn hs-arrow" data-act="prev" aria-label="יום קודם">→</button>
          <input type="date" class="hs-dateinput" value="${date}" max="${today}" aria-label="בחירת תאריך">
          <button type="button" class="btn hs-arrow" data-act="next" aria-label="יום הבא" ${isToday ? 'disabled' : ''}>←</button>
        </div>
        <div class="spread hs-datelabel">
          <b>${esc(longDate(date))}</b>
          ${isToday ? '<span class="hs-todaytag">היום</span>' : '<button type="button" class="btn small" data-act="today">חזרה להיום</button>'}
        </div>
      </section>

      <section class="card">
        <div class="spread"><h2>קלוריות</h2>
          <span class="hs-big"><span class="num">${kcal(sum.kcal)}${target ? ` / ${kcal(target)}` : ''}</span> <small>קק״ל</small></span></div>
        ${totals}
      </section>

      <section class="card">
        <h2>רכיבים</h2>
        ${day.length && !sum.macrosComplete ? `<div class="alert warn">נתונים חלקיים: לחלק מהפריטים אין ערכי חלבון, פחמימות או שומן, ולכן הסכומים כאן נמוכים מהאמת.</div>` : ''}
        <div class="stack">${macroRows}</div>
        ${mt && mt.carbsIsMax ? '<p class="muted hs-note">הפחמימות הן תקרה יומית, וסופרים פחמימות כוללות (כולל סיבים).</p>' : ''}
        ${!mt ? '<p class="muted hs-note">יעדי הרכיבים יוצגו אחרי שיוגדר יעד יומי.</p>' : ''}
      </section>

      ${meals}

      <section class="card">
        <h2>7 ימים אחרונים</h2>
        ${barChart(bars, { target })}
        ${target ? '<p class="muted hs-note">הקו המקווקו הוא היעד היומי. עמודה אדומה היא יום עם חריגה.</p>' : ''}
      </section>`;
  }

  root.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t || !root.contains(t) || t.disabled) return;
    const act = t.dataset.act;
    if (act === 'prev') setDate(addDays(date, -1));
    else if (act === 'next') setDate(addDays(date, 1));
    else if (act === 'today') setDate(todayKey());
    else if (act === 'settings') ctx.navigate('settings');
    else if (act === 'add') ctx.navigate('home', { date, meal: t.dataset.meal });
    else if (act === 'edit' || act === 'del') {
      const entry = getDay(date).find(x => x.id === t.dataset.id);
      if (!entry) return;
      if (act === 'edit') openEntryEditor(date, entry, draw);
      else deleteEntryConfirm(date, entry, draw);
    }
  });
  root.addEventListener('change', e => {
    if (!e.target.classList.contains('hs-dateinput')) return;
    const v = validDate(e.target.value);
    if (v) setDate(v);
    else if (e.target.value) setDate(todayKey()); // future date picked
    else e.target.value = date;
  });

  draw();
}
