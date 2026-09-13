// Verdrahtung der Oberflaeche. Enthaelt keine Verhaltenslogik und kein
// Protokollwissen - nur Knoepfe, Anzeige und die Uhr.

import { RoboAntrieb } from './antrieb_robo.js';
import { Simulator } from './antrieb_sim.js';
import { Auge, kameraVerfuegbar } from './auge.js';
import { drehsinnLaden, drehsinnSichern } from './drehsinn.js';
import { Folgen } from './folgen.js';
import { Geraet, bluetoothVerfuegbar } from './geraet.js';
import {
  MOTOR_ANZAHL, MOTOR_HALT, RAHMEN_LAENGE, TESTRAHMEN_VORWAERTS, TOENE, hex, leererRahmen,
  rahmenAus, stellRahmen,
} from './protokoll.js';
import { Sondierung, VERSUCHSDAUER_MS } from './sondierung.js';
import { laden, sichern, vergessen } from './speicher.js';
import { TRIEBE, Triebe } from './triebe.js';
import { Verhalten } from './verhalten.js';

const TAKT_MS = 100;
const ANZEIGE_MS = 200;
const SICHERN_MS = 5000;
const BYTE_SCHRITT = 16;
const SONDIERUNG_SCHLUESSEL = 'kuscheltier.sondierung.v1';
/** So lange nach einem Ausweichen wird kein neues Hindernis gemeldet. */
const HINDERNIS_SPERRE_MS = 4000;
/**
 * Wie lange ein Fahrbefehl des Folgens gilt. Reichlich laenger als ein Takt,
 * damit eine ausgelassene Erkennung nicht ruckelt - und kurz genug, dass der
 * Roboter stehenbleibt, wenn die Seite haengt.
 */
const FOLGEN_BEFEHL_MS = 400;

const BESCHRIFTUNG = {
  energie: 'Energie',
  sattheit: 'Sattheit',
  zuwendung: 'Zuwendung',
  beschaeftigung: 'Beschäftigung',
};

const el = (id) => document.getElementById(id);
const hexByte = (wert) => wert.toString(16).padStart(2, '0').toUpperCase();

// --- Zustand ---------------------------------------------------------------

const gespeichert = laden();
const triebe = new Triebe(gespeichert?.werte ?? {});
if (gespeichert) triebe.verstreiche(Date.now() - gespeichert.zeit);

const geraet = new Geraet();
const drehsinn = drehsinnLaden();
const sondierung = Sondierung.ausJSON(laden(SONDIERUNG_SCHLUESSEL)?.werte);

let antrieb = neuerSimulator();
const verhalten = new Verhalten({ triebe, antrieb });

let letzteZeit = Date.now();
let letzteAnzeige = 0;
let letztesSichern = Date.now();
let letztesHindernis = 0;
let tasterVorher = false;
let handrahmen = leererRahmen();
let dauersender = null;
let versuchLaeuft = false;
let tonSchleife = false;
let gespiegelt = false;
/** @type {object|null} */
let letzterBefund = null;

const auge = new Auge();
const folgen = new Folgen();

function protokolliere(text) {
  const log = el('log');
  const uhrzeit = new Date().toLocaleTimeString('de-DE', { hour12: false });
  log.textContent += `${uhrzeit}  ${text}\n`;
  const zeilen = log.textContent.split('\n');
  if (zeilen.length > 200) log.textContent = zeilen.slice(-200).join('\n');
  log.scrollTop = log.scrollHeight;
}

function neuerSimulator() {
  const sim = new Simulator();
  sim.onZustand = () => {};
  sim.onEintrag = (eintrag) => protokolliere(`~ ${eintrag.text}`);
  sim.starteTakt();
  return sim;
}

function neuerRoboAntrieb() {
  const robo = new RoboAntrieb({ geraet, drehsinn });
  robo.onRahmen = (_rahmen, text) => protokolliere(`> ${text}`);
  robo.starteTakt();
  return robo;
}

function uebernimm(neu) {
  antrieb.beendeTakt();
  antrieb = neu;
  verhalten.antrieb = neu;
}

// --- Geraet ----------------------------------------------------------------

