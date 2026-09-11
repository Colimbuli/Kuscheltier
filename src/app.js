// Verdrahtung der Oberflaeche. Enthaelt keine Verhaltenslogik und kein
// Protokollwissen - nur Knoepfe, Anzeige und die Uhr.

import { BleAntrieb, bluetoothVerfuegbar } from './antrieb_ble.js';
import { Simulator } from './antrieb_sim.js';
import { FAHRT_GRENZE_MS } from './antrieb.js';
import { FAHRT_RICHTUNGEN, FAHRT_STUFEN, hex } from './protokoll.js';
import { laden, sichern } from './speicher.js';
import { TRIEBE, Triebe } from './triebe.js';
import { Verhalten } from './verhalten.js';

const TAKT_MS = 100;
const ANZEIGE_MS = 200;
const SICHERN_MS = 5000;

const BESCHRIFTUNG = {
  energie: 'Energie',
  sattheit: 'Sattheit',
  zuwendung: 'Zuwendung',
  beschaeftigung: 'Beschäftigung',
};
const RICHTUNG_TEXT = { vor: 'Vor', zurueck: 'Zurück', links: 'Links', rechts: 'Rechts' };

const el = (id) => document.getElementById(id);

// --- Zustand ---------------------------------------------------------------

const gespeichert = laden();
const triebe = new Triebe(gespeichert?.werte ?? {});
if (gespeichert) triebe.verstreiche(Date.now() - gespeichert.zeit);

let antrieb = neuerSimulator();
const verhalten = new Verhalten({ triebe, antrieb });
let dauerfahrt = false;
let letzteZeit = Date.now();
let letzteAnzeige = 0;
let letztesSichern = Date.now();
let letzterLogEintrag = '';

function neuerSimulator() {
  const sim = new Simulator();
  sim.onRahmen = protokolliere;
  sim.starteTakt();
  return sim;
}

function uebernimm(neu) {
  antrieb.beendeTakt();
  antrieb = neu;
  antrieb.onRahmen = protokolliere;
  verhalten.antrieb = neu;
}

// --- Protokollausgabe ------------------------------------------------------

function protokolliere(rahmen) {
  const zeile = hex(rahmen);
  if (zeile === letzterLogEintrag) return; // Ruhestrom nicht mitschreiben
  letzterLogEintrag = zeile;
  const log = el('log');
  const uhrzeit = new Date().toLocaleTimeString('de-DE', { hour12: false });
  log.textContent += `${uhrzeit}  ${zeile}\n`;
  const zeilen = log.textContent.split('\n');
  if (zeilen.length > 200) log.textContent = zeilen.slice(-200).join('\n');
  log.scrollTop = log.scrollHeight;
}

// --- Anzeige ---------------------------------------------------------------

function triebeAufbauen() {
  el('triebe').innerHTML = TRIEBE.map((name) => `
    <div class="trieb">
      <div class="trieb-kopf"><span>${BESCHRIFTUNG[name]}</span><span id="wert-${name}">–</span></div>
      <div class="spur"><div class="fuellung" id="balken-${name}" style="width:0%"></div></div>
    </div>`).join('');
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

  const verbunden = antrieb.verbunden && antrieb instanceof BleAntrieb;
  el('lampe').dataset.an = String(verbunden);
  el('notaus').textContent = antrieb.gesperrt ? 'Entsperren' : 'NOT-AUS';
}

// --- Uhr -------------------------------------------------------------------

