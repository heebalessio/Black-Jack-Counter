/* =========================================================================
   Blackjack Counter & Dashboard  –  reine Vanilla-JS App
   - Hi-Lo Kartenzählen (Running + True Count)
   - Live-Statistik, Vorteils-Schätzung, Einsatz-Empfehlung
   - Basisstrategie inkl. Splits (Mehrdeck, Dealer steht auf Soft 17, DAS)
   - Geldverwaltung mit Session-Tracking und Verlaufschart
   ========================================================================= */

"use strict";

/* ---------- Kartenmodell ----------
   Ränge: '2'..'9', 'T' (=10/Bube/Dame/König), 'A' (=Ass)
   Hi-Lo-Werte: 2-6 = +1, 7-9 = 0, T/A = -1                                */
const RANKS = ["2","3","4","5","6","7","8","9","T","A"];
const HILO  = {2:+1,3:+1,4:+1,5:+1,6:+1,7:0,8:0,9:0,T:-1,A:-1};
const PER_DECK = {2:4,3:4,4:4,5:4,6:4,7:4,8:4,9:4,T:16,A:4}; // T deckt 10,J,Q,K ab

/* numerischer Wert eines Rangs (Ass = 11) */
function rankValue(r){ return r==="A" ? 11 : (r==="T" ? 10 : parseInt(r,10)); }
function rankLabel(r){ return r==="T" ? "10" : r; }

/* ---------- Sicherheits-Helfer ---------- */
function escHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function sanitizeCurrency(s){ return (String(s||"").replace(/[^A-Za-z0-9 .$€£¥]/g,"").slice(0,4)) || "CHF"; }

/* ---------- Zustand ---------- */
const state = {
  decks: 6,
  currency: "CHF",
  seen: [],          // Stapel erfasster Ränge (für Undo)
  unit: 10,
  startBankroll: 1000,
  bankroll: 1000,
  handBet: 10,
  history: [],       // [{result, delta, bankroll}]
  peak: 1000,
  hand: [],          // Strategie: deine Karten (Ränge)
  dealer: null       // Strategie: Dealer-Rang
};

/* ---------- Persistenz (Cloud pro Benutzer über auth.js) ----------
   Gespeichert wird über window.persistState (Firestore, geräteübergreifend).
   Geladen wird der Stand nach dem Login via window.bjApplyState(obj).      */
function statePayload(){
  return {
    decks:state.decks, currency:state.currency, seen:state.seen,
    unit:state.unit, startBankroll:state.startBankroll, bankroll:state.bankroll,
    handBet:state.handBet, history:state.history, peak:state.peak
  };
}
function save(){
  if(typeof window.persistState === "function") window.persistState(statePayload());
}
function applyStateObject(d){
  d = d || {};
  Object.assign(state, {
    decks:d.decks??6, currency:d.currency??"CHF", seen:d.seen??[],
    unit:d.unit??10, startBankroll:d.startBankroll??1000,
    bankroll:d.bankroll??1000, handBet:d.handBet??10,
    history:d.history??[], peak:d.peak??(d.bankroll??1000)
  });
}

/* ======================= ZÄHLUNG / STATISTIK ======================= */
function totalCards(){ return state.decks*52; }

function runningCount(){
  let rc=0;
  for(const r of state.seen) rc += HILO[r];
  return rc;
}
function cardsLeft(){ return totalCards() - state.seen.length; }
function decksLeft(){ return cardsLeft()/52; }
function trueCount(){
  const dl = decksLeft();
  if(dl <= 0) return 0;
  return runningCount()/dl;
}
/* grobe Vorteils-Schätzung: ~ +0.5% pro True Count über 0, Basis -0.5% */
function edgePct(){ return 0.5*(trueCount()-1); }

/* verbleibende Anzahl je Rang */
function remainingByRank(){
  const rem = {};
  for(const r of RANKS) rem[r] = PER_DECK[r]*state.decks;
  for(const r of state.seen) if(rem[r]>0) rem[r]--;
  return rem;
}

/* ======================= EINSATZ-LOGIK ======================= */
/* Spread nach (abgerundetem) True Count – konservative Rampe */
function unitsForTC(tc){
  const t = Math.floor(tc);
  if(t < 1) return 1;
  if(t === 1) return 1;
  if(t === 2) return 2;
  if(t === 3) return 4;
  if(t === 4) return 6;
  return 8; // TC >= 5
}
function recommendedBet(){
  const units = unitsForTC(trueCount());
  return { units, amount: units*state.unit };
}
/* halbe Kelly-Empfehlung: f = Vorteil / Varianz(≈1.32), nur bei positivem Vorteil */
function kellyBet(){
  const e = edgePct()/100;
  if(e <= 0) return 0;
  const f = (e/1.32)*0.5;            // halbes Kelly
  return Math.max(0, state.bankroll*f);
}

