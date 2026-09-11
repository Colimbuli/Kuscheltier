import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulator } from '../src/antrieb_sim.js';
import { Triebe } from '../src/triebe.js';
import { PAUSE_MS, REPERTOIRE, Verhalten } from '../src/verhalten.js';

function aufbau(triebwerte = {}, zufall = () => 0) {
  let uhr = 0;
  const antrieb = new Simulator({ jetzt: () => uhr });
  const triebe = new Triebe(triebwerte);
  const verhalten = new Verhalten({ triebe, antrieb, zufall });
  const takt = (ms = 100) => {
    uhr += ms;
    verhalten.takt(uhr);
    antrieb.takt(uhr);
    return uhr;
  };
  return { antrieb, triebe, verhalten, takt, zeit: () => uhr };
}

test('jede Stimmung hat ein Repertoire', () => {
  for (const [stimmung, handlungen] of Object.entries(REPERTOIRE)) {
    assert.ok(handlungen.length > 0, `${stimmung} ist leer`);
    for (const h of handlungen) {
      assert.ok(h.name, 'Handlung ohne Namen');
      assert.ok(h.schritte.every((s) => s.dauer > 0), `${h.name} hat einen Schritt ohne Dauer`);
    }
  }
});

test('gelangweilt faengt das Tier an, sich zu bewegen', () => {
  const { verhalten, antrieb, takt } = aufbau({ beschaeftigung: 5, energie: 90, sattheit: 90, zuwendung: 90 });
  takt();
  assert.equal(verhalten.stimmung, 'gelangweilt');
  assert.equal(verhalten.aktuell.name, REPERTOIRE.gelangweilt[0].name);
  assert.notEqual(antrieb.zustand.fahrt, null);
});

test('eine Handlung laeuft Schritt fuer Schritt ab und endet im Stillstand', () => {
  const { verhalten, antrieb, takt } = aufbau({ beschaeftigung: 5, energie: 90, sattheit: 90, zuwendung: 90 });
  takt();
  const handlung = REPERTOIRE.gelangweilt[0];
  const gesamt = handlung.schritte.reduce((s, x) => s + x.dauer, 0);

  for (let verstrichen = 0; verstrichen <= gesamt + 200; verstrichen += 100) takt();

  assert.equal(verhalten.aktuell, null, 'die Handlung muss fertig sein');
  assert.equal(antrieb.zustand.fahrt, null, 'am Ende steht das Tier');
});

test('nach einer Handlung folgt eine Pause passend zur Stimmung', () => {
  const { verhalten, takt } = aufbau({ energie: 5, sattheit: 90, zuwendung: 90, beschaeftigung: 90 });
  takt();
  assert.equal(verhalten.stimmung, 'erschoepft');
  const handlung = REPERTOIRE.erschoepft[0];
  const gesamt = handlung.schritte.reduce((s, x) => s + x.dauer, 0);

  for (let v = 0; v <= gesamt + 200; v += 100) takt();
  assert.equal(verhalten.ruht, true);

  // Waehrend der Pause bleibt es still.
  for (let v = 0; v < PAUSE_MS.erschoepft - 1000; v += 100) takt();
  assert.equal(verhalten.ruht, true);
});

test('Streicheln unterbricht sofort und hebt die Zuwendung', () => {
  const { verhalten, triebe, takt, zeit } = aufbau({ beschaeftigung: 5, energie: 90, sattheit: 90, zuwendung: 40 });
  takt();
  const vorher = triebe.werte.zuwendung;
  verhalten.reagiere('streicheln', zeit());
  assert.ok(triebe.werte.zuwendung > vorher);
  assert.equal(verhalten.aktuell.name, 'geniessen');
});

test('unbekannte Ereignisse fliegen auf', () => {
  const { verhalten, zeit } = aufbau();
  assert.throws(() => verhalten.reagiere('kitzeln', zeit()), RangeError);
});

test('der Zufall waehlt aus dem Repertoire und bleibt im Bereich', () => {
  for (const wert of [0, 0.5, 0.999999, 1]) {
    const { verhalten, takt } = aufbau({ beschaeftigung: 5, energie: 90, sattheit: 90, zuwendung: 90 }, () => wert);
    takt();
    const namen = REPERTOIRE.gelangweilt.map((h) => h.name);
    assert.ok(namen.includes(verhalten.aktuell.name), `Zufallswert ${wert} fuehrt ins Leere`);
  }
});