geraet.onGesendet = () => {};
geraet.onSchreiben = (rahmen, erfolg, fehler) => {
  if (!erfolg) protokolliere(`! ${hex(rahmen)} — Schreiben fehlgeschlagen: ${fehler}`);
};
geraet.onSensoren = (messwerte, roh) => {
  if (!messwerte) {
    el('sensoren').textContent = `Unerwarteter Sensorrahmen\nRoh  ${hex(roh)}`;
    return;
  }
  const zeilen = messwerte.ir.map((s, i) => {
    const lage = !s.angeschlossen ? 'nicht angeschlossen'
      : !s.brauchbar ? 'zu hell'
      : s.hindernis ? 'HINDERNIS' : 'frei';
    return `IR ${i}   A ${String(s.a).padStart(5)}  B ${String(s.b).padStart(5)}` +
      `  Differenz ${String(s.differenz).padStart(6)}  ${lage}`;
  });
  zeilen.push(`Taster  ${messwerte.taster ? 'gedrückt' : 'offen'}`);
  el('sensoren').textContent = zeilen.join('\n');
  sinneswahrnehmung(messwerte);
};

/** Sensorwerte in Ereignisse fuer das Tier uebersetzen. */
function sinneswahrnehmung(messwerte) {
  const jetzt = Date.now();
  if (messwerte.taster && !tasterVorher) verhalten.reagiere('streicheln', jetzt);
  tasterVorher = messwerte.taster;

  const inBewegung = antrieb.zustand.fahrt !== null;
  const hindernis = messwerte.ir.some((s) => s.hindernis);
  if (inBewegung && hindernis && jetzt - letztesHindernis > HINDERNIS_SPERRE_MS) {
    letztesHindernis = jetzt;
    verhalten.reagiere('hindernis', jetzt);
  }
}

geraet.onVerbindung = (zustand, info) => {
  if (zustand === 'verbunden') {
    el('status').textContent = info.name ?? 'verbunden';
    el('laborStatus').textContent = `${info.name} verbunden.`;
    el('verbinden').textContent = 'Trennen';
    protokolliere(`verbunden mit ${info.name}`);
    uebernimm(neuerRoboAntrieb());
    // Beim Verbinden bleibt das Tier still. Wer einen Roboter in der Hand
    // haelt, soll nicht davon ueberrascht werden, dass er losfaehrt.
    el('autopilot').checked = false;
    protokolliere('Eigenleben ist aus - im Reiter "Tier" einschalten.');
    leseWerte();
  } else if (zustand === 'verbindet') {
    el('status').textContent = 'verbinde …';
  } else {
    el('status').textContent = info?.fehler ? 'Fehler' : 'nicht verbunden';
    el('laborStatus').textContent = info?.fehler
      ? `Getrennt: ${info.fehler}`
      : 'Nicht verbunden. Oben auf „Roboter verbinden" tippen.';
    el('verbinden').textContent = 'Roboter verbinden';
    dauersendenAus();
    if (antrieb instanceof RoboAntrieb) uebernimm(neuerSimulator());
  }
  zeichne();
};

async function leseWerte() {
  if (!geraet.verbunden) return;
  try {
    const werte = await geraet.lies();
    el('wertReserve').textContent = hexByte(werte.schalter_reserve[0]);
    protokolliere(`< Stell    ${hex(werte.stell)}`);
    protokolliere(`< Sensor   ${hex(werte.sensor)}`);
  } catch (fehler) {
    protokolliere(`Lesen fehlgeschlagen: ${fehler.message ?? fehler}`);
  }
}

// --- Anzeige ---------------------------------------------------------------

function triebeAufbauen() {
  el('triebe').innerHTML = TRIEBE.map((name) => `
    <div class="trieb">
      <div class="trieb-kopf"><span>${BESCHRIFTUNG[name]}</span><span id="wert-${name}">–</span></div>
      <div class="spur"><div class="fuellung" id="balken-${name}" style="width:0%"></div></div>
    </div>`).join('');
}

function toeneAufbauen() {
  el('toene').innerHTML = Object.entries(TOENE)
    .map(([nummer, name]) => `<button data-ton="${nummer}">${nummer} · ${name}</button>`)
    .join('');
}

function bytesAufbauen() {
  el('bytes').innerHTML = Array.from({ length: RAHMEN_LAENGE }, (_, i) => `
    <div class="bytezeile">
      <span class="name">Byte ${i}</span>
      <button data-byte="${i}" data-delta="-${BYTE_SCHRITT}">−</button>
      <span class="wert" id="byte-${i}">00</span>
      <button data-byte="${i}" data-delta="${BYTE_SCHRITT}">+</button>
      <button data-byte="${i}" data-setze="255">FF</button>
      <button data-byte="${i}" data-setze="0">0</button>
    </div>`).join('');
}

