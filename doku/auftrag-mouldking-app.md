# Auftrag: Das Funkprotokoll der Mould-King-Akkubox aus der App herauslesen

Arbeitsauftrag fuer einen lokalen Claude-Code-Agenten auf dem Windows-Rechner.

---

## Ausgangslage

Ich steuere ein selbstgebautes elektronisches Haustier. Der bisherige Antrieb
haengt an einem anderen Hersteller und funktioniert; jetzt soll eine
**Mould-King-Akkubox** dazukommen, aus dem Set **MODELS P1, Modell 13090SD**
(Aufdruck „2.4G Lithium Battery Box"). Das Set enthaelt **zwei** dieser Boxen,
dazu 4 L-Motoren, 2 XL-Motoren, 2 M-Motoren, **einen Servomotor**, eine
Lichtgruppe und eine eigene 2,4-GHz-Fernsteuerung.

### Was am Geraet gemessen ist

- Die Box erscheint **nicht** in einem BLE-Scan (nRF Connect), auch nicht beim
  Ein- und Ausschalten.
- Die Box erscheint **nicht** in der Bluetooth-Kopplungsliste von Android, ist
  also auch kein Bluetooth-Classic-Geraet.
- Die **Hersteller-App steuert sie trotzdem**, vom selben Handy aus.

Daraus folgt zwingend: Die Box kuendigt sich nie an, sie **lauscht nur**. Die
App baut keine Verbindung auf, sondern **sendet fortlaufend Advertising-Pakete**,
auf die die Box reagiert. Das Wort „verbinden" in der App ist Oberflaeche, kein
Protokoll. Nebenbei ist damit bewiesen, dass das Handy Advertising aussenden
kann — das muss nicht mehr geprueft werden.

### Fremde Vorarbeit, nur als Gegenprobe

Fuer diese Geraetefamilie gibt es bereits Beschreibungen:
[mkconnect-python](https://github.com/J0EK3R/mkconnect-python) spricht von
„advertising telegrams" und zeigt **verschluesselte** Telegramme; die
Espruino-Seite „LEGO Power Functions Clone" beschreibt dasselbe Vorgehen fuer
Mould King, Kaiyu und weitere Klone und nennt unterschiedliche Hersteller-IDs
(0xFF00 fuer Mould King, 0xC200 fuer Kaiyu).

**Nutze das nur zum Abgleich, nicht als Wahrheit.** Meine Box kann eine andere
Generation sein. Was zaehlt, ist, was in der App steht.

## Ziel

Eine vollstaendige, belegte Beschreibung, **wie die App die Box steuert** —
so genau, dass ich es in einer eigenen Android-App nachbauen kann.

## Vorgehen

### 1. Die App beschaffen und bestimmen

Die App gehoert zu dem QR-Code auf der Packung; im Play Store heisst sie nach
dem Hersteller. Paketnamen auf dem Handy finden:

```
pm list packages | grep -iE 'mould|mk|king|model'
```

Dann wie beim letzten Mal: Bauart bestimmen (Unity/Mono, Unity/IL2CPP, Cordova,
Java/Kotlin, Flutter) und das passende Werkzeug waehlen.

### 2. Den Sendeweg finden

Such nach den Android-Schnittstellen fuer das Aussenden:

```
BluetoothLeAdvertiser   startAdvertising   startAdvertisingSet
AdvertiseData           AdvertiseSettings  AdvertisingSetParameters
setManufacturerData     setServiceData     addServiceUuid
```

Von jeder Fundstelle rueckwaerts arbeiten: Wer ruft das auf, mit welchen Daten,
und wie werden diese Daten gebaut?

### 3. Das Telegramm zerlegen

Das ist der Kern. Ich brauche:

- Die **Hersteller-ID** (`manufacturerId`) beziehungsweise Service-UUID, unter
  der die Nutzdaten stehen
- Die **Laenge** und den **Aufbau** der Nutzdaten, Byte fuer Byte
- Welches Byte **welchen Anschluss** meint. Die Box hat zwei Ausgaenge, das Set
  hat zwei Boxen — wie werden Kanaele und Boxen auseinandergehalten?
- Wie **Richtung** und **Kraft** kodiert sind: getrennte Bytes, Vorzeichen,
  Mittelpunkt bei 0x80, Wertebereich?
- Wie der **Servomotor** angesprochen wird, falls er anders behandelt wird als
  ein normaler Motor
- Wie die **Lichtgruppe** angesprochen wird
- Ob es einen **Zaehler** oder **Zeitstempel** im Telegramm gibt, der sich von
  Paket zu Paket aendert

### 4. Die Verschluesselung

Fremde Beschreibungen sprechen von verschluesselten Telegrammen. Finde das
Verfahren und den Schluessel, und zwar so vollstaendig, dass ich die Funktion
nachprogrammieren kann. Wenn es eine Tabelle, ein XOR-Muster oder eine
Standardchiffre ist: gib sie vollstaendig an.

### 5. Kopplung und Ablauf

- Gibt es ein **Kopplungstelegramm**, das vor den Steuerbefehlen kommt?
- Traegt die Box eine **Kennung**, und woher nimmt die App sie? Aus einer
  Nutzereingabe, aus einem Zaehler, aus dem Zufall?
- Wie werden **zwei Boxen** getrennt angesprochen?
- Muss das Telegramm **dauerhaft** ausgestrahlt werden, damit der Motor laeuft,
  oder genuegt ein einzelnes Paket? Wie lange laeuft ein Motor ohne neues Paket
  weiter — gibt es eine Abschaltzeit?

### 6. Die Sendeparameter

- `AdvertiseSettings`: Modus, Sendeleistung, verbindbar oder nicht
- Das **Advertising-Intervall** und wie oft die App das Paket wechselt
- Wird jedes Mal neu gestartet und gestoppt, oder laeuft ein Dauerrundruf, dessen
  Nutzdaten sich aendern?

---

## Was ich als Ergebnis brauche

Eine Datei `mouldking-befund.md` mit:

1. **Bauart der App** und benutztes Werkzeug
2. **Tabelle des Telegramms**: Position, Bedeutung, Wertebereich, Ruhewert
3. **Konkrete Beispieltelegramme als Hex**, im Klartext *und* verschluesselt:
   Motor A vorwaerts volle Kraft, Motor A rueckwaerts, Motor B, beides stopp,
   Servo Mittelstellung, Servo Anschlag
4. **Die Verschluesselung** als nachvollziehbare Vorschrift
5. **Ablauf beim Start**: Kopplung, Reihenfolge, Wartezeiten
6. **Sendeparameter** wie oben
7. **Ein kurzes Codegeruest** in Kotlin oder Pseudocode, das ein Telegramm baut
   und aussendet — so weit es sich aus dem Gelesenen ergibt
8. **Belege**: zu jeder Aussage Datei, Klasse, Methode und der entscheidende
   Codeausschnitt, woertlich

## Regeln

- **Trenne Gesichertes von Vermutetem.** Was im Code steht, ist belegt; alles
  andere kennzeichne als Vermutung und schreib dazu, woraus sie sich speist.
  Lieber „nicht ermittelbar" als eine glatte Erfindung — beim letzten Projekt
  hat uns eine plausible, aber falsche Rekonstruktion Stunden gekostet.
- Wo du auf die fremden Vorarbeiten triffst: sag ausdruecklich, ob sie zu dem
  passen, was in **dieser** App steht, oder nicht.
- **Die App bleibt unveraendert.** Nur lesen, nichts patchen, nichts neu
  paketieren.
- **Nichts davon wird veroeffentlicht.** APK und dekompilierte Quellen bleiben
  lokal; ins oeffentliche Repository kommt allein die Protokollbeschreibung.
- Fuehrt der Weg nicht weiter, weil der Code verschleiert ist: sag es frueh.
  Dann nehmen wir einen HCI-Snoop-Mitschnitt — der zeigt die
  `LE Set Advertising Data`-Befehle mitsamt Nutzdaten, waehrend die App faehrt.

## Warum das gebraucht wird

Web Bluetooth kann grundsaetzlich keine Advertising-Pakete aussenden. Fuer diese
Box ist eine native Android-App noetig, die `BluetoothLeAdvertiser` benutzt. Der
Befund aus diesem Auftrag ist die Voraussetzung dafuer — ohne ihn gibt es nichts
zu programmieren.
