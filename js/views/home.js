// Home view: add food to a meal (today, or a past day via params.date).
// Also exports the entry editor + row helpers that summary.js reuses.

import { state, MEALS, getDay, addEntry, updateEntry, deleteEntry, currentWeight, getFood } from '../store.js';
import {
  computeTarget, mealBudgets, dayKey, mealForTime, parseNum, normalize, fmtDate, addDays,
  foodNutrition, recipeTotals, recipeNutrition, sumEntries,
} from '../calc.js';
import { esc, h, toast, openModal, confirmDialog, numInput, progressBar, kcal, g } from '../ui.js';
import { ring } from '../chart.js';

export const title = 'הוספת אוכל';

const RECENT_DAYS = 14;
const RECENT_MAX = 8;
const RESULTS_MAX = 50;

/* ---------- Shared helpers (also used by summary.js) ---------- */

/** Today's diet-day key (respects dayStartHour). */
export function todayKey() { return dayKey(new Date(), state.settings.dayStartHour ?? 4); }

/** Daily kcal target from the *current* settings, or null. */
export function dayTarget() {
  return computeTarget(state.settings, currentWeight(), todayKey()).target || null;
}

/** Returns the key if it's a valid 'YYYY-MM-DD' not after today, else null. */
export function validDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= todayKey() ? d : null;
}

const badge = type => type === 'recipe' ? ' <span class="hs-badge">מתכון</span>' : '';

/** <li> for a log entry: tap name to edit, ✕ to delete. */
export function entryRow(e) {
  const id = esc(e.id);
  return `<li class="hs-entry">
    <button type="button" class="hs-entry-main" data-act="edit" data-id="${id}">
      <span class="hs-entry-name">${esc(e.name)}${badge(e.sourceType)}</span>
      <span class="hs-entry-qty">${esc(e.qtyLabel)}</span>
    </button>
    <span class="hs-entry-kcal"><span class="num">${kcal(e.kcal)}</span> <small>קק״ל</small></span>
    <button type="button" class="hs-del" data-act="del" data-id="${id}" aria-label="מחיקת ${esc(e.name)}">✕</button>
  </li>`;
}

function qtyLabel(mode, q, unitName) {
  if (mode !== 'unit') return `${g(q)} ג׳`;
  if (unitName === 'מנה') return `${g(q)} ${q === 1 ? 'מנה' : 'מנות'}`;
  return `${g(q)} ${unitName}`;
}

function macroLine(n) {
  if (n.protein == null && n.carbs == null && n.fat == null) {
    return '<div class="muted hs-macros">אין נתוני חלבון, פחמימות ושומן</div>';
  }
  const part = (label, v, color) => `<span><i class="hs-dot" style="background:var(${color})"></i>${label} <span class="num">${g(v)}</span> ג׳</span>`;
  return `<div class="hs-macros">${part('חלבון', n.protein, '--protein')}${part('פחמימות', n.carbs, '--carbs')}${part('שומן', n.fat, '--fat')}
    ${n.macrosComplete ? '' : '<span class="muted">(נתונים חלקיים)</span>'}</div>`;
}

function leftLine(where, left) {
  if (left >= 0) return `<div class="spread"><span>יישאר ב${where}</span><span><span class="num">${kcal(left)}</span> קק״ל</span></div>`;
  return `<div class="spread hs-over"><span>חריגה ב${where}</span><span><span class="num">${kcal(-left)}</span> קק״ל</span></div>`;
}

/** Day context for remaining-kcal previews. `excludeId` = entry being edited. */
function budgetCtx(dateKey, excludeId = null) {
  const target = dayTarget();
  const day = getDay(dateKey).filter(e => e.id !== excludeId);
  return {
    target,
    budgets: mealBudgets(target, state.settings.mealPct),
    eatenDay: sumEntries(day).kcal,
    eatenMeal: MEALS.map((_, i) => sumEntries(day.filter(e => e.meal === i)).kcal),
  };
}

/**
 * Quantity bottom sheet used for both add and edit.
 * opts: { title, info(html), unitName, unitGrams, mode:'unit'|'g', qty, meal, nutritionFor(grams),
 *         bctx, saveText, onSave({grams, qty, mode, meal, n, label}), onDelete? }
 */
