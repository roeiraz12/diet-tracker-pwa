// Single source of truth. All data lives in localStorage under one key.
// Views read `state` and call mutators; every mutator persists and notifies.

const KEY = 'diet-app-v1';
export const SCHEMA_VERSION = 1;

export const MEALS = ['בוקר', 'ביניים 1', 'צהריים', 'ביניים 2', 'ערב', 'ביניים 3'];

export function defaultSettings() {
  return {
    sex: null,            // 'male' | 'female'
    age: null,            // years
    heightCm: null,
    startKg: null,        // weight when goal was set
    goalKg: null,
    goalDate: null,       // 'YYYY-MM-DD'
    activity: 1.375,      // multiplier, see calc.ACTIVITY_LEVELS
    dietType: 'balanced', // 'balanced' | 'lowcarb' | 'keto'
    manualTarget: null,   // kcal override, null = auto
    mealPct: [25, 8, 25, 8, 25, 9], // must sum to 100
    dayStartHour: 4,
    lastBackup: null,     // ISO timestamp
  };
}

function emptyState() {
  return {
    version: SCHEMA_VERSION,
    foods: [],    // Food[]
    recipes: [],  // Recipe[]
    log: {},      // { 'YYYY-MM-DD': LogEntry[] }
    weights: [],  // { date:'YYYY-MM-DD', kg:number }[] sorted by date asc
    settings: defaultSettings(),
  };
}

/*
Food   = { id, name, kcal100, protein100|null, carbs100|null, fat100|null,
           servingName|null, servingGrams|null }
Recipe = { id, name, items:[{foodId, grams}], portions:number }
         (recipe nutrition is always computed live from current foods)
LogEntry = { id, meal:0..5, sourceType:'food'|'recipe', sourceId, name,
             grams:number, qtyLabel:string,            // e.g. "2 פרוסה" / "150 ג׳"
             kcal, protein|null, carbs|null, fat|null, // SNAPSHOT at time of adding
             macrosComplete:boolean, addedAt: ISO,
             qty?, unit?:'unit'|'g', unitName?, unitGrams? }    // so edit reopens in the same unit
*/

export let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.error('load failed', e);
    return emptyState();
  }
}

function migrate(s) {
  const base = emptyState();
  const out = { ...base, ...s };
  out.settings = { ...defaultSettings(), ...(s.settings || {}) };
  out.version = SCHEMA_VERSION;
  return out;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('save failed', e);
    alert('שמירה נכשלה – ייתכן שהאחסון בדפדפן מלא.');
  }
  listeners.forEach(fn => fn(state));
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Another tab saved: reload so we don't overwrite its data with a stale copy. */
export function onExternalChange(fn) {
  window.addEventListener('storage', e => {
    if (e.key !== KEY) return;
    state = load();
    fn();
  });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Foods ---------- */
export function getFood(id) { return state.foods.find(f => f.id === id) || null; }
export function upsertFood(food) {
  if (!food.id) food.id = uid();
  const i = state.foods.findIndex(f => f.id === food.id);
  if (i >= 0) state.foods[i] = food; else state.foods.push(food);
  save(); return food;
}
/** Recipes that use this food (for the delete warning). */
export function recipesUsingFood(foodId) {
  return state.recipes.filter(r => r.items.some(it => it.foodId === foodId));
}
/** Deletes the food and removes it from any recipe. Past log entries are untouched (snapshots). */
export function deleteFood(id) {
  state.foods = state.foods.filter(f => f.id !== id);
  state.recipes.forEach(r => { r.items = r.items.filter(it => it.foodId !== id); });
  save();
}

/* ---------- Recipes ---------- */
export function getRecipe(id) { return state.recipes.find(r => r.id === id) || null; }
export function upsertRecipe(recipe) {
  if (!recipe.id) recipe.id = uid();
  const i = state.recipes.findIndex(r => r.id === recipe.id);
  if (i >= 0) state.recipes[i] = recipe; else state.recipes.push(recipe);
  save(); return recipe;
}
export function deleteRecipe(id) {
  state.recipes = state.recipes.filter(r => r.id !== id);
  save();
}

/* ---------- Log ---------- */
export function getDay(dateKey) { return state.log[dateKey] || []; }
export function addEntry(dateKey, entry) {
  if (!entry.id) entry.id = uid();
  if (!entry.addedAt) entry.addedAt = new Date().toISOString();
  (state.log[dateKey] ||= []).push(entry);
  save(); return entry;
}
export function updateEntry(dateKey, entry) {
  const day = state.log[dateKey] || [];
  const i = day.findIndex(e => e.id === entry.id);
  if (i >= 0) { day[i] = entry; save(); }
}
export function deleteEntry(dateKey, id) {
  state.log[dateKey] = (state.log[dateKey] || []).filter(e => e.id !== id);
  if (!state.log[dateKey].length) delete state.log[dateKey];
  save();
}

/* ---------- Weights ---------- */
export function setWeight(date, kg) {
  const i = state.weights.findIndex(w => w.date === date);
  if (i >= 0) state.weights[i].kg = kg; else state.weights.push({ date, kg });
  state.weights.sort((a, b) => a.date.localeCompare(b.date));
  save();
}
export function deleteWeight(date) {
  state.weights = state.weights.filter(w => w.date !== date);
  save();
}
/** Latest logged weight, falling back to settings.startKg. */
export function currentWeight() {
  const w = state.weights[state.weights.length - 1];
  return w ? w.kg : state.settings.startKg;
}

/* ---------- Settings ---------- */
export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  save();
}

/* ---------- Backup ---------- */
export function exportJSON() {
  return JSON.stringify({ app: 'diet-app', exportedAt: new Date().toISOString(), data: state }, null, 2);
}
/** Throws with a Hebrew message on invalid input. Replaces all data. */
export function importJSON(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('הקובץ אינו קובץ גיבוי תקין'); }
  const data = parsed && parsed.app === 'diet-app' ? parsed.data : null;
  if (!data || !Array.isArray(data.foods) || typeof data.log !== 'object') {
    throw new Error('הקובץ אינו קובץ גיבוי של האפליקציה');
  }
  state = migrate(data);
  save();
}
export function markBackedUp() { updateSettings({ lastBackup: new Date().toISOString() }); }

/** Ask the browser not to evict our storage. Safe to call repeatedly. */
export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {}
  return false;
}
