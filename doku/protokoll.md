# Das Funkprotokoll des EVRobot2

## Stand

Die GATT-Struktur ist **am Geraet gemessen** und gesichert. Die **Bedeutung der
neun Stellbytes ist offen** — dafuer gibt es das Labor in der Anwendung.

Der frueher hier dokumentierte Ansatz aus [QtEvoBot][qtevobot] ist **widerlegt**:
jenes Projekt steuert die Vorgaengergeneration (`Evolution-Robot`) ueber den
Dienst `0xFFF3` mit einem 6-Byte-Rahmen. Ein Verbindungsversuch auf diesen Dienst
scheitert am EVRobot2 mit „No Services matching UUID 0000fff3 found in Device".
Weder die UUIDs noch das Rahmenformat sind uebertragbar.

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
sind. Eine Erkundung zur Laufzeit ist ueber Web Bluetooth nicht moeglich — dafuer
braucht es nRF Connect oder ein anderes Werkzeug mit nativem BLE-Zugriff.

### GATT

Ausser `Generic Access` (`0x1800`) und `Generic Attribute` (`0x1801`) gibt es
genau einen Dienst. **Kein Device Information Service**, also auch keine
auslesbare Firmware-Version.

Dienst `2f5772da-18e3-4f2e-82ab-910e81b9f232`:

| Characteristic | Eigenschaften | Laenge | Gelesener Wert |
|---|---|---|---|
| `5e366294-5436-4356-a009-7ccd1e03526d` | NOTIFY, READ | 9 | `BE 01 7E 03 B0 01 B4 00 00` |
| `165aecf8-ed44-45e7-aae4-63789234a30f` | READ, WRITE, WRITE NO RESPONSE | 9 | alles `00` |
| `cc9151df-c5eb-477a-a793-287a5500fc81` | READ, WRITE | 1 | `00` |
| `26c8d1e9-f4ae-4f76-97ea-8576d5e23079` | READ, WRITE, WRITE NO RESPONSE | 1 | `00` |

Verbindungsparameter laut `0x2A04`: Intervall 7,5–50 ms, Latenz 0,
Supervision-Timeout-Multiplikator 1000.

### Sensorrahmen

Die neun Bytes von `5e366294…` als vier 16-Bit-Werte little-endian plus ein
Statusbyte gelesen ergeben **446, 894, 432, 180** und `0x00`. Alle vier liegen
unter 1024, was auf einen 10-Bit-Analogwandler hindeutet. Die Zuordnung der
Kanaele zu einzelnen Sensoren steht aus.

### Stellrahmen

Neun Bytes, im Ruhezustand alle null. Die Bedeutung der einzelnen Bytes ist
unbekannt.

## Offene Fragen und wie sie zu klaeren sind

1. **Was bedeuten die beiden Ein-Byte-Kanaele?** Verdacht: Betriebsart oder
   Freigabe. Im Labor auf `01` setzen und pruefen, ob der Roboter danach
   ueberhaupt Stellbefehle annimmt.
2. **Welches Stellbyte macht was?** Die gefuehrte Suche im Labor setzt der Reihe
   nach genau ein Byte auf `0xFF`, dann `0x80`, dann `0x01` und protokolliert,
   worauf der Roboter reagiert.
3. **Braucht der Roboter einen Dauerstrom?** Der Schalter „Dauersenden" im
   Handbetrieb wiederholt den Rahmen zehnmal pro Sekunde. Wenn ein einzelner
   Schreibvorgang wirkungslos bleibt, der wiederholte aber nicht, ist die Frage
   beantwortet.
4. **Welcher Sensorkanal ist welcher Sensor?** Bei laufenden Notifications einen
   Sensor gezielt reizen (Rad drehen, Licht abdecken) und zusehen, welche der
   vier Zahlen sich bewegt.

Ergebnisse gehoeren in diese Datei; die Konstanten in `src/protokoll.js` und die
Uebersetzung der Absichten in Stellbytes werden entsprechend nachgezogen.

## Falls die Suche nicht weiterfuehrt

Dann hilft die Hersteller-App: APK ziehen und nach der Dienst-UUID `2f5772da`
suchen — der Code, der auf `165aecf8…` schreibt, liefert das Rahmenformat exakt.
Alternativ per HCI-Snoop-Log: Entwickleroptionen → „Bluetooth-HCI-Snoop-Log
aktivieren" → Bluetooth aus und wieder an → mit der Hersteller-App gezielt
einzelne Befehle ausloesen, jeweils zwei Sekunden Pause → `btsnoop_hci.log`
sichern und die ATT-Write-Pakete in Wireshark ansehen.

[qtevobot]: https://github.com/hasselmm/QtEvoBot
