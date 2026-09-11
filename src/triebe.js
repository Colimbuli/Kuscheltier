// Die Beduerfnisse des Tiers.
//
// Alle vier Werte laufen von 0 (leer) bis 100 (voll) und fallen mit der Zeit.
// Reines Rechenmodell ohne Timer: wie viel Zeit vergangen ist, sagt der Aufrufer.
// Genau deshalb faellt der Zustand auch nach, wenn die Seite geschlossen war.

export const TRIEBE = Object.freeze(['energie', 'sattheit', 'zuwendung', 'beschaeftigung']);

/** Verfall pro Minute im Wachzustand. */
export const VERFALL_PRO_MINUTE = Object.freeze({
  energie: 0.8,
  sattheit: 0.5,
  zuwendung: 0.7,
  beschaeftigung: 1.2,
});

/** Zusaetzlicher Energieverbrauch pro Minute, wenn die Motoren laufen. */
export const BEWEGUNGSKOSTEN_PRO_MINUTE = 2.5;

/** Erholung pro Minute im Schlaf. */
export const ERHOLUNG_PRO_MINUTE = 6;

/** Laenger als das rechnen wir eine Pause nicht an - sonst ist alles auf null. */
export const MAX_ABWESENHEIT_MS = 12 * 60 * 60 * 1000;

const begrenzen = (wert) => Math.min(100, Math.max(0, wert));

export class Triebe {
  /** @param {Partial<Record<typeof TRIEBE[number], number>>} start */
  constructor(start = {}) {
    this.werte = {};
    for (const name of TRIEBE) this.werte[name] = begrenzen(start[name] ?? 80);
  }

  /**
   * Laesst Zeit vergehen.
   * @param {number} millisekunden
   * @param {{ruhend?: boolean, inBewegung?: boolean}} lage
   */
  verstreiche(millisekunden, lage = {}) {
    const { ruhend = false, inBewegung = false } = lage;
    const minuten = Math.min(millisekunden, MAX_ABWESENHEIT_MS) / 60000;
    if (minuten <= 0) return this;

    for (const name of TRIEBE) {
      this.werte[name] = begrenzen(this.werte[name] - VERFALL_PRO_MINUTE[name] * minuten);
    }
    if (inBewegung) {
      this.werte.energie = begrenzen(this.werte.energie - BEWEGUNGSKOSTEN_PRO_MINUTE * minuten);
      // Sich bewegen vertreibt die Langeweile.
      this.werte.beschaeftigung = begrenzen(this.werte.beschaeftigung + 2 * minuten);
    }
    if (ruhend) {
      this.werte.energie = begrenzen(this.werte.energie + ERHOLUNG_PRO_MINUTE * minuten);
    }
    return this;
  }

  stille(name, menge) {
    if (!TRIEBE.includes(name)) throw new RangeError(`unbekannter Trieb: ${name}`);
    this.werte[name] = begrenzen(this.werte[name] + menge);
    return this;
  }

  fuettern(menge = 25) {
    return this.stille('sattheit', menge);
  }

  streicheln(menge = 20) {
    return this.stille('zuwendung', menge);
  }

  spielen(menge = 18) {
    this.stille('beschaeftigung', menge);
    return this.stille('energie', -4);
  }

  /** Der Trieb, der am dringendsten ist. */
  get dringendster() {
    return TRIEBE.reduce((a, b) => (this.werte[b] < this.werte[a] ? b : a));
  }

  /** Grobes Mass fuer die Gesamtlage, 0 bis 100. */
  get laune() {
    const summe = TRIEBE.reduce((s, name) => s + this.werte[name], 0);
    return summe / TRIEBE.length;
  }

  toJSON() {
    return { ...this.werte };
  }
}
