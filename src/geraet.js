// Die Verbindung zum echten Roboter ueber Web Bluetooth.
//
// Diese Schicht kennt nur Bytes: Rahmen schreiben, Sensorrahmen empfangen, die
// beiden Ein-Byte-Kanaele setzen. Was die Bytes bedeuten, weiss sie nicht -
// das steht noch nicht fest.
//
// Laeuft in Chrome fuer Android. Die Seite muss ueber HTTPS oder localhost
// ausgeliefert werden, und verbinde() darf nur aus einer Nutzergeste heraus
// aufgerufen werden.

import {
  DIENST_UUID,
  GERAETE_NAMENSPRAEFIX,
  SCHALTER_A_UUID,
  SCHALTER_B_UUID,
  SENSOR_UUID,
  STELL_UUID,
  leererRahmen,
  sensorenLesen,
} from './protokoll.js';

export function bluetoothVerfuegbar() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export class Geraet {
  #geraet = null;
  #server = null;
  #stell = null;
  #sensor = null;
  #schalter = new Map();
  #sendetGerade = false;
  #wartend = null;

  constructor() {
    /** @type {(zustand: 'getrennt'|'verbindet'|'verbunden', info?: object) => void} */
    this.onVerbindung = () => {};
    /** @type {(messwerte: {kanaele: number[], status: number}, roh: Uint8Array) => void} */
    this.onSensoren = () => {};
    /** @type {(rahmen: Uint8Array) => void} */
    this.onGesendet = () => {};
    this.name = null;
  }

  get verbunden() {
    return !!this.#server?.connected;
  }

  async verbinde() {
    if (!bluetoothVerfuegbar()) {
      throw new Error('Web Bluetooth ist hier nicht verfuegbar. Noetig sind Chrome fuer Android und HTTPS.');
    }
    this.onVerbindung('verbindet');
    this.#geraet = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: GERAETE_NAMENSPRAEFIX }],
      optionalServices: [DIENST_UUID],
    });
    this.name = this.#geraet.name ?? null;
    this.#geraet.addEventListener('gattserverdisconnected', () => {
      this.#server = null;
      this.#stell = null;
      this.onVerbindung('getrennt');
    });

    this.#server = await this.#geraet.gatt.connect();
    const dienst = await this.#server.getPrimaryService(DIENST_UUID);
    this.#stell = await dienst.getCharacteristic(STELL_UUID);
    this.#schalter.set('a', await dienst.getCharacteristic(SCHALTER_A_UUID));
    this.#schalter.set('b', await dienst.getCharacteristic(SCHALTER_B_UUID));

    this.#sensor = await dienst.getCharacteristic(SENSOR_UUID);
    this.#sensor.addEventListener('characteristicvaluechanged', (ereignis) => {
      const roh = new Uint8Array(ereignis.target.value.buffer);
      try {
        this.onSensoren(sensorenLesen(roh), roh);
      } catch {
        // Unerwartete Laenge: roh durchreichen genuegt, die Anzeige kann damit umgehen.
        this.onSensoren(null, roh);
      }
    });
    await this.#sensor.startNotifications();

    this.onVerbindung('verbunden', { name: this.name });
    return this;
  }

  async trenne() {
    await this.stopp().catch(() => {});
    if (this.#server?.connected) this.#server.disconnect();
    this.#server = null;
    this.#stell = null;
    this.onVerbindung('getrennt');
  }

  /** Liest die aktuellen Werte aller lesbaren Kanaele. */
  async lies() {
    const ergebnis = {};
    if (this.#stell) ergebnis.stell = new Uint8Array((await this.#stell.readValue()).buffer);
    if (this.#sensor) ergebnis.sensor = new Uint8Array((await this.#sensor.readValue()).buffer);
    for (const [name, merkmal] of this.#schalter) {
      ergebnis[`schalter_${name}`] = new Uint8Array((await merkmal.readValue()).buffer);
    }
    return ergebnis;
  }

  async setzeSchalter(name, wert) {
    const merkmal = this.#schalter.get(name);
    if (!merkmal) throw new RangeError(`unbekannter Schalter: ${name}`);
    await merkmal.writeValue(Uint8Array.of(wert & 0xff));
    return this;
  }

  /** Alles auf null - der Not-Aus dieser Schicht. */
  async stopp() {
    this.#wartend = null;
    return this.sende(leererRahmen());
  }

  /**
   * GATT vertraegt nur eine Schreiboperation gleichzeitig. Trifft ein neuer
   * Rahmen waehrend einer laufenden Uebertragung ein, wird nur der juengste
   * gemerkt - ein veralteter Stellwert darf nicht nachtraeglich ankommen.
   */
  sende(rahmen) {
    if (!this.#stell) return Promise.resolve(this);
    this.#wartend = rahmen;
    if (this.#sendetGerade) return Promise.resolve(this);
    return this.#sendeSchleife();
  }

  async #sendeSchleife() {
    this.#sendetGerade = true;
    try {
      while (this.#wartend) {
        const rahmen = this.#wartend;
        this.#wartend = null;
        const merkmal = this.#stell;
        if (!merkmal) break;
        if (typeof merkmal.writeValueWithoutResponse === 'function') {
          await merkmal.writeValueWithoutResponse(rahmen);
        } else {
          await merkmal.writeValue(rahmen);
        }
        this.onGesendet(rahmen);
      }
    } catch (fehler) {
      this.#wartend = null;
      this.onVerbindung('getrennt', { fehler: String(fehler) });
    } finally {
      this.#sendetGerade = false;
    }
    return this;
  }
}
