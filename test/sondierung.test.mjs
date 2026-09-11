import test from 'node:test';
import assert from 'node:assert/strict';
import { RAHMEN_LAENGE, hex } from '../src/protokoll.js';
import { Sondierung, TESTWERTE, planErstellen } from '../src/sondierung.js';

test('der Plan deckt jedes Byte mit jedem Testwert ab', () => {
  const plan = planErstellen();
  assert.equal(plan.length, RAHMEN_LAENGE * TESTWERTE.length);
  assert.deepEqual(plan[0], { byte: 0, wert: 0xff }, 'der kraeftigste Wert kommt zuerst');
  for (const wert of TESTWERTE) {
    const bytes = plan.filter((p) => p.wert === wert).map((p) => p.byte);
    assert.deepEqual(bytes, [...Array(RAHMEN_LAENGE).keys()]);
  }
});

test('die Sondierung liefert zu jedem Versuch den passenden Rahmen', () => {
  const s = new Sondierung(planErstellen([0xff]));
  assert.equal(s.nummer, 1);
  assert.equal(hex(s.rahmen), 'FF 00 00 00 00 00 00 00 00');
  s.notiere(false);
  assert.equal(hex(s.rahmen), '00 FF 00 00 00 00 00 00 00');
  assert.equal(s.nummer, 2);
});

test('Beobachtungen werden festgehalten und landen im Bericht', () => {
  const s = new Sondierung(planErstellen([0xff]));
  s.notiere(false);
  s.notiere(true, 'linkes Rad dreht');
  assert.equal(s.treffer.length, 1);
  assert.deepEqual(s.treffer[0], { byte: 1, wert: 0xff, reaktion: true, bemerkung: 'linkes Rad dreht' });
  assert.match(s.bericht(), /Byte 1 = 0xFF -> linkes Rad dreht/);
});

test('ohne Reaktion sagt der Bericht das auch', () => {
  const s = new Sondierung(planErstellen([0x01]));
  s.notiere(false);
  assert.match(s.bericht(), /Keine Reaktion beobachtet/);
});

test('ein Versuch laesst sich zuruecknehmen', () => {
  const s = new Sondierung(planErstellen([0xff]));
  s.notiere(true, 'Irrtum');
  assert.equal(s.treffer.length, 1);
  s.zurueck();
  assert.equal(s.treffer.length, 0);
  assert.equal(s.nummer, 1);
});

test('ueberspringen bewertet nicht', () => {
  const s = new Sondierung(planErstellen([0xff]));
  s.ueberspringe();
  assert.equal(s.nummer, 2);
  assert.equal(s.ergebnisse.length, 0);
});

test('am Ende des Plans ist Schluss', () => {
  const s = new Sondierung([{ byte: 0, wert: 1 }]);
  assert.equal(s.fertig, false);
  s.notiere(false);
  assert.equal(s.fertig, true);
  assert.equal(s.rahmen, null);
  s.notiere(true);
  assert.equal(s.ergebnisse.length, 1, 'nach dem Ende wird nichts mehr angehaengt');
});

test('ein leerer Plan fliegt auf', () => {
  assert.throws(() => new Sondierung([]), RangeError);
});

test('ein gesicherter Stand laesst sich wiederherstellen', () => {
  const s = new Sondierung(planErstellen([0xff]));
  s.notiere(false);
  s.notiere(true, 'Rad dreht');
  const wieder = Sondierung.ausJSON(s.toJSON(), planErstellen([0xff]));
  assert.equal(wieder.nummer, 3);
  assert.deepEqual(wieder.treffer, s.treffer);
});

test('kaputte oder fehlende Speicherdaten ergeben eine frische Sondierung', () => {
  for (const daten of [null, undefined, {}, { ergebnisse: 'nein' }, { ergebnisse: [{}, null] }]) {
    const s = Sondierung.ausJSON(daten, planErstellen([0xff]));
    assert.equal(s.nummer, 1);
    assert.equal(s.ergebnisse.length, 0);
  }
});
