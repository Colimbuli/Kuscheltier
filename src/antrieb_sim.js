// Antrieb ohne Hardware: schreibt den Stellzustand in ein Protokoll.
//
// Damit laesst sich der Verhaltenskern vollstaendig entwickeln und beobachten,
// auch solange das Funkprotokoll des Roboters noch unbekannt ist.

import { Antrieb } from './antrieb.js';

export class Simulator extends Antrieb {
  /**
   * @param {{maxZeilen?: number} & ConstructorParameters<typeof Antrieb>[0]} optionen
   */
  constructor(optionen = {}) {
    const { maxZeilen = 200, ...rest } = optionen;
    super(rest);
    this.maxZeilen = maxZeilen;
    /** @type {{zeit: number, text: string, zustand: object}[]} */
    this.protokoll = [];
    this.uebergaben = 0;
    /** @type {(eintrag: object) => void} */
    this.onEintrag = () => {};
  }

  get verbunden() {
    return true;
  }

  sendeStellwerte(zustand) {
    this.uebergaben += 1;
    const text = this.beschreibung;
    const letzter = this.protokoll[this.protokoll.length - 1];
    // Der Zustand geht zehnmal pro Sekunde durch - nur Aenderungen sind
    // interessant, sonst ist das Protokoll nach zwei Sekunden unlesbar.
    if (letzter && letzter.text === text) return;
    const eintrag = { zeit: this.jetzt(), text, zustand };
    this.protokoll.push(eintrag);
    if (this.protokoll.length > this.maxZeilen) this.protokoll.shift();
    this.onEintrag(eintrag);
  }
}
