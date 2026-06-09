/* =========================================================================
   auth.js  –  Anmeldung (Pflicht), Cloud-Speicher pro Benutzer, Admin-Console
   Läuft als ES-Modul und lädt das Firebase-Web-SDK direkt vom CDN.
   Spricht mit dem Spiel (app.js) nur über window.bjInit / window.bjApplyState
   / window.bjGetState und stellt window.persistState bereit.
   ========================================================================= */

import { initializeApp, deleteApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, sendEmailVerification,
  GoogleAuthProvider, OAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { firebaseConfig, WEB3FORMS_KEY } from "./firebase-config.js";

/* ---------- kleine Helfer ---------- */
const $ = id => document.getElementById(id);
/* Admin wird über das role-Feld in Firestore bestimmt – es steht KEINE E-Mail im Code. */
const CONFIGURED = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== "DEIN_API_KEY";

/* ---------- Login-Fehler verständlich machen ---------- */
function authErrorText(code){
  switch(code){
    case "auth/invalid-email":        return "Ungültige E-Mail-Adresse.";
    case "auth/missing-password":     return "Bitte Passwort eingeben.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":       return "E-Mail oder Passwort ist falsch.";
    case "auth/too-many-requests":    return "Zu viele Versuche – bitte später erneut.";
    case "auth/network-request-failed":return "Keine Verbindung zum Server.";
    case "auth/email-already-in-use": return "Diese E-Mail ist bereits vergeben.";
    case "auth/weak-password":        return "Passwort zu kurz (mind. 6 Zeichen).";
    default:                          return "Anmeldung fehlgeschlagen ("+code+").";
  }
}

/* ---------- Kontakt/Anfrage: automatische Mail über Web3Forms (Empfänger steht NICHT im Code) ---------- */
let contactMode = "feedback";
function openContact(mode){
  contactMode = mode;
  const isAcc = mode === "account";
  if($("contactTitle")) $("contactTitle").textContent = isAcc ? "Account anfragen" : "Änderung vorschlagen";
  if($("contactHint"))  $("contactHint").textContent  = isAcc
    ? "Beschreibe kurz, wer du bist und wofür du Zugang brauchst. Beim Senden öffnet sich dein E-Mail-Programm."
    : "Beschreibe, was du gerne geändert hättest. Beim Senden öffnet sich dein E-Mail-Programm an den Admin.";
  if($("contactText")) $("contactText").value = "";
  if($("contactModal")) $("contactModal").hidden = false;
  if($("contactText")) $("contactText").focus();
}
function closeContact(){ if($("contactModal")) $("contactModal").hidden = true; }
async function sendContact(){
  const text = ($("contactText").value || "").trim();
  if(!text){ $("contactText").focus(); return; }
  if(!WEB3FORMS_KEY || WEB3FORMS_KEY === "DEIN_WEB3FORMS_KEY"){
    $("contactHint").textContent = "E-Mail-Versand ist noch nicht eingerichtet (WEB3FORMS_KEY fehlt – siehe LIESMICH.md).";
    return;
  }
  const subject = contactMode === "account" ? "Account-Anfrage – Blackjack-Tool" : "Änderungswunsch – Blackjack-Tool";
  const who = ($("userInfo") && !$("userInfo").hidden && $("userInfo").textContent.trim())
              ? $("userInfo").textContent.trim() : "nicht angemeldet";
  const btn = $("contactSend"); const old = btn ? btn.textContent : "";
  if(btn){ btn.disabled = true; btn.textContent = "Wird gesendet …"; }
  $("contactHint").textContent = "";
  try{
    // Empfänger ist bei Web3Forms am Access-Key hinterlegt – steht NICHT im Code.
    const res = await fetch("https://api.web3forms.com/submit", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Accept":"application/json" },
      body: JSON.stringify({ access_key: WEB3FORMS_KEY, subject, from_name:"Blackjack-Tool",
                             message: text + "\n\n— Absender: " + who })
    });
    const data = await res.json().catch(() => ({}));
    if(res.ok && data.success){
      $("contactHint").textContent = "✓ Gesendet – danke! Du bekommst Rückmeldung.";
      $("contactText").value = "";
      setTimeout(closeContact, 1500);
    } else {
      $("contactHint").textContent = "Senden fehlgeschlagen. Bitte später erneut versuchen.";
    }
  }catch(e){
    $("contactHint").textContent = "Keine Verbindung – Senden fehlgeschlagen.";
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = old; }
  }
}
function wireContact(){
  const fb = $("feedbackBtn");        if(fb) fb.addEventListener("click", () => openContact("feedback"));
  const rq = $("requestAccountBtn");  if(rq) rq.addEventListener("click", () => openContact("account"));
  const cc = $("contactClose");       if(cc) cc.addEventListener("click", closeContact);
  const cs = $("contactSend");        if(cs) cs.addEventListener("click", sendContact);
  const cm = $("contactModal");       if(cm) cm.addEventListener("click", e => { if(e.target.id==="contactModal") closeContact(); });
}

