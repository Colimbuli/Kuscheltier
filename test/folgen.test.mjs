import test from 'node:test';
import assert from 'node:assert/strict';
import { Folgen, STANDARD } from '../src/folgen.js';
import { RICHTUNGEN_NAMEN } from '../src/zuordnung.js';

const gesicht = (mitteX, groesse = STANDARD.zielGroesse) => ({ gefunden: true, mitteX, groesse });
const nichts = { gefunden: false };

test('ein mittiges Gesicht im richtigen Abstand laesst stehen', () => {
  const f = new Folgen();
  assert.equal(f.takt(gesicht(0), 0), null);
  assert.equal(f.zustand, 'haelt');
});

test('das Tier dreht sich zu der Seite, auf der das Gesicht steht', () => {
  const f = new Folgen();
  assert.deepEqual(f.takt(gesicht(0.5), 0), { richtung: 'rechts', stufe: STANDARD.stufeDrehenDeutlich });
  assert.deepEqual(f.takt(gesicht(-0.5), 0), { richtung: 'links', stufe: STANDARD.stufeDrehenDeutlich });
});

test('leichte Ablage wird sanfter ausgeglichen als starke', () => {
  const f = new Folgen();
  const sanft = f.takt(gesicht(STANDARD.totzoneX + 0.01), 0);
  const deutlich = f.takt(gesicht(STANDARD.starkDanebenX + 0.01), 0);
  assert.ok(sanft.stufe < deutlich.stufe);
});

test('die Totzone verhindert das Pendeln um die Mitte', () => {
  const f = new Folgen();
  for (const x of [0, 0.05, -0.05, STANDARD.totzoneX]) {
    assert.equal(f.takt(gesicht(x), 0), null, `bei ${x} darf nicht gedreht werden`);
  }
});

test('zu weit weg heisst vorfahren, zu nah heisst zurueck', () => {
  const f = new Folgen();
  const weit = f.takt(gesicht(0, STANDARD.zielGroesse - 0.2), 0);
  assert.deepEqual(weit, { richtung: 'vor', stufe: STANDARD.stufeFahren });
  const nah = f.takt(gesicht(0, STANDARD.zielGroesse + 0.2), 0);
  assert.deepEqual(nah, { richtung: 'zurueck', stufe: STANDARD.stufeFahren });
});

test('drehen hat Vorrang vor dem Abstand', () => {
  const f = new Folgen();
  const befund = f.takt(gesicht(0.6, 0.02), 0);
  assert.equal(befund.richtung, 'rechts', 'erst ausrichten, dann naehern');
});

test('ein kurz verlorenes Gesicht wird abgewartet, nicht gesucht', () => {
  const f = new Folgen();
  f.takt(gesicht(0.4), 0);
  assert.equal(f.takt(nichts, 500), null);
  assert.equal(f.zustand, 'wartet');
});

test('bleibt es weg, wird zur zuletzt gesehenen Seite gesucht', () => {
  const f = new Folgen();
  f.takt(gesicht(0.4), 0);
  const suche = f.takt(nichts, STANDARD.verlorenNachMs + 100);
  assert.deepEqual(suche, { richtung: 'rechts', stufe: STANDARD.stufeSuchen });
  assert.equal(f.zustand, 'sucht');

  const g = new Folgen();
  g.takt(gesicht(-0.4), 0);
  assert.equal(g.takt(nichts, STANDARD.verlorenNachMs + 100).richtung, 'links');
});

test('irgendwann wird die Suche aufgegeben', () => {
  const f = new Folgen();
  f.takt(gesicht(0.4), 0);
  const spaet = STANDARD.verlorenNachMs + STANDARD.sucheBisMs + 100;
  assert.equal(f.takt(nichts, spaet), null);
  assert.equal(f.zustand, 'aufgegeben');
});

test('ohne je ein Gesicht gesehen zu haben wird nicht gedreht', () => {
  const f = new Folgen();
  assert.equal(f.takt(nichts, 0), null);
  assert.equal(f.takt(nichts, 60000), null, 'auch nach langer Zeit nicht');
  assert.equal(f.zustand, 'wartet');
});

test('nach dem Zuruecksetzen ist die Vorgeschichte weg', () => {
  const f = new Folgen();
  f.takt(gesicht(0.4), 0);
  f.zuruecksetzen();
  assert.equal(f.takt(nichts, STANDARD.verlorenNachMs + 100), null);
  assert.equal(f.zustand, 'wartet');
});

test('jede erzeugte Richtung kennt die Zuordnung', () => {
  const f = new Folgen();
  const absichten = [
    f.takt(gesicht(0.5), 0), f.takt(gesicht(-0.5), 0),
    f.takt(gesicht(0, 0.02), 0), f.takt(gesicht(0, 0.9), 0),
    (f.takt(gesicht(0.4), 0), f.takt(nichts, STANDARD.verlorenNachMs + 100)),
  ].filter(Boolean);
  assert.ok(absichten.length >= 5);
  for (const a of absichten) {
    assert.ok(RICHTUNGEN_NAMEN.includes(a.richtung), `${a.richtung} kennt zuordnung.js nicht`);
    assert.ok(a.stufe >= 1 && a.stufe <= 4);
  }
});

test('die Zielgroesse passt zu einem Roboter auf dem Fussboden', () => {
  assert.ok(STANDARD.zielGroesse <= 0.2,
    'ein stehender Mensch zeigt aus Bodenhoehe ein kleines Gesicht');
});

test('ein Hindernis haelt das Vorfahren an, nicht das Drehen', () => {
  const f = new Folgen();
  const weit = gesicht(0, STANDARD.zielGroesse - 0.2);
  assert.deepEqual(f.takt(weit, 0, { hindernis: false }).richtung, 'vor');
  assert.equal(f.takt(weit, 0, { hindernis: true }), null);
  assert.equal(f.zustand, 'blockiert');

  const daneben = gesicht(0.5, STANDARD.zielGroesse - 0.2);
  assert.equal(f.takt(daneben, 0, { hindernis: true }).richtung, 'rechts',
    'wegdrehen muss auch vor einem Hindernis erlaubt bleiben');
});

test('ein Hindernis hindert nicht am Zurueckweichen', () => {
  const f = new Folgen();
  const nah = gesicht(0, STANDARD.zielGroesse + 0.2);
  assert.equal(f.takt(nah, 0, { hindernis: true }).richtung, 'zurueck');
});

test('die Zielgroesse laesst sich aus einem Befund uebernehmen', () => {
  const f = new Folgen();
  assert.equal(f.zielAusBefund(gesicht(0, 0.09)), 0.09);
  assert.equal(f.einstellungen.zielGroesse, 0.09);
  assert.equal(f.takt(gesicht(0, 0.09), 0), null, 'der gemessene Abstand gilt als richtig');
});

test('unsinnige Messungen werden nicht uebernommen', () => {
  const f = new Folgen();
  const vorher = f.einstellungen.zielGroesse;
  for (const befund of [null, { gefunden: false }, gesicht(0, 0.001), gesicht(0, 0.95)]) {
    assert.equal(f.zielAusBefund(befund), null);
  }
  assert.equal(f.einstellungen.zielGroesse, vorher);
});