/* ======================= BASISSTRATEGIE ======================= */
/* Annahmen: 4+ Decks, Dealer steht auf Soft 17 (S17), Double nach Split
   erlaubt (DAS), Late Surrender erlaubt. Dealer-Wert: 2..11 (11 = Ass).   */

function shouldSplit(rank, dealer){
  switch(rank){
    case 11: return true;                                   // A,A
    case 9:  return !(dealer===7||dealer===10||dealer===11);// 9er: ausser 7,10,A
    case 8:  return true;                                   // 8,8 immer
    case 7:  return dealer<=7;                              // 2-7
    case 6:  return dealer<=6;                              // 2-6 (DAS)
    case 4:  return dealer===5||dealer===6;                 // 5-6 (DAS)
    case 3:  return dealer<=7;                              // 2-7 (DAS)
    case 2:  return dealer<=7;                              // 2-7 (DAS)
    default: return false;                                  // 5er,10er nie splitten
  }
}
function hardAction(total, dealer){
  if(total<=8)  return "H";
  if(total===9) return (dealer>=3&&dealer<=6)?"D":"H";
  if(total===10)return (dealer>=2&&dealer<=9)?"D":"H";
  if(total===11)return (dealer>=2&&dealer<=10)?"D":"H";
  if(total===12)return (dealer>=4&&dealer<=6)?"S":"H";
  if(total>=13&&total<=16) return (dealer>=2&&dealer<=6)?"S":"H";
  return "S"; // 17+
}
function softAction(total, dealer){
  switch(total){
    case 13: case 14: return (dealer>=5&&dealer<=6)?"D":"H"; // A,2 / A,3
    case 15: case 16: return (dealer>=4&&dealer<=6)?"D":"H"; // A,4 / A,5
    case 17:          return (dealer>=3&&dealer<=6)?"D":"H"; // A,6
    case 18:                                                 // A,7
      if(dealer>=3&&dealer<=6) return "Ds";
      if(dealer===2||dealer===7||dealer===8) return "S";
      return "H";
    default: return total>=19 ? "S" : "H";
  }
}

/* liefert {code, label, css, note} */
function getPlay(cards, dealer){
  const n = cards.length;
  const canDouble = n===2;
  const canSurr   = n===2;

  // Paar?
  if(n===2 && cards[0]===cards[1]){
    if(shouldSplit(rankValue(cards[0]), dealer)) return decorate("split");
  }

  // Summe + Soft-Erkennung
  let total = cards.reduce((a,r)=>a+rankValue(r),0);
  let aces  = cards.filter(r=>r==="A").length;
  while(total>21 && aces>0){ total-=10; aces--; }
  const soft = aces>0;

  // Late Surrender (nur 2 Karten, harte Hand; Paare schon behandelt)
  if(canSurr && !soft){
    if(total===16 && (dealer===9||dealer===10||dealer===11)) return decorate("surrender");
    if(total===15 && dealer===10) return decorate("surrender");
  }

  let a = soft ? softAction(total,dealer) : hardAction(total,dealer);

  // Double/Ds auflösen
  if(a==="D")  a = canDouble ? "double" : "hit";
  else if(a==="Ds") a = canDouble ? "double" : "stand";
  else if(a==="H") a = "hit";
  else if(a==="S") a = "stand";

  return decorate(a, soft, total);
}
function decorate(code, soft, total){
  const map = {
    hit:       {label:"HIT – Karte ziehen",      css:"act-hit"},
    stand:     {label:"STAND – stehen bleiben",   css:"act-stand"},
    double:    {label:"DOUBLE – verdoppeln",      css:"act-double"},
    split:     {label:"SPLIT – Paar teilen",      css:"act-split"},
    surrender: {label:"SURRENDER – aufgeben",     css:"act-surrender"}
  };
  const m = map[code] || map.hit;
  let note = "";
  if(typeof total==="number") note = (soft?"Soft ":"Hart ")+total;
  return {code, label:m.label, css:m.css, note};
}

/* ======================= RENDERING ======================= */
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString("de-CH");

function classByValue(el, v){
  el.classList.remove("pos","neg");
  if(v>0) el.classList.add("pos"); else if(v<0) el.classList.add("neg");
}

