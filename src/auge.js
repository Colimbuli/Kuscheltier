// Die Kamera und die Gesichtserkennung.
//
// Laeuft im Browser ueber MediaPipe Tasks Vision, per WebAssembly auf dem
// Geraet - es geht kein Bild nach draussen. Geladen werden Programmteil und
// Modell allerdings von fremden Servern; ohne Netz startet das Auge beim ersten
// Mal nicht. Danach liegen beide im Browser-Zwischenspeicher.
//
// Diese Schicht deutet nichts. Sie sagt nur, ob ein Gesicht zu sehen ist, wo im
// Bild es steht und wie gross es ist. Was daraus folgt, entscheidet folgen.js.

/**
 * Versionsbereich statt fester Version: jsDelivr loest `@0.10` auf die neueste
 * 0.10.x auf. Eine feste Nummer waere sauberer, trifft aber ins Leere, wenn sie
 * zurueckgezogen wird - und ein totes Auge ist schlimmer als ein
 * Nebenversionssprung.
 */
export const PROGRAMM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10';
export const WASM_URL = `${PROGRAMM_URL}/wasm`;
export const MODELL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

/**
 * Abstand zwischen zwei Erkennungen. Gemessen am Zielgeraet braucht eine
 * Erkennung rund 27 ms, der Prozessor ist also nicht der Engpass - dieser Wert
 * ist es. Er rastet auf den Kameratakt ein: bei 30 Bildern je Sekunde wird
 * daraus jedes zweite Bild, also etwa 15 Erkennungen je Sekunde.
 */
export const ERKENNUNGS_INTERVALL_MS = 60;

/** Darunter gilt ein Fund nicht als Gesicht. */
export const MINDESTGUETE = 0.5;

