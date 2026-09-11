# Kuscheltier

Ein elektronisches Haustier. Das Gehirn laeuft als Webseite auf einem
Android-Handy, der Koerper ist ein handelsueblicher Bausatzroboter, der per
Bluetooth Low Energy angesteuert wird.

Kein App-Store, kein Android Studio, kein Bastelrechner: eine HTML-Seite, die
Chrome fuer Android ueber **Web Bluetooth** direkt mit dem Roboter reden laesst.

## Stand

| Teil | Zustand |
|---|---|
| Verhaltenskern (Triebe, Stimmung, Handlungen) | fertig, getestet |
| Simulator (ohne Hardware lauffaehig) | fertig |
| BLE-Verbindung zum Roboter | fertig, am Geraet geprueft |
| Labor zum Ausmessen des Funkprotokolls | fertig |
| Funkprotokoll | **entschluesselt**, aus der App des Herstellers |
| Uebersetzung Absicht -> Stellbytes | fertig, gegen die dokumentierten Rahmen geprueft |
| Fahren, Greifen, Toene am echten Geraet | laeuft — alle drei Motoren und alle Toene |
| Sensoren als Wahrnehmung (Taster, Hindernis) | verdrahtet, am Geraet ungeprueft |
| Gesicht, Sprache | noch nicht angefangen |

Die Kette steht vollstaendig und ist am Geraet gefahren: Beduerfnis → Stimmung →
Handlung → Motorbefehl → Bluetooth. Der Roboter hat drei Motoren zu je `[Befehl, Kraft, Dauer]`, zwei
davon Antrieb, einer Greifer, dazu 17 Toene in der Firmware und zwei
IR-Sensoren. Was aussteht, ist die erste richtige Fahrt — und die Frage, wie
herum die Motoren im Bausatz stecken. Alles Weitere:
[doku/protokoll.md](doku/protokoll.md).

## Ausprobieren

Ohne Roboter, am Rechner:

```bash
npm run serve          # python3 -m http.server 8080
# dann http://localhost:8080 im Browser oeffnen
```

Es laeuft sofort der Simulator: das Tier lebt, seine Stellbefehle stehen im
Reiter *Labor* im Verkehrsprotokoll. Ohne Roboter bleibt das Labor selbst
allerdings stumm.

Mit Roboter, auf dem Handy: Die Seite muss ueber **HTTPS** ausgeliefert werden
(GitHub Pages genuegt), sonst gibt Chrome kein `navigator.bluetooth` frei.
Dann *Roboter verbinden* antippen und `EVRobot2` aus der Liste waehlen. Danach
im Reiter *Labor* weiter — siehe unten.

```bash
npm test               # 60 Tests, ohne Browser
```

## Aufbau

```
index.html             Oberflaeche: Reiter "Tier" und "Labor"
src/protokoll.js       UUIDs, Stellrahmen, Toene, Sensorrahmen. Reine Funktionen.
src/zuordnung.js       Absicht -> Stellrahmen: Richtungen, Kraftstufen, Kurven
src/drehsinn.js        Merkt sich, wie herum die Motoren eingebaut sind
src/geraet.js          Die BLE-Verbindung. Kennt nur Bytes.
src/sondierung.js      Die gefuehrte Suche nach der Bedeutung der Stellbytes
src/antrieb.js         Basis: Stellzustand in Absichten, Fristen, Not-Aus
src/antrieb_robo.js      ... ueber Bluetooth an den Roboter
src/antrieb_sim.js       ... als Protokoll auf dem Bildschirm
src/triebe.js          Energie, Sattheit, Zuwendung, Beschaeftigung
src/gemuet.js          Triebe -> Stimmung
src/verhalten.js       Stimmung -> Handlung -> Stellbefehle
src/speicher.js        Zustand ueberlebt das Schliessen der Seite
src/app.js             Verdrahtung, Uhr, Anzeige
```

Die Trennung ist Absicht: `verhalten.js` kennt kein Bluetooth, `geraet.js` kennt
kein Tier, und `antrieb.js` spricht in Absichten ("fahre vorwaerts, Stufe 2")
statt in Bytes. Genau eine Datei uebersetzt zwischen beiden Welten,
`zuordnung.js`. Ein anderer Roboter braucht eine neue Zuordnung und einen neuen
Antrieb — der Rest bleibt unveraendert.