function renderStats(){
  const rc = runningCount();
  const tc = trueCount();
  const dl = decksLeft();
  $("runningCount").textContent = (rc>0?"+":"")+rc;
  $("trueCount").textContent    = (tc>0?"+":"")+tc.toFixed(1);
  $("decksLeft").textContent    = dl.toFixed(1);
  $("cardsLeft").textContent    = cardsLeft();
  $("dealtCount").textContent   = state.seen.length;
  const pen = totalCards()? (state.seen.length/totalCards()*100):0;
  $("penetration").textContent  = pen.toFixed(0)+"%";

  classByValue($("runningCount").parentElement, rc);
  classByValue($("trueCount").parentElement, tc);

  const e = edgePct();
  const edgeEl = $("edge");
  edgeEl.textContent = (e>0?"+":(e<0?"−":""))+Math.abs(e).toFixed(1)+"%";
  classByValue(edgeEl.parentElement, e);

  // Vorteils-Meter: -2% .. +2% auf 0..100% abbilden (Füllung verdeckt von rechts)
  const clamped = Math.max(-2, Math.min(2, e));
  const pct = (clamped+2)/4*100;
  $("edgeMeter").style.width = (100-pct)+"%";
  let txt = "Hausvorteil – nur Minimum setzen";
  if(e>0.5) txt = "Klarer Spielervorteil – Einsatz erhöhen!";
  else if(e>0) txt = "Leichter Vorteil – etwas mehr setzen";
  else if(e>-0.3) txt = "Etwa ausgeglichen";
  $("edgeText").textContent = txt;

  renderBet();
  renderComposition();
}

function renderBet(){
  const {units, amount} = recommendedBet();
  $("recBet").textContent   = fmt(amount)+" "+state.currency;
  $("recUnits").textContent = units+"×";
  const k = kellyBet();
  $("kellyBet").textContent = k>0 ? (fmt(k)+" "+state.currency) : "– (kein Vorteil)";
}

function renderComposition(){
  const rem = remainingByRank();
  const box = $("composition");
  box.innerHTML = "";
  for(const r of RANKS){
    const max = PER_DECK[r]*state.decks;
    const left = rem[r];
    const cls = (HILO[r]>0)?"low":(HILO[r]<0?"high":"neu");
    const cell = document.createElement("div");
    cell.className = "compcell "+cls;
    cell.innerHTML =
      `<div class="rank">${rankLabel(r)}</div>`+
      `<div class="left">${left}/${max}</div>`+
      `<div class="compbar"><i style="width:${max?left/max*100:0}%"></i></div>`;
    box.appendChild(cell);
  }
}

/* ---------- Strategie-Anzeige ---------- */
function renderStrategy(){
  $("handDisplay").textContent   = state.hand.length? state.hand.map(rankLabel).join("  ") : "–";
  $("dealerDisplay").textContent = state.dealer? rankLabel(state.dealer) : "–";

  // Dealer-Auswahl markieren
  document.querySelectorAll("#dealerPad .minibtn").forEach(b=>{
    b.classList.toggle("sel", b.dataset.rank===state.dealer);
  });

  const box = $("actionBox");
  box.className = "action";
  if(state.hand.length<2 || !state.dealer){
    $("actionValue").textContent = state.hand.length<2 ? "Mind. 2 Karten wählen" : "Dealerkarte wählen";
    $("actionNote").textContent = "";
    return;
  }
  const dealerVal = rankValue(state.dealer);
  const play = getPlay(state.hand, dealerVal);
  box.classList.add(play.css);
  $("actionValue").textContent = play.label;
  $("actionNote").textContent  = play.note;
}

/* ---------- Geldverwaltung ---------- */
function renderMoney(){
  $("bankroll").textContent = fmt(state.bankroll)+" "+state.currency;
  const wins   = state.history.filter(h=>h.result==="win"||h.result==="bj").length;
  const losses = state.history.filter(h=>h.result==="lose"||h.result==="surrender").length;
  const pushes = state.history.filter(h=>h.result==="push").length;
  const hands  = state.history.length;
  const decided= wins+losses;
  const wagered= state.history.reduce((a,h)=>a+Math.abs(h.bet||0),0);
  const profit = state.bankroll - state.startBankroll;

  $("hands").textContent   = hands;
  $("wins").textContent    = wins;
  $("losses").textContent  = losses;
  $("pushes").textContent  = pushes;
  $("winrate").textContent = decided? Math.round(wins/decided*100)+"%" : "0%";
  $("wagered").textContent = fmt(wagered)+" "+state.currency;
  $("peak").textContent    = fmt(state.peak)+" "+state.currency;

  const profEl = $("profit");
  profEl.textContent = (profit>0?"+":(profit<0?"−":""))+fmt(Math.abs(profit))+" "+state.currency;
  classByValue(profEl.parentElement, profit);

  drawChart();
}

