# Blackjack Counter & Dashboard

Ein lokales Tool zum **Kartenzählen-Üben**, für **Live-Statistik**, **Basisstrategie
(inkl. Splits)** und **Geldverwaltung**. Läuft komplett im Browser – keine Installation,
keine Internetverbindung, keine Datenübertragung. Alles bleibt auf deinem PC.

## Starten

Doppelklick auf **`index.html`** (öffnet sich im Standard-Browser, z. B. Edge/Chrome).
Dein kompletter Stand – laufende Zählung (Running/True Count über die ausgeteilten
Karten), Bankroll, Einstellungen und der Verlauf – wird automatisch lokal im Browser
gespeichert (`localStorage`) und beim Neuladen wiederhergestellt. Mit **Session
zurücksetzen** löschst du die Geld-Session, mit **Neuer Schuh** nur die Zählung und mit
**Alles zurücksetzen** den gesamten gespeicherten Stand.

---

## Die vier Bereiche

### 1) Ausgeteilte Karten erfassen (Zählung)
Klicke jede Karte an, die am Tisch sichtbar wird – **alle** Karten (deine, die der
Mitspieler und die des Dealers). Das ist die Grundlage der Zählung.

- Tastatur (Karten): **2–9** = Zahlkarte, **0** = 10/Bube/Dame/König, **A** = Ass,
  **U** / **Backspace** = letzte Karte zurücknehmen (Vertipper korrigieren).
- Tastatur (Hand verbuchen): **G** = Gewonnen, **B** = Blackjack, **V** = Verloren,
  **P** = Push, **R** = Surrender · **+ / −** = Einsatz um eine Unit ändern.
- Tastatur (Steuerung): **N** = Neuer Schuh, **E** = CSV-Export, **I** = CSV-Import,
  **?** = Hilfe öffnen, **Esc** = schliessen.
- Oben rechts gibt es den Button **„? Hilfe"** – er öffnet eine Übersicht mit **allen
  Shortcuts** und einer kurzen Erklärung **aller Funktionen**.
- Verwendetes System: **Hi-Lo** → 2–6 = **+1**, 7–9 = **0**, 10/Bild/Ass = **−1**.

### 2) Live-Statistik
- **Running Count** – die rohe Summe der Hi-Lo-Werte.
- **True Count** – Running Count geteilt durch die verbleibenden Decks (der eigentlich
  aussagekräftige Wert).
- **Decks/Karten übrig**, **Durchdringung**, und eine grobe **Vorteils-Schätzung**.
- Faustregel: Erst ab **True Count +1** kippt der Vorteil zu deinen Gunsten.

### 3) Einsatz-Empfehlung
- **Einheit (Unit)** einstellen (z. B. 10). Daraus ergibt sich der empfohlene Einsatz
  über eine konservative Spread-Rampe nach True Count (1× → 2× → 4× → 6× → 8×).
- Zusätzlich ein **halber-Kelly-Vorschlag** auf Basis von Vorteil und Bankroll.

### 4) Basisstrategie-Berater (inkl. Splits)
- Wähle **deine Karten** und die **offene Dealerkarte** an.
- Ausgabe: **HIT / STAND / DOUBLE / SPLIT / SURRENDER**.
- Diese Auswahl ist nur für die Empfehlung und beeinflusst die Zählung **nicht** –
  die Karten trägst du oben im Zähl-Bereich ein.

### 5) Geldverwaltung & Session
- **Start-Bankroll** und **Einsatz dieser Hand** setzen.
- Ergebnis verbuchen: **Gewonnen (1:1)**, **Blackjack (3:2)**, **Verloren**,
  **Push**, **Surrender (½)**.
  - **Double:** Einsatz verdoppeln, dann Gewonnen/Verloren drücken.
  - **Split:** jede Teilhand einzeln verbuchen.
- Session-Statistik: Hände, Trefferquote, gesetzte Summe, Netto-Gewinn, Höchststand,
  plus **Bankroll-Verlaufschart**.
- **Als CSV exportieren** speichert Karten-/Count-Verlauf und Bankroll-/Hand-Verlauf als
  `.csv`-Datei auf dein Gerät (Semikolon-getrennt, mit BOM – öffnet sauber in Excel).
- **CSV importieren** lädt eine zuvor exportierte Datei wieder – auch den **Spielstand
  von jemand anderem**. Decks, Währung, Einheit, ausgeteilte Karten (Zählung), Bankroll
  und der komplette Hand-Verlauf werden übernommen. Vor dem Überschreiben kommt eine
  Sicherheitsabfrage. Am besten nur unveränderte Export-Dateien dieses Tools verwenden.

---

## Angenommene Spielregeln (Strategietabelle)

Die Basisstrategie geht von einem gängigen Mehrdeck-Spiel aus:

- 4+ Decks
- **Dealer steht auf Soft 17 (S17)**
- **Double nach Split erlaubt (DAS)**
- **Late Surrender erlaubt**

Bei abweichenden Regeln (z. B. Dealer **zieht** auf Soft 17 = H17) sind ein paar
wenige Felder anders – die Empfehlungen bleiben aber zu ~99 % identisch.

---

## Wichtiger Hinweis (bitte lesen)

Dieses Tool ist zum **Lernen, Üben und Analysieren** gedacht.

Kartenzählen **im Kopf** ist kein Betrug und in der Regel legal – Casinos dürfen dich
aber jederzeit des Hauses verweisen. Die Verwendung eines **elektronischen Hilfsmittels**
(Handy, App, Gerät) **am echten Spieltisch** ist dagegen vielerorts ausdrücklich
**verboten** und kann strafbar sein – z. B. im US-Bundesstaat **Nevada**
(NRS 465.075) und in vielen anderen Jurisdiktionen; in der Schweiz regelt das
Geldspielgesetz (BGS) den Spielbetrieb. Setze das Tool daher zu Hause zum Training ein,
nicht verdeckt im Casino.

Und ganz nüchtern: Auch mit perfektem Zählen ist der Vorteil klein (typisch ~0,5–1,5 %),
die Schwankungen sind groß, und ein Gewinn ist **nie garantiert**. Spiele nur mit Geld,
dessen Verlust du verkraftest.

---

## Dateien

| Datei | Zweck |
|------|-------|
| `index.html` | Aufbau der Oberfläche |
| `styles.css` | Design / Layout |
| `app.js` | Logik: Zählung, Strategie, Einsatz, Geldverwaltung |
| `LIESMICH.md` | Diese Anleitung |