function zeichneBytes() {
  for (let i = 0; i < RAHMEN_LAENGE; i += 1) el(`byte-${i}`).textContent = hexByte(handrahmen[i]);
}

function zeichneDrehsinn() {
  el('wertDrehsinnFahrt').textContent = drehsinn.fahrtGetauscht ? 'getauscht' : 'normal';
  el('wertDrehsinnGreifer').textContent = drehsinn.greiferGetauscht ? 'getauscht' : 'normal';
}

function zeichneVersuch() {
  const versuch = sondierung.aktuell;
  if (!versuch) {
    el('versuchText').textContent = 'Alle Versuche durch.';
    el('versuchHex').textContent = '–';
  } else {
    el('versuchText').textContent =
      `Versuch ${sondierung.nummer} von ${sondierung.laenge}: Byte ${versuch.byte} = 0x${hexByte(versuch.wert)}`;
    el('versuchHex').textContent = hex(sondierung.rahmen);
  }
  el('bericht').textContent = sondierung.ergebnisse.length ? sondierung.bericht() : 'Noch kein Versuch.';
  el('versuchSenden').disabled = !versuch || versuchLaeuft || !geraet.verbunden;
  el('versuchJa').disabled = !versuch;
  el('versuchNein').disabled = !versuch;
}

function zeichneSicht(befund) {
  const leinwand = el('sichtRahmen');
  const flaeche = leinwand.getBoundingClientRect();
  leinwand.width = Math.round(flaeche.width);
  leinwand.height = Math.round(flaeche.height);
  const stift = leinwand.getContext('2d');
  stift.clearRect(0, 0, leinwand.width, leinwand.height);

  if (befund?.gefunden) {
    const k = befund.kasten;
    const x = (gespiegelt ? 1 - k.x - k.b : k.x) * leinwand.width;
    stift.strokeStyle = folgen.zustand === 'haelt' ? '#5ac8a0' : '#e2b04a';
    stift.lineWidth = 3;
    stift.strokeRect(x, k.y * leinwand.height, k.b * leinwand.width, k.h * leinwand.height);
  }
  // Die Mittellinie macht sichtbar, worauf das Folgen ausrichtet.
  stift.strokeStyle = '#ffffff33';
  stift.lineWidth = 1;
  stift.beginPath();
  stift.moveTo(leinwand.width / 2, 0);
  stift.lineTo(leinwand.width / 2, leinwand.height);
  stift.stroke();
}

function zeichneMessung(befund) {
  const zeilen = [
    `Zustand   ${auge.zustand}${auge.beschleunigung ? ` (${auge.beschleunigung})` : ''}`,
    `Tempo     ${auge.fps} Bilder/s, ${auge.dauerMs} ms je Erkennung`,
  ];
  if (befund?.gefunden) {
    zeilen.push(
      `Gesicht   Ablage ${befund.mitteX.toFixed(2)}   Groesse ${befund.groesse.toFixed(2)}` +
      `   Guete ${befund.guete.toFixed(2)}`,
      `Gesichter ${befund.anzahl}`,
    );
  } else if (auge.laeuft) {
    zeilen.push('Gesicht   keins im Bild');
  }
  zeilen.push(`Folgen    ${folgen.zustand}`);
  el('sichtMessung').textContent = zeilen.join('\n');
}

function zeichne() {
  el('stimmung').textContent = verhalten.stimmung;
  const handlung = verhalten.aktuell;
  el('handlung').textContent = handlung ? `${handlung.name} (Schritt ${handlung.schritt + 1})` : 'ruht';

  for (const name of TRIEBE) {
    const wert = Math.round(triebe.werte[name]);
    el(`wert-${name}`).textContent = String(wert);
    const balken = el(`balken-${name}`);
    balken.style.width = `${wert}%`;
    balken.dataset.knapp = String(wert < 35);
  }

  el('lampe').dataset.an = String(geraet.verbunden);
  el('notaus').textContent = antrieb.gesperrt ? 'Entsperren' : 'NOT-AUS';
  zeichneMessung(letzterBefund);
}

// --- Uhr -------------------------------------------------------------------

