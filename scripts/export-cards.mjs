#!/usr/bin/env node
// scripts/export-cards.mjs — renders the launch-kit cards to PNGs using
// headless Chrome + the generator's own canvas export, so the images match
// exactly what a visitor exports from lowkeyhud.com.
//
// Usage:  node scripts/export-cards.mjs
// Writes PNGs into launch-cards/ (1080x1350, free tier = watermarked, per the
// launch-kit rule: don't remove the watermark — it's the distribution loop).

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.join(ROOT, 'launch-cards');
const PORT = 9333 + Math.floor(Math.random() * 200);
const genFile = pathToFileURL(path.join(ROOT, 'generator.html')).href;

const CARDS = [
  { file: 'night-owl', name: 'NIGHT OWL', hash: 'mode=personal&name=NIGHT+OWL&cls=ARTIST&status=UP+LATE&lvl=6&tag=DOING+IT+LIVE&s1=68&s2=52&s3=80&chips=VIBES,DELULU,NO+MEETINGS' },
  { file: '2am-theorist', name: '2AM THEORIST', hash: 'mode=personal&name=2AM+THEORIST&cls=PHILOSOPHER&status=SLEEPY&lvl=5&tag=ONE+MORE+VIDEO&s1=90&s2=35&s3=72&chips=VIBES,DELULU,SNACK+ECONOMY' },
  { file: 'lowkey-legend', name: 'LOWKEY LEGEND', hash: 'mode=personal&name=LOWKEY+LEGEND&cls=MENACE&status=UNBOTHERED&lvl=11&tag=TOO+CHILL&s1=94&s2=40&s3=66&chips=NO+CAP,OFF+GRID,COLD+EMAILS' }
];

const profile = path.join(os.tmpdir(), 'lkh-chrome-' + process.pid);
mkdirSync(profile, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--window-size=1200,1500',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile,
  '--no-first-run',
  '--no-default-browser-check',
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

async function waitForCard(ws, i = 0) {
  if (i > 100) throw new Error('page never rendered the card');
  const r = await send(ws, 'Runtime.evaluate', {
    expression: `document.readyState === 'complete' && !!document.getElementById('c-name') && document.getElementById('c-name').textContent.length > 0`,
    returnByValue: true
  });
  if (r.result && r.result.value === true) return;
  await sleep(100);
  return waitForCard(ws, i + 1);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  await waitForEndpoint(`http://127.0.0.1:${PORT}/json/version`);
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  const ws = await connect(page.webSocketDebuggerUrl);
  await send(ws, 'Page.enable');

  for (let ci = 0; ci < CARDS.length; ci++) {
    const card = CARDS[ci];
    // A URL that differs only in the hash is a same-document navigation (no
    // reload), so loadFromHash would never re-run. A unique query forces a real
    // page load; the card data itself still comes from the hash.
    await send(ws, 'Page.navigate', { url: genFile + '?e=' + ci + '#' + card.hash });
    await waitForCard(ws);
    await sleep(250);
    const nameCheck = await send(ws, 'Runtime.evaluate', {
      expression: `document.getElementById('c-name').textContent === ${JSON.stringify(card.name)}`,
      returnByValue: true
    });
    if (!nameCheck.result || nameCheck.result.value !== true) {
      throw new Error('wrong card loaded for ' + card.name);
    }
    const r = await send(ws, 'Runtime.evaluate', {
      expression: `(function(){
        var cv = drawExport(readData(), false);
        var ctx = cv.getContext('2d');
        var px = ctx.getImageData(0, 0, cv.width, cv.height).data;
        var dark = 0, green = 0, n = px.length / 4;
        for (var i = 0; i < n; i += 997) {
          var r2 = px[i*4], g2 = px[i*4+1], b2 = px[i*4+2];
          if (r2 < 30 && g2 < 30 && b2 < 40) dark++;
          if (g2 > 150 && r2 < 200 && b2 < 200) green++;
        }
        return { w: cv.width, h: cv.height, dark: dark, green: green, dataUrl: cv.toDataURL('image/png') };
      })()`,
      returnByValue: true
    });
    const v = r.result && r.result.value;
    if (!v || !v.dataUrl || !v.dataUrl.startsWith('data:image/png')) throw new Error('no png for ' + card.name);
    if (v.w !== 1080 || v.h !== 1350 || v.dark < 5 || v.green < 5) throw new Error('canvas looks wrong for ' + card.name + ' ' + JSON.stringify({ w: v.w, h: v.h, dark: v.dark, green: v.green }));
    const png = Buffer.from(v.dataUrl.split(',')[1], 'base64');
    const out = path.join(OUT_DIR, card.file + '.png');
    writeFileSync(out, png);
    console.log('✓ ' + card.name + ' -> ' + path.relative(ROOT, out) + ' (' + (png.length / 1024).toFixed(0) + ' KB, ' + v.w + 'x' + v.h + ')');
  }

  ws.close();
  chrome.kill();
  rmSync(profile, { recursive: true, force: true });
}

main().catch((e) => {
  console.error('export failed: ' + e.message);
  try { chrome.kill(); rmSync(profile, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
