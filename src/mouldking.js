// Das Funktelegramm der Mould-King-Akkubox.
//
// Die Box laesst sich nicht verbinden - sie lauscht nur auf Advertising-Pakete.
// Deren Nutzdaten sind kein einfacher Befehl, sondern ein vollstaendig
// vorberechneter Funkrahmen: Adresse, Pruefsumme und die Bitverwuerfelung, die
// ein BLE-Sender ohnehin anwendet. Die App rechnet sie vorweg heraus, damit das
// Handy sie beim Senden wieder aufhebt und auf der Luft der Rahmen steht, den
// die Box erwartet.
//
// Herkunft: aus der Hersteller-App gelesen (libble.so, ARM64) - siehe
// doku/protokoll-mouldking.md. Reine Funktionen, kein Bluetooth.
//
// Der Browser kann diese Pakete nicht aussenden; Web Bluetooth darf nicht
// senden. Dieses Modul dient zwei Zwecken: es entschluesselt Mitschnitte, und
// es ist die Vorlage, gegen die sich eine native Umsetzung pruefen laesst.

/** Empfaengeradresse im nachgebauten Funkrahmen. Fuer alle Boxen gleich. */
export const ADRESSE = Object.freeze([0xc1, 0xc2, 0xc3, 0xc4, 0xc5]);

/** Hersteller-ID, unter der die App sendet. */
export const HERSTELLER_ID = 0xff00;

/** Hersteller-ID, unter der die Box laut App antwortet. */
export const HERSTELLER_ID_ANTWORT = 0xfff0;

/** Die drei festen Bytes am Anfang des Rahmens. */
export const VORSPANN = Object.freeze([0x71, 0x0f, 0x55]);

/** Vorlauf vor den Nutzdaten - schiebt das Schieberegister 120 Takte vor. */
export const VORLAUF = 15;

export const SAAT_INNEN = 63;
export const SAAT_AUSSEN = 37;

/** Befehlskennungen im ersten Byte des Telegramms. */
export const BEFEHL = Object.freeze({
  koppeln: 0xa0,
  entkoppeln: 0xe0,
});

/** Statuscodes, mit denen die Box laut App antwortet. */
export const STATUS = Object.freeze({
  entkoppelt: 0xc0,
  gekoppelt: 0xe5,
});

export const TELEGRAMM_LAENGE = 12;

// --- Bitverwuerfelung ------------------------------------------------------

function registerStart(saat) {
  const s = new Array(7).fill(0);
  s[0] = 1;
  for (let k = 0; k <= 5; k += 1) s[1 + k] = (saat >> (5 - k)) & 1;
  return s;
}

function registerBit(s) {
  const o = s.slice();
  s[0] = o[6];
  s[1] = o[0];
  s[2] = o[1];
  s[3] = o[2];
  s[4] = o[6] ^ o[3];
  s[5] = o[4];
  s[6] = o[5];
  return o[6];
}

/**
 * Verwuerfelt `laenge` Bytes ab `versatz`. Weil es ein reines XOR ist, hebt ein
 * zweiter Aufruf mit derselben Saat die Wirkung wieder auf.
 */
function verwuerfeln(puffer, versatz, laenge, saat) {
  const s = registerStart(saat);
  for (let i = 0; i < laenge; i += 1) {
    const b = puffer[versatz + i];
    let r = 0;
    for (let bit = 0; bit <= 7; bit += 1) {
      r |= (((b >> bit) & 1) ^ registerBit(s)) << bit;
    }
    puffer[versatz + i] = r;
  }
  return puffer;
}

/** Verwirft `anzahl` Bytes des Schluesselstroms - fuer Teilentschluesselung. */
function stromVorspulen(s, anzahl) {
  for (let i = 0; i < anzahl * 8; i += 1) registerBit(s);
  return s;
}

export function spiegele8(wert) {
  let r = 0;
  for (let i = 0; i <= 7; i += 1) if ((wert >> i) & 1) r |= 1 << (7 - i);
  return r;
}

export function spiegele16(wert) {
  let r = 0;
  for (let i = 0; i <= 15; i += 1) if ((wert >> i) & 1) r |= 1 << (15 - i);
  return r & 0xffff;
}

// --- Pruefsumme ------------------------------------------------------------

/** CRC-16/CCITT: Adresse rueckwaerts und roh, Daten vorwaerts und gespiegelt. */
export function pruefsumme(adresse, daten) {
  let crc = 0xffff;
  const fuettern = (b) => {
    crc ^= (b & 0xff) << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  };
  for (let i = adresse.length - 1; i >= 0; i -= 1) fuettern(adresse[i]);
  for (const b of daten) fuettern(spiegele8(b));
  return ~spiegele16(crc) & 0xffff;
}

// --- Rahmen bauen und lesen ------------------------------------------------

