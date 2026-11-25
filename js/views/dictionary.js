// Dictionary view: foods + recipes (the user's own food dictionary).
import { state, getFood, upsertFood, deleteFood, recipesUsingFood, upsertRecipe, deleteRecipe } from '../store.js';
import { recipeTotals, parseNum, parseOptional, normalize, round } from '../calc.js';
import { esc, h, toast, openModal, confirmDialog, numInput, kcal, g } from '../ui.js';

export const title = 'המילון שלי';

let tab = 'foods';   // remembered between visits
let query = '';

const byName = (a, b) => a.name.localeCompare(b.name, 'he');
const matches = (name, q) => !q || normalize(name).includes(q);
const fmtN = v => (v === null || v === undefined) ? '' : String(v);

export function render(container, params, ctx) {
  if (params.tab === 'recipes' || params.tab === 'foods') tab = params.tab;
  container.appendChild(h(`<div class="dict">
    <div class="chips dict-tabs" role="tablist">
      <button class="chip" data-tab="foods" role="tab">מאכלים</button>
      <button class="chip" data-tab="recipes" role="tab">מתכונים</button>
    </div>
    <div class="dict-toolbar">
      <input type="search" class="dict-search" placeholder="חיפוש…" autocomplete="off" aria-label="חיפוש">
      <button class="btn primary dict-add"></button>
    </div>
    <div class="card dict-list-card"><ul class="list dict-list"></ul></div>
  </div>`));
  const root = container.querySelector('.dict');
  const search = root.querySelector('.dict-search');
  const addBtn = root.querySelector('.dict-add');
  const listEl = root.querySelector('.dict-list');
  const listCard = root.querySelector('.dict-list-card');
  search.value = query;

  const rerender = () => {
    root.querySelectorAll('[data-tab]').forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', on);
    });
    addBtn.textContent = tab === 'foods' ? '+ מאכל חדש' : '+ מתכון חדש';
    renderList();
  };

  const renderList = () => {
    const q = normalize(query);
    const all = tab === 'foods' ? state.foods : state.recipes;
    const items = all.filter(x => matches(x.name, q)).sort(byName);
    listEl.innerHTML = '';
    if (!all.length) {
      listCard.classList.add('is-empty');
      listEl.innerHTML = tab === 'foods'
        ? `<li class="empty dict-empty"><b>המילון עדיין ריק</b>
            <p>הכנס מאכל פעם אחת, אחר כך מוסיפים אותו ביומן בשתי לחיצות.</p>
            <p class="muted">את הקלוריות ל-100 גרם רואים על תווית המוצר. אפשר גם להגדיר מנה, למשל "פרוסה = 30 ג׳".</p></li>`
        : `<li class="empty dict-empty"><b>אין עדיין מתכונים</b>
            <p>מתכון הוא מנה שבונים ממאכלים שכבר במילון, למשל שקשוקה או סלט. הקלוריות מחושבות לבד.</p>
            ${state.foods.length ? '' : '<p class="muted">קודם צריך להוסיף מאכלים בלשונית "מאכלים".</p>'}</li>`;
      return;
    }
    listCard.classList.remove('is-empty');
    if (!items.length) {
      listEl.innerHTML = `<li class="empty">לא נמצא "${esc(query)}"</li>`;
      return;
    }
    for (const it of items) {
      const li = tab === 'foods' ? foodRow(it) : recipeRow(it);
      listEl.appendChild(li);
    }
  };

  root.querySelector('.dict-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === tab) return;
    tab = b.dataset.tab; rerender();
  });
  search.addEventListener('input', () => { query = search.value; renderList(); });
  addBtn.addEventListener('click', () => {
    if (tab === 'foods') openFoodForm(null, { prefillName: query.trim(), onSaved: rerender });
    else if (!state.foods.length) toast('קודם צריך להוסיף מאכלים למילון');
    else openRecipeForm(null, { onSaved: rerender });
  });
  listEl.addEventListener('click', e => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    if (tab === 'foods') openFoodForm(getFood(row.dataset.id), { onSaved: rerender });
    else openRecipeForm(state.recipes.find(r => r.id === row.dataset.id), { onSaved: rerender });
  });

  rerender();
}

