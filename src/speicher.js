// Der Zustand des Tiers ueberlebt das Schliessen der Seite. Gespeichert wird
// mit Zeitstempel, damit die Triebe auch waehrend der Abwesenheit verfallen.
//
// localStorage kann fehlen oder werfen (privates Fenster, geloeschte Daten).
// Jeder Zugriff ist deshalb abgesichert; ohne Speicher startet das Tier frisch.

const SCHLUESSEL = 'kuscheltier.zustand.v1';

function ablage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** @returns {{werte: object, zeit: number}|null} */
export function laden(schluessel = SCHLUESSEL) {
  const speicher = ablage();
  if (!speicher) return null;
  try {
    const roh = speicher.getItem(schluessel);
    if (!roh) return null;
    const daten = JSON.parse(roh);
    if (!daten || typeof daten !== 'object' || typeof daten.zeit !== 'number') return null;
    return daten;
  } catch {
    return null;
  }
}

export function sichern(werte, zeit = Date.now(), schluessel = SCHLUESSEL) {
  const speicher = ablage();
  if (!speicher) return false;
  try {
    speicher.setItem(schluessel, JSON.stringify({ werte, zeit }));
    return true;
  } catch {
    return false;
  }
}

export function vergessen(schluessel = SCHLUESSEL) {
  const speicher = ablage();
  if (!speicher) return false;
  try {
    speicher.removeItem(schluessel);
    return true;
  } catch {
    return false;
  }
}
