import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RAHMEN_LAENGE, hex, leererRahmen, rahmenAus, rahmenMitByte, sensorenLesen,
} from '../src/protokoll.js';

test('der Stellrahmen ist neun Bytes lang und startet auf null', () => {
  const rahmen = leererRahmen();
  assert.equal(rahmen.length, RAHMEN_LAENGE);
  assert.equal(hex(rahmen), '00 00 00 00 00 00 00 00 00');
});

test('ein Sondierungsrahmen setzt genau ein Byte', () => {
  assert.equal(hex(rahmenMitByte(0, 0xff)), 'FF 00 00 00 00 00 00 00 00');
  assert.equal(hex(rahmenMitByte(4, 0x80)), '00 00 00 00 80 00 00 00 00');
  assert.equal(hex(rahmenMitByte(8, 0x01)), '00 00 00 00 00 00 00 00 01');
});

test('unsinnige Sondierungsrahmen fliegen auf', () => {
  assert.throws(() => rahmenMitByte(-1, 1), RangeError);
  assert.throws(() => rahmenMitByte(RAHMEN_LAENGE, 1), RangeError);
  assert.throws(() => rahmenMitByte(0, 256), RangeError);
  assert.throws(() => rahmenMitByte(0, -1), RangeError);
  assert.throws(() => rahmenAus([1, 2, 3]), RangeError);
});

test('der Sensorrahmen wird als vier 16-Bit-Werte little-endian gelesen', () => {
  // Genau der Wert, den nRF Connect am Geraet gezeigt hat.
  const gemessen = Uint8Array.of(0xbe, 0x01, 0x7e, 0x03, 0xb0, 0x01, 0xb4, 0x00, 0x00);
  const { kanaele, status } = sensorenLesen(gemessen);
  assert.deepEqual(kanaele, [446, 894, 432, 180]);
  assert.equal(status, 0);
  assert.ok(kanaele.every((w) => w < 1024), 'alle Kanaele passen in einen 10-Bit-Wandler');
});

test('ein zu kurzer Sensorrahmen fliegt auf', () => {
  assert.throws(() => sensorenLesen(Uint8Array.of(1, 2, 3)), RangeError);
});

test('Hex-Ausgabe ist zweistellig und in Grossbuchstaben', () => {
  assert.equal(hex(Uint8Array.of(0x00, 0x0f, 0xa0, 0xff)), '00 0F A0 FF');
});
