import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, migrate, emptyState, isBackupDue, SCHEMA_VERSION } from '../js/backup.js';

const sample = () => ({
  ...emptyState(),
  foods: [{ id: 'f1', name: 'bread', kcal100: 250, protein100: 8, carbs100: 48, fat100: 2 }],
  log: { '2026-01-01': [{ id: 'e1', meal: 0, kcal: 125 }] },
  weights: [{ date: '2026-01-01', kg: 80 }],
});

test('backup round-trip preserves all data', () => {
  const s = sample();
  const text = buildBackup(s, new Date('2026-01-02T10:00:00Z'));
  const parsed = JSON.parse(text);
  assert.equal(parsed.app, 'diet-app');
  assert.equal(parsed.exportedAt, '2026-01-02T10:00:00.000Z');
  assert.deepEqual(parseBackup(text), s);
});

test('parseBackup rejects non-JSON, foreign files and malformed data', () => {
  const notBackup = /אינו/; // "is not" in the Hebrew error message
  assert.throws(() => parseBackup('not json'), notBackup);
  assert.throws(() => parseBackup(JSON.stringify({ app: 'other', data: sample() })), notBackup);
  assert.throws(() => parseBackup(JSON.stringify({ app: 'diet-app', data: { foods: 'x', log: {} } })), notBackup);
  assert.throws(() => parseBackup(JSON.stringify({ app: 'diet-app', data: { foods: [] } })), notBackup);
  assert.throws(() => parseBackup('null'), notBackup);
});

test('migrate fills missing fields and keeps user settings', () => {
  const m = migrate({ foods: [], log: {}, settings: { sex: 'female', age: 40 }, version: 0 });
  assert.equal(m.version, SCHEMA_VERSION);
  assert.deepEqual(m.recipes, []);
  assert.deepEqual(m.weights, []);
  assert.equal(m.settings.sex, 'female');
  assert.equal(m.settings.age, 40);
  assert.equal(m.settings.dayStartHour, 4);
  assert.deepEqual(m.settings.mealPct, [25, 8, 25, 8, 25, 9]);
});

test('isBackupDue: never backed up -> due only when there is data', () => {
  assert.equal(isBackupDue(emptyState()), false);
  assert.equal(isBackupDue(sample()), true);
});

test('isBackupDue: weekly reminder window', () => {
  const now = Date.parse('2026-01-10T12:00:00Z');
  const withBackup = iso => ({ ...sample(), settings: { ...sample().settings, lastBackup: iso } });
  assert.equal(isBackupDue(withBackup('2026-01-05T12:00:00Z'), now), false);
  assert.equal(isBackupDue(withBackup('2026-01-03T11:00:00Z'), now), true);
  assert.equal(isBackupDue(withBackup('2026-02-01T00:00:00Z'), now), true); // future date (clock skew)
});