/**
 * Baut aus einem Klartexttelegramm die Nutzdaten des Advertising-Pakets.
 * @param {number[]|Uint8Array} daten
 * @param {number[]} adresse
 * @returns {Uint8Array} Laenge adresse.length + daten.length + 5
 */
export function nutzdaten(daten, adresse = ADRESSE) {
  const a = adresse.length;
  const d = daten.length;
  const puffer = new Uint8Array(a + d + 20);
  puffer.set(VORSPANN, VORLAUF);
  for (let i = 0; i < a; i += 1) puffer[18 + i] = adresse[a - 1 - i];
  puffer.set(daten, 18 + a);

  for (let i = VORLAUF; i <= VORLAUF + a + 2; i += 1) puffer[i] = spiegele8(puffer[i]);

  const crc = pruefsumme(adresse, daten);
  puffer[18 + a + d] = crc & 0xff;
  puffer[18 + a + d + 1] = (crc >> 8) & 0xff;

  verwuerfeln(puffer, 18, a + d + 2, SAAT_INNEN);
  verwuerfeln(puffer, 0, puffer.length, SAAT_AUSSEN);
  return puffer.slice(VORLAUF, VORLAUF + a + d + 5);
}

/**
 * Der Weg zurueck: aus mitgeschnittenen Nutzdaten das Klartexttelegramm.
 * @returns {{daten: Uint8Array, adresse: Uint8Array, crc: number,
 *            crcStimmt: boolean, vorspannStimmt: boolean}}
 */
export function klartext(roh, adresseLaenge = ADRESSE.length) {
  const bytes = Uint8Array.from(roh);
  const a = adresseLaenge;
  const d = bytes.length - a - 5;
  if (d < 0) throw new RangeError(`Nutzdaten zu kurz: ${bytes.length} Bytes`);

  const puffer = bytes.slice();
  // Die aeussere Verwuerfelung lief ab Position 0; der Schluesselstrom fuer
  // unseren Ausschnitt beginnt also erst nach dem Vorlauf.
  const aussen = stromVorspulen(registerStart(SAAT_AUSSEN), VORLAUF);
  for (let i = 0; i < puffer.length; i += 1) {
    let r = 0;
    for (let bit = 0; bit <= 7; bit += 1) {
      r |= (((puffer[i] >> bit) & 1) ^ registerBit(aussen)) << bit;
    }
    puffer[i] = r;
  }
  // Die innere lief ab Position 18, also ab dem dritten Byte des Ausschnitts.
  verwuerfeln(puffer, 3, a + d + 2, SAAT_INNEN);

  for (let i = 0; i <= a + 2; i += 1) puffer[i] = spiegele8(puffer[i]);

  const vorspannStimmt = VORSPANN.every((v, i) => puffer[i] === v);
  const adresse = puffer.slice(3, 3 + a).reverse();
  const daten = puffer.slice(3 + a, 3 + a + d);
  const crc = puffer[3 + a + d] | (puffer[3 + a + d + 1] << 8);
  return {
    daten,
    adresse,
    crc,
    crcStimmt: crc === pruefsumme(Array.from(adresse), daten),
    vorspannStimmt,
  };
}

// --- Telegramme ------------------------------------------------------------

/**
 * Kopplungs- oder Entkopplungstelegramm.
 * @param {{befehl?: 'koppeln'|'entkoppeln', geraet: number, box?: number, kanal?: number}} angabe
 */
export function kopplungsTelegramm({ befehl = 'koppeln', geraet, box = 0, kanal = 0 }) {
  const kennung = BEFEHL[befehl];
  if (kennung === undefined) throw new RangeError(`unbekannter Befehl: ${befehl}`);
  if (!Number.isInteger(geraet) || geraet < 0 || geraet > 0xffffff) {
    throw new RangeError(`Geraetekennung muss 0 bis 0xFFFFFF sein, war: ${geraet}`);
  }
  if (!Number.isInteger(box) || box < 0 || box > 61) {
    throw new RangeError(`Box muss 0 bis 61 sein, war: ${box}`);
  }
  if (!Number.isInteger(kanal) || kanal < 0 || kanal > 3) {
    throw new RangeError(`Kanal muss 0 bis 3 sein, war: ${kanal}`);
  }
  const t = new Uint8Array(TELEGRAMM_LAENGE);
  t[0] = kennung;
  t[1] = (geraet >> 16) & 0xff;
  t[2] = (geraet >> 8) & 0xff;
  t[3] = geraet & 0xff;
  t[7] = (((box + 1) << 2) | kanal) & 0xff;
  return t;
}

export function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

export function ausHex(text) {
  const teile = text.trim().split(/[\s,]+/).filter(Boolean);
  return Uint8Array.from(teile.map((t) => parseInt(t.replace(/^0x/i, ''), 16)));
}
