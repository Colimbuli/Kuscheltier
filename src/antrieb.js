// Gemeinsame Basis aller Antriebe.
//
// Der Roboter erwartet den Stellrahmen als Dauerstrom (alle 100 ms), nicht als
// Einzelbefehl. Diese Klasse haelt den Stellzustand, laesst jeden Kanal nach
// einer Frist von selbst auf neutral zurueckfallen und schickt den Rahmen im
// Takt weiter. Wer den Antrieb benutzt, setzt nur Absichten - das Nachhalten
// und das Abschalten passiert hier.

import { rahmenBauen, SENDE_INTERVALL_MS } from './protokoll.js';

export const KANAELE = Object.freeze(['fahrt', 'greifer', 'hub', 'klang', 'effekt']);

/** Sicherheitsgrenze: laenger als das faehrt das Tier ohne neuen Befehl nicht. */
export const FAHRT_GRENZE_MS = 2500;

export class Antrieb {
  #kanaele;
  #gesperrt = false;
  #taktgeber = null;

  /**
   * @param {{firmware?: number, intervallMs?: number, fahrtGrenzeMs?: number,
   *          jetzt?: () => number}} optionen
   */
  constructor(optionen = {}) {
    const {
      firmware = 2,
      intervallMs = SENDE_INTERVALL_MS,
      fahrtGrenzeMs = FAHRT_GRENZE_MS,
      jetzt = () => Date.now(),
    } = optionen;

    this.firmware = firmware;
    this.intervallMs = intervallMs;
    this.fahrtGrenzeMs = fahrtGrenzeMs;
    this.jetzt = jetzt;
    /** @type {(rahmen: Uint8Array, zeit: number) => void} */
    this.onRahmen = () => {};
    this.#kanaele = new Map(KANAELE.map((name) => [name, { wert: null, bis: 0 }]));
  }

  get gesperrt() {
    return this.#gesperrt;
  }

  /** Aktueller Stellzustand als einfaches Objekt (fuer Anzeige und Tests). */
  get zustand() {
    const z = { firmware: this.firmware };
    for (const [name, kanal] of this.#kanaele) z[name] = kanal.wert;
    return z;
  }

  /**
   * Setzt einen Kanal. `dauerMs === null` haelt den Wert, bis er ueberschrieben
   * wird; die Fahrt wird davon ausgenommen und immer begrenzt.
   */
  setze(name, wert, dauerMs = null) {
    const kanal = this.#kanaele.get(name);
    if (!kanal) throw new RangeError(`unbekannter Kanal: ${name}`);
    if (this.#gesperrt) return this;
    let frist = dauerMs;
    if (name === 'fahrt' && wert !== null) {
      frist = Math.min(dauerMs ?? this.fahrtGrenzeMs, this.fahrtGrenzeMs);
    }
    kanal.wert = wert;
    kanal.bis = wert === null || frist === null ? Infinity : this.jetzt() + frist;
    return this;
  }

  fahre(richtung, stufe = 2, dauerMs = 800) {
    return this.setze('fahrt', { richtung, stufe }, dauerMs);
  }

  halt() {
    return this.setze('fahrt', null);
  }

  greife(stellung, dauerMs = 600) {
    return this.setze('greifer', stellung, dauerMs);
  }

  hebe(richtung, dauerMs = 600) {
    return this.setze('hub', richtung, dauerMs);
  }

  spiele(klangIndex, dauerMs = 300) {
    return this.setze('klang', klangIndex, dauerMs);
  }

  zeige(effektIndex, dauerMs = 300) {
    return this.setze('effekt', effektIndex, dauerMs);
  }

  /**
   * Alles auf neutral, ein Rahmen sofort raus, danach nimmt der Antrieb keine
   * Befehle mehr an. `entsperre()` hebt das wieder auf.
   */
  notAus() {
    for (const kanal of this.#kanaele.values()) {
      kanal.wert = null;
      kanal.bis = Infinity;
    }
    this.#gesperrt = true;
    this.#sendeRahmen(this.jetzt());
    return this;
  }

  entsperre() {
    this.#gesperrt = false;
    return this;
  }

  /**
   * Ein Takt: abgelaufene Kanaele zuruecksetzen, Rahmen bauen und schicken.
   * Wird vom Taktgeber aufgerufen, in Tests direkt.
   */
  takt(zeit = this.jetzt()) {
    for (const kanal of this.#kanaele.values()) {
      if (kanal.wert !== null && zeit >= kanal.bis) {
        kanal.wert = null;
        kanal.bis = Infinity;
      }
    }
    this.#sendeRahmen(zeit);
    return this;
  }

  #sendeRahmen(zeit) {
    const rahmen = rahmenBauen(this.zustand);
    this.onRahmen(rahmen, zeit);
    this.sendeRohdaten(rahmen);
  }

  starteTakt() {
    if (this.#taktgeber !== null) return this;
    this.#taktgeber = setInterval(() => this.takt(), this.intervallMs);
    return this;
  }

  beendeTakt() {
    if (this.#taktgeber === null) return this;
    clearInterval(this.#taktgeber);
    this.#taktgeber = null;
    return this;
  }

  /** Von der konkreten Umsetzung zu ueberschreiben. */
  sendeRohdaten(_rahmen) {
    throw new Error('sendeRohdaten() muss von der Unterklasse umgesetzt werden');
  }
}
