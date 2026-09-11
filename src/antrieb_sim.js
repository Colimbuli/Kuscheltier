// Antrieb ohne Hardware: schreibt die Rahmen in ein Protokoll.
//
// Damit laesst sich der Verhaltenskern vollstaendig entwickeln und testen,
// bevor der Roboter ueberhaupt angeschlossen ist.

import { Antrieb } from './antrieb.js';
import { hex } from './protokoll.js';

export class Simulator extends Antrieb {
  /**
   * @param {{maxZeilen?: number} & ConstructorParameters<typeof Antrieb>[0]} optionen
   */
  constructor(optionen = {}) {
    const { maxZeilen = 200, ...rest } = optionen;
    super(rest);
    this.maxZeilen = maxZeilen;
    /** @type {{zeit: number, hex: string, zustand: object}[]} */
    this.protokoll = [];
    this.gesendet = 0;
    /** @type {(eintrag: object) => void} */
    this.onEintrag = () => {};
  }

  get verbunden() {
    return true;
  }

  sendeRohdaten(rahmen) {
    this.gesendet += 1;
    const eintrag = { zeit: this.jetzt(), hex: hex(rahmen), zustand: this.zustand };
    const letzter = this.protokoll[this.protokoll.length - 1];
    // Der Ruhestrom wiederholt sich zehnmal pro Sekunde - nur Aenderungen sind
    // interessant, sonst ist das Protokoll nach zwei Sekunden unlesbar.
    if (letzter && letzter.hex === eintrag.hex) return;
    this.protokoll.push(eintrag);
    if (this.protokoll.length > this.maxZeilen) this.protokoll.shift();
    this.onEintrag(eintrag);
  }
}
