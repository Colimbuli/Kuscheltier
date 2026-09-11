// Ob `vorwaerts` am Motor auch vorwaerts heisst, haengt daran, wie herum die
// Motoren im Bausatz stecken. Aus der Hersteller-App ist das nicht ablesbar -
// es steht dort in den Szenendaten des jeweiligen Modells, nicht im Programm.
//
// Also wird es einmal ausprobiert und dann gemerkt.

import { laden, sichern } from './speicher.js';

export const SCHLUESSEL = 'kuscheltier.drehsinn.v1';

export const STANDARD = Object.freeze({ fahrtGetauscht: false, greiferGetauscht: false });

export function drehsinnLaden(schluessel = SCHLUESSEL) {
  const daten = laden(schluessel)?.werte;
  if (!daten || typeof daten !== 'object') return { ...STANDARD };
  return {
    fahrtGetauscht: daten.fahrtGetauscht === true,
    greiferGetauscht: daten.greiferGetauscht === true,
  };
}

export function drehsinnSichern(drehsinn, schluessel = SCHLUESSEL) {
  return sichern(
    {
      fahrtGetauscht: drehsinn.fahrtGetauscht === true,
      greiferGetauscht: drehsinn.greiferGetauscht === true,
    },
    Date.now(),
    schluessel,
  );
}
