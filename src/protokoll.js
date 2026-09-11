// Das Funkprotokoll des Roboters (BLE-Name EVRobot2, Cypress-Chip).
//
// GATT am Geraet gemessen, die Bedeutung der Bytes aus der Hersteller-App
// gelesen - siehe doku/protokoll.md. Reine Funktionen, kein Bluetooth.

export const DIENST_UUID = '2f5772da-18e3-4f2e-82ab-910e81b9f232';

/** 9 Byte, NOTIFY + READ: zwei IR-Sensoren zu je zwei Messungen und ein Taster. */
export const SENSOR_UUID = '5e366294-5436-4356-a009-7ccd1e03526d';

/** 9 Byte, READ + WRITE + WRITE NO RESPONSE: drei Motoren zu je drei Byte. */
export const STELL_UUID = '165aecf8-ed44-45e7-aae4-63789234a30f';

/** 1 Byte, READ + WRITE: Tonausgabe. */
export const TON_UUID = 'cc9151df-c5eb-477a-a793-287a5500fc81';

/** 1 Byte. Die Hersteller-App benutzt diesen Kanal nicht; Bedeutung unbekannt. */
export const RESERVE_UUID = '26c8d1e9-f4ae-4f76-97ea-8576d5e23079';

export const GERAETE_NAMENSPRAEFIX = 'EVRobot';

export const RAHMEN_LAENGE = 9;
export const SENSOR_LAENGE = 9;
export const MOTOR_ANZAHL = 3;
export const BYTES_JE_MOTOR = 3;

/**
 * Nachsenden, um eine Bewegung ueber die im Rahmen mitgegebene Dauer hinaus zu
 * halten. Kein Dauerstrom noetig: der Roboter haelt nach der Dauer von selbst an.
 */
export const SENDE_INTERVALL_MS = 100;

// --- Motoren ---------------------------------------------------------------

export const BEFEHL = Object.freeze({ rueckwaerts: 0, vorwaerts: 1, bremse: 2 });
export const BEFEHL_NAMEN = Object.freeze(Object.keys(BEFEHL));

export const KRAFT_MAX = 255;
export const DAUER_EINHEIT_MS = 10;
export const DAUER_MAX = 255;
export const DAUER_MAX_MS = DAUER_MAX * DAUER_EINHEIT_MS; // 2550

/** Ein stehender Motor: bremsen, keine Kraft, keine Dauer. */
export const MOTOR_HALT = Object.freeze({ befehl: 'bremse', kraft: 0, dauerMs: 0 });

const begrenzen = (wert, min, max) => Math.min(max, Math.max(min, wert));

/** Kraft als Anteil von 0 bis 1 in ein Byte. Abgeschnitten wie in der App. */
export function kraftByte(anteil) {
  if (typeof anteil !== 'number' || Number.isNaN(anteil)) {
    throw new RangeError(`Kraft muss eine Zahl von 0 bis 1 sein, war: ${anteil}`);
  }
  return Math.floor(begrenzen(anteil, 0, 1) * KRAFT_MAX);
}

/** Dauer in Millisekunden in Hundertstelsekunden, hoechstens 2,55 s. */
export function dauerByte(millisekunden) {
  if (typeof millisekunden !== 'number' || Number.isNaN(millisekunden)) {
    throw new RangeError(`Dauer muss eine Zahl sein, war: ${millisekunden}`);
  }
  return Math.floor(begrenzen(millisekunden, 0, DAUER_MAX_MS) / DAUER_EINHEIT_MS);
}

export function befehlByte(name) {
  const wert = BEFEHL[name];
  if (wert === undefined) {
    throw new RangeError(`unbekannter Motorbefehl: ${name} (erlaubt: ${BEFEHL_NAMEN.join(', ')})`);
  }
  return wert;
}

/**
 * Baut den 9-Byte-Stellrahmen aus drei Motorabsichten.
 * @param {{befehl: string, kraft: number, dauerMs: number}[]} motoren
 * @returns {Uint8Array}
 */
export function stellRahmen(motoren) {
  if (!Array.isArray(motoren) || motoren.length !== MOTOR_ANZAHL) {
    throw new RangeError(`es braucht genau ${MOTOR_ANZAHL} Motoren, bekam: ${motoren?.length}`);
  }
  const rahmen = new Uint8Array(RAHMEN_LAENGE);
  motoren.forEach((motor, i) => {
    const { befehl = 'bremse', kraft = 0, dauerMs = 0 } = motor ?? {};
    const versatz = i * BYTES_JE_MOTOR;
    rahmen[versatz] = befehlByte(befehl);
    rahmen[versatz + 1] = kraftByte(kraft);
    rahmen[versatz + 2] = dauerByte(dauerMs);
  });
  return rahmen;
}

