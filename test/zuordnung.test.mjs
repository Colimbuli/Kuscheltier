import test from 'node:test';
import assert from 'node:assert/strict';
import { hex } from '../src/protokoll.js';
import { KRAFT_STUFEN, RICHTUNGEN_NAMEN, rahmenFuer, stufeKraft } from '../src/zuordnung.js';

const fahrt = (richtung, stufe = 4) => ({ fahrt: { richtung, stufe }, greifer: null });
const voll = { fahrt: 2500, greifer: 2500 };

test('jede Richtung trifft die Antriebsbytes der Testklasse der App', () => {
  // Die Testmethoden der Hersteller-App senden fest verdrahtet:
  //   vorwaerts {0,1}  rueckwaerts {1,0}  rechts {0,0}  links {1,1}
  // Der dritte Motor bleibt bei uns der Greifer, dort laeuft er mit.
  assert.equal(hex(rahmenFuer(fahrt('vor'), voll)), '00 FF FA 01 FF FA 02 00 00');
  assert.equal(hex(rahmenFuer(fahrt('zurueck'), voll)), '01 FF FA 00 FF FA 02 00 00');
  assert.equal(hex(rahmenFuer(fahrt('rechts'), voll)), '00 FF FA 00 FF FA 02 00 00');
  assert.equal(hex(rahmenFuer(fahrt('links'), voll)), '01 FF FA 01 FF FA 02 00 00');
  assert.equal(hex(rahmenFuer(fahrt('vor_rechts'), voll)), '00 FF FA 01 A5 FA 02 00 00');
  assert.equal(hex(rahmenFuer(fahrt('vor_links'), voll)), '00 A5 FA 01 FF FA 02 00 00');
});

test('der belegte Testrahmen der App laesst sich nachbauen', async () => {
  const { TESTRAHMEN_VORWAERTS, stellRahmen } = await import('../src/protokoll.js');
  const nachgebaut = stellRahmen([
    { befehl: 'rueckwaerts', kraft: 1, dauerMs: 2500 },
    { befehl: 'vorwaerts', kraft: 1, dauerMs: 2500 },
    { befehl: 'vorwaerts', kraft: 1, dauerMs: 2500 },
  ]);
  assert.equal(hex(nachgebaut), '00 FF FA 01 FF FA 01 FF FA');
  assert.equal(hex(TESTRAHMEN_VORWAERTS), hex(nachgebaut));
});

test('Stillstand bremst beide Motoren ohne Dauer', () => {
  assert.equal(hex(rahmenFuer({ fahrt: null, greifer: null }, voll)), '02 00 00 02 00 00 02 00 00');
});

test('der Greifer sitzt auf dem dritten Motor', () => {
  assert.equal(hex(rahmenFuer({ fahrt: null, greifer: 'auf' }, voll)), '02 00 00 02 00 00 01 FF FA');
  assert.equal(hex(rahmenFuer({ fahrt: null, greifer: 'zu' }, voll)), '02 00 00 02 00 00 00 FF FA');
});

test('ein vertauschter Drehsinn tauscht die Befehlsbytes', () => {
  const normal = rahmenFuer(fahrt('vor'), voll);
  const getauscht = rahmenFuer(fahrt('vor'), voll, { fahrtGetauscht: true });
  assert.equal(hex(getauscht), '01 FF FA 00 FF FA 02 00 00');
  assert.equal(getauscht[0], normal[3]);
  assert.equal(getauscht[3], normal[0]);

  const greifer = rahmenFuer({ fahrt: null, greifer: 'auf' }, voll, { greiferGetauscht: true });
  assert.equal(hex(greifer), '02 00 00 02 00 00 00 FF FA');
});

test('beim Kurvenfahren bleibt der Drehsinn stimmig', () => {
  // Getauscht muss aus dem Rechtsbogen der Linksbogen werden, nicht ein Rueckwaertsbogen.
  const getauscht = rahmenFuer(fahrt('vor_rechts'), voll, { fahrtGetauscht: true });
  assert.equal(hex(getauscht), '01 FF FA 00 A5 FA 02 00 00');
});

test('die Fahrstufen steigen und starten nicht bei null', () => {
  assert.deepEqual(KRAFT_STUFEN.map((_, i) => stufeKraft(i + 1)), [...KRAFT_STUFEN]);
  assert.ok(stufeKraft(1) >= 0.3, 'Stufe 1 muss einen Motor noch anlaufen lassen');
  for (let s = 2; s <= KRAFT_STUFEN.length; s += 1) {
    assert.ok(stufeKraft(s) > stufeKraft(s - 1), `Stufe ${s} muss kraeftiger sein als ${s - 1}`);
  }
  assert.equal(stufeKraft(KRAFT_STUFEN.length), 1);
  assert.throws(() => stufeKraft(0), RangeError);
  assert.throws(() => stufeKraft(KRAFT_STUFEN.length + 1), RangeError);
});

test('die Restzeit landet im Dauerbyte und wird begrenzt', () => {
  assert.equal(rahmenFuer(fahrt('vor'), { fahrt: 700 })[2], 70);
  assert.equal(rahmenFuer(fahrt('vor'), { fahrt: Infinity })[2], 255);
  assert.equal(rahmenFuer(fahrt('vor'), {})[2], 255, 'ohne Angabe die volle Dauer');
});

test('unbekannte Absichten fliegen auf', () => {
  assert.throws(() => rahmenFuer(fahrt('schraeg'), voll), RangeError);
  assert.throws(() => rahmenFuer({ fahrt: null, greifer: 'halb' }, voll), RangeError);
  assert.ok(RICHTUNGEN_NAMEN.includes('vor'));
});
