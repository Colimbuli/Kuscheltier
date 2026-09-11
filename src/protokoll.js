// Protokoll des Clementoni Evolution Robot.
//
// Das Geraet meldet sich als BLE-Peripherie mit dem Namen "EVRobot2"
// (Cypress-Chip, MAC-Praefix 00:A0:50, reines BLE ohne BR/EDR).
//
// Die Konstanten stammen aus QtEvoBot (https://github.com/hasselmm/QtEvoBot),
// dort ermittelt fuer die erste Generation, die sich "Evolution-Robot" nennt.
// Fuer EVRobot2 sind sie noch nicht am Geraet verifiziert - siehe
// doku/protokoll.md fuer den Stand und das Vorgehen zur Verifikation.

export const DIENST_UUID = '0000fff3-0000-1000-8000-00805f9b34fb';
export const MELDUNG_UUID = '0000fff4-0000-1000-8000-00805f9b34fb';
export const SCHREIB_UUID = '0000fff5-0000-1000-8000-00805f9b34fb';

// Standarddienst "Device Information" mit der Firmware-Version als Text.
export const GERAETEINFO_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
export const FIRMWARE_UUID = '00002a26-0000-1000-8000-00805f9b34fb';

export const GERAETE_NAMENSPRAEFIX = 'EVRobot';

// Der Roboter erwartet den Rahmen als Dauerstrom, nicht als Einzelbefehl.
export const SENDE_INTERVALL_MS = 100;

export const RAHMEN_LAENGE = 6;

// Position der einzelnen Stellgroessen im 6-Byte-Rahmen.
export const POS = Object.freeze({
  praeambel: 0,
  fahrt: 1,
  greifer: 2,
  hub: 3,
  klang: 4,
  effekt: 5,
});

export const PRAEAMBEL = 0x58; // ASCII 'X'

export const FAHRT_STOPP = 0x11;
export const FAHRT_STUFEN = 4;
const FAHRT_BASIS = Object.freeze({ vor: 0, zurueck: 4, links: 8, rechts: 12 });
export const FAHRT_RICHTUNGEN = Object.freeze(Object.keys(FAHRT_BASIS));

export const GREIFER_WERTE = Object.freeze({ neutral: 0x40, auf: 0x3c, zu: 0x3d });
export const HUB_WERTE = Object.freeze({ neutral: 0x40, hoch: 0x3e, runter: 0x3f });

export const KLANG_AUS = 0x00;
export const KLANG_BASIS = 21;
export const KLANG_MAX_INDEX = 0xff - KLANG_BASIS;

export const EFFEKT_AUS = 0x00;
export const EFFEKT_HALT = 0x3b; // Index 0 heisst "laufenden Effekt beenden".
export const EFFEKT_MAX_INDEX = 63;
const EFFEKT_VERSATZ = Object.freeze({ 1: 0x35, 2: 0x47 });

export const RUHERAHMEN = Object.freeze([
  PRAEAMBEL, FAHRT_STOPP, GREIFER_WERTE.neutral, HUB_WERTE.neutral, KLANG_AUS, EFFEKT_AUS,
]);

function ganzzahlIm(wert, min, max, name) {
  if (!Number.isInteger(wert) || wert < min || wert > max) {
    throw new RangeError(`${name} muss eine ganze Zahl von ${min} bis ${max} sein, war: ${wert}`);
  }
  return wert;
}

/** Byte fuer die Fahrtrichtung. `richtung === null` bedeutet Stillstand. */
export function fahrtByte(richtung, stufe = 1) {
  if (richtung === null || richtung === undefined) return FAHRT_STOPP;
  const basis = FAHRT_BASIS[richtung];
  if (basis === undefined) {
    throw new RangeError(`unbekannte Richtung: ${richtung} (erlaubt: ${FAHRT_RICHTUNGEN.join(', ')})`);
  }
  return basis + ganzzahlIm(stufe, 1, FAHRT_STUFEN, 'stufe');
}

/** Byte fuer den Greifer: 'auf', 'zu' oder null fuer neutral. */
export function greiferByte(stellung) {
  if (stellung === null || stellung === undefined || stellung === 'neutral') return GREIFER_WERTE.neutral;
  const wert = GREIFER_WERTE[stellung];
  if (wert === undefined) {
    throw new RangeError(`unbekannte Greiferstellung: ${stellung} (erlaubt: auf, zu)`);
  }
  return wert;
}

/** Byte fuer Heben/Senken: 'hoch', 'runter' oder null fuer neutral. */
export function hubByte(richtung) {
  if (richtung === null || richtung === undefined || richtung === 'neutral') return HUB_WERTE.neutral;
  const wert = HUB_WERTE[richtung];
  if (wert === undefined) {
    throw new RangeError(`unbekannte Hubrichtung: ${richtung} (erlaubt: hoch, runter)`);
  }
  return wert;
}

/** Byte fuer einen Klang. `null` schaltet ab. */
export function klangByte(index) {
  if (index === null || index === undefined) return KLANG_AUS;
  return KLANG_BASIS + ganzzahlIm(index, 0, KLANG_MAX_INDEX, 'klangindex');
}

/**
 * Byte fuer einen Effekt. `null` schaltet ab, Index 0 beendet einen laufenden
 * Effekt. Der Versatz haengt an der Firmware-Version des Roboters.
 */
export function effektByte(index, firmware = 2) {
  if (index === null || index === undefined) return EFFEKT_AUS;
  ganzzahlIm(index, 0, EFFEKT_MAX_INDEX, 'effektindex');
  if (index === 0) return EFFEKT_HALT;
  const versatz = EFFEKT_VERSATZ[firmware];
  if (versatz === undefined) {
    throw new RangeError(`unbekannte Firmware-Version: ${firmware} (erlaubt: 1, 2)`);
  }
  return index + versatz;
}

/**
 * Baut den 6-Byte-Rahmen aus einem Stellzustand.
 *
 * @param {{fahrt?: {richtung: string, stufe?: number}|null, greifer?: string|null,
 *          hub?: string|null, klang?: number|null, effekt?: number|null,
 *          firmware?: number}} zustand
 * @returns {Uint8Array}
 */
export function rahmenBauen(zustand = {}) {
  const { fahrt = null, greifer = null, hub = null, klang = null, effekt = null, firmware = 2 } = zustand;
  const rahmen = new Uint8Array(RAHMEN_LAENGE);
  rahmen[POS.praeambel] = PRAEAMBEL;
  rahmen[POS.fahrt] = fahrt ? fahrtByte(fahrt.richtung, fahrt.stufe ?? 1) : FAHRT_STOPP;
  rahmen[POS.greifer] = greiferByte(greifer);
  rahmen[POS.hub] = hubByte(hub);
  rahmen[POS.klang] = klangByte(klang);
  rahmen[POS.effekt] = effektByte(effekt, firmware);
  return rahmen;
}

/** Rahmen als Hex-Zeile fuer Logs: "58 11 40 40 00 00". */
export function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

/**
 * Meldungen des Roboters auf der Notify-Characteristic sind ASCII-Text der
 * Form "V3Play" / "V3End".
 *
 * @returns {{klang: number, zustand: 'start'|'ende'}|null}
 */
export function meldungLesen(rohdaten) {
  const text = typeof rohdaten === 'string'
    ? rohdaten
    : new TextDecoder('latin1').decode(rohdaten);
  const treffer = /V(\d+)(Play|End)/.exec(text);
  if (!treffer) return null;
  return { klang: Number(treffer[1]), zustand: treffer[2] === 'Play' ? 'start' : 'ende' };
}
