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
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { firebaseConfig, ADMIN_EMAILS } from "./firebase-config.js";

/* ---------- kleine Helfer ---------- */
const $ = id => document.getElementById(id);
const adminList = (ADMIN_EMAILS || []).map(e => String(e).trim().toLowerCase());
const isAdminEmail = email => !!email && adminList.includes(email.toLowerCase());
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

/* ===================================================================== */
/*  Ohne gültige Config: Hinweis anzeigen und abbrechen                  */
/* ===================================================================== */
if(!CONFIGURED){
  window.addEventListener("DOMContentLoaded", () => {
    if($("loginMsg")) $("loginMsg").textContent =
      "⚠ Firebase ist noch nicht konfiguriert. Bitte firebase-config.js ausfüllen (siehe LIESMICH.md).";
    if($("loginBtn")) $("loginBtn").disabled = true;
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
  const doLogin = async () => {
    const email = ($("loginEmail").value || "").trim();
    const pw    = $("loginPw").value || "";
    $("loginError").textContent = "";
    $("loginBtn").disabled = true;
    try{
      await signInWithEmailAndPassword(auth, email, pw);
      // weiter geht es in onAuthStateChanged
    }catch(err){
      $("loginError").textContent = authErrorText(err.code || "");
    }finally{
      $("loginBtn").disabled = false;
    }
  };
  $("loginBtn").addEventListener("click", doLogin);
  $("loginPw").addEventListener("keydown", e => { if(e.key==="Enter") doLogin(); });
  $("loginEmail").addEventListener("keydown", e => { if(e.key==="Enter") $("loginPw").focus(); });
  $("logoutBtn").addEventListener("click", () => signOut(auth));
}

/* ===================================================================== */
/*  Cloud-Speichern (debounced) – von app.js über window.persistState    */
/* ===================================================================== */
let saveTimer = null, pending = null;
window.persistState = function(payload){
  pending = payload;
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 800);
};
async function flushSave(){
  saveTimer = null;
  const u = auth.currentUser;
  if(!u || pending == null) return;
  const data = pending; pending = null;
  try{
    await setDoc(doc(db, "users", u.uid),
      { state: data, email: u.email, updatedAt: serverTimestamp() }, { merge: true });
  }catch(e){ console.warn("Speichern in der Cloud fehlgeschlagen:", e); }
}

/* ===================================================================== */
/*  Auth-Status: Tür-Wächter                                             */
/* ===================================================================== */
onAuthStateChanged(auth, async (user) => {
  if(!user){
    document.body.classList.remove("authed");
    if($("loginOverlay")) $("loginOverlay").hidden = false;
    if($("userInfo")) $("userInfo").hidden = true;
    if($("logoutBtn")) $("logoutBtn").hidden = true;
    if($("adminBtn"))  $("adminBtn").hidden  = true;
    return;
  }

  // Benutzer-Dokument sicherstellen
  const ref = doc(db, "users", user.uid);
  let snap;
  try{ snap = await getDoc(ref); }
  catch(e){ $("loginError").textContent = "Konnte Profil nicht laden (Firestore-Regeln prüfen)."; await signOut(auth); return; }

  if(!snap.exists()){
    const role = isAdminEmail(user.email) ? "admin" : "user";
    await setDoc(ref, { email:user.email, role, state:{}, createdAt: serverTimestamp() });
    snap = await getDoc(ref);
  }
  const data = snap.data() || {};

  if(data.disabled){
    $("loginError").textContent = "Dieses Konto wurde deaktiviert.";
    await signOut(auth);
    return;
  }

  currentRole = (data.role === "admin" || isAdminEmail(user.email)) ? "admin" : "user";

  // UI aufbauen (einmalig) und Cloud-Stand anwenden
  if(typeof window.bjInit === "function") window.bjInit();
  const hasState = data.state && Object.keys(data.state).length > 0;
  if(typeof window.bjApplyState === "function") window.bjApplyState(hasState ? data.state : null);

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
      { email, role: isAdminEmail(email) ? "admin" : "user", state:{}, createdAt: serverTimestamp() });
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
    const isAdmin  = (u.role === "admin") || isAdminEmail(u.email);
    rows.push(
      "<tr"+(disabled?' class="u-disabled"':"")+">"+
        "<td>"+escapeHtml(u.email||d.id)+(isAdmin?' <span class="u-badge">Admin</span>':"")+"</td>"+
        "<td>"+hands+"</td>"+
        "<td>"+bank+" "+escapeHtml(cur)+"</td>"+
        "<td>"+(disabled?"deaktiviert":"aktiv")+"</td>"+
        '<td class="u-actions">'+
          '<button data-act="toggle" data-uid="'+d.id+'" data-dis="'+(disabled?1:0)+'" class="btn btn-small">'+(disabled?"Aktivieren":"Sperren")+'</button>'+
          '<button data-act="delete" data-uid="'+d.id+'" data-email="'+escapeHtml(u.email||"")+'" class="btn btn-small btn-danger">Daten löschen</button>'+
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
window.addEventListener("DOMContentLoaded", () => { wireLoginForm(); wireAdmin(); });

} // Ende: CONFIGURED
