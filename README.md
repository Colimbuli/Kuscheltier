# Kuscheltier

Ein elektronisches Haustier. Das Gehirn laeuft als Webseite auf einem
Android-Handy, der Koerper ist ein Clementoni-Roboter, der per Bluetooth Low
Energy angesteuert wird.

Kein App-Store, kein Android Studio, kein Bastelrechner: eine HTML-Seite, die
Chrome fuer Android ueber **Web Bluetooth** direkt mit dem Roboter reden laesst.

## Stand

| Teil | Zustand |
|---|---|
| Verhaltenskern (Triebe, Stimmung, Handlungen) | fertig, getestet |
| Simulator (ohne Hardware lauffaehig) | fertig |
| BLE-Verbindung zum Roboter | fertig, am Geraet geprueft |
| Labor zum Ausmessen des Funkprotokolls | fertig |
| Uebersetzung Absicht -> Stellbytes | **fehlt, Protokoll noch unbekannt** |
| Gesicht, Sensorik, Sprache | noch nicht angefangen |

Der Roboter spricht, die Verbindung steht, die Sensordaten kommen an — aber was
die neun Bytes eines Stellbefehls bedeuten, ist noch nicht bekannt. Genau dafuer
ist das Labor da. Stand und Vorgehen: [doku/protokoll.md](doku/protokoll.md).

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
npm test               # 37 Tests, ohne Browser
```

## Aufbau

```
index.html             Oberflaeche: Reiter "Tier" und "Labor"
src/protokoll.js       UUIDs, Rahmenlaengen, Sensorrahmen. Reine Funktionen.
src/geraet.js          Die BLE-Verbindung. Kennt nur Bytes.
src/sondierung.js      Die gefuehrte Suche nach der Bedeutung der Stellbytes
src/antrieb.js         Basis: Stellzustand in Absichten, Fristen, Not-Aus
src/antrieb_sim.js       ... als Protokoll auf dem Bildschirm
src/triebe.js          Energie, Sattheit, Zuwendung, Beschaeftigung
src/gemuet.js          Triebe -> Stimmung
src/verhalten.js       Stimmung -> Handlung -> Stellbefehle
src/speicher.js        Zustand ueberlebt das Schliessen der Seite
src/app.js             Verdrahtung, Uhr, Anzeige
```

Die Trennung ist Absicht: `verhalten.js` kennt kein Bluetooth, `geraet.js` kennt
kein Tier, und `antrieb.js` spricht in Absichten ("fahre vorwaerts, Stufe 2")
statt in Bytes. Sobald das Protokoll feststeht, kommt genau ein Modul dazu, das
Absichten in Stellbytes uebersetzt — alles andere bleibt unveraendert.

## Das Labor

Weil das Funkprotokoll unbekannt ist, muss es ausgemessen werden. Der Reiter
*Labor* macht das ohne Hex-Tipperei:

- **Roboter** — Werte aller Kanaele lesen, alles auf null setzen, Sensordaten live
- **Schalter** — die beiden Ein-Byte-Kanaele auf 0 oder 1 setzen
- **Gefuehrte Suche** — setzt der Reihe nach genau ein Stellbyte auf `0xFF`, dann
  `0x80`, dann `0x01`, schaltet nach zwei Sekunden selbst wieder ab und haelt fest,
  worauf der Roboter reagiert hat. Der Bericht laesst sich kopieren.
- **Handbetrieb** — die neun Bytes einzeln verstellen, wahlweise mit Dauersenden

Die Beobachtungen ueberleben einen Neustart der Seite.

## Sicherheit im Kleinen

Der Antrieb faellt von selbst auf neutral zurueck: jeder Stellwert hat eine
Frist, Fahrbefehle sind zusaetzlich hart auf 2,5 Sekunden begrenzt. Reisst die
Verbindung ab oder bleibt die Seite haengen, faehrt das Tier nicht weiter gegen
die Wand. Der Not-Aus schaltet alles ab und sperrt weitere Befehle, bis er
wieder entsperrt wird.

## Naechste Schritte

1. Mit dem Labor herausfinden, was die neun Stellbytes bedeuten
2. Uebersetzung Absicht -> Stellbytes schreiben, dann faehrt das Tier wirklich
3. Sensorkanaele zuordnen — der Roboter kann fuehlen, wir wissen nur noch nicht was
4. Gesicht: Augen auf dem Display, Blick und Blinzeln an die Stimmung gekoppelt
5. Sprache — erst danach entscheiden, ob ein Sprachmodell auf dem Geraet Sinn ergibt

## Fremdes Material

Keins mehr. Der erste Anlauf stuetzte sich auf
[QtEvoBot](https://github.com/hasselmm/QtEvoBot) von Mathias Hasselmann; das
Projekt steuert die Vorgaengergeneration und passt nicht auf dieses Geraet.
