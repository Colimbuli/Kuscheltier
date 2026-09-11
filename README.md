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
| Bedienoberflaeche inklusive Rohbefehl-Konsole | fertig |
| BLE-Treiber | geschrieben, **am Geraet noch nicht verifiziert** |
| Gesicht, Sensorik, Sprache | noch nicht angefangen |

Das Funkprotokoll ist aus einem fremden Projekt fuer die **Vorgaenger**-Generation
uebernommen. Ob der `EVRobot2` gleich spricht, ist offen — siehe
[doku/protokoll.md](doku/protokoll.md), dort steht auch, wie das zu pruefen ist.

## Ausprobieren

Ohne Roboter, am Rechner:

```bash
npm run serve          # python3 -m http.server 8080
# dann http://localhost:8080 im Browser oeffnen
```

Es laeuft sofort der Simulator: das Tier lebt, die Stellbefehle stehen als
Hex-Zeilen im Reiter *Konsole*.

Mit Roboter, auf dem Handy: Die Seite muss ueber **HTTPS** ausgeliefert werden
(GitHub Pages genuegt), sonst gibt Chrome kein `navigator.bluetooth` frei.
Dann *Roboter verbinden* antippen und `EVRobot2` aus der Liste waehlen.

```bash
npm test               # 29 Tests, ohne Browser
```

## Aufbau

```
index.html             Oberflaeche
src/protokoll.js       Der 6-Byte-Rahmen des Roboters. Reine Funktionen.
src/antrieb.js         Basis: Stellzustand, Dauerstrom, Fristen, Not-Aus
src/antrieb_ble.js       ... ueber Web Bluetooth
src/antrieb_sim.js       ... als Protokoll auf dem Bildschirm
src/triebe.js          Energie, Sattheit, Zuwendung, Beschaeftigung
src/gemuet.js          Triebe -> Stimmung
src/verhalten.js       Stimmung -> Handlung -> Stellbefehle
src/speicher.js        Zustand ueberlebt das Schliessen der Seite
src/app.js             Verdrahtung, Uhr, Anzeige
```

Die Trennung ist Absicht: `verhalten.js` kennt kein Bluetooth, `protokoll.js`
kennt kein Tier. Wer den Roboter austauscht, schreibt einen neuen Antrieb und
laesst alles andere in Ruhe.

## Sicherheit im Kleinen

Der Antrieb faellt von selbst auf neutral zurueck: jeder Stellwert hat eine
Frist, Fahrbefehle sind zusaetzlich hart auf 2,5 Sekunden begrenzt. Reisst die
Verbindung ab oder bleibt die Seite haengen, faehrt das Tier nicht weiter gegen
die Wand. Der Not-Aus schaltet alles ab und sperrt weitere Befehle, bis er
wieder entsperrt wird.

## Naechste Schritte

1. Protokoll am Geraet verifizieren (siehe `doku/protokoll.md`)
2. Gesicht: Augen auf dem Display, Blick und Blinzeln an die Stimmung gekoppelt
3. Sensorik: Beschleunigungssensor des Handys als „gestreichelt" und „geschuettelt"
4. Sprache — erst danach entscheiden, ob ein Sprachmodell auf dem Geraet Sinn ergibt

## Fremdes Material

Die Protokollkonstanten stammen aus [QtEvoBot](https://github.com/hasselmm/QtEvoBot)
von Mathias Hasselmann.
