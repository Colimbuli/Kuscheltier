import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAUER_MAX_MS, HINDERNIS_SCHWELLE, MESSUNG_A_GRENZE, MESSUNG_B_GRENZE, MOTOR_HALT,
  RAHMEN_LAENGE, TOENE, TON_MAX_NUMMER, TON_STOPP, dauerByte, hex, kraftByte, leererRahmen,
  rahmenAus, rahmenMitByte, sensorenLesen, stellRahmen, tonByte,
} from '../src/protokoll.js';

const motor = (befehl, kraft, dauerMs) => ({ befehl, kraft, dauerMs });

test('die dokumentierten Beispielrahmen entstehen Byte fuer Byte', () => {
  const halt = { ...MOTOR_HALT };
  assert.equal(
    hex(stellRahmen([motor('vorwaerts', 1, 2500), motor('rueckwaerts', 1, 2500), halt])),
    '01 FF FA 00 FF FA 02 00 00', 'vorwaerts');
  assert.equal(
    hex(stellRahmen([motor('rueckwaerts', 1, 2500), motor('vorwaerts', 1, 2500), halt])),
    '00 FF FA 01 FF FA 02 00 00', 'rueckwaerts');
  assert.equal(
    hex(stellRahmen([motor('vorwaerts', 1, 2500), motor('rueckwaerts', 0.65, 2500), halt])),
    '01 FF FA 00 A5 FA 02 00 00', 'vorwaerts Rechtsbogen');
  assert.equal(
    hex(stellRahmen([motor('bremse', 0, 2500), motor('bremse', 0, 2500), halt])),
    '02 00 FA 02 00 FA 02 00 00', 'Halt');
});

test('Kraft wird abgeschnitten, nicht gerundet - wie in der App', () => {
  assert.equal(kraftByte(0.65), 165, '0.65 * 255 = 165.75 -> 165 = 0xA5');
  assert.equal(kraftByte(0), 0);
  assert.equal(kraftByte(1), 255);
  assert.equal(kraftByte(2), 255, 'ueber 1 wird begrenzt');
  assert.equal(kraftByte(-1), 0, 'unter 0 wird begrenzt');
  assert.throws(() => kraftByte('viel'), RangeError);
});

test('die Dauer zaehlt in Hundertstelsekunden und endet bei 2,55 s', () => {
  assert.equal(dauerByte(0), 0);
  assert.equal(dauerByte(800), 80);
  assert.equal(dauerByte(2500), 250);
  assert.equal(dauerByte(DAUER_MAX_MS), 255);
  assert.equal(dauerByte(60000), 255, 'laenger geht nicht');
  assert.equal(dauerByte(-100), 0);
});

test('unsinnige Motorangaben fliegen auf', () => {
  assert.throws(() => stellRahmen([MOTOR_HALT, MOTOR_HALT]), RangeError);
  assert.throws(() => stellRahmen([MOTOR_HALT, MOTOR_HALT, motor('schweben', 1, 0)]), RangeError);
});

test('das Tonbyte traegt die Nummer, Bit 7 die Schleife', () => {
  assert.equal(tonByte(0), 0x00);
  assert.equal(tonByte(18), 18);
  assert.equal(tonByte(17, true), 17 | 0x80);
  assert.equal(TON_STOPP, 0xff);
  assert.notEqual(tonByte(TON_MAX_NUMMER, true), TON_STOPP, 'kein Ton darf Stopp bedeuten');
  assert.throws(() => tonByte(127), RangeError);
  assert.throws(() => tonByte(-1), RangeError);
});

test('die Tonliste kennt die im Verhalten benutzten Nummern', () => {
  for (const nummer of [0, 1, 14, 16, 17, 18, 19, 20, 21]) {
    assert.ok(TOENE[nummer], `Ton ${nummer} fehlt in der Liste`);
  }
});

test('der Sensorrahmen wird zu zwei IR-Sensoren und einem Taster', () => {
  // Genau der Wert, den nRF Connect am Geraet gezeigt hat.
  const gemessen = Uint8Array.of(0xbe, 0x01, 0x7e, 0x03, 0xb0, 0x01, 0xb4, 0x00, 0x00);
  const { ir, taster } = sensorenLesen(gemessen);
  assert.equal(taster, false);
  assert.deepEqual(ir.map((s) => s.a), [446, 894]);
  assert.deepEqual(ir.map((s) => s.b), [432, 180]);
  assert.deepEqual(ir.map((s) => s.differenz), [14, 714]);
  assert.deepEqual(ir.map((s) => s.hindernis), [false, true]);
});

test('zu helles Umgebungslicht macht eine Messung unbrauchbar', () => {
  const bau = (a, b) => {
    const r = new Uint8Array(9);
    new DataView(r.buffer).setUint16(0, a, true);
    new DataView(r.buffer).setUint16(4, b, true);
    return r;
  };
  assert.equal(sensorenLesen(bau(1000, 100)).ir[0].brauchbar, true);
  assert.equal(sensorenLesen(bau(1000, MESSUNG_B_GRENZE + 1)).ir[0].brauchbar, false);
  assert.equal(sensorenLesen(bau(MESSUNG_A_GRENZE + 1, 100)).ir[0].brauchbar, false);
  assert.equal(sensorenLesen(bau(MESSUNG_A_GRENZE + 1, 100)).ir[0].hindernis, false,
    'eine unbrauchbare Messung meldet kein Hindernis');
});

test('die Hindernisschwelle wirkt genau an der Grenze', () => {
  const bau = (differenz) => {
    const r = new Uint8Array(9);
    new DataView(r.buffer).setUint16(0, 500 + differenz, true);
    new DataView(r.buffer).setUint16(4, 500, true);
    return r;
  };
  assert.equal(sensorenLesen(bau(HINDERNIS_SCHWELLE)).ir[0].hindernis, false);
  assert.equal(sensorenLesen(bau(HINDERNIS_SCHWELLE + 1)).ir[0].hindernis, true);
});

test('der Taster wird gelesen', () => {
  const r = new Uint8Array(9);
  r[8] = 1;
  assert.equal(sensorenLesen(r).taster, true);
});

test('ein zu kurzer Sensorrahmen fliegt auf', () => {
  assert.throws(() => sensorenLesen(Uint8Array.of(1, 2, 3)), RangeError);
});

test('die Werkzeuge der Sondierung bleiben erhalten', () => {
  assert.equal(leererRahmen().length, RAHMEN_LAENGE);
  assert.equal(hex(rahmenMitByte(4, 0x80)), '00 00 00 00 80 00 00 00 00');
  assert.throws(() => rahmenMitByte(RAHMEN_LAENGE, 1), RangeError);
  assert.throws(() => rahmenAus([1, 2, 3]), RangeError);
});
