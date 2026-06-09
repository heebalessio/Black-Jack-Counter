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

**3. Anmeldearten aktivieren** – **Authentication** → **Get started** → **Sign-in method**
→ **E-Mail/Passwort**, **Google** und **Apple** aktivieren. (Apple braucht zusätzlich die
Einrichtung im Apple-Developer-Account; Google läuft ohne Extra-Setup.)

**4. Datenbank** – **Firestore Database** → **Datenbank erstellen** → **Produktionsmodus**.
Dann Reiter **Regeln** → den Inhalt aus der Datei `firestore.rules` einfügen und
**Veröffentlichen**. Die Regeln enthalten **keine E-Mail** – Admin wird über das
`role`-Feld bestimmt:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    match /users/{uid} {
      allow read: if request.auth != null && (request.auth.uid == uid || isAdmin());
      allow create, delete: if isAdmin();
      allow update: if isAdmin()
        || ( request.auth != null && request.auth.uid == uid
             && request.resource.data.role == resource.data.role
             && request.resource.data.disabled == resource.data.disabled );
    }
    match /{document=**} { allow read, write: if false; }
  }
}
```

(Gehärtet: **Profile legt nur der Admin an** – damit kann sich niemand selbst registrieren.
Jeder sieht/ändert nur sein eigenes Profil; `role`/`disabled` kann **nur ein Admin** setzen –
keine Selbst-Hochstufung, kein Aufheben einer Sperre.)

**5. Web3Forms einrichten** (für „Account anfragen" / „Änderung vorschlagen") – auf
<https://web3forms.com> deine E-Mail eingeben → du bekommst einen **Access-Key** per Mail.
Diesen Key in **`firebase-config.js`** bei `WEB3FORMS_KEY` eintragen. Deine Empfänger-Adresse
bleibt bei Web3Forms hinterlegt und steht **nicht** im Code.

**6. Ersten Admin festlegen (einmalig)** – Da im Code **keine** Admin-E-Mail steht, wird der
erste Admin direkt in der Konsole gesetzt:
1. Einmal in der App mit **„Mit Google anmelden"** anmelden (du wirst noch abgewiesen – das
   ist ok, es legt nur deinen Auth-Account an).
2. **Authentication → Users** → deine **User-UID** kopieren.
3. **Firestore Database → Daten** → Collection **`users`** → Dokument mit **deiner UID** als
   Doc-ID anlegen, Feld **`role`** = `admin` (Typ string); optional `email`, `state` (leere Map).
4. Erneut anmelden → der Button **Admin** erscheint. Ab dann legst du alle weiteren Benutzer
   bequem in der Admin-Console an.

(Tipp: Schritt 2–3 kann der Comet-Assistent übernehmen – Prompt unten.)

**7. (GitHub Pages) Domain freigeben** – falls „unauthorized domain" erscheint (auch nötig
für Google/Apple-Popups): **Authentication → Settings → Authorized domains** → deine
`…github.io`-Domain hinzufügen.

**8. E-Mail-Bestätigung & MFA** – Neue E-Mail/Passwort-Konten müssen ihre **E-Mail
bestätigen** (Link wird automatisch verschickt); erst danach ist das Tool nutzbar
(Google/Apple gelten als bestätigt). Damit ist die Voraussetzung für **MFA** erfüllt –
die Zwei-Faktor-Pflicht richtest du in Firebase ein (erfordert „Identity Platform").
*Hinweis:* Die **In-App-Abfrage** des zweiten Faktors ist noch nicht eingebaut; wenn du
MFA erzwingst, sag Bescheid, dann ergänze ich die Abfrage (sonst schlägt der Login für
MFA-Konten fehl).

### Benutzer verwalten (Admin-Console)
- Oben rechts **Admin** öffnen.
- **Neuen Benutzer anlegen:** E-Mail + Passwort (min. 6 Zeichen) → **Anlegen**. Der
  Benutzer kann sich sofort von **jedem Gerät** anmelden; sein Spielstand liegt in der Cloud.
- **Sperren / Aktivieren:** blockiert die Anmeldung, ohne Daten zu löschen.
- **Daten löschen:** entfernt nur den Spielstand. Das **Login-Konto** selbst lässt sich
  aus Sicherheitsgründen nur in der **Firebase-Konsole** (Authentication → Users) endgültig
  löschen.

> Neu angelegte Benutzer müssen sich beim **ersten Login per E-Mail bestätigen** (Link wird
> automatisch verschickt). Verwende daher echte E-Mail-Adressen.

### Account anfragen & Änderungswünsche
- **Login-Fenster → „Account anfragen"**: schreibt dir (Admin) eine Nachricht per
  E-Mail-Programm. So fordern Leute einen Zugang an – selbst registrieren geht nicht.
- **Fusszeile → „Änderung vorschlagen"** (nach dem Login): sendet dir Änderungswünsche.
- Beide senden **automatisch eine E-Mail** an dich (über Web3Forms, Schritt 5) – ohne
  Mail-Programm. Deine Empfänger-Adresse ist bei Web3Forms hinterlegt und steht **nicht**
  im Code, wird also nirgends geleakt.

### Sicherheit (Kurzüberblick)
- **Keine Selbst-Registrierung:** Zugang nur mit einem vom Admin angelegten Profil; Anlegen
  erlauben die Regeln nur Admins (gilt für E-Mail/Passwort **und** Google/Apple).
- **Keine Rechte-Eskalation:** Admin-Status kommt aus dem `role`-Feld, das laut Regeln
  **nur ein Admin** setzen kann. Im Code (Client **und** Regeln) steht **keine E-Mail**.
- **XSS-geschützt:** Eingaben (z. B. Währung, importierte CSV) werden bereinigt, Ausgaben escaped.
- **Daten getrennt:** Jeder liest/schreibt nur sein eigenes Profil; `role`/`disabled` nur per
  Admin. Andere Collections sind komplett gesperrt.

> Hinweis: Web-Apps sind clientseitig immer einsehbar; jemand kann **lokal** im eigenen
> Browser den Code anschauen/ändern – das betrifft aber nur die eigene Ansicht und kann wegen
> der Server-Regeln **keine fremden Daten** ändern und **keine Rechte** verschaffen.

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
