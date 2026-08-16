#!/usr/bin/env node
// scripts/smoke-pro-flow.mjs — end-to-end smoke test of the Pro money flow,
// driven in headless Chrome against the LIVE site. The only step it can't do
// is the actual Lemon Squeezy payment (that needs the real checkout URL), so
// the "buy" step is mocked with the demo key DEMO123.
//
// Usage:
//   node scripts/smoke-pro-flow.mjs
//     → runs the whole flow against https://lowkeyhud.com
//   node scripts/smoke-pro-flow.mjs --checkout https://STORE.lemonsqueezy.com/checkout/buy/XXXX
//     → additionally proves the "Get Pro" button activates with a real URL
//       (writes a temp copy of generator.html, touches nothing in the repo)
//
// Exits non-zero on any failed assertion.

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9444 + Math.floor(Math.random() * 200);
const BASE = 'https://lowkeyhud.com/';
const CHECKOUT_ARG = process.argv.find(a => a.startsWith('--checkout='));
const CHECKOUT = CHECKOUT_ARG ? CHECKOUT_ARG.split('=').slice(1).join('=') : null;

let passed = 0, failed = 0;
const failures = [];
function ok(name, cond) {
  if (cond) { passed++; console.log('  \u2713 ' + name); }
  else { failed++; failures.push(name); console.log('  \u2717 ' + name); }
}

const profile = path.join(os.tmpdir(), 'lkh-smoke-' + process.pid);
mkdirSync(profile, { recursive: true });

// Temp generator copy with a real checkout URL injected — used ONLY for the
// button test. The flow tests run against the live site so sessionStorage
// bridges correctly across pages.
let genUrl = BASE + 'generator';
let checkoutUrl = null;
const tmpCopy = path.join(os.tmpdir(), 'lkh-gen-checkout-' + process.pid + '.html');
if (CHECKOUT) {
  const src = readFileSync(path.join(ROOT, 'generator.html'), 'utf8');
  const patched = src.replace('var PRO_CHECKOUT_URL = ""', 'var PRO_CHECKOUT_URL = ' + JSON.stringify(CHECKOUT));
  if (patched === src) throw new Error('could not inject checkout url into generator.html');
  writeFileSync(tmpCopy, patched);
  checkoutUrl = pathToFileURL(tmpCopy).href;
}

let ws = null;

async function shutdown() {
  try { if (ws) ws.close(); } catch (e) {}
  chrome.kill();
  await new Promise(r => chrome.once('exit', r));
  rmSync(profile, { recursive: true, force: true });
  if (CHECKOUT) { try { unlinkSync(tmpCopy); } catch (e) {} }
}

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1200,1500', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForEndpoint(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { const res = await fetch(url); if (res.ok) return; } catch (e) {}
    await sleep(200);
  }
  throw new Error('chrome devtools endpoint never came up');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('websocket failed'));
  });
}

