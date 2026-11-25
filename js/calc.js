// Pure functions: nutrition math, targets, dates, parsing. No DOM, no storage.

export const KCAL_PER_KG = 7700;

export const ACTIVITY_LEVELS = [
  { value: 1.2,   label: 'יושבני',       desc: 'עבודה מול מחשב, כמעט בלי פעילות' },
  { value: 1.375, label: 'פעילות קלה',   desc: 'הליכות או אימון קל 1–3 פעמים בשבוע' },
  { value: 1.55,  label: 'פעילות בינונית', desc: 'אימונים 3–5 פעמים בשבוע' },
  { value: 1.725, label: 'פעילות גבוהה', desc: 'אימונים קשים 6–7 פעמים בשבוע' },
  { value: 1.9,   label: 'פעילות גבוהה מאוד', desc: 'עבודה פיזית + אימונים יומיים' },
];

export const DIETS = {
  balanced: {
    name: 'גירעון קלורי מאוזן',
    summary: 'אוכלים מכל קבוצות המזון, פשוט פחות ממה שהגוף שורף.',
    details: [
      'חלוקה: 30% חלבון, 40% פחמימות, 30% שומן מהקלוריות היומיות.',
      'הכי קל להתמיד בה לאורך זמן, ואין מאכלים אסורים.',
      'העיקר הוא לעמוד ביעד הקלורי היומי. החלבון עוזר לשמור על שריר ועל תחושת שובע.',
    ],
  },
  lowcarb: {
    name: 'דלת פחמימות',
    summary: 'מגבילים פחמימות לעד 100 גרם ביום. רוב האנרגיה מגיעה מחלבון ומשומן.',
    details: [
      'פחמימות: עד 100 גרם ביום (לחם, אורז, פסטה, סוכר ופירות מתוקים בכמות מוגבלת).',
      'חלבון: כ-1.6 גרם לכל ק"ג משקל גוף. שאר הקלוריות מגיעות משומן.',
      'עדיין צריך לעמוד ביעד הקלורי. דלת פחמימות לא אומרת "בלי הגבלה".',
    ],
  },
  keto: {
    name: 'קטוגנית (קטו)',
    summary: 'מגבילים פחמימות מאוד, לעד 25 גרם ביום, כך שהגוף עובר לשרוף שומן כדלק עיקרי.',
    details: [
      'פחמימות: עד 25 גרם ביום. כמעט בלי לחם, אורז, פירות, קטניות וסוכר.',
      'חלבון: כ-1.6 גרם לכל ק"ג. שומן: כל השאר, בדרך כלל 65–75% מהקלוריות.',
      'הימים הראשונים עלולים לכלול עייפות וכאבי ראש ("שפעת קטו"). מומלץ לשתות הרבה ולהוסיף מלח.',
      'האפליקציה סופרת פחמימות כוללות, כולל סיבים.',
      'לא מתאימה לכולם (למשל סוכרת או מחלות כליה). כדאי להתייעץ עם רופא.',
    ],
  },
};

export const MIN_KCAL = { female: 1200, male: 1500 };
export const MAX_WEEKLY_LOSS_PCT = 0.01;  // 1% bodyweight/week
export const SAFE_WEEKLY_LOSS_PCT = 0.0075;
export const MAX_WEEKLY_GAIN_KG = 0.5;

/* ---------- Parsing ---------- */
/** Accepts "1,5" or "1.5". Returns NaN for empty/invalid/negative. */
export function parseNum(v) {
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return NaN;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}
/** Like parseNum but empty string -> null (for optional fields). Invalid -> NaN. */
export function parseOptional(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  return parseNum(v);
}
export const round = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };

