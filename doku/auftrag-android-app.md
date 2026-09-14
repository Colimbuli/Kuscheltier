# Auftrag: Die Kuscheltier-App als native Android-Anwendung

Arbeitsauftrag fuer einen lokalen Claude-Code-Agenten. Entwicklungsumgebung ist
**VS Code auf Windows**, nicht Android Studio.

---

## Worum es geht

Das Projekt „Kuscheltier" ist heute eine Webseite, die ueber Web Bluetooth einen
Spielzeugroboter steuert: Beduerfnisse → Stimmung → Handlung → Motorbefehl. Sie
laeuft, ist getestet und liegt unter https://github.com/Colimbuli/Kuscheltier.

Drei Dinge kann ein Browser grundsaetzlich nicht, und alle drei werden gebraucht:

1. **Funk-Rundrufe aussenden.** Eine zweite Akkubox laesst sich nur so ansprechen.
2. **Spracherkennung ohne Netz.** Die Browser-Schnittstelle schickt Audio an Google.
3. **Ein Sprachmodell auf dem Geraet** betreiben.

Deshalb eine native App.

## Die Leitidee: der Kern bleibt, wo er ist

**Nichts von der vorhandenen Logik wird nach Kotlin uebersetzt.** Der Kern ist
reines JavaScript ohne Browserbezug — Protokolle, Zuordnung, Antrieb, Triebe,
Gemuet, Verhalten, Folgen — und durch 88 Tests abgesichert. Er laeuft in einer
**WebView** unveraendert weiter.

Kotlin macht **nur Funk und Geraetezugriff**. Das haelt die native Seite klein und
bewahrt die Tests.

```
  WebView (assets/web/)          Kotlin
  ─────────────────────          ──────────────────────────────
  verhalten.js  triebe.js
  zuordnung.js  folgen.js
  protokoll.js  mouldking.js  ── Bytes ──▶  BLE-Verbindung (GATT)
  auge.js       app.js                      BLE-Rundruf (Advertiser)
        ▲                                   Berechtigungen
        └────── Ereignisse ────────────────┘
```

Besonders wichtig: `mouldking.js` **berechnet die Funkpakete bereits vollstaendig
und ist gegen Pruefvektoren abgesichert.** Kotlin bekommt fertige Bytes und strahlt
sie aus — die Verschluesselung wird nicht noch einmal in Kotlin geschrieben.

## Aufgaben

### 1. Projekt anlegen

Im vorhandenen Repository ein Verzeichnis `android/` mit einem Gradle-Projekt.
Kotlin, eine Activity, **kein** Jetpack Compose noetig — die Oberflaeche ist die
WebView.

- `minSdk 24`, `targetSdk 35`, JDK 17
- Gradle-Wrapper mit einchecken, damit der Bau ohne Android Studio geht
- Einrichtung der Werkzeugkette dokumentieren: Android-SDK ueber die
  `cmdline-tools`, `platform-tools` (fuer `adb`), Build-Tools, Plattform-Image.
  Android Studio ist der bequemste Weg an das SDK, darf aber keine Voraussetzung
  zum Bauen sein.
- Bau und Installation als ein Befehl je: `gradlew assembleDebug`,
  `adb install -r`

### 2. Die Webseite einbetten

- Der Inhalt von `index.html`, `src/` und allem, was die Seite braucht, gehoert
  nach `app/src/main/assets/web/`.
- **Einen Kopierschritt einrichten**, der das aus dem Repository-Stamm holt —
  eine Gradle-Aufgabe oder ein Skript. Doppelt gepflegte Dateien sind ein
  Fehlerherd; es darf nur eine Quelle geben.
- WebView so einstellen, dass die Seite laeuft: JavaScript an, DOM-Speicher an,
  Medienwiedergabe ohne Nutzergeste, `setWebContentsDebuggingEnabled(true)` im
  Debug-Bau, damit sich die Seite ueber `chrome://inspect` untersuchen laesst.
- **Die Kamera muss weiterlaufen.** Die Gesichtserkennung nutzt `getUserMedia`;
  dafuer braucht es `WebChromeClient.onPermissionRequest` und die
  CAMERA-Berechtigung. Pruef das ausdruecklich, es ist der haeufigste Stolperstein
  beim Umzug in eine WebView.
- Die Erkennung laedt ihr Modell heute aus dem Netz. **Schoener waere, beides
  mitzuliefern** und lokal auszuliefern. Wenn du das machst, sag, wo die Dateien
  herkommen und wie gross sie sind.

### 3. Die Bruecke

Ein `@JavascriptInterface`-Objekt unter dem Namen `Robo`. Nur ASCII in Namen,
keine Umlaute. Alle Rueckgaben als JSON-Zeichenkette; Ereignisse laufen umgekehrt
ueber `evaluateJavascript` in Funktionen unter `window.kuscheltier`.

Der vorhandene Code ruft heute Web Bluetooth auf; du ersetzt `src/geraet.js`
durch eine Fassung, die stattdessen diese Bruecke benutzt. **Die Schnittstelle
von `geraet.js` nach aussen bleibt gleich** — alles darueber merkt nichts davon.

**Verbindung (erster Roboter, GATT):**

| Aufruf | Wirkung |
|---|---|
| `Robo.verbinde()` | Sucht ein Geraet mit Namensanfang `EVRobot`, verbindet, listet Dienste auf, schaltet Benachrichtigungen ein |
| `Robo.trenne()` | trennt |
| `Robo.schreibe(uuid, hex, mitAntwort)` | schreibt auf eine Characteristic |
| `Robo.lies(uuid)` | liest, Ergebnis als Ereignis |

