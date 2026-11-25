// Settings: profile, goal, activity, diet type, manual target, meal split, day start, backup.
import { state, MEALS, defaultSettings, updateSettings, importJSON, currentWeight } from '../store.js';
import {
  ACTIVITY_LEVELS, DIETS, computeTarget, macroTargets, mealBudgets, parseNum, round,
  dayKey, addDays, daysBetween, fmtDate, fromKey, MIN_KCAL, MAX_WEEKLY_LOSS_PCT, MAX_WEEKLY_GAIN_KG,
} from '../calc.js';
import { esc, kcal, g, numInput, toast, confirmDialog } from '../ui.js';
import { renderBanners, downloadBackup } from '../banners.js';

export const title = 'הגדרות';

const DEFAULT_PCT = defaultSettings().mealPct; // [25,8,25,8,25,9]
const RANGES = {
  age: [14, 100], heightCm: [120, 230], startKg: [30, 300], goalKg: [30, 300],
  weeks: [1, 260], manualTarget: [800, 6000],
};
const K_GOAL_MODE = 'diet-settings-goal-mode';

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

const inRange = (n, [lo, hi]) => Number.isFinite(n) && n >= lo && n <= hi;
const today = () => dayKey(new Date(), state.settings.dayStartHour);
const fmtLong = key => fromKey(key).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
const hourLabel = h => `${String(h).padStart(2, '0')}:00`;