/* ===================================================================== */
/*  Ohne gültige Config: Hinweis anzeigen und abbrechen                  */
/* ===================================================================== */
if(!CONFIGURED){
  window.addEventListener("DOMContentLoaded", () => {
    if($("loginMsg")) $("loginMsg").textContent =
      "⚠ Firebase ist noch nicht konfiguriert. Bitte firebase-config.js ausfüllen (siehe LIESMICH.md).";
    if($("loginBtn")) $("loginBtn").disabled = true;
    wireContact();
  });
} else {

/* ===================================================================== */
/*  Firebase initialisieren                                              */
/* ===================================================================== */
const app  = initializeApp(firebaseConfig);
const auth  = getAuth(app);
const db    = getFirestore(app);

let currentRole = "user";

/* ---------- Login-Formular ---------- */
function wireLoginForm(){
  const showErr = code => {
    if(code === "auth/multi-factor-auth-required")
      $("loginError").textContent = "Zwei-Faktor-Bestätigung nötig – die In-App-Abfrage dafür ist noch nicht eingebaut.";
    else if(code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request")
      $("loginError").textContent = authErrorText(code || "");
  };
  const doLogin = async () => {
    const email = ($("loginEmail").value || "").trim();
    const pw    = $("loginPw").value || "";
    $("loginError").textContent = "";
    $("loginBtn").disabled = true;
    try{ await signInWithEmailAndPassword(auth, email, pw); }   // weiter in onAuthStateChanged
    catch(err){ showErr(err.code); }
    finally{ $("loginBtn").disabled = false; }
  };
  const socialLogin = async (provider) => {
    $("loginError").textContent = "";
    try{ await signInWithPopup(auth, provider); }
    catch(err){ showErr(err.code); }
  };
  $("loginBtn").addEventListener("click", doLogin);
  $("loginPw").addEventListener("keydown", e => { if(e.key==="Enter") doLogin(); });
  $("loginEmail").addEventListener("keydown", e => { if(e.key==="Enter") $("loginPw").focus(); });
  $("googleBtn").addEventListener("click", () => {
    const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt:"select_account" });
    socialLogin(p);
  });
  $("appleBtn").addEventListener("click", () => {
    const p = new OAuthProvider("apple.com"); p.addScope("email"); p.addScope("name");
    socialLogin(p);
  });
  $("logoutBtn").addEventListener("click", () => signOut(auth));
}

/* ===================================================================== */
/*  Cloud-Speichern (debounced) – von app.js über window.persistState    */
/* ===================================================================== */
// Eindeutige ID dieses Geräts/Tabs – damit wir eigene Schreibvorgänge nicht zurück-anwenden
const CLIENT_ID = (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("c" + Math.random().toString(36).slice(2));
let saveTimer = null, dirty = false, writing = false;

/* Wird von app.js bei jeder Änderung aufgerufen. Wir merken nur „es gibt etwas zu speichern"
   und schreiben gebündelt den AKTUELLEN Stand (nie einen veralteten Schnappschuss). */
window.persistState = function(){
  dirty = true;
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 500);
};
async function flushSave(){
  saveTimer = null;
  const u = auth.currentUser;
  if(!u) return;
  if(!dirty || writing){ if(dirty){ saveTimer = setTimeout(flushSave, 300); } return; }
  const payload = (typeof window.bjGetState === "function") ? window.bjGetState() : null;
  if(payload == null) return;
  dirty = false; writing = true;            // ab jetzt gilt der lokale Stand als „abgeschickt"
  try{
    await setDoc(doc(db, "users", u.uid),
      { state: payload, email: u.email, lastWriter: CLIENT_ID, updatedAt: serverTimestamp() }, { merge: true });
  }catch(e){
    console.warn("Speichern in der Cloud fehlgeschlagen:", e);
    dirty = true;                            // bei Fehler erneut versuchen
  }finally{
    writing = false;
    if(dirty){ saveTimer = setTimeout(flushSave, 300); }  // währenddessen kam Neues → nachspeichern
  }
}

