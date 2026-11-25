import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNum, parseOptional, round, normalize,
  toKey, fromKey, dayKey, addDays, daysBetween, mealForTime,
  foodNutrition, recipeTotals, recipeNutrition, sumEntries,
  bmr, computeTarget, macroTargets, mealBudgets, MIN_KCAL,
} from '../js/calc.js';

const profile = (over = {}) => ({
  sex: 'male', age: 30, heightCm: 180, activity: 1.2, goalKg: null, goalDate: null, manualTarget: null, ...over,
});

test('parseNum accepts comma or dot decimals and rejects junk', () => {
  assert.equal(parseNum('1,5'), 1.5);
  assert.equal(parseNum(' 2.25 '), 2.25);
  assert.equal(parseNum(0), 0);
  for (const bad of ['', '  ', 'abc', '-3', null, undefined, 'Infinity']) {
    assert.ok(Number.isNaN(parseNum(bad)), String(bad));
  }
});

test('parseOptional: empty -> null, invalid -> NaN', () => {
  assert.equal(parseOptional(''), null);
  assert.equal(parseOptional(null), null);
  assert.equal(parseOptional('3'), 3);
  assert.ok(Number.isNaN(parseOptional('x')));
});

test('round to given decimals', () => {
  assert.equal(round(1.2345, 2), 1.23);
  assert.equal(round(2.5), 3);
});

test('normalize ignores niqqud, final letters, spaces and punctuation', () => {
  assert.equal(normalize('לֶחֶם'), normalize('לחם'));
  assert.equal(normalize('שקדים'), normalize('שקדימ'));
  assert.equal(normalize("cottage's 5%"), normalize('cottages 5%'));
  assert.equal(normalize('Pita Bread'), 'pitabread');
  assert.equal(normalize(null), '');
});