/** Normalizes Hebrew text for search/duplicate checks. */
export function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')            // niqqud / cantillation
    .replace(/[ךםןףץ]/g, c => ({ 'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ' })[c])
    .replace(/[\s'"׳״\-_.(),]/g, '');
}

/* ---------- Dates (local time, keys are 'YYYY-MM-DD') ---------- */
const pad = n => String(n).padStart(2, '0');
export function toKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function fromKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
/** The "diet day" a moment belongs to: before dayStartHour counts as the previous day. */
export function dayKey(date = new Date(), dayStartHour = 4) {
  const d = new Date(date.getTime());
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1);
  return toKey(d);
}
export function addDays(key, n) { const d = fromKey(key); d.setDate(d.getDate() + n); return toKey(d); }
export function daysBetween(fromK, toK) { return Math.round((fromKey(toK) - fromKey(fromK)) / 86400000); }
export function fmtDate(key) {
  const d = fromKey(key);
  const opts = { weekday: 'short', day: 'numeric', month: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('he-IL', opts);
}
/** Default meal index by clock time (0..5). */
export function mealForTime(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 4) return 5;
  if (h < 10) return 0;
  if (h < 12.5) return 1;
  if (h < 15.5) return 2;
  if (h < 18.5) return 3;
  if (h < 21.5) return 4;
  return 5;
}

/* ---------- Nutrition ---------- */
const nz = v => (v === null || v === undefined || Number.isNaN(v)) ? null : v;

/** Nutrition of `grams` of a food. Macros are null when the food lacks them. */
export function foodNutrition(food, grams) {
  const k = grams / 100;
  const m = x => nz(x) === null ? null : x * k;
  const protein = m(food.protein100), carbs = m(food.carbs100), fat = m(food.fat100);
  return {
    kcal: food.kcal100 * k, protein, carbs, fat,
    macrosComplete: protein !== null && carbs !== null && fat !== null,
  };
}

/** Totals for the whole recipe, from the *current* dictionary. getFood: id -> Food|null */
export function recipeTotals(recipe, getFood) {
  const t = { grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0, macrosComplete: true, missingItems: 0 };
  for (const it of recipe.items) {
    const f = getFood(it.foodId);
    if (!f) { t.missingItems++; continue; }
    const n = foodNutrition(f, it.grams);
    t.grams += it.grams; t.kcal += n.kcal;
    t.protein += n.protein ?? 0; t.carbs += n.carbs ?? 0; t.fat += n.fat ?? 0;
    if (!n.macrosComplete) t.macrosComplete = false;
  }
  return t;
}

/** Nutrition for eating part of a recipe: either { portions } or { grams }. */
export function recipeNutrition(recipe, getFood, { portions = null, grams = null }) {
  const t = recipeTotals(recipe, getFood);
  let frac = 0;
  if (portions !== null) frac = portions / (recipe.portions || 1);
  else if (grams !== null && t.grams > 0) frac = grams / t.grams;
  // Macros of incomplete recipes are partial sums; macrosComplete=false flags it.
  return {
    kcal: t.kcal * frac, protein: t.protein * frac, carbs: t.carbs * frac, fat: t.fat * frac,
    macrosComplete: t.macrosComplete, grams: t.grams * frac,
  };
}

/** Sums log entries. macrosComplete=false if any entry lacks macros. */
export function sumEntries(entries) {
  const s = { kcal: 0, protein: 0, carbs: 0, fat: 0, macrosComplete: true, count: entries.length };
  for (const e of entries) {
    s.kcal += e.kcal || 0;
    s.protein += e.protein ?? 0; s.carbs += e.carbs ?? 0; s.fat += e.fat ?? 0;
    if (!e.macrosComplete) s.macrosComplete = false;
  }
  return s;
}

