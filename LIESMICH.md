# Blackjack Counter & Dashboard

Ein Web-Tool zum **Kartenzählen-Üben**, für **Live-Statistik**, **Basisstrategie
(inkl. Splits)** und **Geldverwaltung** – mit **Benutzer-Login** und **geräteübergreifendem
Cloud-Speicher** pro Benutzer (über Firebase).

## Starten

Die Seite läuft über **GitHub Pages** (oder einen anderen Webserver). Ein direkter
Doppelklick auf `index.html` funktioniert **nicht mehr**, weil moderne Browser
ES-Module nur über `http(s)://` laden – nicht über `file://`.

Beim Öffnen erscheint zuerst die **Anmeldung**. Ohne gültiges Konto ist das Tool nicht
nutzbar. Nach dem Login wird dein Stand – laufende Zählung, Bankroll, Einstellungen und
Verlauf – automatisch in der **Cloud** gespeichert und ist auf **jedem Gerät** wieder da.
Oben rechts gibt es **Abmelden** und – für Admins – den Button **Admin**. Mit **Session
zurücksetzen** / **Neuer Schuh** / **Alles zurücksetzen** löschst du Geld-Session /
nur die Zählung / den gesamten Stand dieses Benutzers.

> **Damit das funktioniert, musst du einmalig Firebase einrichten** (kostenlos, ein paar
> Minuten – siehe nächster Abschnitt). Vorher zeigt die Login-Maske den Hinweis
> „Firebase ist noch nicht konfiguriert".

---

## Anmeldung & Firebase einrichten (einmalig)

Damit Login + geräteübergreifender Speicher funktionieren, brauchst du ein kostenloses
Firebase-Projekt:

**1. Projekt anlegen** – auf <https://console.firebase.google.com> einloggen →
**Projekt hinzufügen**.

**2. Web-App & Config** – im Projekt: ⚙ **Projekteinstellungen** → **Allgemein** → unten
**Meine Apps** → **</>** (Web) → registrieren. Den Block `firebaseConfig = { … }` kopieren
und in **`firebase-config.js`** einsetzen (Platzhalter ersetzen).

**3. Anmeldung aktivieren** – **Authentication** → **Get started** → **Sign-in method**
→ **E-Mail/Passwort** aktivieren.

**4. Datenbank** – **Firestore Database** → **Datenbank erstellen** → **Produktionsmodus**.
Dann Reiter **Regeln** → folgende Regeln einfügen (deine Admin-E-Mail eintragen) und
**Veröffentlichen**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null
        && request.auth.token.email in ['admin@example.com'];
    }
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      allow read, write: if isAdmin();
    }
  }
}
```

**5. Admin festlegen** – in **`firebase-config.js`** unter `ADMIN_EMAILS` deine Admin-E-Mail
eintragen (genau **dieselbe** wie in den Regeln oben).

**6. Ersten Admin-Account erstellen** – **Authentication** → **Users** → **Add user**
→ deine Admin-E-Mail + Passwort. Danach Seite öffnen, anmelden → der Button **Admin**
erscheint.

**7. (GitHub Pages) Domain freigeben** – falls „unauthorized domain" erscheint:
**Authentication → Settings → Authorized domains** → deine `…github.io`-Domain hinzufügen.

### Benutzer verwalten (Admin-Console)
- Oben rechts **Admin** öffnen.
- **Neuen Benutzer anlegen:** E-Mail + Passwort (min. 6 Zeichen) → **Anlegen**. Der
  Benutzer kann sich sofort von **jedem Gerät** anmelden; sein Spielstand liegt in der Cloud.
- **Sperren / Aktivieren:** blockiert die Anmeldung, ohne Daten zu löschen.
- **Daten löschen:** entfernt nur den Spielstand. Das **Login-Konto** selbst lässt sich
  aus Sicherheitsgründen nur in der **Firebase-Konsole** (Authentication → Users) endgültig
  löschen.

> Pro Benutzer wird unter `users/{uid}` nur der Spielstand gespeichert. Die Firebase-Config
> im Code darf öffentlich sein – die Zugriffskontrolle übernehmen die Firestore-Regeln.

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
| `auth.js` | Anmeldung, Cloud-Speicher pro Benutzer, Admin-Console (Firebase) |
| `firebase-config.js` | **Hier deine Firebase-Projektdaten eintragen** |
| `LIESMICH.md` | Diese Anleitung |
