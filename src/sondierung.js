// Die gefuehrte Suche nach der Bedeutung der neun Stellbytes.
//
// Vorgehen: In jedem Versuch ist genau ein Byte gesetzt, alle anderen sind
// null. Wer zusieht, meldet nur "es passiert etwas" oder "nichts". Die kraeftigen
// Werte kommen zuerst, weil eine 1 einen Motor oft nicht anlaufen laesst.
//
// Reine Logik ohne Bluetooth und ohne Oberflaeche, damit sie testbar bleibt.

import { RAHMEN_LAENGE, rahmenMitByte } from './protokoll.js';

/** Reihenfolge der Testwerte: erst kraeftig, dann Mitte, dann schwach. */
export const TESTWERTE = Object.freeze([0xff, 0x80, 0x01]);

/** So lange bleibt ein Versuch stehen, bevor wieder auf null geschaltet wird. */
export const VERSUCHSDAUER_MS = 2000;

export function planErstellen(werte = TESTWERTE, laenge = RAHMEN_LAENGE) {
  const plan = [];
  for (const wert of werte) {
    for (let byte = 0; byte < laenge; byte += 1) plan.push({ byte, wert });
  }
  return plan;
}

export class Sondierung {
  #plan;
  #index = 0;
  #ergebnisse = [];

  constructor(plan = planErstellen()) {
    if (plan.length === 0) throw new RangeError('der Plan darf nicht leer sein');
    this.#plan = plan;
  }

  get laenge() {
    return this.#plan.length;
  }

  get nummer() {
    return Math.min(this.#index + 1, this.#plan.length);
  }

  get fertig() {
    return this.#index >= this.#plan.length;
  }

  /** Der anstehende Versuch, oder null wenn der Plan durch ist. */
  get aktuell() {
    return this.fertig ? null : this.#plan[this.#index];
  }

  /** Der Rahmen, der fuer den anstehenden Versuch zu senden ist. */
  get rahmen() {
    const versuch = this.aktuell;
    return versuch ? rahmenMitByte(versuch.byte, versuch.wert) : null;
  }

  /**
   * Haelt das Beobachtete fest und rueckt weiter.
   * @param {boolean} reaktion
   * @param {string} bemerkung
   */
  notiere(reaktion, bemerkung = '') {
    const versuch = this.aktuell;
    if (!versuch) return this;
    this.#ergebnisse.push({ ...versuch, reaktion, bemerkung });
    this.#index += 1;
    return this;
  }

  /** Versuch ueberspringen, ohne ihn zu bewerten. */
  ueberspringe() {
    if (!this.fertig) this.#index += 1;
    return this;
  }

  zurueck() {
    if (this.#index > 0) {
      this.#index -= 1;
      this.#ergebnisse.pop();
    }
    return this;
  }

  get ergebnisse() {
    return this.#ergebnisse.slice();
  }

  get treffer() {
    return this.#ergebnisse.filter((e) => e.reaktion);
  }

  /** Zusammenfassung zum Weiterreichen. */
  bericht() {
    const zeilen = [
      `EVRobot2 Sondierung: ${this.#ergebnisse.length} von ${this.laenge} Versuchen`,
      '',
    ];
    if (this.treffer.length === 0) {
      zeilen.push('Keine Reaktion beobachtet.');
    } else {
      zeilen.push('Reaktionen:');
      for (const e of this.treffer) {
        const wert = e.wert.toString(16).padStart(2, '0').toUpperCase();
        zeilen.push(`  Byte ${e.byte} = 0x${wert}${e.bemerkung ? ` -> ${e.bemerkung}` : ''}`);
      }
    }
    return zeilen.join('\n');
  }

  toJSON() {
    return { index: this.#index, ergebnisse: this.#ergebnisse };
  }

  /** Stellt einen gesicherten Stand wieder her. Unbrauchbare Daten werden verworfen. */
  static ausJSON(daten, plan = planErstellen()) {
    const s = new Sondierung(plan);
    if (!daten || !Array.isArray(daten.ergebnisse)) return s;
    const gueltig = daten.ergebnisse.filter(
      (e) => e && Number.isInteger(e.byte) && Number.isInteger(e.wert),
    );
    s.#ergebnisse = gueltig.slice(0, plan.length);
    s.#index = Number.isInteger(daten.index)
      ? Math.min(Math.max(daten.index, s.#ergebnisse.length), plan.length)
      : s.#ergebnisse.length;
    return s;
  }
}
