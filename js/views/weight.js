// Weight log view: add weigh-ins, chart vs goal, stats, history.
import { state, setWeight, deleteWeight, currentWeight, updateSettings } from '../store.js';
import { parseNum, computeTarget, fmtDate, dayKey, round } from '../calc.js';
import { esc, h, toast, confirmDialog, numInput, kcal, g } from '../ui.js';
import { lineChart } from '../chart.js';

export const title = 'שקילות';

const MIN_KG = 30, MAX_KG = 300;

const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + g(Math.abs(n));

export function render(container, params, ctx) {
  const today = dayKey(new Date(), state.settings.dayStartHour);
  const last = state.weights[state.weights.length - 1];

  container.appendChild(h(`<div class="wt">
    <form class="card wt-form" novalidate>
      <h2>שקילה חדשה</h2>
      <div class="wt-fields">
        <label class="field"><span>משקל (ק"ג)</span>${numInput('kg', '', { placeholder: last ? g(last.kg) : 'למשל 82,5' })}</label>
        <label class="field"><span>תאריך</span><input type="date" name="date" value="${today}" max="${today}"></label>
      </div>
      <div class="wt-msg"></div>
      <button type="submit" class="btn primary block">שמירת שקילה</button>
    </form>
    <div class="wt-body"></div>
  </div>`));

  const form = container.querySelector('.wt-form');
  const kgIn = form.querySelector('[name="kg"]');
  const dateIn = form.querySelector('[name="date"]');
  const msg = form.querySelector('.wt-msg');
  const bodyEl = container.querySelector('.wt-body');

  kgIn.addEventListener('input', () => { kgIn.classList.remove('invalid'); msg.innerHTML = ''; });
  dateIn.addEventListener('input', () => { dateIn.classList.remove('invalid'); msg.innerHTML = ''; });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const kg = parseNum(kgIn.value);
    const date = dateIn.value;
    const errs = [];
    if (Number.isNaN(kg) || kg < MIN_KG || kg > MAX_KG) {
      kgIn.classList.add('invalid'); errs.push(`יש להזין משקל בין ${MIN_KG} ל-${MAX_KG} ק"ג (אפשר עם נקודה או פסיק).`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) {
      dateIn.classList.add('invalid'); errs.push('יש לבחור תאריך שאינו בעתיד.');
    }
    if (errs.length) { msg.innerHTML = errs.map(m => `<div class="alert danger">${esc(m)}</div>`).join(''); return; }

    const value = round(kg, 2);
    const existing = state.weights.find(w => w.date === date);
    setWeight(date, value);
    if (state.settings.startKg === null || state.settings.startKg === undefined) updateSettings({ startKg: value });
    toast(existing
      ? `השקילה של ${fmtDate(date)} הוחלפה (${g(existing.kg)} ← ${g(value)} ק"ג)`
      : `נשמר: ${g(value)} ק"ג`, 3000);
    kgIn.value = '';
    kgIn.placeholder = g(value);
    renderBody();
  });

  const renderBody = () => {
    const ws = state.weights;
    const s = state.settings;
    bodyEl.innerHTML = '';
    if (!ws.length) {
      bodyEl.appendChild(h(`<div class="card empty wt-empty">
        <b>עדיין אין שקילות</b>
        <p>מומלץ להישקל באותה שעה, למשל בבוקר לפני האוכל. אחרי כל שקילה היעד היומי מתעדכן לפי המשקל החדש.</p>
      </div>`));
      return;
    }
    const cur = currentWeight();
    const start = s.startKg ?? ws[0].kg;
    const goal = s.goalKg;
    const change = cur - start;
    const t = computeTarget(s, cur, today);

    // Chart
    const chart = lineChart(ws.map(w => ({ x: w.date, y: w.kg })), { goal: goal ?? null });
    bodyEl.appendChild(h(`<div class="card wt-chart">
      <h2>התקדמות</h2>
      ${chart}
      <div class="wt-legend muted">
        <span><i class="wt-dot"></i> משקל</span>
        ${goal ? `<span><i class="wt-dash"></i> מטרה <span class="num">${g(goal)}</span> ק"ג</span>` : '<span>לא הוגדר משקל מטרה בהגדרות</span>'}
      </div>
    </div>`));

    // Stats
    let remaining = '—';
    if (goal) {
      const diff = cur - goal;
      remaining = Math.abs(diff) < 0.05 ? 'הגעת! 🎉' : `<span class="num">${g(Math.abs(diff))}</span> ק"ג ${diff > 0 ? 'לרדת' : 'לעלות'}`;
    }
    const changeCls = change < 0 ? 'down' : change > 0 ? 'up' : '';
    const targetHtml = t.target
      ? `<b class="num">${kcal(t.target)}</b> <span class="muted">קלוריות ביום${s.manualTarget ? ' (יעד ידני)' : ''}</span>`
      : `<span class="muted">${esc(t.warnings[0] || 'לא ניתן לחשב יעד.')}</span>`;
    bodyEl.appendChild(h(`<div class="card wt-stats">
      <h2>סיכום</h2>
      <div class="wt-grid">
        <div><span class="muted">משקל התחלתי</span><b><span class="num">${g(start)}</span> ק"ג</b></div>
        <div><span class="muted">משקל נוכחי</span><b><span class="num">${g(cur)}</span> ק"ג</b></div>
        <div><span class="muted">שינוי עד עכשיו</span><b class="wt-change ${changeCls}"><span class="num">${signed(round(change, 1))}</span> ק"ג</b></div>
        <div><span class="muted">נשאר למטרה</span><b>${remaining}</b></div>
      </div>
      <div class="wt-target">
        <div class="muted">יעד יומי נוכחי</div>
        <div>${targetHtml}</div>
        <div class="muted wt-note">היעד היומי מתעדכן לפי השקילה האחרונה.${s.manualTarget ? ' כרגע מוגדר יעד ידני בהגדרות, ולכן הוא לא משתנה.' : ''}</div>
      </div>
      ${goal ? '' : `<button class="btn small wt-settings">הגדרת משקל מטרה</button>`}
    </div>`));
    bodyEl.querySelector('.wt-settings')?.addEventListener('click', () => ctx.navigate('settings'));

    // History (newest first)
    const hist = h(`<div class="card wt-history"><h2>היסטוריה</h2><ul class="list"></ul></div>`);
    const ul = hist.querySelector('ul');
    const rev = [...ws].reverse();
    rev.forEach((w, i) => {
      const prev = rev[i + 1];
      const d = prev ? round(w.kg - prev.kg, 1) : null;
      ul.appendChild(h(`<li class="wt-row">
        <div class="wt-row-date">${esc(fmtDate(w.date))}</div>
        <div class="wt-row-kg"><b class="num">${g(w.kg)}</b> ק"ג
          ${d !== null && d !== 0 ? `<span class="wt-delta ${d < 0 ? 'down' : 'up'} num">${signed(d)}</span>` : ''}</div>
        <button class="wt-del" data-del="${esc(w.date)}" aria-label="מחיקת השקילה של ${esc(fmtDate(w.date))}">🗑</button>
      </li>`));
    });
    ul.addEventListener('click', async e => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      const w = state.weights.find(x => x.date === b.dataset.del);
      if (!w) return;
      if (await confirmDialog(`למחוק את השקילה של ${fmtDate(w.date)} (${g(w.kg)} ק"ג)?`, { okText: 'מחיקה', danger: true })) {
        deleteWeight(w.date);
        toast('השקילה נמחקה');
        renderBody();
      }
    });
    bodyEl.appendChild(hist);
  };

  renderBody();
}
