// Die Verbindung zum echten Roboter ueber Web Bluetooth.
//
// Diese Schicht kennt nur Bytes: Stellrahmen schreiben, Sensorrahmen empfangen,
// Toene ausloesen. Was ein Rahmen bedeutet, entscheidet zuordnung.js.
//
// Laeuft in Chrome fuer Android. Die Seite muss ueber HTTPS oder localhost
// ausgeliefert werden, und verbinde() darf nur aus einer Nutzergeste heraus
// aufgerufen werden.

import {
  DIENST_UUID,
  GERAETE_NAMENSPRAEFIX,
  RESERVE_UUID,
  SENSOR_UUID,
  STELL_UUID,
  TON_STOPP,
  TON_UUID,
  sensorenLesen,
  stellRahmen,
  tonByte,
} from './protokoll.js';

/** Alle Motoren bremsen, mit Dauer null - der Ruhezustand. */
function haltRahmen() {
  return stellRahmen([
    { befehl: 'bremse', kraft: 0, dauerMs: 0 },
    { befehl: 'bremse', kraft: 0, dauerMs: 0 },
    { befehl: 'bremse', kraft: 0, dauerMs: 0 },
  ]);
}

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

  /**
   * Schreibart fuer den Stellkanal. "mit" ist ein Write Request mit
   * Bestaetigung, "ohne" ein Write Command. Letzteres ist schneller, aber ein
   * verworfenes Paket faellt nirgends auf - Chrome meldet keinen Fehler.
   * @type {'mit'|'ohne'}
   */
  schreibart = 'mit';

  constructor() {
    /** @type {(zustand: 'getrennt'|'verbindet'|'verbunden', info?: object) => void} */
    this.onVerbindung = () => {};
    /** @type {(rahmen: Uint8Array, erfolg: boolean, fehler?: string) => void} */
    this.onSchreiben = () => {};
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
    this.#schalter.set('ton', await dienst.getCharacteristic(TON_UUID));
    this.#schalter.set('reserve', await dienst.getCharacteristic(RESERVE_UUID));

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
    // Erst nach dieser Bestaetigung nimmt der Roboter Stellbefehle an - so macht
    // es auch die Hersteller-App, und vorher verwirft die Firmware alles.
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

  /** Spielt einen Ton, wahlweise in Endlosschleife. */
  async spieleTon(nummer, schleife = false) {
    return this.setzeSchalter('ton', tonByte(nummer, schleife));
  }

  async beendeTon() {
    return this.setzeSchalter('ton', TON_STOPP);
  }

  /** Alle Motoren bremsen - der Not-Aus dieser Schicht. */
  async stopp() {
    this.#wartend = null;
    return this.sende(haltRahmen());
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
    while (this.#wartend) {
      const rahmen = this.#wartend;
      this.#wartend = null;
      const merkmal = this.#stell;
      if (!merkmal) break;
      try {
        const ohneBestaetigung = this.schreibart === 'ohne'
          && typeof merkmal.writeValueWithoutResponse === 'function';
        if (ohneBestaetigung) {
          await merkmal.writeValueWithoutResponse(rahmen);
        } else {
          await merkmal.writeValue(rahmen);
        }
        this.onSchreiben(rahmen, true);
        this.onGesendet(rahmen);
      } catch (fehler) {
        // Ein misslungener Schreibvorgang ist noch kein Verbindungsabbruch.
        // Er muss aber sichtbar werden, sonst sucht man an der falschen Stelle.
        this.onSchreiben(rahmen, false, String(fehler.message ?? fehler));
        if (!this.verbunden) {
          this.onVerbindung('getrennt', { fehler: String(fehler.message ?? fehler) });
          break;
        }
      }
    }
    this.#sendetGerade = false;
    return this;
  }
}
