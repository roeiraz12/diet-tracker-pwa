// Pure state helpers: default shape, schema migration, backup file format and validation.
// No DOM and no storage, so they can be unit-tested in Node (see test/).

export const SCHEMA_VERSION = 1;
export const BACKUP_DAYS = 7;

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

export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    foods: [],    // Food[]
    recipes: [],  // Recipe[]
    log: {},      // { 'YYYY-MM-DD': LogEntry[] }
    weights: [],  // { date:'YYYY-MM-DD', kg:number }[] sorted by date asc
    settings: defaultSettings(),
  };
}

/** Fills in missing fields from the defaults and stamps the current schema version. */
export function migrate(s) {
  const base = emptyState();
  const out = { ...base, ...s };
  out.settings = { ...defaultSettings(), ...(s.settings || {}) };
  out.version = SCHEMA_VERSION;
  return out;
}

/** Serializes state as a backup file. */
export function buildBackup(state, now = new Date()) {
  return JSON.stringify({ app: 'diet-app', exportedAt: now.toISOString(), data: state }, null, 2);
}

/** Parses and validates a backup file. Returns migrated state; throws with a Hebrew message on invalid input. */
export function parseBackup(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('הקובץ אינו קובץ גיבוי תקין'); }
  const data = parsed && parsed.app === 'diet-app' ? parsed.data : null;
  if (!data || !Array.isArray(data.foods) || typeof data.log !== 'object') {
    throw new Error('הקובץ אינו קובץ גיבוי של האפליקציה');
  }
  return migrate(data);
}

/** True when the state holds anything worth backing up. */
export function hasData(state) {
  return state.foods.length > 0 || state.recipes.length > 0 ||
    Object.keys(state.log).length > 0 || state.weights.length > 0;
}

/** Backup reminder: due when there is data and no backup in the last BACKUP_DAYS days. */
export function isBackupDue(state, nowMs = Date.now()) {
  const last = state.settings.lastBackup;
  if (!last) return hasData(state);
  const age = nowMs - new Date(last).getTime();
  return !(age >= 0 && age < BACKUP_DAYS * 86400000);
}
