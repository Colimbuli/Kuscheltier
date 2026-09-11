import test from 'node:test';
import assert from 'node:assert/strict';
import { FAHRT_GRENZE_MS } from '../src/antrieb.js';
import { Simulator } from '../src/antrieb_sim.js';

function simulator(start = 0) {
  let uhr = start;
  const sim = new Simulator({ jetzt: () => uhr });
  return { sim, vor: (ms) => { uhr += ms; return uhr; }, zeit: () => uhr };
}

test('ohne Befehl steht alles auf neutral', () => {
  const { sim, zeit } = simulator();
  sim.takt(zeit());
  assert.equal(sim.protokoll.at(-1).text, 'fahrt=-  greifer=-  klang=-');
});

test('ein Fahrbefehl laeuft nach seiner Dauer von selbst aus', () => {
  const { sim, vor, zeit } = simulator();
  sim.fahre('vor', 2, 500);
  sim.takt(zeit());
  assert.deepEqual(sim.zustand.fahrt, { richtung: 'vor', stufe: 2 });

  sim.takt(vor(400));
  assert.notEqual(sim.zustand.fahrt, null);

  sim.takt(vor(200));
  assert.equal(sim.zustand.fahrt, null);
});

test('die Fahrdauer wird hart begrenzt', () => {
  const { sim, vor, zeit } = simulator();
  sim.fahre('vor', 4, 60000);
  sim.takt(zeit());
  sim.takt(vor(FAHRT_GRENZE_MS - 100));
  assert.notEqual(sim.zustand.fahrt, null);
  sim.takt(vor(200));
  assert.equal(sim.zustand.fahrt, null, 'nach der Grenze muss der Antrieb stehen');
});

test('Kanaele laufen unabhaengig voneinander aus', () => {
  const { sim, vor, zeit } = simulator();
  sim.fahre('links', 1, 300);
  sim.greife('auf', 900);
  sim.takt(zeit());
  sim.takt(vor(400));
  assert.equal(sim.zustand.fahrt, null);
  assert.equal(sim.zustand.greifer, 'auf');
  sim.takt(vor(600));
  assert.equal(sim.zustand.greifer, null);
});

test('der Not-Aus schaltet ab und sperrt weitere Befehle', () => {
  const { sim, zeit } = simulator();
  sim.fahre('vor', 4, 2000);
  sim.takt(zeit());
  sim.notAus();
  assert.equal(sim.zustand.fahrt, null);
  assert.equal(sim.gesperrt, true);

  sim.fahre('vor', 4, 2000);
  sim.takt(zeit());
  assert.equal(sim.zustand.fahrt, null, 'gesperrt heisst gesperrt');

  sim.entsperre().fahre('vor', 1, 500);
  sim.takt(zeit());
  assert.deepEqual(sim.zustand.fahrt, { richtung: 'vor', stufe: 1 });
});

test('das Protokoll haelt nur Aenderungen fest', () => {
  const { sim, vor, zeit } = simulator();
  sim.takt(zeit());
  sim.takt(vor(100));
  sim.takt(vor(100));
  assert.equal(sim.protokoll.length, 1);
  assert.equal(sim.uebergaben, 3, 'uebergeben wird trotzdem in jedem Takt');
});

test('unbekannte Kanaele fliegen auf', () => {
  const { sim } = simulator();
  assert.throws(() => sim.setze('blinker', true), RangeError);
  assert.throws(() => sim.setze('hub', 'hoch'), RangeError, 'eine Hubachse hat der Roboter nicht');
});

test('die Restzeiten zaehlen herunter', () => {
  const { sim, vor, zeit } = simulator();
  sim.fahre('vor', 2, 1000);
  assert.equal(sim.restzeiten(zeit()).fahrt, 1000);
  assert.equal(sim.restzeiten(zeit()).greifer, Infinity, 'ein stiller Kanal hat keine Frist');
  assert.equal(sim.restzeiten(vor(400)).fahrt, 600);
  assert.equal(sim.restzeiten(vor(900)).fahrt, 0, 'nie unter null');
});