function foodRow(f) {
  const serving = f.servingName && f.servingGrams
    ? `<div class="muted">${esc(f.servingName)} = ${g(f.servingGrams)} ג׳ · ${kcal(f.kcal100 * f.servingGrams / 100)} קל׳</div>` : '';
  return h(`<li><button class="dict-row" data-id="${esc(f.id)}">
    <div class="dict-row-main"><div class="dict-name">${esc(f.name)}</div>${serving}</div>
    <div class="dict-kcal"><b class="num">${kcal(f.kcal100)}</b><span class="muted">קל׳ ל-100 ג׳</span></div>
  </button></li>`);
}

function recipeRow(r) {
  const t = recipeTotals(r, getFood);
  const portions = r.portions || 1;
  const n = r.items.filter(it => getFood(it.foodId)).length;
  const sub = n ? `${n === 1 ? "מרכיב אחד" : n + " מרכיבים"} · ${portions === 1 ? 'מנה אחת' : `${g(portions)} מנות`} · ${g(t.grams / portions)} ג׳ למנה`
    : '<span class="dict-warn-text">אין מרכיבים במתכון</span>';
  return h(`<li><button class="dict-row" data-id="${esc(r.id)}">
    <div class="dict-row-main"><div class="dict-name">${esc(r.name)}</div><div class="muted">${sub}</div></div>
    <div class="dict-kcal"><b class="num">${kcal(t.kcal / portions)}</b><span class="muted">קל׳ למנה</span></div>
  </button></li>`);
}

/* ================= Food form ================= */

