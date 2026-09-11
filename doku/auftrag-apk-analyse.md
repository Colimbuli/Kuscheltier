# Auftrag: Das BLE-Protokoll des Clementoni RoboMaker aus der App herauslesen

Dieser Text ist als Arbeitsauftrag fuer einen lokalen Claude-Code-Agenten auf dem
Windows-Rechner gedacht, auf dem die entpackte App liegt.

---

## Ausgangslage

Ich steuere einen **Clementoni RoboMaker** (BLE-Name `EVRobot2`, MAC
`00:A0:50:75:2A:ED`, Cypress-Chip) von einer eigenen Web-Bluetooth-Seite aus.
Die Verbindung steht, das **Rahmenformat der Stellbefehle ist unbekannt**.

Die zugehoerige App ist `it.clementoni.robomaker` Version 20, entpackt unter:

```
C:\Users\Seiler\Downloads\it-clementoni-robomaker
```

### Am Geraet gemessenes GATT

Dienst `2f5772da-18e3-4f2e-82ab-910e81b9f232`, ausser Generic Access und
Generic Attribute der einzige. Kein Device Information Service.

| Characteristic | Eigenschaften | Laenge | Gelesener Wert |
|---|---|---|---|
| `5e366294-5436-4356-a009-7ccd1e03526d` | NOTIFY, READ | 9 | `BE 01 7E 03 B0 01 B4 00 00` |
| `165aecf8-ed44-45e7-aae4-63789234a30f` | READ, WRITE, WRITE NO RESPONSE | 9 | alles `00` |
| `cc9151df-c5eb-477a-a793-287a5500fc81` | READ, WRITE | 1 | `00` |
| `26c8d1e9-f4ae-4f76-97ea-8576d5e23079` | READ, WRITE, WRITE NO RESPONSE | 1 | `00` |

### Was schon bekannt ist

- Die vier Sensorzahlen (Sensorrahmen als vier 16-Bit-Werte little-endian plus
  ein Statusbyte gelesen: 446, 894, 432, 180) **aendern sich, wenn man die Hand
  ueber den Roboter haelt**. Alle unter 1024, vermutlich ein 10-Bit-Wandler.
- **Ein Schreibvorgang auf `cc9151df…` loest am Roboter einen Sound aus** — bei
  Wert `0x00` genauso wie bei `0x01`.
- `26c8d1e9…` liess sich nicht auf `0x01` setzen, ohne sichtbare Wirkung.
- **Schon ausgeschlossen:** im 9-Byte-Rahmen genau ein Byte auf `0xFF`, `0x80`
  oder `0x01` zu setzen und alle anderen auf null, bewirkt nichts. 27 Versuche,
  jeweils ein einzelner Schreibvorgang ohne Dauerwiederholung. Daraus folgt
  vermutlich, dass der Rahmen eine Struktur hat (Befehlskennung, Parameter,
  eventuell Pruefsumme) und unvollstaendige Pakete verworfen werden.

---

## Ziel

Eine vollstaendige, belegte Beschreibung, **wie die App den Roboter steuert**.

## Vorgehen

### 1. Bauart bestimmen

Sieh in den entpackten Ordner und entscheide:

- `assets\bin\Data\Managed\Assembly-CSharp.dll` vorhanden → **Unity mit Mono**.
  Analysiere die DLL (ILSpy, `ilspycmd`, dnSpy oder `monodis`). Das ist der
  angenehmste Fall.
- `lib\**\libil2cpp.so` und `assets\bin\Data\Managed\Metadata\global-metadata.dat`
  → **Unity mit IL2CPP**. Dann Il2CppDumper einsetzen; die Methodennamen stehen
  in der Metadatendatei.
