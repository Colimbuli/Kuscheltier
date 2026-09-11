# Das Funkprotokoll des EVRobot2

## Stand

**Nicht verifiziert.** Die Konstanten stammen aus [QtEvoBot][qtevobot], einer
inoffiziellen Qt-Bibliothek fuer Clementonis *Evolution Robot*. Dort wurden sie
fuer die erste Generation ermittelt, die sich per BLE als `Evolution-Robot`
meldet. Unser Geraet meldet sich als `EVRobot2` — andere Generation, also kann
das Protokoll abweichen. Die Verifikation steht aus, siehe unten.

## Was am Geraet gemessen wurde

| | |
|---|---|
| BLE-Name | `EVRobot2` |
| MAC | `00:A0:50:75:2A:ED` (OUI `00:A0:50` = Cypress Semiconductor) |
| Flags | `0x06` — LE General Discoverable, **BR/EDR Not Supported** |
| Advertising | Legacy, Intervall ~26 ms, connectable |
| Service-UUIDs im Advertising | keine |

Reines BLE ohne Bluetooth Classic. Damit ist Web Bluetooth in Chrome fuer
Android grundsaetzlich einsetzbar.

Weil das Geraet **keine Service-UUIDs im Advertising** fuehrt, muss die Seite die
Service-UUID vorher kennen: `navigator.bluetooth` gibt nur Dienste heraus, die in
`optionalServices` genannt sind. Eine Erkundung zur Laufzeit gibt es nicht.

## Was aus QtEvoBot uebernommen ist

| Rolle | UUID |
|---|---|
| Dienst | `0000fff3-0000-1000-8000-00805f9b34fb` |
| Rueckmeldung (Notify) | `0000fff4-…` |
| Stellbefehle (Write) | `0000fff5-…` |

Der Roboter erwartet einen **6-Byte-Rahmen im Dauerstrom**, etwa alle 100 ms —
kein Einzelbefehl. Ruhezustand: `58 11 40 40 00 00`.

| Byte | Bedeutung | Werte |
|---|---|---|
| 0 | Praeambel | immer `0x58` (`'X'`) |
| 1 | Fahren | `0x11` Stopp · `0x01–04` vor · `0x05–08` zurueck · `0x09–0C` links · `0x0D–10` rechts, je vier Stufen |
| 2 | Greifer | `0x40` neutral · `0x3C` auf · `0x3D` zu |
| 3 | Heben/Senken | `0x40` neutral · `0x3E` hoch · `0x3F` runter |
| 4 | Klang | `0x00` aus · sonst `21 + Index` |
| 5 | Effekt | `0x00` aus · `0x3B` laufenden Effekt beenden · sonst `Index + 0x35` (Firmware 1) bzw. `+ 0x47` (Firmware 2) |

Eine Pruefsumme gibt es nicht.

Die Firmware-Version steht als Text im Standarddienst *Device Information*
(`0x180A`), Characteristic *Firmware Revision String* (`0x2A26`), als `Ver1.0`
oder `Ver2.0`. Bei „EVRobot**2**" ist `Ver2.0` zu erwarten, also der Versatz
`0x47`.

Auf `fff4` schickt der Roboter ASCII-Text zurueck, etwa `V3Play` und `V3End` —
Beginn und Ende eines Klangs.

## Verifikation — was noch fehlt

1. **Dienste bestaetigen.** In nRF Connect auf `EVRobot2` verbinden und pruefen,
   ob `0xFFF3` mit `FFF4`/`FFF5` auftaucht. Wenn nicht, ist alles unten hinfaellig
   und das Protokoll muss per HCI-Snoop-Log neu ermittelt werden.
2. **Erste Bewegung.** Auf `FFF5` schreiben (erst „Write Request", falls wirkungslos
   „Write Command"):
   ```
   58 11 40 40 00 00     Ruhe
   58 02 40 40 00 00     vorwaerts, Stufe 2
   58 11 40 40 00 00     Stopp
   ```
   Bewegt sich nichts, den Rahmen wiederholt senden — moeglich, dass die Firmware
   den Dauerstrom braucht und einen Einzelschreibvorgang verwirft. Genau dafuer
   gibt es die Konsole in dieser Anwendung.
3. **Byte 1 durchzaehlen.** `0x01` bis `0x10` einzeln senden und notieren, was
   der Roboter jeweils tut. Stimmen die vier Bloecke zu je vier Stufen?
4. **Byte 2 und 3 pruefen.** Hat dieses Modell ueberhaupt Greifer und Hub? Das
   Bedienfeld zeigt `M1 M2 M3` — moeglich, dass M3 auf einem dieser Bytes liegt.
5. **Klaenge und Effekte abzaehlen.** Welche Indizes existieren, und meldet sich
   `fff4` dabei?

Ergebnisse gehoeren in diese Datei, und die Konstanten in `src/protokoll.js`
werden entsprechend nachgezogen.

## Falls das Protokoll abweicht

Dann per HCI-Snoop-Log neu ermitteln: Entwickleroptionen → „Bluetooth-HCI-Snoop-Log
aktivieren" → Bluetooth aus/an → mit der Hersteller-App gezielt einzelne Befehle
ausloesen, jeweils zwei Sekunden Pause → `btsnoop_hci.log` sichern und die
ATT-Write-Pakete in Wireshark ansehen.

[qtevobot]: https://github.com/hasselmm/QtEvoBot
