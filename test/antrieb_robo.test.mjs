import test from 'node:test';
import assert from 'node:assert/strict';
import { AUFFRISCHUNG_MS, RoboAntrieb } from '../src/antrieb_robo.js';
import { TON_STOPP, hex } from '../src/protokoll.js';

function aufbau({ verbunden = true } = {}) {
  let uhr = 0;
  const rahmen = [];
  const toene = [];
  const geraet = {
    get verbunden() { return verbunden; },
    sende: (r) => { rahmen.push({ zeit: uhr, hex: hex(r) }); return Promise.resolve(); },
    spieleTon: (n) => { toene.push({ zeit: uhr, ton: n }); return Promise.resolve(); },
    beendeTon: () => { toene.push({ zeit: uhr, ton: TON_STOPP }); return Promise.resolve(); },
  };
  const antrieb = new RoboAntrieb({ geraet, jetzt: () => uhr });
  return { antrieb, rahmen, toene, vor: (ms) => { uhr += ms; return uhr; }, zeit: () => uhr };
}

test('ohne Absichtswechsel geht nichts hinaus', () => {
  const { antrieb, rahmen, vor, zeit } = aufbau();
  antrieb.takt(zeit());
  assert.equal(rahmen.length, 1, 'der erste Rahmen geht immer raus');
  antrieb.takt(vor(100));
  antrieb.takt(vor(100));
  assert.equal(rahmen.length, 1, 'das blosse Herunterzaehlen der Dauer ist kein neuer Befehl');
});

test('eine Fahrt wird aufgefrischt und endet mit einer Bremse', () => {
  const { antrieb, rahmen, vor, zeit } = aufbau();
  antrieb.fahre('vor', 4, 2000);
  antrieb.takt(zeit());
  assert.equal(rahmen.at(-1).hex, '01 FF C8 00 FF C8 02 00 00');

  for (let i = 0; i < 25; i += 1) antrieb.takt(vor(100));

  const zeiten = rahmen.map((r) => r.zeit);
  assert.ok(rahmen.length >= 3 && rahmen.length <= 5,
    `erwartet werden wenige Pakete, waren ${rahmen.length}`);
  assert.ok(zeiten.includes(AUFFRISCHUNG_MS), 'nach der Auffrischungszeit kommt ein neuer Rahmen');
  assert.equal(rahmen.at(-1).hex, '02 00 00 02 00 00 02 00 00', 'am Ende wird gebremst');
  assert.equal(rahmen.at(-1).zeit, 2000, 'und zwar genau beim Ablaufen der Frist');
});

test('die Restdauer schrumpft mit der Zeit', () => {
  const { antrieb, rahmen, vor, zeit } = aufbau();
  antrieb.fahre('vor', 4, 2500);
  antrieb.takt(zeit());
  const ersteDauer = parseInt(rahmen.at(-1).hex.split(' ')[2], 16);
  antrieb.takt(vor(AUFFRISCHUNG_MS));
  const zweiteDauer = parseInt(rahmen.at(-1).hex.split(' ')[2], 16);
  assert.ok(zweiteDauer < ersteDauer, 'der Roboter soll nicht laenger fahren als beabsichtigt');
});

test('Toene werden nur bei Aenderung ausgeloest, nicht im Takt', () => {
  const { antrieb, toene, vor, zeit } = aufbau();
  antrieb.spiele(18, 400);
  antrieb.takt(zeit());
  antrieb.takt(vor(100));
  antrieb.takt(vor(100));
  assert.deepEqual(toene.map((t) => t.ton), [18], 'ein Ton, nicht drei');

  antrieb.takt(vor(300));
  assert.deepEqual(toene.map((t) => t.ton), [18, TON_STOPP], 'am Ende wird abgeschaltet');
});

test('ohne Verbindung wird nichts gesendet', () => {
  const { antrieb, rahmen, toene, zeit } = aufbau({ verbunden: false });
  antrieb.fahre('vor', 4, 1000).spiele(1, 300);
  antrieb.takt(zeit());
  assert.equal(rahmen.length, 0);
  assert.equal(toene.length, 0);
});

test('der Not-Aus bremst und sperrt', () => {
  const { antrieb, rahmen, zeit } = aufbau();
  antrieb.fahre('vor', 4, 2000);
  antrieb.takt(zeit());
  antrieb.notAus();
  assert.equal(rahmen.at(-1).hex, '02 00 00 02 00 00 02 00 00');
  assert.equal(antrieb.gesperrt, true);
});

test('ohne Geraet gibt es keinen Antrieb', () => {
  assert.throws(() => new RoboAntrieb({}), TypeError);
});