function openFoodForm(food, { prefillName = '', onSaved } = {}) {
  const isNew = !food;
  const f = food || {};
  const body = h(`<form class="dict-form stack" novalidate>
    <label class="field"><span>שם המאכל *</span><input name="name" autocomplete="off" maxlength="80" value="${esc(f.name || prefillName)}"></label>
    <label class="field"><span>קלוריות ל-100 גרם *</span>${numInput('kcal100', fmtN(f.kcal100), { placeholder: 'למשל 250' })}</label>
    <div class="dict-sub">
      <div class="muted">רכיבים ל-100 גרם (רשות, בגרמים)</div>
      <div class="dict-macros">
        <label class="field"><span>חלבון</span>${numInput('protein100', fmtN(f.protein100))}</label>
        <label class="field"><span>פחמימות</span>${numInput('carbs100', fmtN(f.carbs100))}</label>
        <label class="field"><span>שומן</span>${numInput('fat100', fmtN(f.fat100))}</label>
      </div>
    </div>
    <div class="dict-sub">
      <div class="muted">מנה (רשות). למשל: פרוסה = 30 גרם</div>
      <div class="row">
        <label class="field"><span>שם המנה</span><input name="servingName" autocomplete="off" maxlength="30" placeholder="פרוסה" value="${esc(f.servingName || '')}"></label>
        <label class="field"><span>גרמים במנה</span>${numInput('servingGrams', fmtN(f.servingGrams), { placeholder: '30' })}</label>
      </div>
      <div class="muted dict-serving-preview"></div>
    </div>
    <div class="dict-msgs"></div>
    <div class="actions">
      <button type="submit" class="btn primary">שמירה</button>
      <button type="button" class="btn" data-cancel>ביטול</button>
    </div>
    ${isNew ? '' : '<button type="button" class="btn ghost dict-delete" data-delete>מחיקת המאכל</button>'}
  </form>`);
  const { close } = openModal(isNew ? 'מאכל חדש' : 'עריכת מאכל', body);
  const $ = n => body.querySelector(`[name="${n}"]`);
  const msgs = body.querySelector('.dict-msgs');
  const saveBtn = body.querySelector('[type="submit"]');
  const preview = body.querySelector('.dict-serving-preview');
  let dupAcknowledged = false;
  if (isNew) setTimeout(() => $('name').focus(), 50);

  // Reads + validates. Returns { values, errors[], warnings[] }; marks invalid inputs.
  const read = () => {
    const errors = [], warnings = [];
    body.querySelectorAll('input').forEach(i => i.classList.remove('invalid'));
    const bad = (n, msg) => { $(n).classList.add('invalid'); if (msg && !errors.includes(msg)) errors.push(msg); };
    const name = $('name').value.trim();
    if (!name) bad('name', 'חסר שם למאכל.');
    const kcal100 = parseNum($('kcal100').value);
    if (Number.isNaN(kcal100)) bad('kcal100', 'יש להזין קלוריות ל-100 גרם (מספר, אפשר עם נקודה או פסיק).');
    else if (kcal100 > 900) bad('kcal100', 'ב-100 גרם יכולות להיות לכל היותר כ-900 קלוריות (שומן טהור).');
    const macro = {};
    for (const n of ['protein100', 'carbs100', 'fat100']) {
      macro[n] = parseOptional($(n).value);
      if (Number.isNaN(macro[n])) bad(n, 'ערכי רכיבים צריכים להיות מספרים, או להשאיר ריק.');
      else if (macro[n] !== null && macro[n] > 100) bad(n, 'ב-100 גרם לא יכולים להיות יותר מ-100 גרם של רכיב.');
    }
    const sName = $('servingName').value.trim();
    const sGrams = parseOptional($('servingGrams').value);
    if (Number.isNaN(sGrams) || sGrams === 0) bad('servingGrams', 'גרמים במנה צריכים להיות מספר גדול מ-0.');
    else if (sName && sGrams === null) bad('servingGrams', 'כדי להגדיר מנה צריך גם שם וגם גרמים.');
    else if (!sName && sGrams !== null) bad('servingName', 'כדי להגדיר מנה צריך גם שם וגם גרמים.');

    const { protein100: p, carbs100: c, fat100: fa } = macro;
    if (!Number.isNaN(kcal100) && [p, c, fa].some(v => v !== null) && [p, c, fa].every(v => !Number.isNaN(v))) {
      const fromMacros = (p || 0) * 4 + (c || 0) * 4 + (fa || 0) * 9;
      if (fromMacros > kcal100 * 1.2 + 5) {
        warnings.push(`לפי הרכיבים יוצא כ-${Math.round(fromMacros)} קלוריות ל-100 גרם, יותר ממה שהוזן (${Math.round(kcal100)}). כדאי לבדוק שוב את התווית. אפשר לשמור בכל זאת.`);
      }
    }
    if (!Number.isNaN(kcal100) && sName && sGrams) {
      preview.textContent = `${sName} = ${g(sGrams)} ג׳ · ${kcal(kcal100 * sGrams / 100)} קלוריות`;
    } else preview.textContent = '';

    return { errors, warnings, values: { name, kcal100, ...macro,
      servingName: sName && sGrams ? sName : null, servingGrams: sName && sGrams ? sGrams : null } };
  };

  const showMsgs = (errors, warnings, extra = '') => {
    msgs.innerHTML = errors.map(m => `<div class="alert danger">${esc(m)}</div>`).join('')
      + warnings.map(m => `<div class="alert warn">${esc(m)}</div>`).join('') + extra;
  };

  // Live: soft warnings & serving preview only (don't nag with errors while typing).
  let submitted = false;
  body.addEventListener('input', e => {
    if (e.target.name === 'name') { dupAcknowledged = false; saveBtn.textContent = 'שמירה'; }
    const r = read();
    if (!submitted) body.querySelectorAll('input.invalid').forEach(i => i.classList.remove('invalid'));
    showMsgs(submitted ? r.errors : [], r.warnings);
  });
  read(); body.querySelectorAll('input.invalid').forEach(i => i.classList.remove('invalid'));

  body.addEventListener('submit', e => {
    e.preventDefault();
    submitted = true;
    const { errors, warnings, values } = read();
    if (errors.length) { showMsgs(errors, warnings); body.querySelector('input.invalid')?.focus(); return; }
    const key = normalize(values.name);
    const dup = state.foods.find(x => x.id !== f.id && normalize(x.name) === key);
    if (dup && !dupAcknowledged) {
      dupAcknowledged = true;
      saveBtn.textContent = 'לשמור בכל זאת';
      $('name').classList.add('invalid');
      showMsgs([], warnings, `<div class="alert warn">כבר יש במילון מאכל בשם "${esc(dup.name)}". אפשר לשנות את השם, או ללחוץ שוב כדי לשמור בכל זאת.</div>`);
      return;
    }
    const saved = upsertFood({ ...(food || {}), ...values, id: f.id });
    close();
    toast(isNew ? `"${saved.name}" נוסף למילון` : 'המאכל עודכן');
    onSaved && onSaved();
  });
  body.querySelector('[data-cancel]').onclick = close;

  body.querySelector('[data-delete]')?.addEventListener('click', async () => {
    const used = recipesUsingFood(f.id);
    let msg = `למחוק את "${f.name}" מהמילון?`;
    if (used.length) msg += ` המאכל יוסר מהמתכונים: ${used.map(r => r.name).join(', ')}.`;
    msg += ' ימים קודמים ביומן לא ישתנו.';
    close();
    if (await confirmDialog(msg, { okText: 'מחיקה', danger: true })) {
      deleteFood(f.id);
      toast('המאכל נמחק');
      onSaved && onSaved();
    }
  });
}

