// Global banners shown above every view (at most two):
// update available, incomplete profile, backup reminder, install tip.

import { state, exportJSON, markBackedUp, currentWeight } from './store.js';
import { computeTarget, dayKey, toKey } from './calc.js';
import { esc, toast } from './ui.js';
import { updateAvailable, applyUpdate } from './pwa.js';

const MAX_BANNERS = 1; // one at a time – banners otherwise eat a quarter of a phone screen
const BACKUP_DAYS = 7;
const K_BACKUP_DISMISS = 'diet-banner-backup-dismissed'; // value: date key of the day it was dismissed
const K_INSTALL_DISMISS = 'diet-banner-install-dismissed';

let lastEl = null, lastCtx = null;

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

export function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch { return false; }
}

export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function hasData() {
  return state.foods.length > 0 || state.recipes.length > 0 ||
    Object.keys(state.log).length > 0 || state.weights.length > 0;
}

export function backupDue() {
  const last = state.settings.lastBackup;
  if (!last) return hasData();
  const age = Date.now() - new Date(last).getTime();
  return !(age >= 0 && age < BACKUP_DAYS * 86400000);
}

/**
 * Saves a backup file. On iPhone tries the share sheet first (downloads are unreliable
 * in an installed web app). Marks the backup date on success. Returns true/false.
 */
export async function downloadBackup() {
  const name = `diet-backup-${toKey(new Date())}.json`;
  const text = exportJSON();
  const blob = new Blob([text], { type: 'application/json' });

  if (isIOS() && navigator.share && typeof File === 'function') {
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'גיבוי יומן דיאטה' });
        markBackedUp();
        toast('הגיבוי נשמר');
        return true;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return false; // user closed the share sheet
      // otherwise fall through to a regular download
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    markBackedUp();
    toast('קובץ הגיבוי ירד למכשיר');
    return true;
  } catch (e) {
    console.error(e);
    toast('שמירת הגיבוי נכשלה');
    return false;
  }
}

function banner(kind, html, actions = '') {
  return `<div class="banner alert ${kind}"><div class="banner-text">${html}</div>${actions ? `<div class="banner-actions">${actions}</div>` : ''}</div>`;
}

export function renderBanners(el, ctx) {
  if (!el) return;
  lastEl = el; lastCtx = ctx;
  const out = [];
  const onSettings = location.hash.replace(/^#/, '').split('?')[0] === 'settings';
  const s = state.settings;

  if (updateAvailable()) {
    out.push(banner('info', 'יש גרסה חדשה של האפליקציה.',
      `<button class="btn small primary" data-b="update">רענן</button>`));
  }

  if (!onSettings && !s.manualTarget) {
    const t = computeTarget(s, currentWeight(), dayKey(new Date(), s.dayStartHour));
    if (!t.ready) {
      out.push(banner('info', 'כדי לחשב יעד קלורי יומי צריך למלא כמה פרטים.',
        `<a class="btn small primary" href="#settings">להגדרות</a>`));
    }
  }

  if (backupDue() && lsGet(K_BACKUP_DISMISS) !== toKey(new Date())) {
    const msg = s.lastBackup ? 'עבר יותר משבוע מהגיבוי האחרון.' : 'עדיין לא נשמר גיבוי של הנתונים.';
    out.push(banner('warn', `${esc(msg)} הנתונים נשמרים רק במכשיר הזה.`,
      `<button class="btn small primary" data-b="backup">גבה עכשיו</button>
       <button class="btn small ghost" data-b="backup-dismiss">לא היום</button>`));
  }

  if (!isStandalone() && lsGet(K_INSTALL_DISMISS) !== '1') {
    const how = isIOS()
      ? 'בספארי: כפתור השיתוף ⬆️ ואז "הוסף למסך הבית".'
      : 'בכרום: תפריט ⋮ ואז "התקנת אפליקציה".';
    out.push(banner('info', `<b>טיפ:</b> התקינו את האפליקציה במסך הבית, כך הנתונים שמורים טוב יותר. ${esc(how)}`,
      `<button class="btn small ghost" data-b="install-dismiss">הבנתי</button>`));
  }

  el.innerHTML = out.slice(0, MAX_BANNERS).join('');
}

function rerender() { if (lastEl) renderBanners(lastEl, lastCtx); }

document.addEventListener('click', async e => {
  const b = e.target.closest('#banner-area [data-b]');
  if (!b) return;
  const act = b.dataset.b;
  if (act === 'update') applyUpdate();
  else if (act === 'backup') { if (await downloadBackup()) rerender(); }
  else if (act === 'backup-dismiss') { lsSet(K_BACKUP_DISMISS, toKey(new Date())); rerender(); }
  else if (act === 'install-dismiss') { lsSet(K_INSTALL_DISMISS, '1'); rerender(); }
});

window.addEventListener('app-update-available', rerender);
