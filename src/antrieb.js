// Gemeinsame Basis aller Antriebe.
//
// Der Antrieb haelt einen Stellzustand in Absichten - "fahre vorwaerts, Stufe 2",
// nicht "Byte 3 auf 0x80". Jeder Kanal faellt nach einer Frist von selbst auf
// neutral zurueck, und der Zustand geht im Takt an die konkrete Umsetzung.
//
// Bewusst ohne Protokollwissen: die Uebersetzung in Stellbytes steht in
// zuordnung.js, das Senden in antrieb_robo.js. Der Verhaltenskern kennt beides
// nicht.
//
// Die Kanaele bilden ab, was der Roboter wirklich hat: zwei Antriebsmotoren
// (zusammen "fahrt"), einen Greifermotor und die Tonausgabe. Eine Hubachse gibt
// es nicht.

export const KANAELE = Object.freeze(['fahrt', 'greifer', 'klang']);

/** Sicherheitsgrenze: laenger als das faehrt das Tier ohne neuen Befehl nicht. */
export const FAHRT_GRENZE_MS = 2500;

export class Antrieb {
  #kanaele;
  #gesperrt = false;
  #taktgeber = null;

  /**
   * @param {{intervallMs?: number, fahrtGrenzeMs?: number, jetzt?: () => number}} optionen
   */
  constructor(optionen = {}) {
    const { intervallMs = 100, fahrtGrenzeMs = FAHRT_GRENZE_MS, jetzt = () => Date.now() } = optionen;
    this.intervallMs = intervallMs;
    this.fahrtGrenzeMs = fahrtGrenzeMs;
    this.jetzt = jetzt;
    /** @type {(zustand: object, zeit: number) => void} */
    this.onZustand = () => {};
    this.#kanaele = new Map(KANAELE.map((name) => [name, { wert: null, bis: 0 }]));
  }

  get gesperrt() {
    return this.#gesperrt;
  }

  /** Aktueller Stellzustand als einfaches Objekt. */
  get zustand() {
    const z = {};
    for (const [name, kanal] of this.#kanaele) z[name] = kanal.wert;
    return z;
  }

  /** Kurzform des Zustands fuer Protokoll und Anzeige. */
  get beschreibung() {
    const z = this.zustand;
    const fahrt = z.fahrt ? `${z.fahrt.richtung}:${z.fahrt.stufe}` : '-';
    return [`fahrt=${fahrt}`, `greifer=${z.greifer ?? '-'}`, `klang=${z.klang ?? '-'}`].join('  ');
  }

  /**
   * Verbleibende Dauer je Kanal in Millisekunden. Der Roboter bekommt sie im
   * Stellrahmen mit und haelt danach von selbst an, auch wenn diese Seite
   * stehenbleibt.
   */
  restzeiten(zeit = this.jetzt()) {
    const rest = {};
    for (const [name, kanal] of this.#kanaele) {
      rest[name] = kanal.wert === null || kanal.bis === Infinity
        ? Infinity
        : Math.max(0, kanal.bis - zeit);
    }
    return rest;
  }

  /**
   * Setzt einen Kanal. `dauerMs === null` haelt den Wert, bis er ueberschrieben
   * wird; die Fahrt wird davon ausgenommen und immer begrenzt.
   */
  setze(name, wert, dauerMs = null) {
    const kanal = this.#kanaele.get(name);
    if (!kanal) throw new RangeError(`unbekannter Kanal: ${name}`);
    if (this.#gesperrt) return this;
    let frist = dauerMs;
    if (name === 'fahrt' && wert !== null) {
      frist = Math.min(dauerMs ?? this.fahrtGrenzeMs, this.fahrtGrenzeMs);
    }
    kanal.wert = wert;
    kanal.bis = wert === null || frist === null ? Infinity : this.jetzt() + frist;
    return this;
  }

  fahre(richtung, stufe = 2, dauerMs = 800) {
    return this.setze('fahrt', { richtung, stufe }, dauerMs);
  }

  halt() {
    return this.setze('fahrt', null);
  }

  greife(stellung, dauerMs = 600) {
    return this.setze('greifer', stellung, dauerMs);
  }

  spiele(klangIndex, dauerMs = 300) {
    return this.setze('klang', klangIndex, dauerMs);
  }

  /**
   * Alles auf neutral, sofort hinaus, danach nimmt der Antrieb keine Befehle
   * mehr an. `entsperre()` hebt das wieder auf.
   */
  notAus() {
    for (const kanal of this.#kanaele.values()) {
      kanal.wert = null;
      kanal.bis = Infinity;
    }
    this.#gesperrt = true;
    this.#uebergib(this.jetzt());
    return this;
  }

  entsperre() {
    this.#gesperrt = false;
    return this;
  }

  /** Ein Takt: abgelaufene Kanaele zuruecksetzen und den Zustand uebergeben. */
  takt(zeit = this.jetzt()) {
    for (const kanal of this.#kanaele.values()) {
      if (kanal.wert !== null && zeit >= kanal.bis) {
        kanal.wert = null;
        kanal.bis = Infinity;
      }
    }
    this.#uebergib(zeit);
    return this;
  }

  #uebergib(zeit) {
    const zustand = this.zustand;
    this.onZustand(zustand, zeit);
    this.sendeStellwerte(zustand);
  }

  starteTakt() {
    if (this.#taktgeber !== null) return this;
    this.#taktgeber = setInterval(() => this.takt(), this.intervallMs);
    return this;
  }

  beendeTakt() {
    if (this.#taktgeber === null) return this;
    clearInterval(this.#taktgeber);
    this.#taktgeber = null;
    return this;
  }

  /** Von der konkreten Umsetzung zu ueberschreiben. */
  sendeStellwerte(_zustand) {
    throw new Error('sendeStellwerte() muss von der Unterklasse umgesetzt werden');
  }
}