let msgId = 0;
function send(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    const handler = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(ws, expression) {
  const r = await send(ws, 'Runtime.evaluate', { expression, returnByValue: true });
  return r.result ? r.result.value : undefined;
}

async function waitFor(ws, expression, tries = 60, ms = 100) {
  for (let i = 0; i < tries; i++) {
    if (await evaluate(ws, expression) === true) return true;
    await sleep(ms);
  }
  return false;
}

async function navigate(ws, url) {
  await send(ws, 'Page.navigate', { url });
  const ready = await waitFor(ws, `document.readyState === 'complete'`, 80, 100);
  if (!ready) throw new Error('page never loaded: ' + url);
  await sleep(250);
}

async function main() {
  await waitForEndpoint(`http://127.0.0.1:${PORT}/json/version`);
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  ws = await connect(page.webSocketDebuggerUrl);
  await send(ws, 'Page.enable');

  console.log('smoke: pro purchase flow' + (CHECKOUT ? ' (checkout injected)' : '') + '\n');

  // 1 — free download shows the upsell
  await navigate(ws, genUrl);
  await evaluate(ws, `document.getElementById('btn-download').click()`);
  const upsellShown = await waitFor(ws, `document.getElementById('upsell').hidden === false`);
  ok('free download shows the upsell strip', upsellShown);

  // 2 — one tap on the upsell opens the Pro modal
  await evaluate(ws, `document.getElementById('upsell-cta').click()`);
  const modalOpen = await waitFor(ws, `document.getElementById('pro-modal').hidden === false`);
  ok('upsell tap opens the Pro modal', modalOpen);

  // 3 — checkout button state
  if (CHECKOUT) {
    await navigate(ws, checkoutUrl);
    const btn = await evaluate(ws, `(function(){ var b = document.getElementById('pro-buy'); return { display: b.style.display, href: b.getAttribute('href'), target: b.getAttribute('target') }; })()`);
    ok('Get Pro button visible with checkout URL', btn.display !== 'none');
    ok('Get Pro links to the checkout URL', btn.href === CHECKOUT);
    ok('Get Pro opens a new tab', btn.target === '_blank');
  } else {
    const state = await evaluate(ws, `(function(){ var b = document.getElementById('pro-buy'); return { display: b.style.display, note: document.getElementById('pro-note').textContent }; })()`);
    ok('Get Pro hidden while checkout URL is empty', state.display === 'none');
    ok('modal explains the missing checkout link', /not configured/.test(state.note));
  }

  // 4 — success page delivers + stashes the key
  await navigate(ws, BASE + 'success?key=DEMO123');
  const s = await evaluate(ws, `(function(){ return { key: document.getElementById('key').textContent, keyBox: document.getElementById('key-box').hidden, stash: sessionStorage.getItem('lowkeyhud:pending-key'), next: document.getElementById('next-box').hidden }; })()`);
  ok('success page shows the key', s.keyBox === false && s.key === 'DEMO123');
  ok('success page stashes the key', s.stash === 'DEMO123');
  ok('success page shows what-happens-next', s.next === false);

  // 5 — generator handoff pre-fills + opens the modal
  await navigate(ws, genUrl + '#pro=1');
  const g = await evaluate(ws, `(function(){ return { key: document.getElementById('pro-key').value, modal: document.getElementById('pro-modal').hidden }; })()`);
  ok('generator pre-fills the key from the stash', g.key === 'DEMO123');
  ok('generator opens the Pro modal on arrival', g.modal === false);

  // 6 — unlock turns PRO on
  await evaluate(ws, `document.getElementById('pro-unlock').click()`);
  const pro = await waitFor(ws, `localStorage.getItem('lowkeyhud:pro') === '1'`);
  ok('unlock enables PRO', pro);
  const ui = await evaluate(ws, `(function(){ return { status: document.getElementById('pro-status').textContent, upsell: document.getElementById('upsell').hidden, modal: document.getElementById('pro-modal').hidden }; })()`);
  ok('status reads PRO', ui.status === 'PRO \u2713 unlocked');
  ok('upsell hidden after unlock', ui.upsell === true);
  ok('modal closed after unlock', ui.modal === true);

  // 7 — HD export scales 2x, free export is 1x
  const scale = await evaluate(ws, `(function(){ return { pro: drawExport(readData(), true).width, free: drawExport(readData(), false).width }; })()`);
  ok('HD export is 2x (2160 wide)', scale.pro === 2160);
  ok('free export is 1x (1080 wide)', scale.free === 1080);

  // 8 — roast page unlocks with the same key
  await navigate(ws, BASE + 'roast');
  await evaluate(ws, `(function(){ document.getElementById('btn-pro').click(); document.getElementById('pro-key').value = 'DEMO123'; document.getElementById('pro-unlock').click(); })()`);
  const roastPro = await waitFor(ws, `localStorage.getItem('lowkeyhud:pro') === '1'`);
  ok('roast page unlocks PRO with the same key', roastPro);

  await shutdown();

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) { console.log('FAILED: ' + failures.join(', ')); process.exit(1); }
}

main().catch(async (e) => {
  console.error('smoke failed: ' + e.message);
  try { await shutdown(); } catch (e2) {}
  process.exit(1);
});