/* einfacher Linien-Chart der Bankroll über die Hände */
function drawChart(){
  const cv = $("chart");
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  ctx.clearRect(0,0,W,H);

  const pts = [state.startBankroll, ...state.history.map(h=>h.bankroll)];
  const min = Math.min(...pts), max = Math.max(...pts);
  const pad = 24;
  const range = (max-min)||1;
  const x = i => pad + (pts.length<=1?0:i/(pts.length-1))*(W-2*pad);
  const y = v => H-pad - (v-min)/range*(H-2*pad);

  // Nulllinie (Start-Bankroll)
  ctx.strokeStyle = "rgba(232,192,106,.35)";
  ctx.setLineDash([4,4]); ctx.beginPath();
  ctx.moveTo(pad, y(state.startBankroll)); ctx.lineTo(W-pad, y(state.startBankroll));
  ctx.stroke(); ctx.setLineDash([]);

  // Fläche
  const grad = ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,"rgba(74,222,128,.30)");
  grad.addColorStop(1,"rgba(74,222,128,0)");
  ctx.beginPath(); ctx.moveTo(x(0), y(pts[0]));
  for(let i=1;i<pts.length;i++) ctx.lineTo(x(i), y(pts[i]));
  ctx.lineTo(x(pts.length-1), H-pad); ctx.lineTo(x(0), H-pad); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Linie
  ctx.beginPath(); ctx.moveTo(x(0), y(pts[0]));
  for(let i=1;i<pts.length;i++) ctx.lineTo(x(i), y(pts[i]));
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = (state.bankroll>=state.startBankroll)?"#4ade80":"#f87171";
  ctx.stroke();

  // letzter Punkt
  ctx.fillStyle = "#e8c06a";
  ctx.beginPath(); ctx.arc(x(pts.length-1), y(pts[pts.length-1]),3.5,0,7); ctx.fill();
}

/* ======================= SEITENWETTEN (LERNMODUL) ======================= */
/* Rein informativ: zeigt Quoten & geschätzten Hausvorteil der Zusatzwetten und
   wie viel sie langfristig kosten. Typische 8-Deck-Werte (variieren je Paytable). */
const SIDE_BETS = [
  { name:"21+3", edge:3.2,
    desc:"Deine 2 Karten + die offene Dealerkarte als 3-Karten-Pokerhand.",
    pays:[["Suited Three of a Kind","100:1"],["Straight Flush","40:1"],["Drilling","30:1"],["Straße","10:1"],["Flush","5:1"]] },
  { name:"Perfect Pairs", edge:4.1,
    desc:"Deine ersten zwei Karten bilden ein Paar (auch als Perfect Player/Dealer Pairs).",
    pays:[["Perfect Pair (Farbe+Symbol)","25:1"],["Coloured Pair","12:1"],["Mixed Pair","6:1"]] },
  { name:"Lucky Lucky", edge:2.7,
    desc:"Deine 2 Karten + Dealerkarte ergeben zusammen 19–21 (Boni für 6-7-8 / 7-7-7).",
    pays:[["7-7-7 suited","200:1"],["6-7-8 suited","100:1"],["7-7-7","50:1"],["6-7-8","30:1"],["21 suited","15:1"],["21 unsuited","3:1"],["19–20","2:1"]] },
  { name:"Buster Blackjack", edge:6.2,
    desc:"Wette, dass der Dealer überkauft – je mehr Karten, desto höher die Quote.",
    pays:[["8+ Karten","250:1"],["7 Karten","50:1"],["6 Karten","18:1"],["5 Karten","4:1"],["3–4 Karten","2:1"]] },
  { name:"Top 3", edge:4.6,
    desc:"Deine 2 Karten + Dealerkarte – nur die Top-Kombinationen zählen.",
    pays:[["Suited Three of a Kind","270:1"],["Straight Flush","180:1"],["Drilling","90:1"]] }
];
function renderSideBets(){
  const box = $("sideBets"); if(!box) return;
  const stake = Math.max(0, Number($("sideStake").value) || state.unit || 0);
  const cur = escHtml(state.currency);
  box.innerHTML = "";
  for(const b of SIDE_BETS){
    const per100 = stake*b.edge;          // Einsatz × 100 × Hausvorteil/100
    const perRound = stake*b.edge/100;
    const el = document.createElement("div");
    el.className = "sidebet";
    el.innerHTML =
      `<div class="sb-head"><span class="sb-name">${b.name}</span>`+
      `<span class="sb-edge">Hausvorteil ~${b.edge.toFixed(1)}%</span></div>`+
      `<div class="sb-desc">${b.desc}</div>`+
      `<ul class="sb-pays">`+ b.pays.map(p=>`<li><span>${p[0]}</span><span>${p[1]}</span></li>`).join("") +`</ul>`+
      `<div class="sb-cost">Kostet im Schnitt <b>${fmt(per100)} ${cur}</b> pro 100 Runden `+
      `(<b>${perRound.toFixed(2)} ${cur}</b>/Runde) bei ${fmt(stake)} ${cur} Einsatz.</div>`;
    box.appendChild(el);
  }
}