/* ---------- Targets ---------- */
export function bmr({ sex, age, heightCm }, kg) {
  if (!sex || !age || !heightCm || !kg) return null;
  return 10 * kg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

/**
 * Full daily target computation.
 * Returns { ready, bmr, tdee, auto, target, dailyDelta, weeklyKg, daysLeft, mode, warnings[], suggestedDate }
 *  - ready=false when profile is incomplete (target falls back to manualTarget or null)
 *  - mode: 'loss' | 'gain' | 'maintain'
 *  - warnings: Hebrew strings
 */
export function computeTarget(settings, currentKg, todayKey) {
  const out = { ready: false, bmr: null, tdee: null, auto: null, target: settings.manualTarget || null,
    dailyDelta: 0, weeklyKg: 0, daysLeft: null, mode: 'maintain', warnings: [], suggestedDate: null };
  const b = bmr(settings, currentKg);
  if (!b) {
    if (!settings.manualTarget) out.warnings.push('כדי לחשב יעד יומי יש למלא בהגדרות: מין, גיל, גובה ומשקל.');
    return out;
  }
  out.ready = true;
  out.bmr = b;
  out.tdee = b * (settings.activity || 1.2);

  const goal = settings.goalKg;
  const diff = goal ? goal - currentKg : 0; // negative = need to lose
  out.mode = !goal || Math.abs(diff) < 0.3 ? 'maintain' : diff < 0 ? 'loss' : 'gain';

  if (out.mode !== 'maintain') {
    if (!settings.goalDate) {
      out.warnings.push('לא הוגדר תאריך יעד. לכן היעד מחושב לפי קצב מומלץ.');
    } else {
      out.daysLeft = daysBetween(todayKey, settings.goalDate);
      if (out.daysLeft <= 0) out.warnings.push('תאריך היעד כבר עבר. כדאי לעדכן אותו בהגדרות. בינתיים היעד מחושב לפי קצב מומלץ.');
    }
    const safeWeekly = out.mode === 'loss' ? currentKg * SAFE_WEEKLY_LOSS_PCT : 0.25;
    let weekly; // kg/week, signed
    if (out.daysLeft && out.daysLeft > 0) weekly = diff / (out.daysLeft / 7);
    else weekly = Math.sign(diff) * safeWeekly;

    const suggestWeeks = Math.ceil(Math.abs(diff) / safeWeekly);
    out.suggestedDate = addDays(todayKey, suggestWeeks * 7);

    if (out.mode === 'loss' && Math.abs(weekly) > currentKg * MAX_WEEKLY_LOSS_PCT) {
      out.warnings.push(`הקצב שנדרש (${round(Math.abs(weekly), 2)} ק"ג בשבוע) מהיר מדי. מומלץ לרדת עד כ-1% ממשקל הגוף בשבוע. תאריך יעד מציאותי: ${fmtDate(out.suggestedDate)}.`);
    }
    if (out.mode === 'gain' && weekly > MAX_WEEKLY_GAIN_KG) {
      out.warnings.push(`קצב העלייה (${round(weekly, 2)} ק"ג בשבוע) גבוה. עלייה מהירה מ-0.5 ק"ג בשבוע מגיעה בעיקר משומן.`);
    }
    out.weeklyKg = weekly;
    out.dailyDelta = weekly * KCAL_PER_KG / 7;
  }

  let auto = out.tdee + out.dailyDelta;
  const min = MIN_KCAL[settings.sex] || 1200;
  if (auto < min) {
    out.warnings.push(`כדי לעמוד בתאריך היעד צריך לאכול פחות מהמינימום הבטוח (${min} קלוריות). היעד הועלה ל-${min}, ולכן ההגעה למטרה תיקח יותר זמן.`);
    auto = min;
  }
  out.auto = Math.round(auto);
  out.target = settings.manualTarget || out.auto;
  if (settings.manualTarget && settings.manualTarget < min) {
    out.warnings.push(`היעד הידני (${settings.manualTarget}) נמוך מהמינימום הבטוח (${min}).`);
  }
  return out;
}

/** Macro targets in grams. limits: which macros are a ceiling ('max') vs a goal ('target'). */
export function macroTargets(targetKcal, dietType, kg) {
  if (!targetKcal) return null;
  if (dietType === 'balanced' || !kg) {
    return { protein: targetKcal * 0.30 / 4, carbs: targetKcal * 0.40 / 4, fat: targetKcal * 0.30 / 9,
      carbsIsMax: false };
  }
  const carbs = dietType === 'keto' ? 25 : 100;
  const protein = 1.6 * kg;
  const fat = Math.max(0, (targetKcal - carbs * 4 - protein * 4) / 9);
  return { protein, carbs, fat, carbsIsMax: true };
}

/** kcal budget per meal (array of 6). */
export function mealBudgets(targetKcal, mealPct) {
  if (!targetKcal) return mealPct.map(() => null);
  return mealPct.map(p => Math.round(targetKcal * p / 100));
}
