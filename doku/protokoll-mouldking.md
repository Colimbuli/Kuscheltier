# Das Funkprotokoll der Mould-King-Akkubox

Zweite Antriebsart neben dem [EVRobot2](protokoll.md). Set **MODELS P1**,
Modell **13090SD**, Aufdruck „2.4G Lithium Battery Box" — zwei Boxen, dazu
L-, XL- und M-Motoren, ein Servo und eine Lichtgruppe.

## Stand

| Teil | Stand |
|---|---|
| Uebertragungsart | **geklaert** |
| Verschluesselung, Pruefsumme, Adresse, Hersteller-ID | **geklaert und nachgebaut**, gegen Pruefvektoren geprueft |
| Kopplungstelegramm | **geklaert** |
| Sendeparameter | **geklaert** |
| Bedeutung der Stellbytes (Motor, Servo, Licht) | **offen** |

## Die Uebertragungsart

Die Box **verbindet sich nicht** — sie lauscht nur.

Am Geraet gemessen: Sie erscheint weder in einem BLE-Scan noch in der
Bluetooth-Kopplungsliste von Android, auch nicht beim Ein- und Ausschalten.
Die Hersteller-App steuert sie trotzdem, vom selben Handy. Da ein Handy
funktechnisch nur WLAN, Bluetooth und BLE beherrscht, bleibt nur ein Schluss:
Die App **sendet fortlaufend Advertising-Pakete**, die Box reagiert darauf. Das
Wort „verbinden" in der App ist Oberflaeche, kein Protokoll.

**Folge fuer dieses Projekt:** Web Bluetooth darf grundsaetzlich nicht senden.
Fuer diese Box ist eine native Android-App noetig, die `BluetoothLeAdvertiser`
benutzt. Dass das Handy das kann, ist dadurch bewiesen, dass die Hersteller-App
darauf laeuft.

## Der Rahmen

Die Nutzdaten des Advertising-Pakets sind kein Befehl, sondern ein vollstaendig
vorberechneter Funkrahmen: Adresse, Pruefsumme und die Bitverwuerfelung, die ein
BLE-Sender ohnehin anwendet. Die App rechnet sie vorweg heraus, damit das Handy
sie beim Senden wieder aufhebt und auf der Luft der Rahmen steht, den die Box
erwartet. „Verschluesselung" ist dafuer das falsche Wort; es ist ein Nachbau.

| | |
|---|---|
| Hersteller-ID beim Senden | `0xFF00` |
| Hersteller-ID der Antwort | `0xFFF0` |
| Empfaengeradresse | `C1 C2 C3 C4 C5`, fuer alle Boxen gleich |
| Vorspann | `71 0F 55` |
| Laenge der Nutzdaten | Adresslaenge + Telegrammlaenge + 5, bei 12 Byte Telegramm also 22 |

Der Ablauf, wie er in `src/mouldking.js` umgesetzt ist:

1. Puffer der Laenge `adr + daten + 20`; die ersten 15 Byte bleiben ungenutzt —
   sie schieben nur das Schieberegister 120 Takte vor.
2. `71 0F 55` an Position 15, Adresse **rueckwaerts** ab 18, dann das Telegramm.
3. Die ersten acht belegten Bytes (Vorspann und Adresse) werden **bitgespiegelt**.
4. Pruefsumme CRC-16/CCITT, Startwert `0xFFFF`: Adressbytes rueckwaerts und roh,
   Telegrammbytes vorwaerts und je bitgespiegelt; Ergebnis gespiegelt und
   invertiert. Sie kommt little endian ans Ende.
5. Bitverwuerfelung (Polynom x⁷+x⁴+1) zweimal: erst ab Position 18 mit Saat 63,
   dann ueber den ganzen Puffer mit Saat 37.
6. Gesendet wird der Ausschnitt ab Position 15.

**Die ersten acht Byte sind immer `6D B6 43 CF 7E 8F 47 11`** — sie entstehen
allein aus Vorspann und Adresse. Der erste Pruefstein, wenn ein Mitschnitt nicht
passen will.

### Pruefvektoren

Aus der Hersteller-App abgeleitet und in `test/mouldking.test.mjs` hinterlegt.
Weicht die Umsetzung auch nur in einem Byte ab, faellt der Test um.

| Fall | Telegramm | Nutzdaten |
|---|---|---|
| alles null | `00 …` (12×) | `6D B6 43 CF 7E 8F 47 11 E5 1D FE B8 51 FA 2A B4 E7 D4 0C B6 74 2D` |
| koppeln, Geraet `0x123456`, Box 0, Kanal 0 | `A0 12 34 56 00 00 00 04 00 00 00 00` | `6D B6 43 CF 7E 8F 47 11 45 0F CA EE 51 FA 2A B0 E7 D4 0C B6 E0 2C` |
| koppeln, Box 1 | `… 08 …` | `6D B6 43 CF 7E 8F 47 11 45 0F CA EE 51 FA 2A BC E7 D4 0C B6 D0 5B` |
| koppeln, Kanal 1 | `… 05 …` | `6D B6 43 CF 7E 8F 47 11 45 0F CA EE 51 FA 2A B1 E7 D4 0C B6 A4 27` |
| entkoppeln | `E0 12 34 56 …` | `6D B6 43 CF 7E 8F 47 11 05 0F CA EE 51 FA 2A B0 E7 D4 0C B6 80 7B` |

## Das Kopplungstelegramm

Zwoelf Byte. Einen Handschlag im engeren Sinn gibt es nicht — es geht denselben
Weg wie jedes andere Telegramm und unterscheidet sich nur in der Befehlskennung.