export function leererRahmen() {
  return new Uint8Array(RAHMEN_LAENGE);
}

/** Rahmen, bei dem genau ein Byte gesetzt ist - das Werkzeug der Sondierung. */
export function rahmenMitByte(index, wert) {
  if (!Number.isInteger(index) || index < 0 || index >= RAHMEN_LAENGE) {
    throw new RangeError(`Byte-Index muss 0 bis ${RAHMEN_LAENGE - 1} sein, war: ${index}`);
  }
  if (!Number.isInteger(wert) || wert < 0 || wert > 255) {
    throw new RangeError(`Bytewert muss 0 bis 255 sein, war: ${wert}`);
  }
  const rahmen = leererRahmen();
  rahmen[index] = wert;
  return rahmen;
}

export function rahmenAus(werte) {
  if (werte.length !== RAHMEN_LAENGE) {
    throw new RangeError(`Rahmen braucht ${RAHMEN_LAENGE} Bytes, bekam: ${werte.length}`);
  }
  return Uint8Array.from(werte);
}

// --- Ton -------------------------------------------------------------------

export const TON_SCHLEIFE = 0x80;
export const TON_STOPP = 0xff;
/** 127 mit Schleifenbit waere 0xFF und damit das Stopp-Kommando. */
export const TON_MAX_NUMMER = 126;

/** Die Toene, die die Hersteller-App kennt. Luecken sind dort ebenfalls leer. */
export const TOENE = Object.freeze({
  0: 'Roboterfunk 1',
  1: 'Roboterfunk 2',
  2: 'elektronischer Ton',
  3: 'Tuerklingel',
  4: 'Telefontastatur',
  5: 'Radar',
  6: 'Alarmanlage scharf',
  7: 'altes Telefon',
  10: 'Radio',
  14: 'Schlagwerk',
  15: 'Alarm',
  16: 'Summer',
  17: 'Motor',
  18: 'Triumph',
  19: 'Hupe',
  20: 'Uhr',
  21: 'Fehlschlag',
});

export function tonByte(nummer, schleife = false) {
  if (!Number.isInteger(nummer) || nummer < 0 || nummer > TON_MAX_NUMMER) {
    throw new RangeError(`Tonnummer muss 0 bis ${TON_MAX_NUMMER} sein, war: ${nummer}`);
  }
  return schleife ? nummer | TON_SCHLEIFE : nummer;
}

// --- Sensoren --------------------------------------------------------------

/** Ab dieser Differenz gilt ein Hindernis als erkannt. */
export const HINDERNIS_SCHWELLE = 90;
/** Oberhalb dieser Werte gilt die Messung als von Fremdlicht verdorben. */
export const MESSUNG_B_GRENZE = 1500;
export const MESSUNG_A_GRENZE = 2800;

/**
 * Der Sensorrahmen: zwei IR-Sensoren, jeder zweimal gemessen (A mit
 * eingeschalteter Diode, B ohne), plus ein Taster. Ausgewertet wird die
 * Differenz - das ist das reflektierte Eigenlicht ohne Fremdlichtanteil.
 *
 * Byte 0-1 IR0-A, 2-3 IR1-A, 4-5 IR0-B, 6-7 IR1-B, 8 Taster.
 */
export function sensorenLesen(rohdaten) {
  const bytes = rohdaten instanceof Uint8Array ? rohdaten : new Uint8Array(rohdaten);
  if (bytes.length < SENSOR_LAENGE) {
    throw new RangeError(`Sensorrahmen braucht ${SENSOR_LAENGE} Bytes, bekam: ${bytes.length}`);
  }
  const sicht = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ir = [0, 1].map((i) => {
    const a = sicht.getUint16(i * 2, true);
    const b = sicht.getUint16(4 + i * 2, true);
    const brauchbar = b <= MESSUNG_B_GRENZE && a <= MESSUNG_A_GRENZE;
    const differenz = a - b;
    return { a, b, differenz, brauchbar, hindernis: brauchbar && differenz > HINDERNIS_SCHWELLE };
  });
  return { ir, taster: bytes[8] !== 0 };
}

// --- Anzeige ---------------------------------------------------------------

/** Bytes als Hex-Zeile fuer Logs: "01 FF FA 00 FF FA 02 00 00". */
export function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