function renderAll(){ renderStats(); renderStrategy(); renderMoney(); renderSideBets(); }

/* ======================= AKTIONEN ======================= */
function addCard(rank){
  if(cardsLeft()<=0) return;
  state.seen.push(rank);
  save(); renderStats();
  flash(rank);
}
function undoCard(){
  if(state.seen.length){ state.seen.pop(); save(); renderStats(); }
}
function newShoe(){
  state.seen = []; save(); renderStats();
}
function flash(rank){
  const btn = document.querySelector(`#cardpad .cardbtn[data-rank="${rank}"]`);
  if(!btn) return;
  btn.classList.remove("flash-on"); void btn.offsetWidth; btn.classList.add("flash-on");
}

function recordOutcome(result){
  const bet = Math.max(0, Number($("handBet").value)||0);
  let delta = 0;
  if(result==="win")      delta = bet;
  else if(result==="bj")  delta = bet*1.5;
  else if(result==="lose")delta = -bet;
  else if(result==="push")delta = 0;
  else if(result==="surrender") delta = -bet/2;

  state.bankroll += delta;
  state.peak = Math.max(state.peak, state.bankroll);
  state.history.push({result, bet, delta, bankroll:state.bankroll});
  save(); renderMoney();
}
function undoHand(){
  const last = state.history.pop();
  if(!last) return;
  state.bankroll -= last.delta;
  // Peak neu berechnen
  let peak = state.startBankroll, bk = state.startBankroll;
  state.peak = Math.max(...[state.startBankroll, ...state.history.map(h=>h.bankroll)]);
  save(); renderMoney();
}
function resetSession(){
  if(!confirm("Session zurücksetzen? Bankroll wird auf den Startwert gesetzt und der Verlauf gelöscht.")) return;
  state.bankroll = state.startBankroll;
  state.peak = state.startBankroll;
  state.history = [];
  save(); renderMoney();
}
function resetAll(){
  if(!confirm("Wirklich ALLE Daten dieses Benutzers zurücksetzen (Zählung, Session, Einstellungen)?")) return;
  applyStateObject(null);          // auf Standardwerte
  state.hand = []; state.dealer = null;
  bjApplyFields();
  save(); renderAll();
}

/* ======================= SHORTCUT-MODAL ======================= */
function isShortcutsOpen(){ return !$("shortcutModal").hidden; }
function openShortcuts(){ $("shortcutModal").hidden = false; }
function closeShortcuts(){ $("shortcutModal").hidden = true; }

