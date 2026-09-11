import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EFFEKT_HALT, FAHRT_STOPP, RUHERAHMEN, effektByte, fahrtByte, greiferByte, hex, hubByte,
  klangByte, meldungLesen, rahmenBauen,
} from '../src/protokoll.js';

test('der Ruherahmen entspricht dem Pausenbefehl aus QtEvoBot', () => {
  assert.equal(hex(rahmenBauen()), '58 11 40 40 00 00');
  assert.deepEqual(Array.from(rahmenBauen()), Array.from(RUHERAHMEN));
});

test('Fahrbefehle belegen je Richtung vier aufeinanderfolgende Werte', () => {
  assert.deepEqual([1, 2, 3, 4].map((s) => fahrtByte('vor', s)), [1, 2, 3, 4]);
  assert.deepEqual([1, 2, 3, 4].map((s) => fahrtByte('zurueck', s)), [5, 6, 7, 8]);
  assert.deepEqual([1, 2, 3, 4].map((s) => fahrtByte('links', s)), [9, 10, 11, 12]);
  assert.deepEqual([1, 2, 3, 4].map((s) => fahrtByte('rechts', s)), [13, 14, 15, 16]);
  assert.equal(fahrtByte(null), FAHRT_STOPP);
});

test('unsinnige Fahrbefehle fliegen auf', () => {
  assert.throws(() => fahrtByte('schraeg', 1), RangeError);
  assert.throws(() => fahrtByte('vor', 0), RangeError);
  assert.throws(() => fahrtByte('vor', 5), RangeError);
  assert.throws(() => fahrtByte('vor', 1.5), RangeError);
});

test('Greifer und Hub kennen ihre Neutralstellung', () => {
  assert.equal(greiferByte(null), 0x40);
  assert.equal(greiferByte('neutral'), 0x40);
  assert.equal(greiferByte('auf'), 0x3c);
  assert.equal(greiferByte('zu'), 0x3d);
  assert.equal(hubByte(null), 0x40);
  assert.equal(hubByte('hoch'), 0x3e);
  assert.equal(hubByte('runter'), 0x3f);
  assert.throws(() => greiferByte('halb'), RangeError);
  assert.throws(() => hubByte('seitlich'), RangeError);
});

test('Klaenge zaehlen ab 21', () => {
  assert.equal(klangByte(null), 0);
  assert.equal(klangByte(0), 21);
  assert.equal(klangByte(3), 24);
  assert.throws(() => klangByte(-1), RangeError);
});

test('der Effektversatz haengt an der Firmware-Version', () => {
  assert.equal(effektByte(null), 0);
  assert.equal(effektByte(0), EFFEKT_HALT);
  assert.equal(effektByte(1, 1), 1 + 0x35);
  assert.equal(effektByte(1, 2), 1 + 0x47);
  assert.equal(effektByte(63, 2), 63 + 0x47);
  assert.throws(() => effektByte(64, 2), RangeError);
  assert.throws(() => effektByte(1, 3), RangeError);
});

test('ein vollstaendiger Rahmen setzt alle Stellgroessen', () => {
  const rahmen = rahmenBauen({
    fahrt: { richtung: 'rechts', stufe: 3 },
    greifer: 'auf',
    hub: 'hoch',
    klang: 2,
    effekt: 1,
    firmware: 2,
  });
  assert.equal(hex(rahmen), '58 0f 3c 3e 17 48');
  assert.equal(rahmen.length, 6);
});

test('Meldungen des Roboters werden gelesen', () => {
  assert.deepEqual(meldungLesen('V3Play'), { klang: 3, zustand: 'start' });
  assert.deepEqual(meldungLesen('V12End'), { klang: 12, zustand: 'ende' });
  assert.equal(meldungLesen('irgendwas'), null);
});