setInterval(() => {
  const jetzt = Date.now();
  const abstand = jetzt - letzteZeit;
  letzteZeit = jetzt;

  const inBewegung = antrieb.zustand.fahrt !== null;
  const ruhend = verhalten.ruht && ['erschoepft', 'muede'].includes(verhalten.stimmung);
  triebe.verstreiche(abstand, { inBewegung, ruhend });

  if (antrieb.gesperrt) {
    // nichts
  } else if (el('folgen').checked) {
    const absicht = folgen.takt(letzterBefund, jetzt);
    if (absicht) {
      antrieb.fahre(absicht.richtung, absicht.stufe, FOLGEN_BEFEHL_MS);
    } else {
      antrieb.halt();
    }
  } else if (el('autopilot').checked) {
    verhalten.takt(jetzt);
  }

  if (jetzt - letzteAnzeige >= ANZEIGE_MS) {
    letzteAnzeige = jetzt;
    zeichne();
  }
  if (jetzt - letztesSichern >= SICHERN_MS) {
    letztesSichern = jetzt;
    sichern(triebe.toJSON());
  }
}, TAKT_MS);

addEventListener('pagehide', () => sichern(triebe.toJSON()));
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') sichern(triebe.toJSON());
});

// --- Knoepfe: allgemein ----------------------------------------------------

function reiterWaehlen(name) {
  const tier = name === 'tier';
  el('reiter-tier').setAttribute('aria-selected', String(tier));
  el('reiter-labor').setAttribute('aria-selected', String(!tier));
  el('blatt-tier').hidden = !tier;
  el('blatt-labor').hidden = tier;
}
el('reiter-tier').addEventListener('click', () => reiterWaehlen('tier'));
el('reiter-labor').addEventListener('click', () => reiterWaehlen('labor'));

el('verbinden').addEventListener('click', async () => {
  if (geraet.verbunden) {
    await geraet.trenne();
    return;
  }
  try {
    await geraet.verbinde();
  } catch (fehler) {
    el('laborStatus').textContent = String(fehler.message ?? fehler);
    protokolliere(`Verbinden fehlgeschlagen: ${fehler.message ?? fehler}`);
  }
});

el('notaus').addEventListener('click', async () => {
  if (antrieb.gesperrt) {
    antrieb.entsperre();
  } else {
    antrieb.notAus();
    el('autopilot').checked = false;
    el('folgen').checked = false;
  }
  dauersendenAus();
  handrahmen = leererRahmen();
  zeichneBytes();
  if (geraet.verbunden) {
    await geraet.stopp();
    await geraet.beendeTon().catch(() => {});
  }
  zeichne();
});

for (const knopf of document.querySelectorAll('[data-ereignis]')) {
  knopf.addEventListener('click', () => {
    verhalten.reagiere(knopf.dataset.ereignis, Date.now());
    zeichne();
  });
}

// --- Knoepfe: Augen --------------------------------------------------------

auge.onBefund = (befund) => {
  letzterBefund = befund;
  zeichneSicht(befund);
};

auge.onZustand = (zustand, text) => {
  el('sichtLeer').hidden = zustand === 'laeuft';
  el('sichtLeer').textContent = zustand === 'fehler' ? `Auge gestört: ${text}` : 'Kamera aus';
  el('kamera').textContent = auge.laeuft ? 'Kamera ausschalten' : 'Kamera einschalten';
  el('folgen').disabled = !auge.laeuft;
  if (!auge.laeuft) {
    el('folgen').checked = false;
    letzterBefund = null;
    folgen.zuruecksetzen();
  }
  if (text) protokolliere(`Auge: ${zustand} — ${text}`);
};

el('kamera').addEventListener('click', async () => {
  if (auge.laeuft) {
    await auge.stoppe();
    return;
  }
  el('kamera').disabled = true;
  try {
    await auge.starte(el('video'));
  } catch (fehler) {
    const text = String(fehler.message ?? fehler);
    el('sichtLeer').hidden = false;
    el('sichtLeer').textContent = `Kamera nicht möglich: ${text}`;
    protokolliere(`Kamera fehlgeschlagen: ${text}`);
  } finally {
    el('kamera').disabled = false;
  }
});

el('sichtSpiegeln').addEventListener('click', () => {
  gespiegelt = !gespiegelt;
  el('video').style.transform = gespiegelt ? 'scaleX(-1)' : '';
  el('sichtSpiegeln').textContent = `Ansicht: ${gespiegelt ? 'gespiegelt' : 'normal'}`;
});

el('folgen').addEventListener('change', () => {
  if (el('folgen').checked) {
    el('autopilot').checked = false;
    folgen.zuruecksetzen();
    if (antrieb.gesperrt) antrieb.entsperre();
  } else {
    antrieb.halt();
  }
});

