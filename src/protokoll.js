// Das Funkprotokoll des EVRobot2 (Clementoni, Cypress-Chip).
//
// Am Geraet gemessen, nicht geraten - siehe doku/protokoll.md. Was die neun
// Bytes des Stellrahmens bedeuten, ist noch offen; genau dafuer gibt es das
// Labor in dieser Anwendung.

export const DIENST_UUID = '2f5772da-18e3-4f2e-82ab-910e81b9f232';

/** 9 Byte, NOTIFY + READ: vier Sensorwerte und ein Statusbyte. */
export const SENSOR_UUID = '5e366294-5436-4356-a009-7ccd1e03526d';

/** 9 Byte, READ + WRITE + WRITE NO RESPONSE: die Stellbefehle. */
export const STELL_UUID = '165aecf8-ed44-45e7-aae4-63789234a30f';

/** Je 1 Byte, Bedeutung unbekannt - Verdacht: Betriebsart oder Freigabe. */
export const SCHALTER_A_UUID = 'cc9151df-c5eb-477a-a793-287a5500fc81';
export const SCHALTER_B_UUID = '26c8d1e9-f4ae-4f76-97ea-8576d5e23079';

export const GERAETE_NAMENSPRAEFIX = 'EVRobot';

export const RAHMEN_LAENGE = 9;
export const SENSOR_LAENGE = 9;

/** Anzahl der 16-Bit-Sensorkanaele im Sensorrahmen. */
export const SENSOR_KANAELE = 4;

/** Wiederholrate, falls sich zeigt, dass der Roboter einen Dauerstrom braucht. */
export const SENDE_INTERVALL_MS = 100;

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

/**
 * Der Sensorrahmen: vier 16-Bit-Werte little-endian, dann ein Statusbyte.
 * Die gemessenen Werte lagen alle unter 1024, was auf einen 10-Bit-Wandler
 * hindeutet. Welcher Kanal welcher Sensor ist, ist noch offen.
 */
export function sensorenLesen(rohdaten) {
  const bytes = rohdaten instanceof Uint8Array ? rohdaten : new Uint8Array(rohdaten);
  if (bytes.length < SENSOR_LAENGE) {
    throw new RangeError(`Sensorrahmen braucht ${SENSOR_LAENGE} Bytes, bekam: ${bytes.length}`);
  }
  const sicht = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kanaele = [];
  for (let i = 0; i < SENSOR_KANAELE; i += 1) kanaele.push(sicht.getUint16(i * 2, true));
  return { kanaele, status: bytes[SENSOR_KANAELE * 2] };
}

/** Bytes als Hex-Zeile fuer Logs: "58 11 40 40 00 00". */
export function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