export function render(container, params, ctx) {
  const s = state.settings;
  const hasWeights = state.weights.length > 0;
  let goalMode = lsGet(K_GOAL_MODE) === 'weeks' ? 'weeks' : 'date';
  const weeksVal = s.goalDate ? Math.max(1, Math.round(daysBetween(today(), s.goalDate) / 7)) : '';

  container.innerHTML = `
  <div class="settings">
    <section class="card">
      <h2>פרטים אישיים</h2>
      <div class="stack">
        <div class="field">
          <span class="lbl">מין</span>
          <div class="seg" role="radiogroup">
            <label><input type="radio" name="sex" value="female" ${s.sex === 'female' ? 'checked' : ''}><span>אישה</span></label>
            <label><input type="radio" name="sex" value="male" ${s.sex === 'male' ? 'checked' : ''}><span>גבר</span></label>
          </div>
        </div>
        <div class="row">
          <label class="field"><span>גיל</span>${numInput('age', s.age)}</label>
          <label class="field"><span>גובה (ס"מ)</span>${numInput('heightCm', s.heightCm)}</label>
        </div>
        ${hasWeights ? `
          <div class="field">
            <span class="lbl">משקל נוכחי</span>
            <div class="readonly-val"><b class="num">${g(currentWeight())}</b> ק"ג
              <span class="muted">· לפי השקילה האחרונה</span></div>
            <a href="#weight" class="link">לעדכון משקל – לדף השקילות</a>
          </div>` : `
          <label class="field"><span>משקל נוכחי (ק"ג)</span>${numInput('startKg', s.startKg)}</label>`}
      </div>
    </section>

    <section class="card">
      <h2>מטרה</h2>
      <div class="stack">
        <label class="field"><span>משקל מטרה (ק"ג)</span>${numInput('goalKg', s.goalKg)}</label>
        <div class="field">
          <span class="lbl">מתי רוצים להגיע למטרה?</span>
          <div class="seg">
            <label><input type="radio" name="goalMode" value="date" ${goalMode === 'date' ? 'checked' : ''}><span>לפי תאריך</span></label>
            <label><input type="radio" name="goalMode" value="weeks" ${goalMode === 'weeks' ? 'checked' : ''}><span>לפי מספר שבועות</span></label>
          </div>
        </div>
        <label class="field" data-mode="date"><span>תאריך יעד</span>
          <input type="date" name="goalDate" value="${esc(s.goalDate || '')}" min="${addDays(today(), 1)}"></label>
        <label class="field" data-mode="weeks"><span>בעוד כמה שבועות</span>${numInput('weeks', weeksVal)}
          <small class="muted" data-weeks-date></small></label>
        <div data-result></div>
      </div>
    </section>

    <section class="card">
      <h2>רמת פעילות</h2>
      <div class="opt-list">
        ${ACTIVITY_LEVELS.map(a => `
          <label class="opt">
            <input type="radio" name="activity" value="${a.value}" ${s.activity === a.value ? 'checked' : ''}>
            <span class="opt-body"><b>${esc(a.label)}</b><span class="muted">${esc(a.desc)}</span></span>
          </label>`).join('')}
      </div>
    </section>

    <section class="card">
      <h2>סוג דיאטה</h2>
      <div class="opt-list">
        ${Object.entries(DIETS).map(([key, d]) => `
          <label class="opt diet">
            <input type="radio" name="dietType" value="${key}" ${s.dietType === key ? 'checked' : ''}>
            <span class="opt-body">
              <b>${esc(d.name)}</b>
              <span class="muted">${esc(d.summary)}</span>
              <ul class="diet-details">${d.details.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
            </span>
          </label>`).join('')}
      </div>
      <div data-macros></div>
    </section>

    <section class="card">
      <h2>יעד יומי ידני</h2>
      <p class="muted">לא חובה. אם דיאטנית נתנה לך מספר קלוריות, אפשר להזין אותו כאן במקום החישוב האוטומטי.</p>
      <label class="switch"><input type="checkbox" name="manualOn" ${s.manualTarget ? 'checked' : ''}><span>להשתמש ביעד ידני</span></label>
      <label class="field" data-manual ${s.manualTarget ? '' : 'hidden'}><span>קלוריות ביום</span>${numInput('manualTarget', s.manualTarget)}</label>
    </section>

    <section class="card">
      <h2>חלוקת ארוחות</h2>
      <p class="muted">איזה חלק מהיעד היומי מיועד לכל ארוחה (באחוזים). הסכום חייב להיות 100.</p>
      <div class="meals-grid">
        ${MEALS.map((m, i) => `
          <label class="meal-row">
            <span class="meal-name">${esc(m)}</span>
            <span class="pct-wrap">${numInput('pct' + i, s.mealPct[i], { attrs: 'class="pct"' })}<span>%</span></span>
            <span class="meal-kcal muted num" data-meal-kcal="${i}"></span>
          </label>`).join('')}
      </div>
      <div class="spread meal-foot">
        <span data-pct-sum></span>
        <button type="button" class="btn small" data-act="reset-pct">איפוס לברירת מחדל</button>
      </div>
      <div data-pct-error></div>
    </section>

    <section class="card">
      <h2>שעת החלפת יום</h2>
      <p class="muted">מה שאוכלים לפני השעה הזו נרשם ליום הקודם. כך נשנוש בחצות עדיין שייך לאותו ערב.</p>
      <select name="dayStartHour">
        ${[0, 1, 2, 3, 4, 5, 6].map(h => `<option value="${h}" ${s.dayStartHour === h ? 'selected' : ''}>${hourLabel(h)}</option>`).join('')}
      </select>
    </section>

    <section class="card">
      <h2>גיבוי ושחזור</h2>
      <p class="muted">כל הנתונים נשמרים רק במכשיר הזה. אם הטלפון יאבד או שהדפדפן יימחק, הנתונים יאבדו. מומלץ לשמור קובץ גיבוי פעם בשבוע (למשל ב-Google Drive, iCloud או במייל לעצמך).</p>
      <div class="stack">
        <div data-last-backup></div>
        <div data-persist class="muted"></div>
        <button type="button" class="btn primary block" data-act="export">שמירת קובץ גיבוי</button>
        <button type="button" class="btn block" data-act="import">שחזור מקובץ גיבוי</button>
        <input type="file" accept=".json,application/json" data-import hidden>
      </div>
    </section>

    <section class="card danger-zone">
      <h2>מחיקת כל הנתונים</h2>
      <p class="muted">מוחק את כל המאכלים, המתכונים, היומן, השקילות וההגדרות מהמכשיר. אי אפשר לבטל את זה. כדאי לשמור גיבוי קודם.</p>
      <button type="button" class="btn danger block" data-act="wipe">מחיקת כל הנתונים</button>
    </section>

    <section class="card disclaimer">
      <h2>חשוב לדעת</h2>
      <p class="muted">האפליקציה נותנת הערכות כלליות בלבד ואינה ייעוץ רפואי או תזונתי. לפני שינוי משמעותי בתזונה, ובמיוחד בהריון, בהנקה, בגיל צעיר או עם מחלה (למשל סוכרת או מחלת כליות), כדאי להתייעץ עם רופא או דיאטנית.</p>
    </section>
  </div>`;

  const $ = sel => container.querySelector(sel);
  const field = name => container.querySelector(`[name="${name}"]`);

  /* ---------- live panels ---------- */
  function updateGoalMode() {
    container.querySelectorAll('[data-mode]').forEach(el => { el.hidden = el.dataset.mode !== goalMode; });
    const wd = $('[data-weeks-date]');
    wd.textContent = state.settings.goalDate ? `תאריך היעד: ${fmtLong(state.settings.goalDate)}` : '';
  }

  function updateResult() {
    const st = state.settings;
    const kg = currentWeight();
    const t = computeTarget(st, kg, today());
    const el = $('[data-result]');
    if (!t.ready) {
      el.innerHTML = `<div class="result-panel">
        ${st.manualTarget ? `<div class="stat"><span>יעד יומי (ידני)</span><b class="num">${kcal(st.manualTarget)}</b></div>` : ''}
        ${t.warnings.map(w => `<div class="alert warn">${esc(w)}</div>`).join('')}
        ${!st.manualTarget && !t.warnings.length ? '<div class="alert info">מלאו מין, גיל, גובה ומשקל כדי לקבל יעד יומי.</div>' : ''}
      </div>`;
    } else {
      const wk = Math.abs(t.weeklyKg);
      const rate = t.mode === 'maintain' ? 'שמירה על המשקל'
        : `${t.mode === 'loss' ? 'ירידה' : 'עלייה'} של <span class="num">${g(round(wk, 2))}</span> ק"ג בשבוע`;
      const tooFast = (t.mode === 'loss' && wk > kg * MAX_WEEKLY_LOSS_PCT) ||
        (t.mode === 'gain' && t.weeklyKg > MAX_WEEKLY_GAIN_KG) ||
        (t.mode !== 'maintain' && t.daysLeft !== null && t.daysLeft <= 0);
      el.innerHTML = `<div class="result-panel">
        <div class="stats">
          <div class="stat"><span>שריפה יומית משוערת</span><b class="num">${kcal(t.tdee)}</b><small>קלוריות</small></div>
          <div class="stat main"><span>יעד יומי${st.manualTarget ? ' (ידני)' : ''}</span><b class="num">${kcal(t.target)}</b><small>קלוריות</small></div>
          <div class="stat"><span>קצב</span><b class="rate">${rate}</b></div>
          <div class="stat"><span>ימים שנותרו</span><b class="num">${t.daysLeft !== null && t.daysLeft > 0 ? t.daysLeft : '—'}</b></div>
        </div>
        ${st.manualTarget && t.auto ? `<p class="muted small">היעד האוטומטי היה ${kcal(t.auto)} קלוריות.</p>` : ''}
        ${t.warnings.map(w => `<div class="alert warn">${esc(w)}</div>`).join('')}
        ${tooFast && t.suggestedDate ? `<button type="button" class="btn block" data-act="suggest" data-date="${t.suggestedDate}">קבע תאריך מציאותי: ${esc(fmtLong(t.suggestedDate))}</button>` : ''}
      </div>`;
    }
    return t;
  }

  function updateMacros(t) {
    const el = $('[data-macros]');
    const m = macroTargets(t.target, state.settings.dietType, currentWeight());
    if (!m) { el.innerHTML = '<p class="muted small">היעדים בגרמים יוצגו אחרי שיחושב יעד יומי.</p>'; return; }
    el.innerHTML = `<div class="macro-targets">
      <div><span class="dot" style="background:var(--protein)"></span>חלבון<b class="num">${Math.round(m.protein)}</b>ג׳</div>
      <div><span class="dot" style="background:var(--carbs)"></span>פחמימות<b class="num">${m.carbsIsMax ? 'עד ' : ''}${Math.round(m.carbs)}</b>ג׳</div>
      <div><span class="dot" style="background:var(--fat)"></span>שומן<b class="num">${Math.round(m.fat)}</b>ג׳</div>
    </div>`;
  }

  function readPcts() {
    return MEALS.map((_, i) => parseNum(field('pct' + i).value));
  }

  function updateMeals(t) {
    const pcts = readPcts();
    const valid = pcts.every(p => Number.isFinite(p) && p <= 100);
    const sum = pcts.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    const budgets = mealBudgets(t.target, pcts.map(p => (Number.isFinite(p) ? p : 0)));
    budgets.forEach((b, i) => { $(`[data-meal-kcal="${i}"]`).textContent = b === null ? '' : `${kcal(b)} קל׳`; });
    const ok = valid && Math.abs(sum - 100) < 0.001;
    $('[data-pct-sum]').innerHTML = `סה"כ: <b class="num ${ok ? 'ok' : 'bad'}">${round(sum, 1)}%</b>`;
    $('[data-pct-error]').innerHTML = ok ? '' :
      `<div class="alert danger">${valid ? `הסכום חייב להיות בדיוק 100% (כרגע ${round(sum, 1)}%). השינוי לא נשמר עד שהסכום יהיה 100.` : 'יש למלא מספר בכל ארוחה (אפשר 0).'}</div>`;
    return ok ? pcts : null;
  }

  function updateAll() {
    updateGoalMode();
    const t = updateResult();
    updateMacros(t);
    updateMeals(t);
  }

  function updateBackupInfo() {
    const lb = state.settings.lastBackup;
    $('[data-last-backup]').innerHTML = lb
      ? `<span class="muted">גיבוי אחרון: </span><b>${esc(new Date(lb).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }))}</b>`
      : '<div class="alert warn">עדיין לא נשמר אף גיבוי.</div>';
  }

  async function updatePersist() {
    const el = $('[data-persist]');
    try {
      if (navigator.storage && navigator.storage.persisted) {
        const p = await navigator.storage.persisted();
        el.textContent = p
          ? '✓ הדפדפן אישר אחסון קבוע – הנתונים לא יימחקו אוטומטית.'
          : 'הדפדפן עדיין לא אישר אחסון קבוע. התקנה למסך הבית ושמירת גיבויים עוזרות להגן על הנתונים.';
        return;
      }
    } catch {}
    el.textContent = '';
  }

  const refreshBanners = () => renderBanners(document.getElementById('banner-area'), ctx);

  /* ---------- input handling ---------- */
  function setInvalid(input, bad) { input.classList.toggle('invalid', !!bad); }

  /** Validates one numeric field. Empty -> null (allowed). Returns {ok, value}. */
  function readNum(name, { integer = false } = {}) {
    const input = field(name);
    const raw = input.value.trim();
    if (raw === '') { setInvalid(input, false); return { ok: true, value: null }; }
    let n = parseNum(raw);
    if (integer && Number.isFinite(n)) n = Math.round(n);
    const ok = inRange(n, RANGES[name]);
    setInvalid(input, !ok);
    return { ok, value: ok ? n : null };
  }

  function onInput(e) {
    const t = e.target;
    const name = t.name;
    if (!name) return;
    let patch = null;

    if (name === 'age' || name === 'heightCm' || name === 'startKg' || name === 'goalKg') {
      const r = readNum(name, { integer: name === 'age' });
      if (r.ok) patch = { [name]: r.value };
    } else if (name === 'weeks') {
      const r = readNum('weeks', { integer: true });
      if (r.ok) patch = { goalDate: r.value ? addDays(today(), r.value * 7) : null };
    } else if (name === 'goalDate') {
      patch = { goalDate: t.value || null };
    } else if (name === 'manualTarget') {
      const r = readNum('manualTarget', { integer: true });
      if (r.ok && r.value) patch = { manualTarget: r.value };
    } else if (name.startsWith('pct')) {
      MEALS.forEach((_, i) => {
        const inp = field('pct' + i); const p = parseNum(inp.value);
        setInvalid(inp, !(Number.isFinite(p) && p <= 100));
      });
      const pcts = updateMeals(updateResult());
      if (pcts && pcts.some((p, i) => p !== state.settings.mealPct[i])) updateSettings({ mealPct: pcts });
      return;
    }
    if (patch) { updateSettings(patch); updateAll(); syncDateInputs(name); }
  }

  /** Keeps the date and weeks inputs in sync with the stored goalDate. */
  function syncDateInputs(changed) {
    const gd = state.settings.goalDate;
    if (changed !== 'goalDate') field('goalDate').value = gd || '';
    if (changed !== 'weeks') {
      field('weeks').value = gd ? Math.max(1, Math.round(daysBetween(today(), gd) / 7)) : '';
      setInvalid(field('weeks'), false);
    }
  }

  function onChange(e) {
    const t = e.target;
    const name = t.name;
    if (name === 'sex') updateSettings({ sex: t.value });
    else if (name === 'activity') updateSettings({ activity: Number(t.value) });
    else if (name === 'dietType') updateSettings({ dietType: t.value });
    else if (name === 'dayStartHour') updateSettings({ dayStartHour: Number(t.value) });
    else if (name === 'goalMode') { goalMode = t.value; lsSet(K_GOAL_MODE, goalMode); syncDateInputs(); }
    else if (name === 'manualOn') {
      const box = $('[data-manual]');
      box.hidden = !t.checked;
      if (t.checked) {
        const inp = field('manualTarget');
        if (!inp.value.trim()) {
          const auto = computeTarget({ ...state.settings, manualTarget: null }, currentWeight(), today()).auto;
          inp.value = auto || MIN_KCAL[state.settings.sex] || 1800;
        }
        const r = readNum('manualTarget', { integer: true });
        if (r.ok && r.value) updateSettings({ manualTarget: r.value });
        inp.focus();
      } else {
        updateSettings({ manualTarget: null });
        setInvalid(field('manualTarget'), false);
      }
    } else if (name === 'goalDate') {
      onInput(e);
    }
    updateAll();
    refreshBanners();
  }

  async function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'suggest') {
      updateSettings({ goalDate: b.dataset.date });
      syncDateInputs();
      updateAll();
      toast('תאריך היעד עודכן');
    } else if (act === 'reset-pct') {
      MEALS.forEach((_, i) => { const inp = field('pct' + i); inp.value = DEFAULT_PCT[i]; setInvalid(inp, false); });
      updateSettings({ mealPct: [...DEFAULT_PCT] });
      updateAll();
    } else if (act === 'export') {
      if (await downloadBackup()) { updateBackupInfo(); refreshBanners(); }
    } else if (act === 'import') {
      $('[data-import]').click();
    } else if (act === 'wipe') {
      const ok1 = await confirmDialog('למחוק את כל הנתונים מהמכשיר? אי אפשר לבטל את זה.', { okText: 'כן, למחוק', danger: true });
      if (!ok1) return;
      const ok2 = await confirmDialog('בטוח? כל המאכלים, היומן והשקילות יימחקו לצמיתות.', { okText: 'מחיקה סופית', danger: true });
      if (!ok2) return;
      try { localStorage.removeItem('diet-app-v1'); } catch {}
      location.reload();
    }
  }

  async function onFile(e) {
    const inp = e.target;
    const file = inp.files && inp.files[0];
    inp.value = '';
    if (!file) return;
    let text;
    try { text = await file.text(); } catch { toast('לא הצלחתי לקרוא את הקובץ'); return; }
    try {
      const p = JSON.parse(text);
      if (!p || p.app !== 'diet-app') throw 0;
    } catch { toast('הקובץ שנבחר אינו קובץ גיבוי של האפליקציה', 3500); return; }
    const ok = await confirmDialog('זה יחליף את כל הנתונים הקיימים בנתונים מהקובץ. להמשיך?', { okText: 'שחזור', danger: true });
    if (!ok) return;
    try {
      importJSON(text);
      toast('הנתונים שוחזרו בהצלחה');
      ctx.refresh();
    } catch (err) {
      toast(err.message || 'השחזור נכשל', 3500);
    }
  }

  container.addEventListener('input', onInput);
  container.addEventListener('change', onChange);
  container.addEventListener('click', onClick);
  $('[data-import]').addEventListener('change', e => { e.stopPropagation(); onFile(e); });

  updateAll();
  updateBackupInfo();
  updatePersist();
}