Der Roboter braucht **„Write Without Response"** fuer den Stellkanal; mit
Bestaetigung bewegt sich nichts. Und **Benachrichtigungen muessen eingeschaltet
sein, bevor der erste Stellbefehl geht**, sonst verwirft die Firmware alles.
Beides ist am Geraet gemessen und steht in `doku/protokoll.md`.

**Rundruf (zweite Box, Advertising):**

| Aufruf | Wirkung |
|---|---|
| `Robo.starteRundruf(herstellerId, hex)` | Dauerrundruf mit diesen Herstellerdaten |
| `Robo.aendereRundruf(hex)` | Nutzdaten wechseln, Rundruf laeuft weiter |
| `Robo.beendeRundruf()` | beenden |

Einstellungen laut Analyse der Hersteller-App: Modus
`ADVERTISE_MODE_LOW_LATENCY`, verbindbar, ohne Zeitlimit, Sendeleistung hoch.
Bei jeder Aenderung stoppen, neu bauen, neu starten. Einzelheiten in
`doku/protokoll-mouldking.md`.

**Allgemein:** `Robo.faehigkeiten()` meldet, was dieses Geraet kann — ob
Advertising unterstuetzt wird, ob die Berechtigungen erteilt sind. Die Seite
blendet danach aus, was nicht geht.

### 4. Berechtigungen

Das Zielgeraet ist ein **Redmi Note 8 Pro mit Android 11 unter MIUI 12.5**. Die
App muss beide Berechtigungsmodelle bedienen:

- bis Android 11: `BLUETOOTH`, `BLUETOOTH_ADMIN`, `ACCESS_FINE_LOCATION`
- ab Android 12: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE`
- immer: `CAMERA`, `INTERNET`

Zur Laufzeit anfordern, und **verstaendlich erklaeren, wenn etwas fehlt** —
nicht stumm nichts tun.

**MIUI raeumt Hintergrundprozesse hart ab.** Pruef, ob eine
Vordergrunddienst-Benachrichtigung noetig ist, damit die App beim Fahren nicht
abgeschossen wird, und schreib in die Anleitung, was der Nutzer einstellen muss
(Autostart erlauben, Akkusparen abschalten).

### 5. Was die App koennen muss, um abgenommen zu werden

1. Startet, zeigt die Oberflaeche, das Tier lebt im Simulator
2. Verbindet sich mit dem Roboter, alle drei Motoren laufen, Toene spielen
3. Kamera laeuft, Gesichtserkennung findet Gesichter, das Folgen funktioniert
4. Ein Rundruf laesst sich starten und im Inhalt aendern — mit nRF Connect auf
   einem zweiten Geraet nachweisbar
5. Ueberlebt Bildschirm aus und wieder an, ohne die Verbindung zu verlieren

## Was ich als Ergebnis brauche

1. Das lauffaehige Projekt unter `android/`
2. Eine **`android/README.md`**: Werkzeugkette einrichten, bauen, installieren,
   MIUI-Einstellungen, Fehlersuche ueber `chrome://inspect`
3. Ein **Bericht**, was von Punkt 5 tatsaechlich am Geraet geprueft wurde und was
   nicht. Getrennt nach „am Geraet gesehen" und „sollte gehen".
4. Die angepasste `src/geraet.js` — mit derselben Schnittstelle nach aussen wie
   heute, damit die Tests und der Kern unveraendert bleiben

## Regeln

- **Der JavaScript-Kern wird nicht nach Kotlin uebersetzt.** Wenn dir das an einer
  Stelle sinnvoll erscheint, sag warum, statt es zu tun.
- **`npm test` muss weiter durchlaufen.** 88 Tests, keiner darf fallen.
- **Trenne Gesichertes von Vermutetem.** Was du am Geraet gesehen hast, ist
  belegt; alles andere kennzeichne. Lieber „nicht geprueft" als eine
  Erfolgsmeldung ins Blaue — in diesem Projekt haben plausible, aber falsche
  Annahmen schon Stunden gekostet.
- **Erfinde keine Schnittstellen.** Wenn du eine Android-Klasse oder -Methode
  nicht sicher kennst, schlag sie nach oder sag, dass du sie nicht kennst.
- **Kein APK ins Repository.** Baugut gehoert in `.gitignore`.
- Deutsche Bezeichner im Code, wie im uebrigen Projekt. Kommentare erklaeren das
  Warum, nicht das Was.

## Was noch nicht geht, und das ist in Ordnung

Die **Stellbefehle der zweiten Box sind unbekannt.** Die App kann sie koppeln,
aber noch nicht fahren. Bau deshalb einen kleinen Pruefbereich ein, in dem sich
ein Telegramm als Hex eintippen und aussenden laesst — so wie es das „Labor" in
der Webseite fuer den ersten Roboter tut. Damit laesst sich die Belegung spaeter
von Hand finden.

**Spracherkennung und Sprachmodell gehoeren nicht in diesen Auftrag.** Sie sind
der Grund, warum die App existiert, aber sie kommen erst, wenn der Rahmen steht.
Halt die Architektur dafuer offen — mehr nicht.

## Vorwissen im Repository

- `doku/protokoll.md` — der erste Roboter, vollstaendig, am Geraet bestaetigt
- `doku/protokoll-mouldking.md` — die zweite Box: Rahmen geklaert, Stellbytes offen
- `README.md` — Aufbau und Stand des Projekts
- `src/` — der Kern, der unveraendert weiterlaufen soll