export function kameraVerfuegbar() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export class Auge {
  #strom = null;
  #erkenner = null;
  #video = null;
  #laeuft = false;
  #letzteErkennung = 0;
  #letzterZeitstempel = -1;
  #bilder = 0;
  #fensterBeginn = 0;

  constructor(optionen = {}) {
    this.intervallMs = optionen.intervallMs ?? ERKENNUNGS_INTERVALL_MS;
    this.mindestguete = optionen.mindestguete ?? MINDESTGUETE;
    this.zustand = 'aus';
    this.fps = 0;
    this.dauerMs = 0;
    this.beschleunigung = null;
    /** @type {(befund: object) => void} */
    this.onBefund = () => {};
    /** @type {(zustand: string, text?: string) => void} */
    this.onZustand = () => {};
  }

  get laeuft() {
    return this.#laeuft;
  }

  #melde(zustand, text) {
    this.zustand = zustand;
    this.onZustand(zustand, text);
  }

  /** Kamera oeffnen, Modell laden, Erkennung starten. Braucht eine Nutzergeste. */
  async starte(video) {
    if (this.#laeuft) return this;
    if (!kameraVerfuegbar()) throw new Error('Diese Umgebung hat keine Kamera.');
    this.#video = video;
    this.#melde('startet');

    this.#strom = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.srcObject = this.#strom;
    await video.play();

    try {
      this.#erkenner = await this.#erkennerBauen();
    } catch (fehler) {
      // Ohne Erkenner ist die Kamera nutzlos - sie darf dann nicht weiterlaufen.
      // Sonst bleibt die Kameraleuchte an und niemand weiss, warum.
      await this.#kameraSchliessen();
      this.#melde('fehler', String(fehler.message ?? fehler));
      throw fehler;
    }

    this.#laeuft = true;
    this.#fensterBeginn = performance.now();
    this.#bilder = 0;
    this.#melde('laeuft');
    this.#schleife();
    return this;
  }

  async #erkennerBauen() {
    const { FilesetResolver, FaceDetector } = await import(/* @vite-ignore */ PROGRAMM_URL);
    const teile = await FilesetResolver.forVisionTasks(WASM_URL);
    const bauen = async (delegate) => FaceDetector.createFromOptions(teile, {
      baseOptions: { modelAssetPath: MODELL_URL, delegate },
      runningMode: 'VIDEO',
      minDetectionConfidence: this.mindestguete,
    });
    try {
      const erkenner = await bauen('GPU');
      this.beschleunigung = 'GPU';
      return erkenner;
    } catch {
      // Aeltere Geraete koennen den GPU-Weg nicht; auf dem Prozessor geht es
      // langsamer, aber es geht.
      const erkenner = await bauen('CPU');
      this.beschleunigung = 'CPU';
      return erkenner;
    }
  }

  async stoppe() {
    this.#laeuft = false;
    await this.#kameraSchliessen();
    this.#erkenner?.close?.();
    this.#erkenner = null;
    this.#melde('aus');
    return this;
  }

  async #kameraSchliessen() {
    for (const spur of this.#strom?.getTracks() ?? []) spur.stop();
    this.#strom = null;
    if (this.#video) this.#video.srcObject = null;
    this.fps = 0;
    this.dauerMs = 0;
  }

  #schleife() {
    if (!this.#laeuft) return;
    const weiter = () => {
      if (!this.#laeuft) return;
      if (typeof this.#video?.requestVideoFrameCallback === 'function') {
        this.#video.requestVideoFrameCallback(() => this.#schleife());
      } else {
        requestAnimationFrame(() => this.#schleife());
      }
    };

    const jetzt = performance.now();
    if (jetzt - this.#letzteErkennung < this.intervallMs) {
      weiter();
      return;
    }
    this.#letzteErkennung = jetzt;

    try {
      this.#erkenne(jetzt);
    } catch (fehler) {
      this.#laeuft = false;
      this.#melde('fehler', String(fehler.message ?? fehler));
      return;
    }
    weiter();
  }

  #erkenne(jetzt) {
    const video = this.#video;
    if (!video?.videoWidth) return;

    // MediaPipe verlangt streng wachsende Zeitstempel.
    const stempel = Math.max(this.#letzterZeitstempel + 1, Math.round(jetzt));
    this.#letzterZeitstempel = stempel;

    const vorher = performance.now();
    const ergebnis = this.#erkenner.detectForVideo(video, stempel);
    this.dauerMs = Math.round(performance.now() - vorher);

    this.#bilder += 1;
    const fenster = jetzt - this.#fensterBeginn;
    if (fenster >= 1000) {
      this.fps = Math.round((this.#bilder * 1000) / fenster);
      this.#bilder = 0;
      this.#fensterBeginn = jetzt;
    }

    this.onBefund(this.#befundAus(ergebnis, video));
  }

  #befundAus(ergebnis, video) {
    const treffer = (ergebnis?.detections ?? [])
      .map((d) => ({ d, guete: d.categories?.[0]?.score ?? 0 }))
      .filter((t) => t.guete >= this.mindestguete)
      // Das groesste Gesicht ist das naechste - dem folgt das Tier.
      .sort((a, b) => (b.d.boundingBox?.width ?? 0) - (a.d.boundingBox?.width ?? 0))[0];

    if (!treffer) {
      return { gefunden: false, anzahl: 0, fps: this.fps, dauerMs: this.dauerMs };
    }

    const k = treffer.d.boundingBox;
    const breite = video.videoWidth;
    const hoehe = video.videoHeight;
    return {
      gefunden: true,
      anzahl: ergebnis.detections.length,
      guete: treffer.guete,
      mitteX: ((k.originX + k.width / 2) / breite) * 2 - 1,
      mitteY: ((k.originY + k.height / 2) / hoehe) * 2 - 1,
      groesse: k.width / breite,
      kasten: { x: k.originX / breite, y: k.originY / hoehe, b: k.width / breite, h: k.height / hoehe },
      fps: this.fps,
      dauerMs: this.dauerMs,
    };
  }
}
