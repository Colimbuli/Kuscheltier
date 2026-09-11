// Uebersetzt Absichten in Stellrahmen.
//
// Der Verhaltenskern sagt "fahre vorwaerts, Stufe 2". Hier wird daraus, was die
// drei Motoren tun muessen. Die beiden Antriebsmotoren sind spiegelbildlich
// eingebaut und laufen fuer Geradeausfahrt gegenlaeufig; der dritte ist der
// Greifer.
//
// Reine Funktionen, kein Bluetooth, keine Zeit.

import { DAUER_MAX_MS, MOTOR_HALT, stellRahmen } from './protokoll.js';

/**
 * Kraft je Fahrstufe. Nicht linear von null an: unter etwa 0,4 laeuft ein Motor
 * unter Last gar nicht erst an, eine "Stufe 1" mit Kraft 0,25 waere also kein
 * langsames Fahren, sondern Stillstand mit Brummen.
 */
export const KRAFT_STUFEN = Object.freeze([0.4, 0.6, 0.8, 1.0]);

/** Kraft des kurveninneren Rades. Derselbe Wert, den die Hersteller-App nimmt. */
export const KURVE_KRAFT = 0.65;

/**
 * Je Richtung die Befehle der beiden Antriebsmotoren und der Kraftfaktor des
 * inneren Rades. `vorwaerts` an Motor 0 und `rueckwaerts` an Motor 1 ergeben
 * zusammen Geradeausfahrt.
 */
const RICHTUNGEN = Object.freeze({
  vor: { befehle: ['vorwaerts', 'rueckwaerts'], faktoren: [1, 1] },
  zurueck: { befehle: ['rueckwaerts', 'vorwaerts'], faktoren: [1, 1] },
  rechts: { befehle: ['vorwaerts', 'vorwaerts'], faktoren: [1, 1] },
  links: { befehle: ['rueckwaerts', 'rueckwaerts'], faktoren: [1, 1] },
  vor_rechts: { befehle: ['vorwaerts', 'rueckwaerts'], faktoren: [1, KURVE_KRAFT] },
  vor_links: { befehle: ['vorwaerts', 'rueckwaerts'], faktoren: [KURVE_KRAFT, 1] },
});

export const RICHTUNGEN_NAMEN = Object.freeze(Object.keys(RICHTUNGEN));

/** Der Greifermotor. "auf" und "zu" koennen am Bausatz vertauscht sein. */
const GREIFER = Object.freeze({ auf: 'vorwaerts', zu: 'rueckwaerts' });

export function stufeKraft(stufe) {
  if (!Number.isInteger(stufe) || stufe < 1 || stufe > KRAFT_STUFEN.length) {
    throw new RangeError(`Stufe muss 1 bis ${KRAFT_STUFEN.length} sein, war: ${stufe}`);
  }
  return KRAFT_STUFEN[stufe - 1];
}

/**
 * Die beiden Antriebsmotoren fuer eine Fahrabsicht.
 * @param {{richtung: string, stufe?: number}|null} fahrt
 * @param {number} dauerMs
 * @param {boolean} getauscht Drehsinn vertauscht - siehe `drehsinn.js`
 */
export function antriebsMotoren(fahrt, dauerMs, getauscht = false) {
  // Ein stehender Motor bekommt keine Dauer - so steht es auch im Ruherahmen
  // der Hersteller-App.
  if (!fahrt) return [{ ...MOTOR_HALT }, { ...MOTOR_HALT }];
  const vorlage = RICHTUNGEN[fahrt.richtung];
  if (!vorlage) {
    throw new RangeError(
      `unbekannte Richtung: ${fahrt.richtung} (erlaubt: ${RICHTUNGEN_NAMEN.join(', ')})`,
    );
  }
  const kraft = stufeKraft(fahrt.stufe ?? 2);
  const befehle = getauscht ? [...vorlage.befehle].reverse() : vorlage.befehle;
  return befehle.map((befehl, i) => ({
    befehl,
    kraft: kraft * vorlage.faktoren[i],
    dauerMs,
  }));
}

/** Der Greifermotor fuer eine Greifabsicht. */
export function greiferMotor(stellung, dauerMs, getauscht = false) {
  if (!stellung) return { ...MOTOR_HALT };
  const befehl = GREIFER[stellung];
  if (!befehl) {
    throw new RangeError(`unbekannte Greiferstellung: ${stellung} (erlaubt: auf, zu)`);
  }
  const getauschtBefehl = befehl === 'vorwaerts' ? 'rueckwaerts' : 'vorwaerts';
  return { befehl: getauscht ? getauschtBefehl : befehl, kraft: 1, dauerMs };
}

/**
 * Der vollstaendige Stellrahmen fuer einen Antriebszustand.
 *
 * @param {{fahrt: object|null, greifer: string|null}} zustand
 * @param {{fahrt?: number, greifer?: number}} restzeiten verbleibende Dauer je
 *        Kanal in Millisekunden; der Roboter haelt danach von selbst an
 * @param {{fahrtGetauscht?: boolean, greiferGetauscht?: boolean}} drehsinn
 */
export function rahmenFuer(zustand, restzeiten = {}, drehsinn = {}) {
  const fahrtDauer = Math.min(restzeiten.fahrt ?? DAUER_MAX_MS, DAUER_MAX_MS);
  const greiferDauer = Math.min(restzeiten.greifer ?? DAUER_MAX_MS, DAUER_MAX_MS);
  return stellRahmen([
    ...antriebsMotoren(zustand.fahrt ?? null, fahrtDauer, drehsinn.fahrtGetauscht ?? false),
    greiferMotor(zustand.greifer ?? null, greiferDauer, drehsinn.greiferGetauscht ?? false),
  ]);
}
