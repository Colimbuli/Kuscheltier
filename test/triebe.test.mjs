import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ABWESENHEIT_MS, TRIEBE, Triebe, VERFALL_PRO_MINUTE } from '../src/triebe.js';
import { NOTSCHWELLE, SCHWELLE, gemuetslage } from '../src/gemuet.js';

const MINUTE = 60000;

test('frische Triebe starten gefuellt', () => {
  const t = new Triebe();
  for (const name of TRIEBE) assert.equal(t.werte[name], 80);
});

test('Triebe verfallen mit der Zeit', () => {
  const t = new Triebe({ beschaeftigung: 50 });
  t.verstreiche(10 * MINUTE);
  assert.equal(t.werte.beschaeftigung, 50 - 10 * VERFALL_PRO_MINUTE.beschaeftigung);
  assert.equal(t.werte.energie, 80 - 10 * VERFALL_PRO_MINUTE.energie);
});

test('Werte bleiben zwischen 0 und 100', () => {
  const t = new Triebe({ energie: 2 });
  t.verstreiche(60 * MINUTE);
  assert.equal(t.werte.energie, 0);
  t.fuettern(1000);
  assert.equal(t.werte.sattheit, 100);
});

test('Bewegung kostet Energie, Ruhe bringt sie zurueck', () => {
  const bewegt = new Triebe();
  const ruhig = new Triebe();
  bewegt.verstreiche(MINUTE, { inBewegung: true });
  ruhig.verstreiche(MINUTE);
  assert.ok(bewegt.werte.energie < ruhig.werte.energie);
  assert.ok(bewegt.werte.beschaeftigung > ruhig.werte.beschaeftigung);

  const schlafend = new Triebe({ energie: 20 });
  schlafend.verstreiche(5 * MINUTE, { ruhend: true });
  assert.ok(schlafend.werte.energie > 20);
});

test('eine sehr lange Abwesenheit wird gedeckelt', () => {
  const kurz = new Triebe();
  const lang = new Triebe();
  kurz.verstreiche(MAX_ABWESENHEIT_MS);
  lang.verstreiche(MAX_ABWESENHEIT_MS * 10);
  assert.deepEqual(kurz.toJSON(), lang.toJSON());
});

test('der dringendste Trieb ist der niedrigste', () => {
  const t = new Triebe({ energie: 90, sattheit: 12, zuwendung: 60, beschaeftigung: 55 });
  assert.equal(t.dringendster, 'sattheit');
});

test('die Stimmung folgt dem dringendsten Trieb', () => {
  const satt = new Triebe({ energie: 80, sattheit: 80, zuwendung: 80, beschaeftigung: 80 });
  assert.equal(gemuetslage(satt).stimmung, 'zufrieden');

  const hungrig = new Triebe({ energie: 80, sattheit: SCHWELLE - 1, zuwendung: 80, beschaeftigung: 80 });
  assert.equal(gemuetslage(hungrig).stimmung, 'hungrig');

  const leer = new Triebe({ energie: NOTSCHWELLE - 1, sattheit: 5, zuwendung: 80, beschaeftigung: 80 });
  assert.equal(gemuetslage(leer).stimmung, 'erschoepft');

  const munter = new Triebe({ energie: 95, sattheit: 95, zuwendung: 95, beschaeftigung: 95 });
  assert.equal(gemuetslage(munter).stimmung, 'aufgedreht');
});
