// Verhaltenskern: aus der Stimmung wird eine Handlung, aus der Handlung werden
// Stellbefehle an den Antrieb.
//
// Eine Handlung ist eine Folge von Schritten mit fester Dauer. Der Taktgeber
// arbeitet sie ab; dazwischen liegt eine Pause, deren Laenge von der Stimmung
// abhaengt. Nichts hier kennt Bluetooth - der Antrieb ist austauschbar.
//
// Das Repertoire nutzt nur, was der Roboter wirklich hat: zwei Antriebsmotoren,
// einen Greifer und die Toene der Firmware.

import { gemuetslage } from './gemuet.js';

/** Die Toene, die im Repertoire vorkommen. Vollstaendige Liste: protokoll.js */
export const KLANG = Object.freeze({
  funk1: 0,
  funk2: 1,
  elektronisch: 2,
  radar: 5,
  schlagwerk: 14,
  summer: 16,
  motor: 17,
  triumph: 18,
  hupe: 19,
  uhr: 20,
  fehlschlag: 21,
});

/**
 * Schrittarten: fahre, halt, greifer, klang, warte.
 * Jeder Schritt hat eine Dauer in Millisekunden.
 */
const schritt = (aktion, dauer, zusatz = {}) => ({ aktion, dauer, ...zusatz });

export const REPERTOIRE = Object.freeze({
  erschoepft: [
    { name: 'zusammensinken', schritte: [
      schritt('greifer', 600, { stellung: 'zu' }),
      schritt('warte', 2500),
    ] },
    { name: 'doesen', schritte: [schritt('warte', 4000)] },
  ],
  muede: [
    { name: 'gaehnen', schritte: [
      schritt('greifer', 500, { stellung: 'auf' }),
      schritt('klang', 600, { index: KLANG.motor }),
      schritt('greifer', 400, { stellung: 'zu' }),
    ] },
    { name: 'wegdaemmern', schritte: [
      schritt('klang', 400, { index: KLANG.uhr }),
      schritt('warte', 2000),
    ] },
  ],
  hungrig: [
    { name: 'betteln', schritte: [
      schritt('greifer', 350, { stellung: 'auf' }),
      schritt('greifer', 350, { stellung: 'zu' }),
      schritt('klang', 400, { index: KLANG.funk1 }),
      schritt('greifer', 350, { stellung: 'auf' }),
      schritt('greifer', 350, { stellung: 'zu' }),
    ] },
    { name: 'futter-suchen', schritte: [
      schritt('fahre', 500, { richtung: 'links', stufe: 1 }),
      schritt('greifer', 400, { stellung: 'auf' }),
      schritt('fahre', 500, { richtung: 'rechts', stufe: 1 }),
      schritt('greifer', 400, { stellung: 'zu' }),
    ] },
  ],
  einsam: [
    { name: 'anschmiegen', schritte: [
      schritt('fahre', 800, { richtung: 'vor', stufe: 1 }),
      schritt('klang', 600, { index: KLANG.funk2 }),
    ] },
    { name: 'auf-sich-aufmerksam-machen', schritte: [
      schritt('klang', 400, { index: KLANG.hupe }),
      schritt('fahre', 350, { richtung: 'links', stufe: 2 }),
      schritt('fahre', 350, { richtung: 'rechts', stufe: 2 }),
    ] },
  ],
  gelangweilt: [
    { name: 'kreiseln', schritte: [
      schritt('fahre', 1200, { richtung: 'rechts', stufe: 3 }),
      schritt('halt', 200),
    ] },
    { name: 'zickzack', schritte: [
      schritt('fahre', 700, { richtung: 'vor_links', stufe: 3 }),
      schritt('fahre', 700, { richtung: 'vor_rechts', stufe: 3 }),
      schritt('fahre', 700, { richtung: 'vor_links', stufe: 3 }),
    ] },
    { name: 'herumstochern', schritte: [
      schritt('greifer', 400, { stellung: 'auf' }),
      schritt('fahre', 400, { richtung: 'vor', stufe: 2 }),
      schritt('greifer', 400, { stellung: 'zu' }),
      schritt('klang', 300, { index: KLANG.schlagwerk }),
      schritt('fahre', 500, { richtung: 'zurueck', stufe: 2 }),
    ] },
  ],
  zufrieden: [
    { name: 'umsehen', schritte: [
      schritt('fahre', 400, { richtung: 'links', stufe: 1 }),
      schritt('warte', 600),
      schritt('fahre', 400, { richtung: 'rechts', stufe: 1 }),
    ] },
    { name: 'schnurren', schritte: [
      schritt('klang', 800, { index: KLANG.motor }),
      schritt('warte', 600),
    ] },
    { name: 'nichts', schritte: [schritt('warte', 1500)] },
  ],
  aufgedreht: [
    { name: 'sprint', schritte: [
      schritt('fahre', 900, { richtung: 'vor', stufe: 4 }),
      schritt('halt', 150),
      schritt('fahre', 700, { richtung: 'zurueck', stufe: 3 }),
    ] },
    { name: 'pirouette', schritte: [
      schritt('klang', 300, { index: KLANG.triumph }),
      schritt('fahre', 1400, { richtung: 'links', stufe: 4 }),
    ] },
    { name: 'schnappen', schritte: [
      schritt('greifer', 300, { stellung: 'auf' }),
      schritt('greifer', 300, { stellung: 'zu' }),
      schritt('greifer', 300, { stellung: 'auf' }),
      schritt('greifer', 300, { stellung: 'zu' }),
      schritt('klang', 300, { index: KLANG.elektronisch }),
    ] },
  ],
});

