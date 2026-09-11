// Der Antrieb, der wirklich Motoren bewegt.
//
// Nimmt den Stellzustand der Basisklasse, laesst ihn von zuordnung.js in einen
// Rahmen uebersetzen und schickt ihn ueber geraet.js hinaus. Toene laufen ueber
// einen eigenen Kanal und werden nur bei Aenderung ausgeloest, nicht im Takt -
// sonst faengt der Roboter zehnmal pro Sekunde denselben Ton neu an.

import { Antrieb } from './antrieb.js';
import { BYTES_JE_MOTOR, hex } from './protokoll.js';
import { rahmenFuer } from './zuordnung.js';

/**
 * Auffrischung: dieselbe Absicht geht spaetestens nach dieser Zeit erneut raus,
 * damit eine Bewegung ueber die im Rahmen mitgegebene Dauer hinaus weiterlaeuft.
 */
export const AUFFRISCHUNG_MS = 800;

/**
 * Die Dauerbytes zaehlen in jedem Takt herunter, der Rahmen ist also nie
 * zweimal gleich. Verglichen wird deshalb nur die Absicht - Befehl und Kraft
 * je Motor -, sonst ginge zehnmal je Sekunde ein Paket hinaus.
 */
function absichtVon(rahmen) {
  const teile = [];
  for (let i = 0; i < rahmen.length; i += BYTES_JE_MOTOR) {
    teile.push(rahmen[i], rahmen[i + 1]);
  }
  return teile.join(',');
}

export class RoboAntrieb extends Antrieb {
  #geraet;
  #letzteAbsicht = null;
  #letzteSendung = 0;
  #letzterKlang = null;

  /**
   * @param {{geraet: import('./geraet.js').Geraet,
   *          drehsinn?: {fahrtGetauscht?: boolean, greiferGetauscht?: boolean}}
   *         & ConstructorParameters<typeof Antrieb>[0]} optionen
   */
  constructor(optionen = {}) {
    const { geraet, drehsinn = {}, ...rest } = optionen;
    super(rest);
    if (!geraet) throw new TypeError('RoboAntrieb braucht ein Geraet');
    this.#geraet = geraet;
    this.drehsinn = { fahrtGetauscht: false, greiferGetauscht: false, ...drehsinn };
    /** @type {(rahmen: Uint8Array, text: string) => void} */
    this.onRahmen = () => {};
  }

  get verbunden() {
    return this.#geraet.verbunden;
  }

  sendeStellwerte(zustand) {
    if (!this.#geraet.verbunden) return;
    const zeit = this.jetzt();
    this.#klangPflegen(zustand.klang);

    const rahmen = rahmenFuer(zustand, this.restzeiten(zeit), this.drehsinn);
    const absicht = absichtVon(rahmen);
    const inBewegung = zustand.fahrt !== null || zustand.greifer !== null;
    const faellig = inBewegung && zeit - this.#letzteSendung >= AUFFRISCHUNG_MS;
    if (absicht === this.#letzteAbsicht && !faellig) return;

    this.#letzteAbsicht = absicht;
    this.#letzteSendung = zeit;
    this.onRahmen(rahmen, hex(rahmen));
    this.#geraet.sende(rahmen);
  }

  #klangPflegen(klang) {
    if (klang === this.#letzterKlang) return;
    this.#letzterKlang = klang;
    const versprechen = klang === null
      ? this.#geraet.beendeTon()
      : this.#geraet.spieleTon(klang);
    // Ein misslungener Ton darf den Antrieb nicht aufhalten.
    versprechen?.catch?.(() => {});
  }
}