test('date keys round-trip and arithmetic crosses month/year/DST boundaries', () => {
  assert.equal(toKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(toKey(fromKey('2026-03-27')), '2026-03-27');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-03-26', 7), '2026-04-02'); // spans a DST change
  assert.equal(daysBetween('2026-03-20', '2026-04-03'), 14);
  assert.equal(daysBetween('2026-05-10', '2026-05-01'), -9);
});

test('dayKey: moments before dayStartHour belong to the previous day', () => {
  assert.equal(dayKey(new Date(2026, 4, 10, 2, 30)), '2026-05-09');
  assert.equal(dayKey(new Date(2026, 4, 10, 4, 0)), '2026-05-10');
  assert.equal(dayKey(new Date(2026, 4, 10, 5, 0), 6), '2026-05-09');
  assert.equal(dayKey(new Date(2026, 0, 1, 1, 0)), '2025-12-31');
});

test('mealForTime maps clock time to the six meals', () => {
  const at = (h, m = 0) => mealForTime(new Date(2026, 0, 1, h, m));
  assert.equal(at(8), 0);
  assert.equal(at(11), 1);
  assert.equal(at(12, 30), 2);
  assert.equal(at(13), 2);
  assert.equal(at(17), 3);
  assert.equal(at(20), 4);
  assert.equal(at(23), 5);
  assert.equal(at(2), 5);
});

const bread = { id: 'b', kcal100: 250, protein100: 8, carbs100: 48, fat100: 2 };
const butter = { id: 'u', kcal100: 720, protein100: null, carbs100: null, fat100: 81 };

test('foodNutrition scales per 100 g and flags missing macros', () => {
  const n = foodNutrition(bread, 50);
  assert.equal(n.kcal, 125);
  assert.equal(n.protein, 4);
  assert.equal(n.macrosComplete, true);
  const m = foodNutrition(butter, 10);
  assert.equal(m.kcal, 72);
  assert.equal(m.protein, null);
  assert.equal(m.macrosComplete, false);
});

test('recipeTotals and recipeNutrition use the current dictionary', () => {
  const foods = { b: bread, u: butter };
  const getFood = id => foods[id] || null;
  const recipe = {
    items: [{ foodId: 'b', grams: 200 }, { foodId: 'u', grams: 20 }, { foodId: 'gone', grams: 50 }],
    portions: 4,
  };
  const t = recipeTotals(recipe, getFood);
  assert.equal(t.grams, 220);
  assert.equal(t.kcal, 500 + 144);
  assert.equal(t.missingItems, 1);
  assert.equal(t.macrosComplete, false);
  assert.equal(recipeNutrition(recipe, getFood, { portions: 1 }).kcal, 161);
  const byGrams = recipeNutrition(recipe, getFood, { grams: 110 });
  assert.equal(byGrams.kcal, 322);
  assert.equal(byGrams.grams, 110);
});

test('sumEntries totals a day and tracks macro completeness', () => {
  const s = sumEntries([
    { kcal: 300, protein: 20, carbs: 30, fat: 10, macrosComplete: true },
    { kcal: 150, protein: null, carbs: null, fat: null, macrosComplete: false },
  ]);
  assert.deepEqual(s, { kcal: 450, protein: 20, carbs: 30, fat: 10, macrosComplete: false, count: 2 });
  assert.deepEqual(sumEntries([]), { kcal: 0, protein: 0, carbs: 0, fat: 0, macrosComplete: true, count: 0 });
});

test('bmr uses the Mifflin-St Jeor equation', () => {
  assert.equal(bmr({ sex: 'male', age: 30, heightCm: 180 }, 80), 1780);
  assert.equal(bmr({ sex: 'female', age: 30, heightCm: 165 }, 60), 1320.25);
  assert.equal(bmr({ sex: 'male', age: null, heightCm: 180 }, 80), null);
  assert.equal(bmr({ sex: 'male', age: 30, heightCm: 180 }, null), null);
});

test('computeTarget: incomplete profile is not ready and warns', () => {
  const r = computeTarget(profile({ sex: null }), 80, '2026-01-01');
  assert.equal(r.ready, false);
  assert.equal(r.target, null);
  assert.equal(r.warnings.length, 1);
  const manual = computeTarget(profile({ sex: null, manualTarget: 1800 }), 80, '2026-01-01');
  assert.equal(manual.target, 1800);
  assert.equal(manual.warnings.length, 0);
});

test('computeTarget: maintenance = BMR x activity', () => {
  const r = computeTarget(profile({ activity: 1.55 }), 80, '2026-01-01');
  assert.equal(r.mode, 'maintain');
  assert.equal(r.tdee, 1780 * 1.55);
  assert.equal(r.target, Math.round(1780 * 1.55));
});

test('computeTarget: loss toward a goal date creates a daily deficit', () => {
  // 4 kg in 140 days = 0.2 kg/week -> 220 kcal/day deficit
  const r = computeTarget(profile({ activity: 1.55, goalKg: 76, goalDate: '2026-05-21' }), 80, '2026-01-01');
  assert.equal(r.mode, 'loss');
  assert.equal(r.daysLeft, 140);
  assert.ok(Math.abs(r.weeklyKg + 0.2) < 1e-9);
  assert.ok(Math.abs(r.dailyDelta + 220) < 1e-9);
  assert.equal(r.auto, Math.round(1780 * 1.55 - 220));
  assert.equal(r.warnings.length, 0);
});

test('computeTarget: too-fast loss warns and is floored at the safe minimum', () => {
  const r = computeTarget(profile({ goalKg: 60, goalDate: '2026-02-01' }), 80, '2026-01-01');
  assert.equal(r.mode, 'loss');
  assert.equal(r.auto, MIN_KCAL.male);
  assert.ok(r.warnings.length >= 2);
  assert.ok(r.suggestedDate > '2026-02-01');
});

test('computeTarget: no goal date falls back to the recommended pace', () => {
  const r = computeTarget(profile({ activity: 1.55, goalKg: 75 }), 80, '2026-01-01');
  assert.ok(Math.abs(r.weeklyKg + 80 * 0.0075) < 1e-9);
  assert.equal(r.suggestedDate, addDays('2026-01-01', Math.ceil(5 / 0.6) * 7));
  assert.equal(r.warnings.length, 1);
});

test('computeTarget: gain mode and manual override below minimum', () => {
  const g = computeTarget(profile({ goalKg: 85, goalDate: '2026-02-01' }), 80, '2026-01-01');
  assert.equal(g.mode, 'gain');
  assert.ok(g.dailyDelta > 0);
  assert.ok(g.warnings.some(w => w.includes('0.5')));
  const m = computeTarget(profile({ sex: 'female', heightCm: 165, manualTarget: 1000 }), 60, '2026-01-01');
  assert.equal(m.target, 1000);
  assert.ok(m.warnings.some(w => w.includes('1200')));
});

test('macroTargets: balanced split and low-carb / keto ceilings', () => {
  assert.deepEqual(macroTargets(2000, 'balanced', 80),
    { protein: 2000 * 0.3 / 4, carbs: 2000 * 0.4 / 4, fat: 2000 * 0.3 / 9, carbsIsMax: false });
  const keto = macroTargets(2000, 'keto', 80);
  assert.equal(keto.carbs, 25);
  assert.equal(keto.protein, 128);
  assert.equal(keto.fat, (2000 - 100 - 512) / 9);
  assert.equal(keto.carbsIsMax, true);
  assert.equal(macroTargets(2000, 'lowcarb', 80).carbs, 100);
  assert.equal(macroTargets(null, 'balanced', 80), null);
});

test('mealBudgets splits the target by meal percentages', () => {
  assert.deepEqual(mealBudgets(2000, [25, 8, 25, 8, 25, 9]), [500, 160, 500, 160, 500, 180]);
  assert.deepEqual(mealBudgets(null, [50, 50]), [null, null]);
});
