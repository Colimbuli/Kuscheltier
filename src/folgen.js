// Aus einem Gesichtsbefund wird eine Fahrabsicht.
//
// Reine Regelung, ohne Kamera und ohne Bluetooth: rein kommt, wo im Bild ein
// Gesicht gesehen wurde und wie gross es ist, raus kommt dieselbe Absicht, die
// auch der Verhaltenskern erzeugt - `{richtung, stufe}` oder nichts.
//
// Zwei Dinge sind hier wichtiger, als sie aussehen. Eine Totzone um die Mitte,
// sonst pendelt der Roboter dauernd hin und her. Und eine Wartezeit, bevor er
// ein verlorenes Gesicht sucht: Gesichtserkennung setzt gelegentlich ein Bild
// aus, und wer darauf sofort mit Drehen antwortet, verliert es erst recht.

export const STANDARD = Object.freeze({
  /** Innerhalb dieses Abstands von der Bildmitte gilt das Gesicht als mittig. */
  totzoneX: 0.12,
  /** Groessere Ablage als das gilt als deutlich daneben. */
  starkDanebenX: 0.30,
  /** Angestrebte Gesichtsbreite im Bild - das ist das Mass fuer den Abstand. */
  zielGroesse: 0.28,
  /** Darunter wird nicht nachgeregelt. */
  groessenToleranz: 0.06,
  /** So lange wird ein kurz verlorenes Gesicht einfach abgewartet. */
  verlorenNachMs: 1200,
  /** So lange wird gesucht, danach gibt das Folgen auf. */
  sucheBisMs: 8000,
  stufeDrehenSanft: 1,
  stufeDrehenDeutlich: 2,
  stufeFahren: 2,
  stufeSuchen: 1,
});

export const ZUSTAENDE = Object.freeze([
  'aus', 'wartet', 'dreht', 'faehrt', 'haelt', 'sucht', 'aufgegeben',
]);

export class Folgen {
  #letzteSicht = null;
  #letzteSeite = 'rechts';

  constructor(einstellungen = {}) {
    this.einstellungen = { ...STANDARD, ...einstellungen };
    this.zustand = 'aus';
  }

  /** Beim Einschalten wird vergessen, was frueher einmal zu sehen war. */
  zuruecksetzen() {
    this.#letzteSicht = null;
    this.zustand = 'aus';
    return this;
  }

  /**
   * @param {{gefunden: boolean, mitteX?: number, groesse?: number}} befund
   *        `mitteX` ist -1 (ganz links) bis +1 (ganz rechts), `groesse` die
   *        Gesichtsbreite als Anteil der Bildbreite.
   * @param {number} zeit Millisekunden-Uhr
   * @returns {{richtung: string, stufe: number}|null}
   */
  takt(befund, zeit) {
    const e = this.einstellungen;

    if (befund?.gefunden) {
      this.#letzteSicht = zeit;
      const mitteX = befund.mitteX ?? 0;
      if (Math.abs(mitteX) > e.totzoneX) this.#letzteSeite = mitteX > 0 ? 'rechts' : 'links';
      return this.#nachfuehren(mitteX, befund.groesse ?? 0);
    }

    if (this.#letzteSicht === null) {
      // Noch nie etwas gesehen: nicht blind losdrehen.
      this.zustand = 'wartet';
      return null;
    }

    const her = zeit - this.#letzteSicht;
    if (her < e.verlorenNachMs) {
      this.zustand = 'wartet';
      return null;
    }
    if (her > e.verlorenNachMs + e.sucheBisMs) {
      this.zustand = 'aufgegeben';
      return null;
    }
    this.zustand = 'sucht';
    return { richtung: this.#letzteSeite, stufe: e.stufeSuchen };
  }

  #nachfuehren(mitteX, groesse) {
    const e = this.einstellungen;
    const ablage = Math.abs(mitteX);

    if (ablage > e.totzoneX) {
      this.zustand = 'dreht';
      return {
        richtung: mitteX > 0 ? 'rechts' : 'links',
        stufe: ablage > e.starkDanebenX ? e.stufeDrehenDeutlich : e.stufeDrehenSanft,
      };
    }

    if (groesse < e.zielGroesse - e.groessenToleranz) {
      this.zustand = 'faehrt';
      return { richtung: 'vor', stufe: e.stufeFahren };
    }
    if (groesse > e.zielGroesse + e.groessenToleranz) {
      this.zustand = 'faehrt';
      return { richtung: 'zurueck', stufe: e.stufeFahren };
    }

    this.zustand = 'haelt';
    return null;
  }
}
