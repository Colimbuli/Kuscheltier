#!/usr/bin/env node
// Liest einen Bluetooth-HCI-Mitschnitt und entschluesselt die
// Mould-King-Telegramme darin.
//
//   node werkzeug/snoop-lesen.mjs btsnoop_hci.log
//   node werkzeug/snoop-lesen.mjs btsnoop_hci.log --alle
//
// Gesucht werden die Befehle, mit denen das Handy seine Advertising-Nutzdaten
// setzt. Deren Herstellerdaten laufen rueckwaerts durch die Verschluesselung,
// heraus faellt der Klartextrahmen.

import { readFileSync } from 'node:fs';
import { HERSTELLER_ID, hex, klartext } from '../src/mouldking.js';

const KOPF_LAENGE = 16;
const SATZ_KOPF = 24;
const H4_BEFEHL = 0x01;
const OPCODE_ADV_DATA = 0x2008;
const OPCODE_ADV_DATA_ERWEITERT = 0x2037;
const OPCODE_SCAN_ANTWORT = 0x2009;

function saetze(puffer) {
  if (puffer.subarray(0, 8).toString('latin1') !== 'btsnoop\0') {
    throw new Error('Das ist kein btsnoop-Mitschnitt.');
  }
  const liste = [];
  let p = KOPF_LAENGE;
  while (p + SATZ_KOPF <= puffer.length) {
    const enthalten = puffer.readUInt32BE(p + 4);
    const flaggen = puffer.readUInt32BE(p + 8);
    const zeit = puffer.readBigUInt64BE(p + 16);
    const daten = puffer.subarray(p + SATZ_KOPF, p + SATZ_KOPF + enthalten);
    if (daten.length < enthalten) break;
    liste.push({ gesendet: (flaggen & 1) === 0, zeit, daten });
    p += SATZ_KOPF + enthalten;
  }
  return liste;
}

/** Die Advertising-Nutzdaten aus einem HCI-Befehl, oder null. */
function advertisingDaten(daten) {
  if (daten.length < 4 || daten[0] !== H4_BEFEHL) return null;
  const opcode = daten.readUInt16LE(1);
  if (opcode === OPCODE_ADV_DATA || opcode === OPCODE_SCAN_ANTWORT) {
    const laenge = daten[4];
    return { opcode, roh: daten.subarray(5, 5 + laenge) };
  }
  if (opcode === OPCODE_ADV_DATA_ERWEITERT) {
    const laenge = daten[7];
    return { opcode, roh: daten.subarray(8, 8 + laenge) };
  }
  return null;
}

/** Zerlegt einen Advertising-Datensatz in seine Abschnitte. */
function abschnitte(roh) {
  const liste = [];
  let p = 0;
  while (p < roh.length) {
    const laenge = roh[p];
    if (laenge === 0 || p + laenge >= roh.length + 1) break;
    liste.push({ typ: roh[p + 1], inhalt: roh.subarray(p + 2, p + 1 + laenge) });
    p += 1 + laenge;
  }
  return liste;
}

const [pfad, ...schalter] = process.argv.slice(2);
if (!pfad) {
  console.error('Aufruf: node werkzeug/snoop-lesen.mjs <btsnoop_hci.log> [--alle]');
  process.exit(2);
}
const alle = schalter.includes('--alle');

const liste = saetze(readFileSync(pfad));
console.log(`${liste.length} Saetze gelesen.\n`);

let erste = null;
let letzterKlartext = null;
let gefunden = 0;

for (const satz of liste) {
  if (!satz.gesendet) continue;
  const adv = advertisingDaten(satz.daten);
  if (!adv) continue;

  for (const a of abschnitte(adv.roh)) {
    if (a.typ !== 0xff || a.inhalt.length < 3) continue;
    const hersteller = a.inhalt[0] | (a.inhalt[1] << 8);
    if (!alle && hersteller !== HERSTELLER_ID) continue;

    const nutz = a.inhalt.subarray(2);
    let gelesen;
    try {
      gelesen = klartext(nutz);
    } catch {
      continue;
    }
    const zeile = hex(gelesen.daten);
    if (zeile === letzterKlartext) continue; // Dauerrundruf nicht mitschreiben
    letzterKlartext = zeile;
    gefunden += 1;

    if (erste === null) erste = satz.zeit;
    const ms = Number((satz.zeit - erste) / 1000n);
    const marke = gelesen.crcStimmt && gelesen.vorspannStimmt ? ' ' : '?';
    console.log(
      `${String(ms).padStart(8)} ms ${marke} 0x${hersteller.toString(16).toUpperCase()}  ${zeile}`,
    );
  }
}

console.log(`\n${gefunden} unterschiedliche Telegramme.`);
if (gefunden === 0) {
  console.log('Nichts gefunden. Mit --alle laufen lassen, dann werden alle');
  console.log('Hersteller-IDs versucht - vielleicht sendet die App unter einer anderen.');
}
