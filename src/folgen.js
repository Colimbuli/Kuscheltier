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
  /**
   * Angestrebte Gesichtsbreite im Bild - das ist das Mass fuer den Abstand.
   *
   * Der Wert ist klein, weil der Roboter auf dem Boden steht und zu einem
   * stehenden Menschen hinaufschaut: aus anderthalb Metern ist ein Gesicht dann
   * rund ein Zehntel der Bildbreite. Wer die Zahl aus einem Selbstportraet auf
   * Kopfhoehe ableitet, landet bei einem Vielfachen davon - und das Tier faehrt
   * dem Menschen in die Fuesse, weil das Gesicht nie gross genug wird.
   *
   * Verlaesslich ist ohnehin nur eine Messung am Aufbau: siehe `zielAusBefund`.
   */
  zielGroesse: 0.12,
  /** Darunter wird nicht nachgeregelt. */
  groessenToleranz: 0.035,
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
  'aus', 'wartet', 'dreht', 'faehrt', 'haelt', 'sucht', 'aufgegeben', 'blockiert',
]);

/** Sinnvolle Grenzen fuer eine gemessene Zielgroesse. */
export const ZIEL_MIN = 0.03;
export const ZIEL_MAX = 0.6;

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
   * Uebernimmt den Abstand, in dem der Roboter gerade steht, als den richtigen.
   * Ehrlicher als jede geschaetzte Zahl.
   * @returns {number|null} die uebernommene Groesse, oder null bei Unsinn
   */
  zielAusBefund(befund) {
    const groesse = befund?.gefunden ? befund.groesse : null;
    if (typeof groesse !== 'number' || groesse < ZIEL_MIN || groesse > ZIEL_MAX) return null;
    this.einstellungen = { ...this.einstellungen, zielGroesse: groesse };
    return groesse;
  }

  /**
   * @param {{gefunden: boolean, mitteX?: number, groesse?: number}} befund
   *        `mitteX` ist -1 (ganz links) bis +1 (ganz rechts), `groesse` die
   *        Gesichtsbreite als Anteil der Bildbreite.
   * @param {number} zeit Millisekunden-Uhr
   * @param {{hindernis?: boolean}} lage was die Infrarotsensoren melden
   * @returns {{richtung: string, stufe: number}|null}
   */
  takt(befund, zeit, lage = {}) {
    const e = this.einstellungen;

    if (befund?.gefunden) {
      this.#letzteSicht = zeit;
      const mitteX = befund.mitteX ?? 0;
      if (Math.abs(mitteX) > e.totzoneX) this.#letzteSeite = mitteX > 0 ? 'rechts' : 'links';
      return this.#nachfuehren(mitteX, befund.groesse ?? 0, lage.hindernis === true);
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

  #nachfuehren(mitteX, groesse, hindernis) {
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
      // Das Gesicht ist das Mass fuer die Richtung, der Infrarotsensor fuer den
      // Abstand. Ein Kopf in zwei Metern Hoehe sieht klein aus, auch wenn die
      // Fuesse direkt vor dem Roboter stehen - nur der Sensor merkt das.
      if (hindernis) {
        this.zustand = 'blockiert';
        return null;
      }
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