el('autopilot').addEventListener('change', () => {
  if (el('autopilot').checked) el('folgen').checked = false;
});

// --- Knoepfe: Labor --------------------------------------------------------

el('lesen').addEventListener('click', leseWerte);

el('nullen').addEventListener('click', async () => {
  handrahmen = leererRahmen();
  zeichneBytes();
  dauersendenAus();
  if (geraet.verbunden) await geraet.stopp();
});

/** Rohbefehle gehen am Verhalten vorbei, also alle Automatik abschalten. */
function ohneEigenleben(wirkung) {
  el('autopilot').checked = false;
  el('folgen').checked = false;
  if (antrieb.gesperrt) antrieb.entsperre();
  return wirkung();
}

const MOTOR_NAMEN = ['M1', 'M2', 'M3'];

function motortestAufbauen() {
  el('motortest').innerHTML = MOTOR_NAMEN.flatMap((name, i) => [
    `<button data-motor="${i}" data-befehl="vorwaerts">${name} vorwärts</button>`,
    `<button data-motor="${i}" data-befehl="rueckwaerts">${name} rückwärts</button>`,
  ]).join('');
}

el('motortest').addEventListener('click', async (ereignis) => {
  const knopf = ereignis.target.closest('button');
  if (!knopf || !geraet.verbunden) return;
  ohneEigenleben(() => {});
  const index = Number(knopf.dataset.motor);
  const motoren = Array.from({ length: MOTOR_ANZAHL }, (_, i) => (
    i === index
      ? { befehl: knopf.dataset.befehl, kraft: 1, dauerMs: 2000 }
      : { ...MOTOR_HALT }
  ));
  const rahmen = stellRahmen(motoren);
  protokolliere(`> ${hex(rahmen)}   (${MOTOR_NAMEN[index]} ${knopf.dataset.befehl})`);
  await geraet.sende(rahmen);
});

el('belegterRahmen').addEventListener('click', async () => {
  if (!geraet.verbunden) return;
  ohneEigenleben(() => {});
  const rahmen = rahmenAus(TESTRAHMEN_VORWAERTS);
  protokolliere(`> ${hex(rahmen)}   (belegter Testrahmen)`);
  await geraet.sende(rahmen);
});

el('motorStopp').addEventListener('click', async () => {
  if (!geraet.verbunden) return;
  protokolliere('> Stopp');
  await geraet.stopp();
});

function zeichneSchreibart() {
  el('schreibart').textContent =
    `Schreibart: ${geraet.schreibart === 'mit' ? 'mit' : 'ohne'} Bestätigung`;
}

el('schreibart').addEventListener('click', () => {
  geraet.schreibart = geraet.schreibart === 'mit' ? 'ohne' : 'mit';
  zeichneSchreibart();
  protokolliere(`Schreibart: ${geraet.schreibart} Bestaetigung`);
});

el('drehsinnFahrtProbe').addEventListener('click', () => ohneEigenleben(() => {
  antrieb.fahre('vor', 2, 700);
  antrieb.takt();
}));
el('drehsinnGreiferProbe').addEventListener('click', () => ohneEigenleben(() => {
  antrieb.greife('auf', 600);
  antrieb.takt();
}));

function drehsinnTauschen(feld) {
  drehsinn[feld] = !drehsinn[feld];
  drehsinnSichern(drehsinn);
  if (antrieb instanceof RoboAntrieb) antrieb.drehsinn = { ...drehsinn };
  zeichneDrehsinn();
  protokolliere(`Drehsinn ${feld}: ${drehsinn[feld] ? 'getauscht' : 'normal'}`);
}
el('drehsinnFahrtTauschen').addEventListener('click', () => drehsinnTauschen('fahrtGetauscht'));
el('drehsinnGreiferTauschen').addEventListener('click', () => drehsinnTauschen('greiferGetauscht'));

el('toene').addEventListener('click', async (ereignis) => {
  const knopf = ereignis.target.closest('button');
  if (!knopf || !geraet.verbunden) return;
  const nummer = Number(knopf.dataset.ton);
  try {
    await geraet.spieleTon(nummer, tonSchleife);
    protokolliere(`> Ton ${nummer}${tonSchleife ? ' (Schleife)' : ''}`);
  } catch (fehler) {
    protokolliere(`Ton fehlgeschlagen: ${fehler.message ?? fehler}`);
  }
});