setInterval(() => {
  const jetzt = Date.now();
  const abstand = jetzt - letzteZeit;
  letzteZeit = jetzt;

  const inBewegung = antrieb.zustand.fahrt !== null;
  const ruhend = verhalten.ruht && ['erschoepft', 'muede'].includes(verhalten.stimmung);
  triebe.verstreiche(abstand, { inBewegung, ruhend });

  if (el('autopilot').checked && !antrieb.gesperrt) verhalten.takt(jetzt);

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

// --- Knoepfe ---------------------------------------------------------------

function reiterWaehlen(name) {
  const tier = name === 'tier';
  el('reiter-tier').setAttribute('aria-selected', String(tier));
  el('reiter-konsole').setAttribute('aria-selected', String(!tier));
  el('blatt-tier').hidden = !tier;
  el('blatt-konsole').hidden = tier;
}
el('reiter-tier').addEventListener('click', () => reiterWaehlen('tier'));
el('reiter-konsole').addEventListener('click', () => reiterWaehlen('konsole'));

el('verbinden').addEventListener('click', async () => {
  if (antrieb instanceof BleAntrieb && antrieb.verbunden) {
    await antrieb.trenne();
    uebernimm(neuerSimulator());
    el('status').textContent = 'Simulator';
    el('verbinden').textContent = 'Roboter verbinden';
    return;
  }
  const ble = new BleAntrieb();
  ble.onVerbindung = (zustand, info) => {
    if (zustand === 'verbunden') {
      el('status').textContent = `${info.name} · Firmware ${info.firmware}`;
      el('verbinden').textContent = 'Trennen';
    } else if (zustand === 'verbindet') {
      el('status').textContent = 'verbinde …';
    } else {
      el('status').textContent = info?.fehler ? `getrennt: ${info.fehler}` : 'getrennt';
      el('verbinden').textContent = 'Roboter verbinden';
    }
  };
  ble.onMeldung = (meldung) => protokolliere(new TextEncoder().encode(`< V${meldung.klang} ${meldung.zustand}`));
  try {
    uebernimm(ble);
    await ble.verbinde();
  } catch (fehler) {
    el('status').textContent = String(fehler.message ?? fehler);
    uebernimm(neuerSimulator());
  }
});

el('notaus').addEventListener('click', () => {
  if (antrieb.gesperrt) {
    antrieb.entsperre();
  } else {
    antrieb.notAus();
    el('autopilot').checked = false;
  }
  zeichne();
});

for (const knopf of document.querySelectorAll('[data-ereignis]')) {
  knopf.addEventListener('click', () => {
    verhalten.reagiere(knopf.dataset.ereignis, Date.now());
    zeichne();
  });
}

// Konsole: Rohbefehle gehen am Verhalten vorbei, also Eigenleben abschalten.
function rohbefehl(wirkung) {
  el('autopilot').checked = false;
  if (antrieb.gesperrt) antrieb.entsperre();
  wirkung();
}

const fahren = el('fahren');
for (const richtung of FAHRT_RICHTUNGEN) {
  for (let stufe = 1; stufe <= FAHRT_STUFEN; stufe += 1) {
    const knopf = document.createElement('button');
    knopf.textContent = `${RICHTUNG_TEXT[richtung]} ${stufe}`;
    knopf.addEventListener('click', () => rohbefehl(() => {
      antrieb.fahre(richtung, stufe, dauerfahrt ? FAHRT_GRENZE_MS : 700);
    }));
    fahren.append(knopf);
  }
}

el('dauerfahrt').addEventListener('click', () => {
  dauerfahrt = !dauerfahrt;
  el('dauerfahrt').textContent = `Halten: ${dauerfahrt ? 'an' : 'aus'}`;
});

for (const knopf of document.querySelectorAll('[data-roh]')) {
  const art = knopf.dataset.roh;
  if (art === 'dauer') continue;
  knopf.addEventListener('click', () => rohbefehl(() => {
    if (art === 'halt') antrieb.halt();
    if (art === 'greifer') antrieb.greife(knopf.dataset.wert, 600);
    if (art === 'hub') antrieb.hebe(knopf.dataset.wert, 600);
  }));
}

for (let i = 1; i <= 4; i += 1) {
  const knopf = document.createElement('button');
  knopf.textContent = `Klang ${i}`;
  knopf.addEventListener('click', () => rohbefehl(() => antrieb.spiele(i, 400)));
  el('klaenge').append(knopf);
}
for (let i = 1; i <= 4; i += 1) {
  const knopf = document.createElement('button');
  knopf.textContent = `Effekt ${i}`;
  knopf.addEventListener('click', () => rohbefehl(() => antrieb.zeige(i, 400)));
  el('effekte').append(knopf);
}

el('btHinweis').hidden = bluetoothVerfuegbar();
if (!bluetoothVerfuegbar()) el('verbinden').disabled = true;

triebeAufbauen();
zeichne();
