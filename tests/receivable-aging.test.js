import test from 'node:test';
import assert from 'node:assert/strict';
import { getAgingBucket, getAgingMeta, getOverdueDays } from '../src/lib/receivableAging.js';

const TODAY = new Date(2026, 8, 13);

test('clasifica una factura futura como al día', () => {
  assert.equal(getOverdueDays('2026-09-20', TODAY), 0);
  assert.equal(getAgingBucket('2026-09-20', TODAY), 'current');
});

test('clasifica una factura con vencimiento hoy como al día', () => {
  assert.equal(getOverdueDays('2026-09-13', TODAY), 0);
  assert.equal(getAgingBucket('2026-09-13', TODAY), 'current');
});

test('calcula correctamente los límites de aging', () => {
  assert.equal(getAgingBucket('2026-09-12', TODAY), '1_30');
  assert.equal(getAgingBucket('2026-08-14', TODAY), '1_30');
  assert.equal(getAgingBucket('2026-08-13', TODAY), '31_60');
  assert.equal(getAgingBucket('2026-07-15', TODAY), '31_60');
  assert.equal(getAgingBucket('2026-07-14', TODAY), '61_90');
  assert.equal(getAgingBucket('2026-06-15', TODAY), '61_90');
  assert.equal(getAgingBucket('2026-06-14', TODAY), '90_plus');
});

test('una factura sin fecha de vencimiento no se marca como vencida', () => {
  assert.equal(getOverdueDays(null, TODAY), 0);
  assert.equal(getAgingBucket(null, TODAY), 'current');
});

test('expone etiquetas legibles para los buckets', () => {
  assert.equal(getAgingMeta('1_30').label, '1–30 días');
  assert.equal(getAgingMeta('90_plus').label, '+90 días');
});