- `assets\www\` mit JavaScript → **Cordova**. Der Code liegt offen, eventuell
  minifiziert.
- Sonst `classes.dex`, `classes2.dex` … → **Java/Kotlin**. Mit `jadx` nach Java
  dekompilieren.
- `lib\**\libapp.so` ohne das Uebrige → Flutter. Sag mir das, dann aendern wir
  die Strategie.

### 2. Die UUIDs finden

Such in den dekompilierten Quellen nach diesen Zeichenfolgen:

```
2f5772da   165aecf8   5e366294   cc9151df   26c8d1e9
```

Beachte: UUIDs koennen gross geschrieben, ohne Bindestriche, in Teilen
zusammengesetzt oder aus einzelnen Bytes gebaut sein. Such deshalb auch nach
kurzen Bruchstuecken und nach umgedrehter Bytereihenfolge.

### 3. Dem Schreibpfad folgen

Finde jede Stelle, die auf `165aecf8…` schreibt, und arbeite rueckwaerts:
Wer ruft das auf, mit welchem Puffer, und wie wird dieser Puffer gefuellt?
Achte besonders auf:

- Eine **Befehlskennung** in einem festen Byte
- **Pruefsumme oder Laengenfeld**
- Ob der Rahmen **einmalig oder wiederholt** gesendet wird (Timer, Coroutine,
  Handler, `setInterval`) und in welchem Abstand
- Ob vor dem ersten Stellbefehl ein **Handschlag** noetig ist (etwa ein
  bestimmter Wert auf `cc9151df…` oder `26c8d1e9…`)
- Welcher **Schreibtyp** verwendet wird (mit oder ohne Bestaetigung)

### 4. Die uebrigen Kanaele klaeren

- Was schreibt die App auf `cc9151df…` und `26c8d1e9…`, und wann?
- Wie wertet sie den Sensorrahmen von `5e366294…` aus? Welcher der vier Kanaele
  ist welcher Sensor, und in welchen Einheiten?
- Gibt es eine Tabelle von Sounds, Effekten oder Aktionen mit ihren Nummern?

---

## Was ich als Ergebnis brauche

Eine Datei `protokoll-befund.md` mit:

1. **Bauart der App** und welches Werkzeug du benutzt hast
2. **Tabelle des 9-Byte-Stellrahmens**: Position, Bedeutung, Wertebereich,
   Ruhewert. Wenn ein Byte eine Befehlskennung ist, die Liste der Kennungen.
3. **Konkrete Beispielrahmen** als Hex: vorwaerts, rueckwaerts, links, rechts,
   Stopp, und was es sonst gibt
4. **Sendeverhalten**: einmalig oder Dauerstrom, Abstand in Millisekunden,
   Schreibtyp
5. **Handschlag**, falls noetig: welche Werte in welcher Reihenfolge
6. **Bedeutung der beiden Ein-Byte-Kanaele**
7. **Deutung des Sensorrahmens**, Kanal fuer Kanal
8. **Belege**: zu jeder Aussage die Fundstelle (Datei, Klasse, Methode) und der
   entscheidende Quelltextausschnitt, woertlich

## Regeln

- **Trenne Gesichertes von Vermutetem.** Was du aus dem Code ablesen kannst, ist
  belegt; alles andere kennzeichne ausdruecklich als Vermutung und schreib dazu,
  woraus sie sich speist. Lieber "nicht ermittelbar" als eine glatte Erfindung —
  ich habe schon einmal Tage an ein Protokoll verloren, das plausibel klang und
  falsch war.
- **Die App bleibt unveraendert.** Nur lesen, nichts patchen, nichts neu paketieren.
- **Nichts davon wird veroeffentlicht.** Die APK und die dekompilierten Quellen
  bleiben lokal; ins oeffentliche Projekt-Repository kommt allein die
  Protokollbeschreibung, also die Erkenntnis, nicht das fremde Material.
- Wenn der Code verschleiert ist und der Weg nicht weiterfuehrt, sag das
  frueh — dann nehmen wir stattdessen einen HCI-Snoop-Mitschnitt des echten
  Funkverkehrs.

## Nuetzliche Befehle

```powershell
# Ordner sichten
Get-ChildItem -Recurse -Depth 2 C:\Users\Seiler\Downloads\it-clementoni-robomaker |
  Select-Object FullName, Length

# Java-Fall: dekompilieren (jadx von https://github.com/skylot/jadx)
jadx -d C:\temp\robomaker-src C:\Users\Seiler\Downloads\it-clementoni-robomaker\classes.dex

# Unity-Mono-Fall: dekompilieren (ilspycmd via "dotnet tool install -g ilspycmd")
ilspycmd -p -o C:\temp\robomaker-src `
  C:\Users\Seiler\Downloads\it-clementoni-robomaker\assets\bin\Data\Managed\Assembly-CSharp.dll

# In den Quellen suchen (ripgrep)
rg -i -n "2f5772da|165aecf8|5e366294|cc9151df|26c8d1e9" C:\temp\robomaker-src
rg -i -n "writeCharacteristic|WRITE_TYPE|WriteCharacteristic|setValue" C:\temp\robomaker-src

# Rohe Suche in Binaerdateien, falls noch nichts dekompiliert ist
rg -a -i "2f5772da" C:\Users\Seiler\Downloads\it-clementoni-robomaker
```