/* ---- Live-Synchronisation: Änderungen von ANDEREN Geräten übernehmen ---- */
let liveUnsub = null;
function startLiveSync(uid){
  stopLiveSync();
  liveUnsub = onSnapshot(doc(db, "users", uid), (snap) => {
    if(!snap.exists()) return;
    if(snap.metadata.hasPendingWrites) return;        // eigener, noch nicht bestätigter Schreibvorgang
    const d = snap.data() || {};
    if(d.disabled){ signOut(auth); return; }          // Live-Sperre durch Admin greift sofort
    if(d.lastWriter === CLIENT_ID) return;            // eigene Änderung – nicht erneut anwenden
    if(dirty || writing) return;                       // wir bearbeiten gerade lokal → NICHT überschreiben
                                                       // (sonst „verschwindet" ein gerade getätigter Klick)
    if(typeof window.bjApplyState === "function"){
      const hasState = d.state && Object.keys(d.state).length > 0;
      window.bjApplyState(hasState ? d.state : null); // Stand vom anderen Gerät live übernehmen
    }
  }, (err) => console.warn("Live-Sync-Fehler:", err));
}
function stopLiveSync(){ if(liveUnsub){ liveUnsub(); liveUnsub = null; } }

/* ===================================================================== */
/*  Auth-Status: Tür-Wächter                                             */
/* ===================================================================== */
onAuthStateChanged(auth, async (user) => {
  if(!user){
    stopLiveSync();
    if(typeof window.bjApplyState === "function") window.bjApplyState(null); // angezeigte Daten beim Abmelden leeren
    document.body.classList.remove("authed");
    if($("loginOverlay")) $("loginOverlay").hidden = false;
    if($("userInfo")) $("userInfo").hidden = true;
    if($("logoutBtn")) $("logoutBtn").hidden = true;
    if($("adminBtn"))  $("adminBtn").hidden  = true;
    return;
  }

  // E-Mail-Bestätigung erzwingen (Google/Apple-Logins gelten bereits als verifiziert)
  if(!user.emailVerified){
    try{ await sendEmailVerification(user); }catch(e){ /* z. B. Rate-Limit – ignorieren */ }
    $("loginError").textContent = "Bitte bestätige zuerst deine E-Mail – wir haben dir einen Link geschickt. Danach erneut anmelden.";
    await signOut(auth);
    return;
  }

  // Benutzer-Dokument sicherstellen
  const ref = doc(db, "users", user.uid);
  let snap;
  try{ snap = await getDoc(ref); }
  catch(e){ $("loginError").textContent = "Konnte Profil nicht laden (Firestore-Regeln prüfen)."; await signOut(auth); return; }

  if(!snap.exists()){
    // Kein vom Admin angelegtes Profil → KEIN Zugang (keine Selbst-Registrierung).
    // Der erste Admin wird EINMALIG in der Firebase-Konsole angelegt (role:'admin').
    $("loginError").textContent = "Für dieses Konto ist kein Zugang freigegeben. Bitte unten „Account anfragen“ nutzen.";
    await signOut(auth);
    return;
  }
  const data = snap.data() || {};

  if(data.disabled){
    $("loginError").textContent = "Dieses Konto wurde deaktiviert.";
    await signOut(auth);
    return;
  }

  // Admin-Status aus dem role-Feld in Firestore. Das ist sicher, weil die Regeln
  // role nur durch einen Admin setzen lassen – und im Client steht keine E-Mail.
  currentRole = (data.role === "admin") ? "admin" : "user";

  // UI aufbauen (einmalig) und Cloud-Stand anwenden
  if(typeof window.bjInit === "function") window.bjInit();
  const hasState = data.state && Object.keys(data.state).length > 0;
  if(typeof window.bjApplyState === "function") window.bjApplyState(hasState ? data.state : null);

  // Live-Synchronisation aktivieren: Updates von anderen Geräten ohne Neuladen
  startLiveSync(user.uid);

  // Kopfzeile + Tür öffnen
  $("userInfo").textContent = user.email + (currentRole==="admin" ? "  (Admin)" : "");
  $("userInfo").hidden = false;
  $("logoutBtn").hidden = false;
  $("adminBtn").hidden = (currentRole !== "admin");
  $("loginOverlay").hidden = true;
  document.body.classList.add("authed");
  $("loginPw").value = "";
});

/* ===================================================================== */
/*  Admin-Console                                                        */
/* ===================================================================== */
function wireAdmin(){
  $("adminBtn").addEventListener("click", openAdmin);
  $("adminClose").addEventListener("click", () => { $("adminOverlay").hidden = true; });
  $("adminOverlay").addEventListener("click", e => { if(e.target.id==="adminOverlay") $("adminOverlay").hidden = true; });
  $("createUserBtn").addEventListener("click", createUser);
}

