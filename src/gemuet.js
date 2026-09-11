// Aus den Trieben wird eine Stimmung. Die Stimmung entscheidet spaeter, welches
// Verhalten das Tier zeigt - nicht der einzelne Zahlenwert.

export const STIMMUNGEN = Object.freeze([
  'erschoepft', 'muede', 'hungrig', 'einsam', 'gelangweilt', 'zufrieden', 'aufgedreht',
]);

/** Unter diesem Wert meldet sich ein Trieb. */
export const SCHWELLE = 35;
/** Unter diesem Wert geht gar nichts mehr. */
export const NOTSCHWELLE = 12;

const STIMMUNG_ZU_TRIEB = Object.freeze({
  energie: 'muede',
  sattheit: 'hungrig',
  zuwendung: 'einsam',
  beschaeftigung: 'gelangweilt',
});

/**
 * @param {import('./triebe.js').Triebe} triebe
 * @returns {{stimmung: string, ursache: string|null, staerke: number}}
 */
export function gemuetslage(triebe) {
  const werte = triebe.werte;
  if (werte.energie <= NOTSCHWELLE) {
    return { stimmung: 'erschoepft', ursache: 'energie', staerke: 1 };
  }

  const dringend = triebe.dringendster;
  const wert = werte[dringend];
  if (wert < SCHWELLE) {
    return {
      stimmung: STIMMUNG_ZU_TRIEB[dringend],
      ursache: dringend,
      staerke: Math.min(1, (SCHWELLE - wert) / SCHWELLE),
    };
  }

  if (triebe.laune > 85 && werte.energie > 70) {
    return { stimmung: 'aufgedreht', ursache: null, staerke: (triebe.laune - 85) / 15 };
  }
  return { stimmung: 'zufrieden', ursache: null, staerke: 0 };
}