| Byte | Bedeutung | Werte |
|---|---|---|
| 0 | Befehlskennung | `0xA0` koppeln, `0xE0` entkoppeln |
| 1–3 | Geraetekennung, big endian | `0`…`0xFFFFFF` |
| 4–6 | ungenutzt | `00 00 00` |
| 7 | `((box + 1) << 2) \| kanal` | Box 0/Kanal 0 → `0x04` |
| 8–11 | ungenutzt | `00` |

Die Geraetekennung vergibt die App; jede Box bekommt beim Koppeln ihre eigene.
Ob in Byte 7 der erste Wert die Box und der zweite den Ausgang meint, ist aus
der App nicht zu entscheiden — beide werden nur durchgereicht. Der Name des
Parameters (`car`) spricht fuer die Box.

Statuscodes, mit denen die Box laut App **antwortet**: `0xC0` entkoppelt,
`0xE5` gekoppelt, unter Hersteller-ID `0xFFF0`.

**Offener Widerspruch:** Die App erwartet also ein Advertising der Box, in einem
Scan war aber nie eines zu sehen. Moeglich ist, dass die Box nur kurz nach einem
Kopplungstelegramm sendet, oder dass dieser Pfad zu einem anderen Boxtyp
derselben Bibliothek gehoert. Zu klaeren am Geraet: mit laufendem Scan ein
Kopplungstelegramm senden und sehen, ob etwas mit `F0 FF` erscheint.

## Sendeparameter

| Einstellung | Wert |
|---|---|
| `setAdvertiseMode` | `ADVERTISE_MODE_LOW_LATENCY` (~100 ms) |
| `setConnectable` | `true` |
| `setTimeout` | `0`, kein Zeitlimit |
| `setTxPowerLevel` | `ADVERTISE_TX_POWER_HIGH` |

Es ist ein **Dauerrundruf mit wechselnden Nutzdaten**, kein Einzelpaket. Bei
jeder Aenderung wird das Advertising gestoppt, neu gebaut und neu gestartet;
der Sendefaden laeuft im 50-ms-Takt. Ohne Aenderung wird spaetestens alle 150 ms
derselbe Inhalt erneut ausgestrahlt.

Eine neu gebaute App braucht ab Android 12 die Berechtigung
`android.permission.BLUETOOTH_ADVERTISE` und muss sie zur Laufzeit anfordern.

## Was offen ist

**Die Bedeutung der Stellbytes.** Der Java-Teil der App baut sie nicht, er nimmt
sie als fertige Liste aus dem Dart-Teil entgegen, und der liegt als
AOT-Maschinencode vor. Aus den Zeichenketten geht hervor, dass es Kanaele A bis D
mit je „Speed" und „Level" gibt, eine Variante mit sechs Kanaelen, eine eigene
Behandlung fuer Lenkung und eine fuer Licht — das passt zum Inhalt des Sets, ist
aber keine Byte-Belegung.

Dass bei diesem Hersteller `0x80` die Ruhelage einer Stellgroesse ist, legt ein
Ruherahmen aus dem verbindungsbasierten Teil derselben App nahe
(`CC 00 00 01` + 13× `80` + `33`). **Das ist ein Hinweis, kein Beleg** — jener
Teil gehoert zu anderen Boxen.

Weiter offen: ob der Motor ohne neues Telegramm weiterlaeuft, und wenn ja, wie
lange.

## Wie es weitergeht

Der Mitschnitt ist jetzt besonders ergiebig, weil der Rahmen bekannt ist: Die
mitgeschnittenen Nutzdaten laufen einfach rueckwaerts durch dieselbe Vorschrift.
Dafuer gibt es `werkzeug/snoop-lesen.mjs`.

1. Entwickleroptionen → „Bluetooth-HCI-Snoop-Log aktivieren", Bluetooth aus/an
2. Hersteller-App, Box koppeln, dann einzeln und mit Pausen: Motor A vorwaerts
   langsam, vorwaerts voll, rueckwaerts, Stopp, Motor B, Servo links/Mitte/rechts,
   Licht an/aus
3. `btsnoop_hci.log` sichern, dann
   `node werkzeug/snoop-lesen.mjs btsnoop_hci.log`

Ohne Mitschnitt geht auch ein Versuch von Hand: `werkzeug/telegramm.mjs` gibt die
Nutzdaten aus, die sich im Reiter *Advertiser* von nRF Connect als
Manufacturer Data mit Company ID `0xFF00` eintragen lassen. Damit laesst sich die
ganze Kette pruefen, ohne eine Zeile nativen Code.

## Abgleich mit fremder Vorarbeit

Die Verschluesselung stimmt Punkt fuer Punkt mit
[mkconnect-python](https://github.com/J0EK3R/mkconnect-python) ueberein —
unabhaengig voneinander ermittelt.

Die Telegramminhalte stimmen **nicht** ueberein: dort kurze Rahmen mit Mittelwert
`0x80` und Pruefsumme im letzten Byte, hier zwoelf Byte mit Befehlskennung und
Geraetekennung. Diese Box ist eine andere Generation als die dort beschriebenen
Hubs. Die Hersteller-ID `0xFF00` deckt sich dagegen mit der Espruino-Beschreibung
fuer Mould King.

## Herkunft

Aus der Android-App des Geraeteherstellers gelesen: Flutter mit nativem Zusatz,
die Verschluesselung in einer C++-Bibliothek mit unverschleierten Symbolen, der
Sendeweg im mit R8 verschleierten, aber lesbaren Java-Teil. Die vollstaendige
Belegkette — Klasse, Methode, Adresse und Codeausschnitt — bleibt **lokal**; sie
nuetzt nur dem, der dieselbe APK vorliegen hat.

Die APK und die entpackten Dateien kommen nicht ins Repository. Hier steht die
Erkenntnis, nicht das fremde Material.
