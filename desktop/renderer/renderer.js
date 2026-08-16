/* lowkeyhud renderer — clock, daily-roast rotation, and a focus timer. */

const ROASTS = [
  "today's forecast: <b>3 meetings</b>. 1 of them necessary. lowkey.",
  "you opened the calendar <b>14 times</b>. it's still today.",
  "hydrate. this is the HUD talking. <b>no cap</b>.",
  "your screen time called. it's <b>worried</b>.",
  "the <b>3pm</b> meeting could've been an email. you already know.",
  "achievement unlocked: felt the fear, did it <b>anyway</b>.",
  "lowkey you should stand up. <b>no cap</b>.",
  "productivity has left the chat. <b>lowkey</b>.",
  "you've been 'about to start' for <b>47 minutes</b>.",
  "reminder: you can do hard things. <b>also you can nap</b>."
];

const $ = (id) => document.getElementById(id);

let settings = { showTime: true, showRoast: true, focusMinutes: 25 };
let roastIndex = Math.floor(Math.random() * ROASTS.length);
let focusTotal = 25 * 60;
let focusLeft = focusTotal;
let focusRunning = false;
let focusTimer = null;

/* ---------- clock ---------- */
function pad(n) { return n < 10 ? "0" + n : "" + n; }

function tickClock() {
  const now = new Date();
  $("clock").textContent = pad(now.getHours()) + ":" + pad(now.getMinutes());
  $("seconds").textContent = pad(now.getSeconds());
}
setInterval(tickClock, 1000);

/* ---------- roast rotation ---------- */
function setRoast() {
  const el = $("roast");
  el.classList.add("fade");
  setTimeout(() => {
    el.innerHTML = ROASTS[roastIndex % ROASTS.length];
    roastIndex++;
    el.classList.remove("fade");
  }, 250);
}
setInterval(setRoast, 8000);

/* ---------- focus timer ---------- */
function fmt(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return pad(m) + ":" + pad(sec);
}

function renderFocus() {
  $("f-time").textContent = fmt(focusLeft);
  $("f-time").classList.toggle("done", focusLeft === 0);
  $("f-btn").textContent = focusRunning ? "pause" : (focusLeft === focusTotal ? "start" : "resume");
  $("f-btn").classList.toggle("running", focusRunning);
}

function startFocus() {
  if (focusRunning) return;
  focusRunning = true;
  renderFocus();
  focusTimer = setInterval(() => {
    focusLeft--;
    if (focusLeft <= 0) {
      focusLeft = 0;
      clearInterval(focusTimer);
      focusTimer = null;
      focusRunning = false;
      renderFocus();
      setTimeout(() => { focusLeft = focusTotal; renderFocus(); }, 4000);
      return;
    }
    renderFocus();
  }, 1000);
}

function toggleFocus() {
  if (focusRunning) {
    clearInterval(focusTimer);
    focusTimer = null;
    focusRunning = false;
    renderFocus();
  } else {
    startFocus();
  }
}

$("f-btn").addEventListener("click", toggleFocus);

/* ---------- buttons ---------- */
$("quit-btn").addEventListener("click", () => window.lowkey.quit());
$("menu-btn").addEventListener("click", () => window.lowkey.openMenu());

/* ---------- settings ---------- */
function applySettings(s) {
  settings = s;
  $("clock-wrap").classList.toggle("hidden", !s.showTime);
  $("roast").classList.toggle("hidden", !s.showRoast);
  focusTotal = (s.focusMinutes || 25) * 60;
  if (!focusRunning && focusLeft === 0) focusLeft = focusTotal;
  if (!focusRunning && focusLeft > focusTotal) focusLeft = focusTotal;
  if (focusLeft === focusTotal && !focusRunning) renderFocus();
}

window.lowkey.onSettings(applySettings);

/* ---------- init ---------- */
(async function init() {
  const s = await window.lowkey.getSettings();
  applySettings(s);
  tickClock();
  setRoast();
  focusLeft = focusTotal;
  renderFocus();
})();
