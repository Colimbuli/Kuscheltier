#!/usr/bin/env node
// Erzeugt die Nutzdaten eines Mould-King-Telegramms zum Abtippen in nRF Connect.
//
//   node werkzeug/telegramm.mjs koppeln 0x123456 0 0
//   node werkzeug/telegramm.mjs entkoppeln 0x123456 0 0
//   node werkzeug/telegramm.mjs roh A0 12 34 56 00 00 00 04 00 00 00 00
//
// In nRF Connect: Reiter ADVERTISER, neues Paket, Manufacturer Data,
// Company ID 0xFF00, Data = die ausgegebene Hex-Folge.

import { HERSTELLER_ID, ausHex, hex, kopplungsTelegramm, nutzdaten } from '../src/mouldking.js';

const [art = 'koppeln', ...rest] = process.argv.slice(2);

let telegramm;
if (art === 'roh') {
  telegramm = ausHex(rest.join(' '));
} else if (art === 'koppeln' || art === 'entkoppeln') {
  const [geraet = '0x123456', box = '0', kanal = '0'] = rest;
  telegramm = kopplungsTelegramm({
    befehl: art,
    geraet: Number(geraet),
    box: Number(box),
    kanal: Number(kanal),
  });
} else {
  console.error(`Unbekannte Art: ${art}. Erlaubt: koppeln, entkoppeln, roh`);
  process.exit(2);
}

console.log(`Klartext        ${hex(telegramm)}`);
console.log(`Company ID      0x${HERSTELLER_ID.toString(16).toUpperCase()}`);
console.log(`Manufacturer    ${hex(nutzdaten(telegramm))}`);