/* ======================= CSV-EXPORT ======================= */
/* Speichert Karten-/Count-Verlauf und Bankroll-/Hand-Verlauf als .csv-Datei */
function exportCsv(){
  const S = ";"; // Trennzeichen – passt zu DE/CH-Excel
  const cur = state.currency;
  const rows = [];

  rows.push("Blackjack Session-Export");
  rows.push("Exportiert"+S+new Date().toLocaleString("de-CH"));
  rows.push("Decks im Schuh"+S+state.decks);
  rows.push("Start-Bankroll"+S+Math.round(state.startBankroll)+S+cur);
  rows.push("Aktuelle Bankroll"+S+Math.round(state.bankroll)+S+cur);
  rows.push("Einheit (Unit)"+S+state.unit);
  rows.push("Running Count"+S+runningCount());
  rows.push("True Count"+S+trueCount().toFixed(2));
  rows.push("");

  // Karten-/Count-Verlauf (eine Zeile pro erfasster Karte)
  rows.push("Karten-/Count-Verlauf");
  rows.push(["Nr","Karte","Hi-Lo","Running Count","Karten uebrig","Decks uebrig","True Count"].join(S));
  let rc = 0;
  const total = state.decks*52;
  state.seen.forEach((r,i)=>{
    rc += HILO[r];
    const left = total-(i+1);
    const dl = left/52;
    const tc = dl>0 ? rc/dl : 0;
    rows.push([i+1, rankLabel(r), (HILO[r]>0?"+":"")+HILO[r],
               (rc>0?"+":"")+rc, left, dl.toFixed(2), tc.toFixed(2)].join(S));
  });
  rows.push("");

  // Bankroll-/Hand-Verlauf (eine Zeile pro gespielter Hand)
  rows.push("Bankroll-/Hand-Verlauf");
  rows.push(["Nr","Ergebnis","Einsatz","Veraenderung","Bankroll"].join(S));
  const lbl = {win:"Gewonnen", bj:"Blackjack", lose:"Verloren", push:"Push", surrender:"Surrender"};
  state.history.forEach((h,i)=>{
    rows.push([i+1, lbl[h.result]||h.result, h.bet,
               (h.delta>0?"+":"")+h.delta, Math.round(h.bankroll)].join(S));
  });

  const csv = "\uFEFF"+rows.join("\r\n"); // BOM für Umlaute + Windows-Zeilenenden
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const t = new Date(), p = n => String(n).padStart(2,"0");
  const fname = `blackjack-session_${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}_${p(t.getHours())}${p(t.getMinutes())}.csv`;
  const a = document.createElement("a");
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

/* ======================= CSV-IMPORT ======================= */
/* Liest eine zuvor (auch von jemand anderem) exportierte CSV und stellt
   den Spielstand daraus wieder her. */
function parseNum(s){
  if(s==null) return 0;
  const cleaned = String(s).replace(/−/g,"-").replace(/[’']/g,"").replace(",",".").replace(/[^0-9.\-]/g,"");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
function importCsvText(text){
  const lines = String(text).replace(/^﻿/,"").split(/\r?\n/);
  const labelToResult = {Gewonnen:"win", Blackjack:"bj", Verloren:"lose", Push:"push", Surrender:"surrender"};
  const p = { decks:null, currency:null, startBankroll:null, bankroll:null, unit:null, seen:[], history:[] };
  let section = "meta"; // meta | cards-head | cards | hands-head | hands
  for(const raw of lines){
    const line = raw.trim();
    if(line==="") continue;
    const cells = line.split(";").map(c=>c.trim());
    const head = cells[0];
    if(head==="Karten-/Count-Verlauf"){ section="cards-head"; continue; }
    if(head==="Bankroll-/Hand-Verlauf"){ section="hands-head"; continue; }
    if(section==="cards-head"){ section="cards"; continue; }   // Spaltenkopf überspringen
    if(section==="hands-head"){ section="hands"; continue; }
    if(section==="cards"){
      const label = (cells[1]||"").toUpperCase();
      const rank = label==="10" ? "T" : label;
      if(RANKS.includes(rank)) p.seen.push(rank);
      continue;
    }
    if(section==="hands"){
      const result = labelToResult[cells[1]];
      if(result) p.history.push({ result, bet:Math.abs(parseNum(cells[2])), delta:parseNum(cells[3]), bankroll:parseNum(cells[4]) });
      continue;
    }
    // Meta-Zeilen
    if(head==="Decks im Schuh") p.decks = parseInt(cells[1],10);
    else if(head==="Start-Bankroll"){ p.startBankroll = parseNum(cells[1]); if(cells[2]) p.currency = cells[2]; }
    else if(head==="Aktuelle Bankroll"){ p.bankroll = parseNum(cells[1]); if(cells[2]) p.currency = cells[2]; }
    else if(head.indexOf("Einheit")===0) p.unit = parseNum(cells[1]);
  }
  return p;
}
function applyImported(p){
  if([1,2,4,6,8].includes(p.decks)) state.decks = p.decks;
  if(p.currency) state.currency = sanitizeCurrency(p.currency);
  if(p.unit>0) state.unit = Math.max(1, Math.round(p.unit));
  if(p.startBankroll!=null) state.startBankroll = p.startBankroll;

  const max = state.decks*52;
  state.seen = p.seen.slice(0, max);   // Sicherheits-Begrenzung auf Schuhgröße
  state.history = p.history;

  if(state.history.length) state.bankroll = state.history[state.history.length-1].bankroll;
  else if(p.bankroll!=null) state.bankroll = p.bankroll;
  else state.bankroll = state.startBankroll;
  state.peak = Math.max(state.startBankroll, state.bankroll, ...state.history.map(h=>h.bankroll));

  // Eingabefelder nachziehen
  $("deckCount").value     = String(state.decks);
  $("currency").value      = state.currency;
  $("unitSize").value      = state.unit;
  $("startBankroll").value = state.startBankroll;
  $("handBet").value       = state.handBet;

  save();
  renderAll();
}
function importCsvFile(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    let p;
    try{ p = importCsvText(ev.target.result); }
    catch(err){ alert("Import fehlgeschlagen – die Datei konnte nicht gelesen werden.\n\n"+err); return; }
    if(p.seen.length===0 && p.history.length===0 && p.startBankroll==null){
      alert("In dieser CSV wurden keine Spieldaten gefunden.\nBitte eine von diesem Tool exportierte CSV verwenden.");
      return;
    }
    if(!confirm("CSV laden? Der aktuelle Stand wird ersetzt durch:\n"+
                "• "+p.seen.length+" erfasste Karten\n"+
                "• "+p.history.length+" gespielte Hände\n"+
                "• Bankroll, Decks und Währung aus der Datei")) return;
    applyImported(p);
    alert("Import erfolgreich: "+state.seen.length+" Karten und "+state.history.length+" Hände geladen.");
  };
  reader.onerror = () => alert("Datei konnte nicht gelesen werden.");
  reader.readAsText(file, "UTF-8");
}

/* ======================= AUFBAU DER OBERFLÄCHE ======================= */
function buildCardPad(){
  const pad = $("cardpad");
  pad.innerHTML = "";
  for(const r of RANKS){
    const v = HILO[r];
    const cls = v>0?"low":(v<0?"high":"");
    const sign = v>0?"+1":(v<0?"−1":"0");
    const b = document.createElement("button");
    b.className = "cardbtn "+cls;
    b.dataset.rank = r;
    b.innerHTML = `${rankLabel(r)}<small>${sign}</small><span class="flash"></span>`;
    b.addEventListener("click", ()=>addCard(r));
    pad.appendChild(b);
  }
}
function buildMiniPad(containerId, onPick){
  const pad = $(containerId);
  pad.innerHTML = "";
  for(const r of RANKS){
    const b = document.createElement("button");
    b.className = "minibtn";
    b.dataset.rank = r;
    b.textContent = rankLabel(r);
    b.addEventListener("click", ()=>onPick(r));
    pad.appendChild(b);
  }
}

/* ======================= TASTATUR ======================= */
/* Einsatz dieser Hand um eine Unit erhöhen/verringern (Tastatur + / −) */
function adjustBet(dir){
  const step = Math.max(1, state.unit||1);
  const v = Math.max(0, (Number($("handBet").value)||0) + dir*step);
  $("handBet").value = v;
  state.handBet = v; save();
}

function onKey(e){
  // Escape schliesst das Hilfe-Modal – funktioniert immer, auch aus Eingabefeldern
  if(e.key==="Escape"){ if(isShortcutsOpen()) closeShortcuts(); return; }
  // In Eingabefeldern (Zahl/Text/Select) keine Shortcuts auslösen
  if(["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName)) return;
  // ? öffnet bzw. schliesst die Hilfe-Übersicht
  if(e.key==="?"){ e.preventDefault(); isShortcutsOpen()?closeShortcuts():openShortcuts(); return; }
  // Bei offenem Modal keine weiteren Shortcuts
  if(isShortcutsOpen()) return;

  // Einsatz anpassen (+ / −)
  if(e.key==="+"){ e.preventDefault(); adjustBet(+1); return; }
  if(e.key==="-" || e.key==="−"){ e.preventDefault(); adjustBet(-1); return; }

  const k = e.key.toLowerCase();
  // Karten erfassen
  if(k>="2" && k<="9"){ addCard(k); return; }
  if(k==="0" || k==="t"){ addCard("T"); return; }
  if(k==="a"){ addCard("A"); return; }
  if(k==="u" || k==="backspace"){ e.preventDefault(); undoCard(); return; }
  // Steuerung
  if(k==="n"){ newShoe(); return; }
  if(k==="e"){ exportCsv(); return; }
  if(k==="i"){ $("importFile").click(); return; }
  // Hand-Ergebnis verbuchen
  if(k==="g"){ recordOutcome("win"); return; }
  if(k==="b"){ recordOutcome("bj"); return; }
  if(k==="v"){ recordOutcome("lose"); return; }
  if(k==="p"){ recordOutcome("push"); return; }
  if(k==="r"){ recordOutcome("surrender"); return; }
}

/* ======================= INIT ======================= */
let __uiBuilt = false;
function bjApplyFields(){
  $("deckCount").value     = String(state.decks);
  $("currency").value      = state.currency;
  $("unitSize").value      = state.unit;
  $("startBankroll").value = state.startBankroll;
  $("handBet").value       = state.handBet;
}
function init(){
  if(__uiBuilt) return;   // UI nur einmal aufbauen (wird nach dem Login aufgerufen)
  __uiBuilt = true;

  bjApplyFields();

  buildCardPad();
  buildMiniPad("handPad", r=>{ if(state.hand.length<6){ state.hand.push(r); renderStrategy(); } });
  buildMiniPad("dealerPad", r=>{ state.dealer = (state.dealer===r?null:r); renderStrategy(); });

  // Eingaben
  $("deckCount").addEventListener("change", e=>{ state.decks=parseInt(e.target.value,10); save(); renderStats(); });
  $("currency").addEventListener("input", e=>{ state.currency=sanitizeCurrency(e.target.value); save(); renderAll(); });
  $("unitSize").addEventListener("input", e=>{ state.unit=Math.max(1,Number(e.target.value)||1); save(); renderBet(); });
  $("startBankroll").addEventListener("input", e=>{
    const v = Math.max(0, Number(e.target.value)||0);
    // wenn noch keine Hand gespielt: Bankroll mitführen
    if(state.history.length===0){ state.bankroll=v; state.peak=v; }
    state.startBankroll=v; save(); renderMoney();
  });
  $("handBet").addEventListener("input", e=>{ state.handBet=Math.max(0,Number(e.target.value)||0); save(); });

  // Karten-Buttons
  $("undoCard").addEventListener("click", undoCard);
  $("newShoe").addEventListener("click", newShoe);

  // Strategie
  $("clearHand").addEventListener("click", ()=>{ state.hand=[]; renderStrategy(); });

  // Geldverwaltung
  document.querySelectorAll(".outcomes .btn").forEach(b=>{
    b.addEventListener("click", ()=>recordOutcome(b.dataset.result));
  });
  $("undoHand").addEventListener("click", undoHand);
  $("resetSession").addEventListener("click", resetSession);
  $("resetAll").addEventListener("click", resetAll);

  // Hilfe-Modal: öffnen per Button „? Hilfe" oder Taste ? ; schliessen per ✕, Escape, Klick auf Hintergrund
  $("helpBtn").addEventListener("click", openShortcuts);
  $("modalClose").addEventListener("click", closeShortcuts);
  $("shortcutModal").addEventListener("click", e=>{ if(e.target.id==="shortcutModal") closeShortcuts(); });
  $("exportCsv").addEventListener("click", exportCsv);
  $("importCsv").addEventListener("click", ()=>$("importFile").click());
  $("importFile").addEventListener("change", e=>{ importCsvFile(e.target.files[0]); e.target.value=""; });

  // Seitenwetten-Lernmodul
  $("sideStake").value = state.unit;
  $("sideStake").addEventListener("input", renderSideBets);

  document.addEventListener("keydown", onKey);

  renderAll();
}

/* Stand aus der Cloud anwenden (von auth.js nach dem Login aufgerufen) */
function bjApplyState(obj){
  applyStateObject(obj);
  state.hand = []; state.dealer = null;   // Strategie-Auswahl frisch starten
  bjApplyFields();
  renderAll();
}

/* ---------- Brücke zur Auth-/Cloud-Schicht (auth.js) ---------- */
window.bjInit       = init;          // UI aufbauen (nach Login)
window.bjApplyState = bjApplyState;  // Cloud-Stand anwenden
window.bjGetState   = statePayload;  // aktuellen Stand auslesen

/* ---------- Farbschema: Grün ⇄ Gold/Schwarz (Auswahl wird lokal gemerkt) ---------- */
function applyTheme(gold){
  document.body.classList.toggle("theme-gold", gold);
  const b = document.getElementById("themeBtn");
  if(b) b.textContent = gold ? "Grün" : "Gold/Schwarz";
  try{ localStorage.setItem("bj.theme", gold ? "gold" : "green"); }catch(e){}
}
(function initTheme(){
  let gold = false;
  try{ gold = localStorage.getItem("bj.theme") === "gold"; }catch(e){}
  applyTheme(gold);
  const b = document.getElementById("themeBtn");
  if(b) b.addEventListener("click", () => applyTheme(!document.body.classList.contains("theme-gold")));
})();