/** Sofortige Reaktionen auf Zuwendung - unterbrechen, was gerade laeuft. */
export const REAKTIONEN = Object.freeze({
  streicheln: { name: 'geniessen', schritte: [
    schritt('klang', 900, { index: KLANG.motor }),
    schritt('fahre', 300, { richtung: 'links', stufe: 1 }),
    schritt('fahre', 300, { richtung: 'rechts', stufe: 1 }),
  ] },
  fuettern: { name: 'schmatzen', schritte: [
    schritt('greifer', 300, { stellung: 'auf' }),
    schritt('greifer', 300, { stellung: 'zu' }),
    schritt('klang', 400, { index: KLANG.schlagwerk }),
  ] },
  spielen: { name: 'jubeln', schritte: [
    schritt('klang', 400, { index: KLANG.triumph }),
    schritt('fahre', 600, { richtung: 'rechts', stufe: 3 }),
    schritt('fahre', 600, { richtung: 'links', stufe: 3 }),
  ] },
  erschreckt: { name: 'zurueckzucken', schritte: [
    schritt('fahre', 500, { richtung: 'zurueck', stufe: 3 }),
    schritt('klang', 400, { index: KLANG.fehlschlag }),
  ] },
  hindernis: { name: 'ausweichen', schritte: [
    schritt('fahre', 400, { richtung: 'zurueck', stufe: 2 }),
    schritt('klang', 300, { index: KLANG.summer }),
    schritt('fahre', 500, { richtung: 'rechts', stufe: 2 }),
  ] },
});

/** Pause zwischen zwei Handlungen, in Millisekunden. */
export const PAUSE_MS = Object.freeze({
  erschoepft: 9000,
  muede: 5000,
  hungrig: 2500,
  einsam: 2500,
  gelangweilt: 1800,
  zufrieden: 3500,
  aufgedreht: 1200,
});

export class Verhalten {
  #handlung = null;
  #schrittIndex = 0;
  #schrittEnde = 0;
  #pauseBis = 0;

  /**
   * @param {{triebe: import('./triebe.js').Triebe,
   *          antrieb: import('./antrieb.js').Antrieb,
   *          zufall?: () => number}} teile
   */
  constructor({ triebe, antrieb, zufall = Math.random }) {
    this.triebe = triebe;
    this.antrieb = antrieb;
    this.zufall = zufall;
    this.stimmung = 'zufrieden';
    /** @type {(name: string, stimmung: string) => void} */
    this.onHandlung = () => {};
  }

  get aktuell() {
    return this.#handlung ? { name: this.#handlung.name, schritt: this.#schrittIndex } : null;
  }

  get ruht() {
    return this.#handlung === null;
  }

  /** Ein Taktschritt. `zeit` ist eine Millisekunden-Uhr. */
  takt(zeit) {
    this.stimmung = gemuetslage(this.triebe).stimmung;

    if (this.#handlung) {
      if (zeit < this.#schrittEnde) return this;
      this.#schrittIndex += 1;
      if (this.#schrittIndex >= this.#handlung.schritte.length) {
        this.#beende(zeit);
        return this;
      }
      this.#schrittAusfuehren(zeit);
      return this;
    }

    if (zeit >= this.#pauseBis) this.#waehleHandlung(zeit);
    return this;
  }

  /** Aeussere Ereignisse. Stillen einen Trieb und loesen eine Reaktion aus. */
  reagiere(ereignis, zeit) {
    switch (ereignis) {
      case 'streicheln': this.triebe.streicheln(); break;
      case 'fuettern': this.triebe.fuettern(); break;
      case 'spielen': this.triebe.spielen(); break;
      case 'erschreckt': this.triebe.stille('zuwendung', -5); break;
      case 'hindernis': break;
      default: throw new RangeError(`unbekanntes Ereignis: ${ereignis}`);
    }
    const reaktion = REAKTIONEN[ereignis];
    if (reaktion) this.#starte(reaktion, zeit);
    return this;
  }

  #waehleHandlung(zeit) {
    const auswahl = REPERTOIRE[this.stimmung] ?? REPERTOIRE.zufrieden;
    const index = Math.min(auswahl.length - 1, Math.floor(this.zufall() * auswahl.length));
    this.#starte(auswahl[index], zeit);
  }

  #starte(handlung, zeit) {
    this.#handlung = handlung;
    this.#schrittIndex = 0;
    this.#schrittAusfuehren(zeit);
    this.onHandlung(handlung.name, this.stimmung);
  }

  #schrittAusfuehren(zeit) {
    const s = this.#handlung.schritte[this.#schrittIndex];
    this.#schrittEnde = zeit + s.dauer;
    switch (s.aktion) {
      case 'fahre': this.antrieb.fahre(s.richtung, s.stufe, s.dauer); break;
      case 'halt': this.antrieb.halt(); break;
      case 'greifer': this.antrieb.greife(s.stellung, s.dauer); break;
      case 'klang': this.antrieb.spiele(s.index, s.dauer); break;
      case 'warte': this.antrieb.halt(); break;
      default: throw new RangeError(`unbekannte Schrittart: ${s.aktion}`);
    }
  }

  #beende(zeit) {
    this.#handlung = null;
    this.#schrittIndex = 0;
    this.antrieb.halt();
    this.#pauseBis = zeit + (PAUSE_MS[this.stimmung] ?? PAUSE_MS.zufrieden);
  }
}
