# Das Funkprotokoll des EVRobot2

## Stand

Die GATT-Struktur ist **am Geraet gemessen**. Die **Bedeutung der neun
Stellbytes ist geklaert** — sie stammt aus der Hersteller-App, nicht aus dem
Labor. Der Stellrahmen ist kein Befehl mit Parametern, sondern **drei Motoren zu
je drei Byte**.

Damit sind die vier offenen Fragen der vorigen Fassung beantwortet; sie stehen
unten als Abschnitt [Beantwortet](#beantwortet). Was der Roboter noch nicht
verraten hat, steht unter [Offen](#offen).

Der frueher hier dokumentierte Ansatz aus [QtEvoBot][qtevobot] bleibt
**widerlegt**: jenes Projekt steuert die Vorgaengergeneration
(`Evolution-Robot`) ueber den Dienst `0xFFF3` mit einem 6-Byte-Rahmen. Weder die
UUIDs noch das Rahmenformat sind uebertragbar.

## Gemessen

### Advertising

| | |
|---|---|
| BLE-Name | `EVRobot2` |
| MAC | `00:A0:50:75:2A:ED` (OUI `00:A0:50` = Cypress Semiconductor) |
| Rohdaten | `02 01 06 09 09 45 56 52 6F 62 6F 74 32` |
| Flags | `0x06` — LE General Discoverable, **BR/EDR Not Supported** |
| Advertising | Legacy, Intervall ~26 ms, connectable |
| Service-UUIDs im Advertising | **keine** |

Reines BLE, deshalb ist Web Bluetooth einsetzbar. Weil das Advertising **keine
Service-UUIDs** fuehrt, muss die Seite die Dienst-UUID vorher kennen:
`navigator.bluetooth` gibt nur Dienste heraus, die in `optionalServices` genannt
sind.

### GATT

Ausser `Generic Access` (`0x1800`) und `Generic Attribute` (`0x1801`) gibt es
genau einen Dienst. **Kein Device Information Service**, also auch keine
auslesbare Firmware-Version.

Dienst `2f5772da-18e3-4f2e-82ab-910e81b9f232`:

| Characteristic | Eigenschaften | Laenge | Rolle |
|---|---|---|---|
| `5e366294-5436-4356-a009-7ccd1e03526d` | NOTIFY, READ | 9 | Sensorrahmen |
| `165aecf8-ed44-45e7-aae4-63789234a30f` | READ, WRITE, WRITE NO RESPONSE | 9 | **Stellrahmen** |
| `cc9151df-c5eb-477a-a793-287a5500fc81` | READ, WRITE | 1 | **Ton** |
| `26c8d1e9-f4ae-4f76-97ea-8576d5e23079` | READ, WRITE, WRITE NO RESPONSE | 1 | unbenutzt, siehe [Offen](#offen) |

Verbindungsparameter laut `0x2A04`: Intervall 7,5–50 ms, Latenz 0,
Supervision-Timeout-Multiplikator 1000.

## Woher das Protokoll stammt

Aus der Hersteller-App `it.clementoni.robomaker` Version 20. Sie ist in
**Unity/IL2CPP** gebaut und **nicht verschleiert**: Klassen-, Methoden- und
Feldnamen stehen im Klartext in `global-metadata.dat`, die Methodenruempfe als
ARM64-Code in `libil2cpp.so`. Die drei UUIDs oben stehen als Zeichenketten in
den Metadaten; `2f5772da` und `26c8d1e9` kommen darin nicht vor.

Die tragenden Klassen und ihre Adressen in `libil2cpp.so` (arm64-v8a), damit
jede Aussage unten nachpruefbar bleibt:

| Klasse / Methode | RVA | Was daraus folgt |
|---|---|---|
| `ClemRobotBLE..cctor` | `0x6FBBD4` | Zuordnung der drei UUIDs, `MOTOR_BACKWARD=0`, `MOTOR_FORWARD=1`, `MOTOR_BRAKE=2` |
| `ClemRobotBLE.Motors(int[], float[], float[])` | `0x6DBFC4` | Aufbau des 9-Byte-Rahmens, Umrechnung von Kraft und Dauer |
| `ClemRobotBLE.PlaySound(int, bool)` | `0x6FB76C` | Aufbau des Tonbytes |
| `ClemRobotBLE.IRValueON` / `.IRValueOFF` / `.TouchPressed` | `0x6FB164` / `0x6FB310` / `0x6FB444` | Belegung des Sensorrahmens |
| `ClemRobotBLE.SubscriptionACK` | `0x6FAF0C` | die Verbindung gilt erst nach der Notification-Bestaetigung als benutzbar |
| `ClemRobotBLE.ScanServices` | `0x6FABB4` | kein Schreib-Handschlag; letzte Handlung ist das Einschalten der Notifications |
| `RobotControllerBLE..cctor` | `0x44D7E0` | `TURN_VALUE=0.65`, `OFF_LIMIT=1500`, `ON_LIMIT=2800`, `THRESHOLD_VISIBILITY=90` |
| `RobotControllerBLE.MoveAction(STATE_MOVE)` | `0x44B77C` | die neun Fahrtrichtungen |
| `RobotControllerBLE.RealtimePinzaCommand(PINZA_MOVE)` | `0x44C2F4` | der dritte Motor ist der Greifer |
| `RobotControllerBLE.UpdateRuntimeMotorsCommands` | `0x44C86C` | Sendetakt im Programmbetrieb |
| `RobotControllerBLE.CheckVisibilityIR` / `.IntensityIR` | `0x44D41C` / `0x44D610` | wie die Sensorwerte verrechnet werden |
| `com.xplored.ble.Peripheral$1.run` (in `classes.dex`) | — | `setWriteType(1)` = **WRITE_TYPE_NO_RESPONSE**, fest verdrahtet |

Die APK, die entpackten Dateien und die ausfuehrlichen Notizen mit woertlichen
Codeauszuegen bleiben lokal. Hier steht die Erkenntnis, nicht das fremde
Material.

## Der Stellrahmen

Neun Bytes auf `165aecf8…`: **drei Motoren zu je drei Byte**, in der Reihenfolge
`[Befehl, Kraft, Dauer]`. Keine Befehlskennung, kein Laengenfeld, **keine
Pruefsumme**.

| Byte | Bedeutung | Bereich | Ruhewert |
|---|---|---|---|
| 0 | Motor 0 — Befehl | 0, 1, 2 | `0x02` |
| 1 | Motor 0 — Kraft | 0…255 | `0x00` |
| 2 | Motor 0 — Dauer | 0…255, Einheit 10 ms | `0x00` |
| 3 | Motor 1 — Befehl | 0, 1, 2 | `0x02` |
| 4 | Motor 1 — Kraft | 0…255 | `0x00` |
| 5 | Motor 1 — Dauer | 0…255, Einheit 10 ms | `0x00` |
| 6 | Motor 2 — Befehl | 0, 1, 2 | `0x02` |
| 7 | Motor 2 — Kraft | 0…255 | `0x00` |
| 8 | Motor 2 — Dauer | 0…255, Einheit 10 ms | `0x00` |

Befehlsbyte:

| Wert | Bedeutung |
|---|---|
| `0x00` | rueckwaerts |
| `0x01` | vorwaerts |
| `0x02` | bremsen |

Kraftbyte: die App rechnet `(int)(kraft · 255)` mit `kraft` zwischen 0 und 1.

Dauerbyte: `(int)(begrenzt(dauer, 0, 2.55) · 100)`, also **Hundertstelsekunden,
hoechstens 2,55 s**. Der Roboter haelt von selbst an, wenn kein neuer Rahmen
kommt. Das passt genau zur harten 2,5-Sekunden-Grenze, die `antrieb.js` ohnehin
schon zieht.

Motorzuordnung: **Motor 0 und 1 sind der Fahrantrieb, Motor 2 ist der Greifer**
(in der App „pinza" beziehungsweise „cluster"). Die beiden Antriebsmotoren sind
spiegelbildlich eingebaut und laufen fuer Geradeausfahrt **gegenlaeufig**.

### Beispielrahmen

Die Bytes 6–8 sind der zuletzt gesetzte Greiferzustand, hier im Ruhezustand.

| Absicht | Rahmen |
|---|---|
| vorwaerts | `01 FF FA  00 FF FA  02 00 00` |
| rueckwaerts | `00 FF FA  01 FF FA  02 00 00` |
| auf der Stelle rechts | `01 FF FA  01 FF FA  02 00 00` |
| auf der Stelle links | `00 FF FA  00 FF FA  02 00 00` |
| vorwaerts Rechtsbogen | `01 FF FA  00 A5 FA  02 00 00` |
| vorwaerts Linksbogen | `01 A5 FA  00 FF FA  02 00 00` |
| rueckwaerts Rechtsbogen | `00 FF FA  01 A5 FA  02 00 00` |
| rueckwaerts Linksbogen | `00 A5 FA  01 FF FA  02 00 00` |
| Halt | `02 00 FA  02 00 FA  02 00 00` |
| Greifer oeffnen | `… … …  … … …  01 FF FA` |
| Greifer schliessen | `… … …  … … …  00 FF FA` |
| Greifer anhalten | `… … …  … … …  02 00 FA` |

`0xFF` = volle Kraft, `0xA5` = 165 = die Kurvenkraft 0,65 der App, `0xFA` = 250
= 2,5 s.

Ein Rahmen aus lauter Nullen ist ebenfalls ein gueltiger Halt (Befehl 0 bei
Kraft 0), aber die App sendet ihn so nicht.

### Drehsinn

Ob `0x01` am jeweiligen Motor vorwaerts oder rueckwaerts bedeutet, haengt beim
Hersteller an zwei Kennzeichen des Bausatzmodells: `_direct_drive_motor` fuer
den Antrieb, `_direct_cluster_motor` fuer den Greifer. Diese Werte liegen in den
Unity-Szenendaten, nicht im Programmtext, und sind deshalb aus der App nicht
ablesbar.

**Praktisch heisst das:** faehrt der Roboter auf `01 FF FA 00 FF FA …`
rueckwaerts, sind die Bytes 0 und 3 zu tauschen — dann stimmt die ganze Tabelle
oben. Ein Versuch genuegt, danach ist es eine Konstante.

### Sendeverhalten

- **Schreibtyp: „Write Without Response"**, in der Java-Seite der App fest
  verdrahtet. Ein Schreibvorgang ist gleichzeitig unterwegs, der naechste folgt
  aus einer Warteschlange.
- **Kein Dauerstrom noetig.** Die Fernsteuerung der App sendet **einen** Rahmen
  je Tastendruck und **einen** beim Loslassen. Die Bewegung endet nach der im
  Rahmen mitgegebenen Dauer von selbst.
- Nur wenn ein Blockprogramm laeuft, sendet die App laufend nach — mit der
  jeweils verbleibenden Restlaufzeit im Dauerbyte und einem Abstand von
  **hoechstens 100 ms**.

Fuer das Kuscheltier heisst das: nachsenden ist erlaubt und beim Halten einer
Bewegung ueber 2,5 s hinaus sogar noetig, aber keine Voraussetzung dafuer, dass
ein Befehl ueberhaupt ankommt. `SENDE_INTERVALL_MS = 100` in `protokoll.js` ist
genau richtig gewaehlt.

### Reihenfolge beim Verbinden

Es gibt **keinen Schreib-Handschlag**. Weder auf `cc9151df…` noch auf
`26c8d1e9…` muss vorher etwas stehen. Die App macht:

1. verbinden,
2. Dienste und Characteristics auflisten und den drei bekannten UUIDs zuordnen,
3. **Notifications auf `5e366294…` einschalten**,
4. erst wenn deren Bestaetigung eintrifft, gilt die Verbindung als benutzbar —
   bis dahin verwerfen sowohl der Stell- als auch der Tonpfad jeden Aufruf
   wirkungslos.

Das ist die einzige Bedingung: **Notifications einschalten, bevor der erste
Stellbefehl geschrieben wird.**

## Der Tonkanal

Ein Byte auf `cc9151df…`:

| Bit | Bedeutung |
|---|---|
| 7 | Endlosschleife |
| 6…0 | Tonnummer |

`0xFF` ist das **Stopp-Kommando** (die App uebergibt die Tonnummer `-1`).
Dass ein Schreibvorgang mit `0x00` einen Ton ausloest, passt: `0x00` ist die
gueltige Tonnummer 0.

Die Tonliste stammt aus der Unity-Resource `sound_collector` der App:

| Nr. | Name | Nr. | Name |
|---|---|---|---|
| 0 | Roboterfunk 1 | 15 | Alarm |
| 1 | Roboterfunk 2 | 16 | Summer |
| 2 | elektronischer Ton | 17 | Motor |
| 3 | Tuerklingel | 18 | Triumph |
| 4 | Telefontastatur | 19 | Hupe |
| 5 | Radar | 20 | Uhr |
| 6 | Alarmanlage scharf | 21 | Fehlschlag |
| 7 | altes Telefon | | |
| 10 | Radio | | |
| 14 | Schlagwerk | | |

Die Nummern 8, 9, 11, 12 und 13 fehlen in der Liste der App. Ob die Firmware sie
trotzdem kennt, ist offen — ausprobieren kostet nichts.

Fuer das Tier brauchbar: 18 (Triumph) und 21 (Fehlschlag) als Freude und
Enttaeuschung, 17 (Motor) als Schnurren, 19 (Hupe) als Ruf, 0 und 1 als
Geplapper.

## Der Sensorrahmen

Neun Bytes von `5e366294…`, vier 16-Bit-Werte little-endian und ein Statusbyte —
so weit stimmt die bisherige Lesart. Die Zuordnung:

| Byte | Bedeutung |
|---|---|
| 0–1 | IR-Sensor 0, Messung **A** |
| 2–3 | IR-Sensor 1, Messung **A** |
| 4–5 | IR-Sensor 0, Messung **B** |
| 6–7 | IR-Sensor 1, Messung **B** |
| 8 | Taster: 0 = nicht gedrueckt, sonst gedrueckt |

Der gemessene Rahmen `BE 01 7E 03 B0 01 B4 00 00` ist damit
IR0-A = 446, IR1-A = 894, IR0-B = 432, IR1-B = 180, Taster nicht gedrueckt.

**Es sind also nur zwei IR-Sensoren, nicht vier Kanaele.** Jeder wird zweimal
gemessen, und die App wertet ausschliesslich die **Differenz A − B** aus:

- `differenz > 90` gilt als **Hindernis erkannt**.
- Ist Messung B groesser als **1500**, gilt der Sensor als unbrauchbar.
- Ist Messung A groesser als **2800**, ebenso.

Die Grenze 2800 zeigt nebenbei, dass die Werte ueber 1024 hinausgehen koennen —
die Vermutung eines 10-Bit-Wandlers aus der vorigen Fassung traegt nicht.

In der App heissen die beiden Messungen `IRValueON` und `IRValueOFF`. Zusammen
mit der Differenzbildung ergibt das das uebliche Verfahren der
Fremdlichtunterdrueckung: einmal mit eingeschalteter IR-Diode messen, einmal
ohne, die Differenz ist das reflektierte Eigenlicht, und zu viel Umgebungslicht
macht die Messung unbrauchbar. Das steht so nicht im Code, passt aber zu jeder
Zeile davon.

Anmerkung fuer den Fall, dass jemand die App-Nummerierung danebenlegt: dort sind
die beiden Sensoren gegenueber der Rahmenbelegung vertauscht. Fuer uns zaehlt
allein die Tabelle oben.

## Beantwortet

Die vier offenen Fragen der vorigen Fassung:

1. **Was bedeuten die beiden Ein-Byte-Kanaele?** `cc9151df…` ist der Ton, siehe
   oben. `26c8d1e9…` benutzt die App ueberhaupt nicht. Weder Betriebsart noch
   Freigabe — es gibt keine Freigabe.
2. **Welches Stellbyte macht was?** Siehe Stellrahmen. Damit erklaeren sich auch
   die 27 erfolglosen Versuche der gefuehrten Suche: ein einzelnes gesetztes
   Byte trifft immer entweder Kraft **oder** Dauer, waehrend der jeweils andere
   Wert null bleibt — und ohne beide passiert nichts. Trifft es ein Befehlsbyte,
   steht dort zwar `0x01` (vorwaerts), aber mit Kraft 0 und Dauer 0. Es wurde
   nie etwas verworfen; es fehlte immer ein Drittel des Tripels. Die Suche war
   richtig gebaut, nur der Rahmen ist keine Byte-fuer-Byte-Angelegenheit.
3. **Braucht der Roboter einen Dauerstrom?** Nein, siehe Sendeverhalten.
4. **Welcher Sensorkanal ist welcher Sensor?** Siehe Sensorrahmen.

## Offen

1. **Der Drehsinn der Motoren** — eine Fahrt klaert es, siehe oben. Bis dahin
   ist die Richtungstabelle unter Vorbehalt.
2. **Was `26c8d1e9…` tut.** Die App ruehrt die Characteristic nicht an, also
   gibt sie darueber auch nichts preis. Das Labor kann es ausprobieren; Vorsicht
   ist angebracht, weil unbekannt ist, was der Kanal schaltet.
3. **Ob die Firmware mehr Toene kennt** als die 17 der App — die Luecken bei 8,
   9, 11, 12, 13 sind einen Versuch wert.
4. **Ob die Firmware kuerzere Rahmen annimmt.** Die App sendet ausnahmslos volle
   neun Byte.
5. **Der genaue Wertebereich der Sensoren.** Bekannt ist nur, dass er ueber 1024
   hinausreicht.

## Naechster Schritt im Projekt

Die Uebersetzung Absicht → Stellbytes kann jetzt geschrieben werden. Sie braucht
aus dieser Datei nur das Stellrahmen-Kapitel. `src/protokoll.js` bekommt die
Befehlskonstanten und eine Funktion, die aus drei Motorabsichten den Rahmen
baut; `SCHALTER_A_UUID` heisst besser `TON_UUID`. Die Sensorauswertung bekommt
die Differenzbildung und die drei Grenzen 90, 1500 und 2800.

[qtevobot]: https://github.com/hasselmm/QtEvoBot