el('tonAus').addEventListener('click', async () => {
  if (!geraet.verbunden) return;
  await geraet.beendeTon().catch(() => {});
  protokolliere('> Ton aus');
});

el('tonSchleife').addEventListener('click', () => {
  tonSchleife = !tonSchleife;
  el('tonSchleife').textContent = `Schleife: ${tonSchleife ? 'an' : 'aus'}`;
});

for (const knopf of document.querySelectorAll('[data-schalter]')) {
  knopf.addEventListener('click', async () => {
    const name = knopf.dataset.schalter;
    const wert = Number(knopf.dataset.wert);
    try {
      await geraet.setzeSchalter(name, wert);
      protokolliere(`> ${name} = ${hexByte(wert)}`);
      await leseWerte();
    } catch (fehler) {
      protokolliere(`${name} fehlgeschlagen: ${fehler.message ?? fehler}`);
    }
  });
}

el('versuchSenden').addEventListener('click', async () => {
  const rahmen = sondierung.rahmen;
  if (!rahmen || versuchLaeuft) return;
  versuchLaeuft = true;
  zeichneVersuch();
  protokolliere(`> ${hex(rahmen)}`);
  await geraet.sende(rahmen);
  setTimeout(async () => {
    await geraet.stopp();
    versuchLaeuft = false;
    zeichneVersuch();
  }, VERSUCHSDAUER_MS);
});

function versuchNotieren(reaktion) {
  const bemerkung = reaktion ? (prompt('Was ist passiert?') ?? '') : '';
  sondierung.notiere(reaktion, bemerkung);
  sichern(sondierung.toJSON(), Date.now(), SONDIERUNG_SCHLUESSEL);
  zeichneVersuch();
}
el('versuchJa').addEventListener('click', () => versuchNotieren(true));
el('versuchNein').addEventListener('click', () => versuchNotieren(false));
el('versuchZurueck').addEventListener('click', () => {
  sondierung.zurueck();
  sichern(sondierung.toJSON(), Date.now(), SONDIERUNG_SCHLUESSEL);
  zeichneVersuch();
});
el('versuchUeberspringen').addEventListener('click', () => {
  sondierung.ueberspringe();
  zeichneVersuch();
});

el('berichtKopieren').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(sondierung.bericht());
    protokolliere('Bericht in die Zwischenablage kopiert.');
  } catch {
    protokolliere('Kopieren nicht moeglich - Bericht bitte von Hand markieren.');
  }
});
el('berichtLeeren').addEventListener('click', () => {
  if (!confirm('Alle notierten Beobachtungen verwerfen?')) return;
  vergessen(SONDIERUNG_SCHLUESSEL);
  location.reload();
});

el('bytes').addEventListener('click', async (ereignis) => {
  const knopf = ereignis.target.closest('button');
  if (!knopf) return;
  const index = Number(knopf.dataset.byte);
  if (knopf.dataset.setze !== undefined) {
    handrahmen[index] = Number(knopf.dataset.setze);
  } else {
    const neu = handrahmen[index] + Number(knopf.dataset.delta);
    handrahmen[index] = Math.min(255, Math.max(0, neu));
  }
  zeichneBytes();
  if (geraet.verbunden) await geraet.sende(rahmenAus(handrahmen));
});

function dauersendenAus() {
  if (dauersender !== null) clearInterval(dauersender);
  dauersender = null;
  const schalter = el('dauersenden');
  if (schalter) schalter.checked = false;
}

el('dauersenden').addEventListener('change', () => {
  if (el('dauersenden').checked) {
    dauersender = setInterval(() => {
      if (geraet.verbunden) geraet.sende(rahmenAus(handrahmen));
    }, TAKT_MS);
  } else {
    dauersendenAus();
  }
});

// --- Start -----------------------------------------------------------------

if (!bluetoothVerfuegbar()) {
  el('btHinweis').hidden = false;
  el('verbinden').disabled = true;
}

if (!kameraVerfuegbar()) {
  el('kamera').disabled = true;
  el('sichtLeer').textContent = 'Dieser Browser gibt keine Kamera her.';
}

el('belegterRahmenHex').textContent = hex(TESTRAHMEN_VORWAERTS);
zeichneSchreibart();
triebeAufbauen();
motortestAufbauen();
toeneAufbauen();
bytesAufbauen();
zeichneBytes();
zeichneDrehsinn();
zeichneVersuch();
zeichne();