async function openAdmin(){
  if(currentRole !== "admin") return;
  $("adminOverlay").hidden = false;
  $("createUserMsg").textContent = "";
  await refreshUserList();
}

/* Benutzer anlegen, ohne die Admin-Sitzung zu verlieren (Zweit-App) */
async function createUser(){
  const email = ($("newUserEmail").value || "").trim();
  const pw    = $("newUserPw").value || "";
  $("createUserMsg").textContent = "";
  if(!email || pw.length < 6){
    $("createUserMsg").textContent = "E-Mail angeben und Passwort mit mindestens 6 Zeichen.";
    return;
  }
  $("createUserBtn").disabled = true;
  let secondary = null;
  try{
    secondary = initializeApp(firebaseConfig, "admin-create-" + Date.now());
    const secAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(secAuth, email, pw);
    const uid = cred.user.uid;
    await signOut(secAuth);
    // Profil-Dokument mit der ADMIN-Sitzung schreiben (Regeln erlauben das Admins)
    await setDoc(doc(db, "users", uid),
      { email, role: "user", state:{}, createdAt: serverTimestamp() });
    $("createUserMsg").textContent = "✓ Benutzer „" + email + '" angelegt.';
    $("newUserEmail").value = ""; $("newUserPw").value = "";
    await refreshUserList();
  }catch(err){
    $("createUserMsg").textContent = authErrorText(err.code || "") + "";
  }finally{
    if(secondary){ try{ await deleteApp(secondary); }catch(e){} }
    $("createUserBtn").disabled = false;
  }
}

async function refreshUserList(){
  const tbody = $("userList");
  tbody.innerHTML = '<tr><td colspan="5">Lade…</td></tr>';
  let docs;
  try{ docs = await getDocs(collection(db, "users")); }
  catch(e){ tbody.innerHTML = '<tr><td colspan="5">Fehler beim Laden (Firestore-Regeln prüfen).</td></tr>'; return; }

  const rows = [];
  docs.forEach(d => {
    const u = d.data() || {};
    const st = u.state || {};
    const hands = (st.history && st.history.length) || 0;
    const bank  = (st.bankroll != null) ? Math.round(st.bankroll) : "–";
    const cur   = st.currency || "";
    const disabled = !!u.disabled;
    const isAdmin  = (u.role === "admin");
    rows.push(
      "<tr"+(disabled?' class="u-disabled"':"")+">"+
        "<td>"+escapeHtml(u.email||d.id)+(isAdmin?' <span class="u-badge">Admin</span>':"")+"</td>"+
        "<td>"+hands+"</td>"+
        "<td>"+bank+" "+escapeHtml(cur)+"</td>"+
        "<td>"+(disabled?"deaktiviert":"aktiv")+"</td>"+
        '<td class="u-actions">'+
          '<button data-act="toggle" data-uid="'+escapeHtml(d.id)+'" data-dis="'+(disabled?1:0)+'" class="btn btn-small">'+(disabled?"Aktivieren":"Sperren")+'</button>'+
          '<button data-act="delete" data-uid="'+escapeHtml(d.id)+'" data-email="'+escapeHtml(u.email||"")+'" class="btn btn-small btn-danger">Daten löschen</button>'+
        "</td>"+
      "</tr>"
    );
  });
  tbody.innerHTML = rows.join("") || '<tr><td colspan="5">Noch keine Benutzer.</td></tr>';

  tbody.querySelectorAll('button[data-act]').forEach(b => {
    b.addEventListener("click", () => onUserAction(b.dataset));
  });
}

async function onUserAction(ds){
  const ref = doc(db, "users", ds.uid);
  if(ds.act === "toggle"){
    const disable = ds.dis === "0";
    try{ await setDoc(ref, { disabled: disable }, { merge: true }); }
    catch(e){ alert("Aktion fehlgeschlagen."); }
    await refreshUserList();
  } else if(ds.act === "delete"){
    if(!confirm('Spieldaten von „'+(ds.email||ds.uid)+'" löschen?\n\nDas Login-Konto bleibt bestehen – es vollständig zu entfernen geht nur in der Firebase-Konsole (Authentication).')) return;
    try{ await deleteDoc(ref); }
    catch(e){ alert("Löschen fehlgeschlagen."); }
    await refreshUserList();
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------- Start ---------- */
window.addEventListener("DOMContentLoaded", () => { wireLoginForm(); wireAdmin(); wireContact(); });

} // Ende: CONFIGURED
