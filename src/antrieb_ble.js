// Antrieb ueber Web Bluetooth.
//
// Laeuft in Chrome fuer Android (und Chrome/Edge am Rechner). Die Seite muss
// ueber HTTPS oder localhost ausgeliefert werden, sonst gibt es kein
// navigator.bluetooth. Die Geraeteauswahl verlangt eine Nutzergeste, also darf
// verbinde() nur aus einem Klick-Handler heraus aufgerufen werden.

import { Antrieb } from './antrieb.js';
import {
  DIENST_UUID,
  FIRMWARE_UUID,
  GERAETEINFO_UUID,
  GERAETE_NAMENSPRAEFIX,
  MELDUNG_UUID,
  SCHREIB_UUID,
  meldungLesen,
} from './protokoll.js';

export function bluetoothVerfuegbar() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export class BleAntrieb extends Antrieb {
  #geraet = null;
  #server = null;
  #schreiben = null;
  #melden = null;
  #sendetGerade = false;
  #wartend = null;

  constructor(optionen = {}) {
    super(optionen);
    /** @type {(zustand: 'getrennt'|'verbindet'|'verbunden', info?: object) => void} */
    this.onVerbindung = () => {};
    /** @type {(meldung: {klang: number, zustand: string}, roh: string) => void} */
    this.onMeldung = () => {};
    this.geraetename = null;
  }

  get verbunden() {
    return !!this.#server?.connected;
  }

  /** Geraeteauswahl und Verbindungsaufbau. Nur aus einer Nutzergeste heraus. */
  async verbinde() {
    if (!bluetoothVerfuegbar()) {
      throw new Error('Web Bluetooth ist hier nicht verfuegbar. Chrome fuer Android und HTTPS noetig.');
    }
    this.onVerbindung('verbindet');
    this.#geraet = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: GERAETE_NAMENSPRAEFIX }],
      optionalServices: [DIENST_UUID, GERAETEINFO_UUID],
    });
    this.geraetename = this.#geraet.name ?? null;
    this.#geraet.addEventListener('gattserverdisconnected', () => {
      this.beendeTakt();
      this.#server = null;
      this.#schreiben = null;
      this.onVerbindung('getrennt');
    });

    this.#server = await this.#geraet.gatt.connect();
    const dienst = await this.#server.getPrimaryService(DIENST_UUID);
    this.#schreiben = await dienst.getCharacteristic(SCHREIB_UUID);

    await this.#meldungenAbonnieren(dienst);
    this.firmware = await this.#firmwareLesen();

    this.entsperre();
    this.starteTakt();
    this.onVerbindung('verbunden', { name: this.geraetename, firmware: this.firmware });
    return this;
  }

  async trenne() {
    this.beendeTakt();
    if (this.#server?.connected) this.#server.disconnect();
    this.#server = null;
    this.#schreiben = null;
    this.onVerbindung('getrennt');
  }

  async #meldungenAbonnieren(dienst) {
    try {
      this.#melden = await dienst.getCharacteristic(MELDUNG_UUID);
      await this.#melden.startNotifications();
      this.#melden.addEventListener('characteristicvaluechanged', (ereignis) => {
        const roh = new TextDecoder('latin1').decode(ereignis.target.value.buffer);
        const meldung = meldungLesen(roh);
        if (meldung) this.onMeldung(meldung, roh);
      });
    } catch {
      // Ohne Rueckmeldungen laesst sich trotzdem fahren.
      this.#melden = null;
    }
  }

  async #firmwareLesen() {
    try {
      const info = await this.#server.getPrimaryService(GERAETEINFO_UUID);
      const merkmal = await info.getCharacteristic(FIRMWARE_UUID);
      const text = new TextDecoder().decode((await merkmal.readValue()).buffer);
      if (text.includes('1.0')) return 1;
      if (text.includes('2.0')) return 2;
    } catch {
      // Manche Geraete geben den Dienst nicht her.
    }
    return this.firmware;
  }

  /**
   * GATT vertraegt nur eine Schreiboperation gleichzeitig. Faellt ein Takt in
   * eine laufende Uebertragung, wird nur der juengste Rahmen gemerkt - ein
   * veralteter Stellwert darf nicht nachtraeglich noch ankommen.
   */
  sendeRohdaten(rahmen) {
    if (!this.#schreiben) return;
    this.#wartend = rahmen;
    if (this.#sendetGerade) return;
    this.#sendeSchleife();
  }

  async #sendeSchleife() {
    this.#sendetGerade = true;
    try {
      while (this.#wartend) {
        const rahmen = this.#wartend;
        this.#wartend = null;
        const merkmal = this.#schreiben;
        if (!merkmal) break;
        if (typeof merkmal.writeValueWithoutResponse === 'function') {
          await merkmal.writeValueWithoutResponse(rahmen);
        } else {
          await merkmal.writeValue(rahmen);
        }
      }
    } catch (fehler) {
      this.#wartend = null;
      this.onVerbindung('getrennt', { fehler: String(fehler) });
    } finally {
      this.#sendetGerade = false;
    }
  }
}