Sobald die Verbindung steht, uebernimmt `antrieb_robo.js` vom Simulator; beim
Trennen geht es zurueck. Das Tier lebt in beiden Faellen weiter.

## Das Labor

Das Protokoll ist bekannt, das Labor bleibt trotzdem noetig: zum Klaeren des
Drehsinns und fuer die Reste, die die Hersteller-App nicht verraet.

- **Roboter** — Werte aller Kanaele lesen, alles auf null setzen, und die
  Sensoren live: je IR-Sensor beide Messungen, ihre Differenz und ob daraus ein
  Hindernis folgt, dazu der Taster
- **Drehsinn** — kurz vorwaerts fahren, und wenn der Roboter rueckwaerts faehrt,
  *Tauschen* druecken. Dasselbe fuer den Greifer. Die Entscheidung wird
  gespeichert und gilt ab dann fuer alles
- **Toene** — alle 17 Toene der Firmware zum Antippen, wahlweise in Schleife.
  Dazu der Reservekanal, den die Hersteller-App nicht benutzt
- **Gefuehrte Suche** — aus der Zeit, als das Rahmenformat unbekannt war. Bleibt
  fuer die offenen Fragen aus `doku/protokoll.md`
- **Handbetrieb** — die neun Bytes einzeln verstellen, wahlweise mit Dauersenden

Die Beobachtungen ueberleben einen Neustart der Seite.

## Sicherheit im Kleinen

Drei Sicherungen, unabhaengig voneinander:

1. **Die Firmware selbst.** Jeder Stellrahmen traegt eine Dauer von hoechstens
   2,55 Sekunden; danach haelt der Roboter an, egal was das Handy tut.
2. **Der Antrieb.** Jeder Kanal hat eine Frist und faellt danach auf neutral;
   Fahrbefehle sind zusaetzlich hart begrenzt. Die verbleibende Frist steht im
   Dauerbyte, der Roboter haelt also genau dann an, wann es gemeint war.
3. **Der Not-Aus.** Bremst alle Motoren, schaltet den Ton ab und nimmt keine
   Befehle mehr an, bis er wieder entsperrt wird.

## Naechste Schritte

1. Drehsinn klaeren und Kraftstufen am echten Modell nachziehen
2. Nachbessern, was sich dabei als unpassend erweist — die Fahrdauern im
   Repertoire sind am Schreibtisch geschaetzt, nicht am Teppich
3. Gesicht: Augen auf dem Display, Blick und Blinzeln an die Stimmung gekoppelt
4. Sprache — erst danach entscheiden, ob ein Sprachmodell auf dem Geraet Sinn ergibt

## Fremdes Material

Keins in diesem Repository. Der erste Anlauf stuetzte sich auf
[QtEvoBot](https://github.com/hasselmm/QtEvoBot) von Mathias Hasselmann; das
Projekt steuert ein anderes, aelteres Geraet und passt nicht auf dieses.

Das Funkprotokoll wurde aus der App des Geraeteherstellers gelesen. Die APK,
die entpackten Dateien und die Notizen mit den Fundstellen und woertlichen
Codeauszuegen bleiben lokal und kommen hier nicht herein — in
[doku/protokoll.md](doku/protokoll.md) steht allein die Erkenntnis.

## Hinweis

Dies ist eine unabhaengige Arbeit zur **Interoperabilitaet**: sie dient allein
dem Zweck, ein selbst geschriebenes Programm mit einem rechtmaessig erworbenen
Geraet zusammenarbeiten zu lassen (§ 69e UrhG, Art. 6 der Richtlinie
2009/24/EG; in der Schweiz Art. 21 URG).

Das Projekt steht in **keiner Verbindung zum Hersteller des Geraets** und wird
von dort weder unterstuetzt noch geprueft. Genannte Marken gehoeren ihren
jeweiligen Inhabern.

Dieses Repository enthaelt **keinen Code und keine Dateien des Herstellers** —
nur die Beschreibung einer Schnittstelle. Schnittstellen als solche sind nach
§ 69a Abs. 2 UrhG nicht urheberrechtlich geschuetzt.

Benutzung auf eigene Gefahr: die Software bewegt Motoren eines Spielzeugs.
Der Not-Aus ist da, damit man ihn benutzt.
