import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BEFEHL, HERSTELLER_ID, TELEGRAMM_LAENGE, ausHex, hex, klartext, kopplungsTelegramm,
  nutzdaten, pruefsumme, spiegele8, spiegele16,
} from '../src/mouldking.js';

/**
 * Die Vektoren aus der Analyse der Hersteller-App. Sie sind der ganze Grund,
 * warum diese Umsetzung nicht geraten ist: stimmt auch nur ein Byte nicht,
 * faellt der Test um.
 */
const VEKTOREN = [
  {
    name: 'Pruefvektor, alles null',
    telegramm: new Uint8Array(12),
    crc: 0x0b5a,
    roh: '6D B6 43 CF 7E 8F 47 11 E5 1D FE B8 51 FA 2A B4 E7 D4 0C B6 74 2D',
  },
  {
    name: 'koppeln, Geraet 0x123456, Box 0, Kanal 0',
    telegramm: kopplungsTelegramm({ geraet: 0x123456 }),
    crc: 0x0ace,
    roh: '6D B6 43 CF 7E 8F 47 11 45 0F CA EE 51 FA 2A B0 E7 D4 0C B6 E0 2C',
  },
  {
    name: 'koppeln, Box 1',
    telegramm: kopplungsTelegramm({ geraet: 0x123456, box: 1 }),
    crc: 0x7dfe,
    roh: '6D B6 43 CF 7E 8F 47 11 45 0F CA EE 51 FA 2A BC E7 D4 0C B6 D0 5B',
  },
  {
    name: 'koppeln, Kanal 1',
    telegramm: kopplungsTelegramm({ geraet: 0x123456, kanal: 1 }),
    crc: 0x018a,
    roh: '6D B6 43 CF 7E 8F 47 11 45 0F CA EE 51 FA 2A B1 E7 D4 0C B6 A4 27',
  },
  {
    name: 'entkoppeln',
    telegramm: kopplungsTelegramm({ befehl: 'entkoppeln', geraet: 0x123456 }),
    crc: 0x5dae,
    roh: '6D B6 43 CF 7E 8F 47 11 05 0F CA EE 51 FA 2A B0 E7 D4 0C B6 80 7B',
  },
];

test('jedes Telegramm ergibt genau die Nutzdaten aus der App', () => {
  for (const v of VEKTOREN) {
    assert.equal(hex(nutzdaten(v.telegramm)), v.roh, v.name);
  }
});

test('die Pruefsumme trifft die Werte aus der App', () => {
  for (const v of VEKTOREN) {
    assert.equal(pruefsumme([0xc1, 0xc2, 0xc3, 0xc4, 0xc5], v.telegramm), v.crc, v.name);
  }
});

test('die ersten acht Bytes sind immer gleich', () => {
  // Sie entstehen aus den drei Konstanten und der festen Adresse - ein guter
  // erster Pruefstein, wenn ein Mitschnitt gar nicht passen will.
  for (const v of VEKTOREN) {
    assert.equal(v.roh.slice(0, 23), '6D B6 43 CF 7E 8F 47 11', v.name);
  }
});

test('aus den Nutzdaten laesst sich der Klartext zurueckgewinnen', () => {
  for (const v of VEKTOREN) {
    const zurueck = klartext(ausHex(v.roh));
    assert.equal(hex(zurueck.daten), hex(v.telegramm), v.name);
    assert.equal(hex(zurueck.adresse), 'C1 C2 C3 C4 C5', v.name);
    assert.equal(zurueck.crc, v.crc, v.name);
    assert.equal(zurueck.crcStimmt, true, v.name);
    assert.equal(zurueck.vorspannStimmt, true, v.name);
  }
});

test('der Rueckweg erkennt beschaedigte Mitschnitte', () => {
  const roh = ausHex(VEKTOREN[1].roh);
  roh[12] ^= 0x01;
  const zurueck = klartext(roh);
  assert.equal(zurueck.crcStimmt, false, 'ein gekipptes Bit muss auffallen');
});

test('der Rueckweg funktioniert fuer beliebige Telegrammlaengen', () => {
  for (const laenge of [1, 8, 10, 12, 18, 20]) {
    const telegramm = Uint8Array.from({ length: laenge }, (_, i) => (i * 37 + 11) & 0xff);
    const zurueck = klartext(nutzdaten(telegramm));
    assert.equal(hex(zurueck.daten), hex(telegramm), `Laenge ${laenge}`);
    assert.equal(zurueck.crcStimmt, true, `Laenge ${laenge}`);
  }
});

test('das Kopplungstelegramm ist zwoelf Byte lang und richtig belegt', () => {
  const t = kopplungsTelegramm({ geraet: 0xabcdef, box: 2, kanal: 3 });
  assert.equal(t.length, TELEGRAMM_LAENGE);
  assert.equal(t[0], BEFEHL.koppeln);
  assert.equal(hex(t.slice(1, 4)), 'AB CD EF', 'Geraetekennung big endian');
  assert.equal(hex(t.slice(4, 7)), '00 00 00', 'dieses Feld bleibt null');
  assert.equal(t[7], ((2 + 1) << 2) | 3);
  assert.equal(hex(t.slice(8)), '00 00 00 00', 'die letzten vier Byte bleiben null');
});

test('unsinnige Angaben fliegen auf', () => {
  assert.throws(() => kopplungsTelegramm({ geraet: -1 }), RangeError);
  assert.throws(() => kopplungsTelegramm({ geraet: 0x1000000 }), RangeError);
  assert.throws(() => kopplungsTelegramm({ geraet: 1, kanal: 4 }), RangeError);
  assert.throws(() => kopplungsTelegramm({ geraet: 1, box: 62 }), RangeError);
  assert.throws(() => kopplungsTelegramm({ geraet: 1, befehl: 'schuetteln' }), RangeError);
  assert.throws(() => klartext(new Uint8Array(3)), RangeError);
});

test('die Bitspiegelungen stimmen', () => {
  assert.equal(spiegele8(0x01), 0x80);
  assert.equal(spiegele8(0xa0), 0x05);
  assert.equal(spiegele16(0x0001), 0x8000);
  assert.equal(HERSTELLER_ID, 0xff00);
});