/* ================= Recipe form ================= */

function openRecipeForm(recipe, { onSaved } = {}) {
  const isNew = !recipe;
  // Draft items: { foodId, qty (string as typed), unit: 'g' | 's' }
  const draft = {
    items: (recipe?.items || []).filter(it => getFood(it.foodId))
      .map(it => {
        const f = getFood(it.foodId);
        const s = f.servingName && f.servingGrams ? it.grams / f.servingGrams : NaN;
        // Show whole/half servings in serving units, anything else in grams.
        return Number.isFinite(s) && Math.abs(s * 2 - Math.round(s * 2)) < 1e-6
          ? { foodId: it.foodId, qty: String(s), unit: 's' }
          : { foodId: it.foodId, qty: String(round(it.grams, 1)), unit: 'g' };
      }),
  };
  const body = h(`<form class="dict-form stack" novalidate>
    <label class="field"><span>שם המתכון *</span><input name="name" autocomplete="off" maxlength="80" value="${esc(recipe?.name || '')}" placeholder="למשל: שקשוקה"></label>
    <label class="field"><span>לכמה מנות המתכון? </span>${numInput('portions', recipe ? fmtN(recipe.portions || 1) : '1')}</label>
    <div class="dict-sub">
      <div class="spread"><b>מרכיבים</b><span class="muted">כמות לכל המתכון</span></div>
      <ul class="list dict-ings"></ul>
      <button type="button" class="btn block dict-add-ing">+ הוספת מרכיב</button>
      <div class="dict-picker" hidden>
        <input type="search" class="dict-picker-search" placeholder="חיפוש מאכל במילון…" autocomplete="off">
        <ul class="list dict-picker-list"></ul>
      </div>
    </div>
    <div class="card dict-totals"></div>
    <div class="dict-msgs"></div>
    <div class="actions">
      <button type="submit" class="btn primary">שמירה</button>
      <button type="button" class="btn" data-cancel>ביטול</button>
    </div>
    ${isNew ? '' : '<button type="button" class="btn ghost dict-delete" data-delete>מחיקת המתכון</button>'}
  </form>`);
  const { close } = openModal(isNew ? 'מתכון חדש' : 'עריכת מתכון', body);
  const nameIn = body.querySelector('[name="name"]');
  const portionsIn = body.querySelector('[name="portions"]');
  const ingsEl = body.querySelector('.dict-ings');
  const totalsEl = body.querySelector('.dict-totals');
  const msgs = body.querySelector('.dict-msgs');
  const picker = body.querySelector('.dict-picker');
  const pickerSearch = body.querySelector('.dict-picker-search');
  const pickerList = body.querySelector('.dict-picker-list');
  const addIngBtn = body.querySelector('.dict-add-ing');
  if (isNew) setTimeout(() => nameIn.focus(), 50);

  const itemGrams = it => {
    const q = parseNum(it.qty);
    if (Number.isNaN(q) || q <= 0) return NaN;
    const f = getFood(it.foodId);
    return it.unit === 's' && f?.servingGrams ? q * f.servingGrams : q;
  };

  const renderIngs = () => {
    msgs.innerHTML = "";
    ingsEl.innerHTML = '';
    if (!draft.items.length) {
      ingsEl.innerHTML = '<li class="muted dict-ings-empty">עדיין אין מרכיבים. לחץ "הוספת מרכיב" ובחר מאכלים מהמילון.</li>';
    }
    draft.items.forEach((it, i) => {
      const f = getFood(it.foodId);
      const gr = itemGrams(it);
      const unitSel = f.servingName && f.servingGrams
        ? `<select class="dict-unit" data-i="${i}" aria-label="יחידה">
             <option value="g" ${it.unit === 'g' ? 'selected' : ''}>גרם</option>
             <option value="s" ${it.unit === 's' ? 'selected' : ''}>${esc(f.servingName)}</option></select>`
        : '<span class="dict-unit-fixed">גרם</span>';
      ingsEl.appendChild(h(`<li class="dict-ing">
        <div class="dict-ing-head">
          <div class="dict-name">${esc(f.name)}</div>
          <button type="button" class="dict-remove" data-remove="${i}" aria-label="הסרת ${esc(f.name)}">✕</button>
        </div>
        <div class="dict-ing-qty">
          <input class="dict-qty ${Number.isNaN(gr) && it.qty !== '' ? 'invalid' : ''}" data-i="${i}" inputmode="decimal" autocomplete="off" value="${esc(it.qty)}" aria-label="כמות">
          ${unitSel}
          <span class="muted dict-ing-kcal" data-kcal="${i}"></span>
        </div>
      </li>`));
    });
    updateTotals();
  };

  const updateTotals = () => {
    draft.items.forEach((it, i) => {
      const gr = itemGrams(it);
      const span = ingsEl.querySelector(`[data-kcal="${i}"]`);
      const f = getFood(it.foodId);
      if (span) span.textContent = Number.isNaN(gr) ? '' : `${it.unit === 's' ? g(gr) + ' ג׳ · ' : ''}${kcal(f.kcal100 * gr / 100)} קל׳`;
    });
    const items = draft.items.map(it => ({ foodId: it.foodId, grams: itemGrams(it) })).filter(it => !Number.isNaN(it.grams));
    const t = recipeTotals({ items }, getFood);
    const p = parseNum(portionsIn.value);
    const portions = !Number.isNaN(p) && p > 0 ? p : null;
    totalsEl.innerHTML = `<div class="dict-totals-grid">
      <div><span class="muted">סה"כ במתכון</span><b class="num">${kcal(t.kcal)}</b><span class="muted">קל׳ · <span class="num">${g(t.grams)}</span> ג׳</span></div>
      <div><span class="muted">למנה</span><b class="num">${portions ? kcal(t.kcal / portions) : '—'}</b><span class="muted">קל׳ · <span class="num">${portions ? g(t.grams / portions) : '—'}</span> ג׳</span></div>
    </div>
    ${items.length && t.macrosComplete ? `<div class="muted dict-totals-macros">למנה: חלבון ${g(t.protein / (portions || 1))} ג׳ · פחמימות ${g(t.carbs / (portions || 1))} ג׳ · שומן ${g(t.fat / (portions || 1))} ג׳</div>`
      : items.length ? '<div class="muted dict-totals-macros">לחלק מהמרכיבים אין ערכי חלבון, פחמימות ושומן.</div>' : ''}`;
  };

  const renderPicker = () => {
    const q = normalize(pickerSearch.value);
    const foods = state.foods.filter(f => matches(f.name, q)).sort(byName);
    pickerList.innerHTML = foods.length ? '' : `<li class="muted">לא נמצא. אפשר להוסיף מאכלים בלשונית "מאכלים".</li>`;
    for (const f of foods.slice(0, 50)) {
      const already = draft.items.some(it => it.foodId === f.id);
      pickerList.appendChild(h(`<li><button type="button" class="dict-pick" data-pick="${esc(f.id)}">
        <span class="dict-name">${esc(f.name)}${already ? ' <span class="muted">(כבר במתכון)</span>' : ''}</span>
        <span class="muted num">${kcal(f.kcal100)} / 100 ג׳</span></button></li>`));
    }
  };

  addIngBtn.addEventListener('click', () => {
    picker.hidden = false; addIngBtn.hidden = true;
    pickerSearch.value = ''; renderPicker(); pickerSearch.focus();
  });
  pickerSearch.addEventListener('input', renderPicker);
  pickerList.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const f = getFood(b.dataset.pick);
    const hasServing = f.servingName && f.servingGrams;
    draft.items.push({ foodId: f.id, qty: hasServing ? '1' : '100', unit: hasServing ? 's' : 'g' });
    picker.hidden = true; addIngBtn.hidden = false;
    renderIngs();
    const inp = ingsEl.querySelector(`.dict-qty[data-i="${draft.items.length - 1}"]`);
    inp?.focus(); inp?.select();
  });

  ingsEl.addEventListener('input', e => {
    const i = e.target.dataset.i;
    if (i === undefined || !e.target.classList.contains('dict-qty')) return;
    draft.items[i].qty = e.target.value;
    e.target.classList.toggle('invalid', Number.isNaN(itemGrams(draft.items[i])) && e.target.value !== '');
    updateTotals();
  });
  ingsEl.addEventListener('change', e => {
    if (!e.target.classList.contains('dict-unit')) return;
    const it = draft.items[e.target.dataset.i];
    const f = getFood(it.foodId);
    const gr = itemGrams(it);
    const nu = e.target.value;
    // Convert the typed amount so the actual quantity stays the same.
    if (!Number.isNaN(gr) && nu !== it.unit) it.qty = String(round(nu === 's' ? gr / f.servingGrams : gr, 2));
    it.unit = nu;
    renderIngs();
  });
  ingsEl.addEventListener('click', e => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    draft.items.splice(+b.dataset.remove, 1);
    renderIngs();
  });
  portionsIn.addEventListener('input', () => { portionsIn.classList.remove('invalid'); updateTotals(); });

  body.addEventListener('submit', e => {
    e.preventDefault();
    const errors = [];
    body.querySelectorAll('input.invalid').forEach(i => i.classList.remove('invalid'));
    const name = nameIn.value.trim();
    if (!name) { nameIn.classList.add('invalid'); errors.push('חסר שם למתכון.'); }
    const portions = parseNum(portionsIn.value);
    if (Number.isNaN(portions) || portions <= 0) { portionsIn.classList.add('invalid'); errors.push('מספר מנות צריך להיות מספר גדול מ-0.'); }
    if (!draft.items.length) errors.push('צריך להוסיף לפחות מרכיב אחד.');
    const items = [];
    draft.items.forEach((it, i) => {
      const gr = itemGrams(it);
      if (Number.isNaN(gr)) {
        ingsEl.querySelector(`.dict-qty[data-i="${i}"]`)?.classList.add('invalid');
        if (!errors.includes('יש כמות לא תקינה באחד המרכיבים.')) errors.push('יש כמות לא תקינה באחד המרכיבים.');
      } else items.push({ foodId: it.foodId, grams: round(gr, 2) });
    });
    if (errors.length) {
      msgs.innerHTML = errors.map(m => `<div class="alert danger">${esc(m)}</div>`).join('');
      return;
    }
    upsertRecipe({ ...(recipe || {}), id: recipe?.id, name, portions, items });
    close();
    toast(isNew ? `המתכון "${name}" נשמר` : 'המתכון עודכן');
    onSaved && onSaved();
  });
  body.querySelector('[data-cancel]').onclick = close;
  body.querySelector('[data-delete]')?.addEventListener('click', async () => {
    close();
    if (await confirmDialog(`למחוק את המתכון "${recipe.name}"? ימים קודמים ביומן לא ישתנו.`, { okText: 'מחיקה', danger: true })) {
      deleteRecipe(recipe.id);
      toast('המתכון נמחק');
      onSaved && onSaved();
    }
  });

  renderIngs();
}