function qtyModal(o) {
  let mode = o.unitGrams ? o.mode : 'g';
  const body = h(`<form class="hs-qty" novalidate>
    ${o.info ? `<p class="muted hs-info">${o.info}</p>` : ''}
    <label class="field"><span>ארוחה</span>
      <select name="meal">${MEALS.map((m, i) => `<option value="${i}" ${i === o.meal ? 'selected' : ''}>${m}</option>`).join('')}</select>
    </label>
    ${o.unitGrams ? `<div class="hs-seg" role="group" aria-label="יחידת כמות">
      <button type="button" data-mode="unit">${esc(o.unitName)} (<span class="num">${g(o.unitGrams)}</span> ג׳)</button>
      <button type="button" data-mode="g">גרמים</button>
    </div>` : ''}
    <label class="field"><span data-qlabel></span>${numInput('qty', o.qty)}</label>
    <div class="hs-preview" aria-live="polite"></div>
    <div class="actions">
      <button type="submit" class="btn primary">${o.saveText}</button>
      ${o.onDelete ? '<button type="button" class="btn hs-btn-danger" data-del>מחיקה</button>' : ''}
      <button type="button" class="btn" data-cancel>ביטול</button>
    </div>
  </form>`);
  const { close } = openModal(o.title, body);
  const input = body.querySelector('input[name=qty]');
  const select = body.querySelector('select[name=meal]');
  const preview = body.querySelector('.hs-preview');
  const submit = body.querySelector('[type=submit]');
  const qlabel = body.querySelector('[data-qlabel]');

  const read = () => {
    const q = parseNum(input.value);
    if (!(q > 0)) return null;
    const grams = mode === 'unit' ? q * o.unitGrams : q;
    return { q, grams, n: o.nutritionFor(grams) };
  };

  function update() {
    qlabel.textContent = mode === 'unit' ? `כמות (${o.unitName})` : 'כמות בגרמים';
    body.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    const r = read();
    input.classList.toggle('invalid', input.value.trim() !== '' && !r);
    submit.disabled = !r;
    if (!r) { preview.innerHTML = '<div class="muted">יש להזין כמות גדולה מ-0</div>'; return; }
    const m = +select.value, c = o.bctx;
    let rows = '';
    if (c.target) {
      if (c.budgets[m] != null) rows += leftLine(MEALS[m], c.budgets[m] - c.eatenMeal[m] - r.n.kcal);
      rows += leftLine('יום', c.target - c.eatenDay - r.n.kcal);
    } else {
      rows += `<div class="spread"><span>סה״כ ביום אחרי זה</span><span><span class="num">${kcal(c.eatenDay + r.n.kcal)}</span> קק״ל</span></div>`;
    }
    preview.innerHTML = `
      <div class="hs-preview-kcal"><b class="num">${kcal(r.n.kcal)}</b> קק״ל
        ${mode === 'unit' ? `<span class="muted">(<span class="num">${g(r.grams)}</span> ג׳)</span>` : ''}</div>
      ${macroLine(r.n)}
      <div class="hs-left">${rows}</div>`;
  }

  body.addEventListener('click', e => {
    const mb = e.target.closest('[data-mode]');
    if (mb && mb.dataset.mode !== mode) {
      const q = parseNum(input.value);
      mode = mb.dataset.mode;
      if (q > 0) input.value = String(mode === 'unit' ? Math.round(q / o.unitGrams * 100) / 100 : Math.round(q * o.unitGrams));
      update();
      input.focus();
    }
    if (e.target.closest('[data-cancel]')) close();
    if (e.target.closest('[data-del]')) { close(); o.onDelete(); }
  });
  input.addEventListener('input', update);
  select.addEventListener('change', update);
  body.addEventListener('submit', e => {
    e.preventDefault();
    const r = read();
    if (!r) { input.focus(); return; }
    close();
    o.onSave({ grams: r.grams, qty: r.q, mode, meal: +select.value, n: r.n, label: qtyLabel(mode, r.q, o.unitName) });
  });
  update();
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

/** Edit quantity / meal of an existing entry. Scales the snapshot proportionally. */
export function openEntryEditor(dateKey, entry, onDone) {
  const base = entry.grams > 0 ? entry.grams : 1;
  const scale = grams => {
    const f = grams / base, s = v => v == null ? null : v * f;
    return { kcal: entry.kcal * f, protein: s(entry.protein), carbs: s(entry.carbs), fat: s(entry.fat),
      macrosComplete: !!entry.macrosComplete };
  };
  const hasUnit = entry.unit === 'unit' && entry.unitGrams > 0;
  qtyModal({
    title: entry.name,
    info: `נרשם: ${esc(entry.qtyLabel)} · <span class="num">${kcal(entry.kcal)}</span> קק״ל`,
    unitName: hasUnit ? entry.unitName : null,
    unitGrams: hasUnit ? entry.unitGrams : null,
    mode: hasUnit ? 'unit' : 'g',
    qty: hasUnit ? Math.round((entry.qty ?? entry.grams / entry.unitGrams) * 100) / 100 : Math.round(entry.grams * 10) / 10,
    meal: entry.meal,
    nutritionFor: scale,
    bctx: budgetCtx(dateKey, entry.id),
    saveText: 'שמירה',
    onSave: r => {
      updateEntry(dateKey, { ...entry, meal: r.meal, grams: r.grams, qty: r.qty, unit: r.mode, qtyLabel: r.label,
        kcal: r.n.kcal, protein: r.n.protein, carbs: r.n.carbs, fat: r.n.fat, macrosComplete: r.n.macrosComplete });
      toast('עודכן');
      onDone && onDone();
    },
    onDelete: () => deleteEntryConfirm(dateKey, entry, onDone),
  });
}

export async function deleteEntryConfirm(dateKey, entry, onDone) {
  const ok = await confirmDialog(`למחוק את "${entry.name}" (${entry.qtyLabel})?`, { okText: 'מחיקה', danger: true });
  if (!ok) return;
  deleteEntry(dateKey, entry.id);
  toast('נמחק');
  onDone && onDone();
}

/* ---------- Dictionary items ---------- */

function allItems() {
  return [
    ...state.foods.map(f => ({ type: 'food', id: f.id, name: f.name, obj: f })),
    ...state.recipes.map(r => ({ type: 'recipe', id: r.id, name: r.name, obj: r })),
  ];
}
function findItem(type, id) {
  const list = type === 'recipe' ? state.recipes : state.foods;
  const obj = list.find(x => x.id === id);
  return obj ? { type, id, name: obj.name, obj } : null;
}
function itemSub(it) {
  if (it.type === 'food') {
    const f = it.obj;
    const serv = f.servingName && f.servingGrams > 0 ? ` · ${esc(f.servingName)} = <span class="num">${g(f.servingGrams)}</span> ג׳` : '';
    return `<span class="num">${kcal(f.kcal100)}</span> קק״ל ל-100 ג׳${serv}`;
  }
  const t = recipeTotals(it.obj, getFood);
  if (!(t.grams > 0)) return 'מתכון ריק';
  const p = it.obj.portions > 0 ? it.obj.portions : 1;
  return `<span class="num">${kcal(t.kcal / p)}</span> קק״ל למנה · <span class="num">${g(p)}</span> מנות`;
}

/* ---------- View ---------- */

export function render(container, params, ctx) {
  const today = todayKey();
  const date = validDate(params.date) || today;
  const isToday = date === today;
  let meal = /^[0-5]$/.test(params.meal || '') ? +params.meal : (isToday ? mealForTime() : 0);
  let query = '';

  const root = h('<div class="hs-home"></div>');
  container.appendChild(root);

  function draw() {
    const target = dayTarget();
    const budgets = mealBudgets(target, state.settings.mealPct);
    const day = getDay(date);
    const eaten = sumEntries(day).kcal;
    const perMeal = MEALS.map((_, i) => sumEntries(day.filter(e => e.meal === i)).kcal);
    const hasDict = state.foods.length || state.recipes.length;

    let ringExtra;
    if (target) {
      const left = target - eaten;
      ringExtra = left >= 0
        ? `<p class="hs-ring-note">נשארו <b class="num">${kcal(left)}</b> קק״ל${isToday ? ' להיום' : ''}</p>`
        : `<p class="hs-ring-note hs-over">חריגה של <b class="num">${kcal(-left)}</b> קק״ל</p>`;
    } else {
      ringExtra = `<div class="hs-ring-note"><p class="muted">עדיין לא הוגדר יעד יומי.</p>
        <button type="button" class="btn small" data-act="settings">להגדרת יעד</button></div>`;
    }

    root.innerHTML = `
      ${isToday ? '' : `<div class="alert warn hs-pastday">
        <span>הוספה ליום קודם: <b>${esc(fmtDate(date))}</b></span>
        <button type="button" class="btn small" data-act="today">חזרה להיום</button></div>`}
      <section class="card hs-ringcard">
        ${ring(eaten, target, { label: kcal(eaten), sub: target ? `מתוך ${kcal(target)} קק״ל` : 'קק״ל' })}
        ${ringExtra}
      </section>
      <div class="hs-meals" role="tablist" aria-label="ארוחה">
        ${MEALS.map((m, i) => `<button type="button" role="tab" aria-selected="${i === meal}" class="hs-meal ${i === meal ? 'active' : ''}" data-meal="${i}">
          <span class="hs-meal-name">${m}</span>
          <span class="hs-meal-kcal num">${kcal(perMeal[i])}${budgets[i] != null ? ` / ${kcal(budgets[i])}` : ''}</span>
        </button>`).join('')}
      </div>
      <section class="card hs-mealcard">${mealCardHTML(day, budgets[meal])}</section>
      <section class="card hs-search">
        <h2>מה אכלת?</h2>
        ${hasDict ? `<input type="search" class="hs-q" placeholder="חיפוש במילון ובמתכונים" autocomplete="off" enterkeyhint="search" value="${esc(query)}">
          <div class="hs-results"></div>`
        : `<div class="empty"><p>המילון עדיין ריק. מוסיפים קודם מאכלים למילון, ואז אפשר לרשום אותם כאן.</p>
          <button type="button" class="btn primary" data-act="dictionary">למילון</button></div>`}
      </section>`;
    if (hasDict) renderResults();
  }

  function mealCardHTML(day, budget) {
    const entries = day.filter(e => e.meal === meal);
    const s = sumEntries(entries).kcal;
    const yEntries = getDay(addDays(date, -1)).filter(e => e.meal === meal);
    return `
      <div class="spread"><h2>${MEALS[meal]}</h2>
        <span class="muted"><span class="num">${kcal(s)}${budget != null ? ` / ${kcal(budget)}` : ''}</span> קק״ל</span></div>
      ${budget != null ? progressBar(s, budget) : ''}
      ${entries.length ? `<ul class="list hs-entries">${entries.map(entryRow).join('')}</ul>`
        : '<p class="muted hs-mealempty">עוד לא נרשם כלום בארוחה הזו.</p>'}
      ${yEntries.length ? `<button type="button" class="btn block hs-copy" data-act="copy"><span>
        העתק מאתמול (${yEntries.length} ${yEntries.length === 1 ? 'פריט' : 'פריטים'} · <span class="num">${kcal(sumEntries(yEntries).kcal)}</span> קק״ל)</span></button>` : ''}`;
  }

  function recentItems() {
    const entries = [];
    for (let i = 0; i < RECENT_DAYS; i++) entries.push(...getDay(addDays(today, -i)));
    entries.sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
    const seen = new Set(), out = [];
    for (const e of entries) {
      const k = e.sourceType + ':' + e.sourceId;
      if (seen.has(k)) continue;
      seen.add(k);
      const it = findItem(e.sourceType, e.sourceId);
      if (it) out.push(it);
      if (out.length >= RECENT_MAX) break;
    }
    return out;
  }

  function renderResults() {
    const el = root.querySelector('.hs-results');
    if (!el) return;
    const q = normalize(query);
    let list = allItems();
    if (q) {
      list = list.map(it => ({ it, n: normalize(it.name) })).filter(x => x.n.includes(q))
        .sort((a, b) => (b.n.startsWith(q) - a.n.startsWith(q)) || a.it.name.localeCompare(b.it.name, 'he'))
        .map(x => x.it);
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name, 'he'));
    }
    const recent = q ? [] : recentItems();
    const more = list.length > RESULTS_MAX;
    el.innerHTML = `
      ${recent.length ? `<div class="hs-recent"><div class="muted">אחרונים</div>
        <div class="chips">${recent.map(it => `<button type="button" class="chip" data-type="${it.type}" data-id="${esc(it.id)}">${esc(it.name)}</button>`).join('')}</div></div>` : ''}
      ${list.length ? `<ul class="list hs-items">${list.slice(0, RESULTS_MAX).map(it => `<li>
          <button type="button" class="hs-item" data-type="${it.type}" data-id="${esc(it.id)}">
            <span class="hs-item-name">${esc(it.name)}${badge(it.type)}</span>
            <span class="hs-item-sub muted">${itemSub(it)}</span>
          </button></li>`).join('')}</ul>
        ${more ? `<p class="muted">מוצגות ${RESULTS_MAX} תוצאות ראשונות. אפשר לצמצם בחיפוש.</p>` : ''}`
      : `<div class="empty"><p>לא נמצא "${esc(query)}" במילון.</p>
          <button type="button" class="btn" data-act="dictionary">הוספה למילון</button></div>`}`;
  }

  function openAdd(it) {
    const isRecipe = it.type === 'recipe';
    const src = it.obj;
    let unitGrams = null, unitName = null, nutritionFor, info;
    if (isRecipe) {
      const t = recipeTotals(src, getFood);
      if (!(t.grams > 0)) { toast('המתכון ריק. אפשר להוסיף לו מרכיבים במילון.'); return; }
      const p = src.portions > 0 ? src.portions : 1;
      unitGrams = t.grams / p; unitName = 'מנה';
      nutritionFor = grams => recipeNutrition(src, getFood, { grams });
      info = `מתכון · <span class="num">${kcal(t.kcal / p)}</span> קק״ל למנה · סה״כ <span class="num">${g(p)}</span> מנות (<span class="num">${g(t.grams)}</span> ג׳)`;
    } else {
      if (src.servingName && src.servingGrams > 0) { unitGrams = src.servingGrams; unitName = src.servingName; }
      nutritionFor = grams => foodNutrition(src, grams);
      info = `<span class="num">${kcal(src.kcal100)}</span> קק״ל ל-100 ג׳`;
    }
    qtyModal({
      title: src.name, info, unitName, unitGrams,
      mode: unitGrams ? 'unit' : 'g',
      qty: unitGrams ? 1 : 100,
      meal, nutritionFor,
      bctx: budgetCtx(date),
      saveText: 'הוספה',
      onSave: r => {
        addEntry(date, {
          meal: r.meal, sourceType: it.type, sourceId: src.id, name: src.name,
          grams: r.grams, qtyLabel: r.label, qty: r.qty, unit: r.mode,
          unitName: unitName || null, unitGrams: unitGrams || null,
          kcal: r.n.kcal, protein: r.n.protein ?? null, carbs: r.n.carbs ?? null, fat: r.n.fat ?? null,
          macrosComplete: !!r.n.macrosComplete,
        });
        meal = r.meal;
        toast(`נוסף ל${MEALS[r.meal]}: ${src.name} (${kcal(r.n.kcal)} קק״ל)`);
        draw();
      },
    });
  }

  async function copyYesterday() {
    const yEntries = getDay(addDays(date, -1)).filter(e => e.meal === meal);
    if (!yEntries.length) return;
    const existing = getDay(date).filter(e => e.meal === meal).length;
    if (existing && !await confirmDialog(`ב${MEALS[meal]} כבר יש ${existing} פריטים. להוסיף אליהם גם את הפריטים מאתמול?`, { okText: 'העתקה' })) return;
    for (const e of yEntries) {
      const { id, addedAt, ...rest } = e;
      addEntry(date, { ...rest });
    }
    toast(`הועתקו ${yEntries.length} פריטים מאתמול`);
    draw();
  }

  root.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t || !root.contains(t)) return;
    if (t.dataset.meal !== undefined) { meal = +t.dataset.meal; draw(); return; }
    if (t.dataset.type) { const it = findItem(t.dataset.type, t.dataset.id); if (it) openAdd(it); return; }
    const act = t.dataset.act;
    if (act === 'today') ctx.navigate('home');
    else if (act === 'settings') ctx.navigate('settings');
    else if (act === 'dictionary') ctx.navigate('dictionary');
    else if (act === 'copy') copyYesterday();
    else if (act === 'edit' || act === 'del') {
      const entry = getDay(date).find(x => x.id === t.dataset.id);
      if (!entry) return;
      if (act === 'edit') openEntryEditor(date, entry, draw);
      else deleteEntryConfirm(date, entry, draw);
    }
  });
  root.addEventListener('input', e => {
    if (e.target.classList.contains('hs-q')) { query = e.target.value; renderResults(); }
  });

  draw();
}
