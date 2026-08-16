#!/usr/bin/env node
// scripts/export-cards.mjs — renders the launch-kit cards to PNGs using
// headless Chrome + the generator's own canvas export, so the images match
// exactly what a visitor exports from lowkeyhud.com.
//
// Usage:  node scripts/export-cards.mjs [--live]
// Writes PNGs (1080x1350) and looping GIFs (540x675, 12fps) into launch-cards/.
// Default renders the local generator.html (for testing unshipped edits);
// `--live` renders from https://lowkeyhud.com/generator so the kit matches the
// exact code visitors get.
// Free tier = watermarked, per the launch-kit rule: don't remove the
// watermark — it's the distribution loop. GIFs upload natively to X/Discord.

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.join(ROOT, 'launch-cards');
const PORT = 9333 + Math.floor(Math.random() * 200);
const LIVE = process.argv.includes('--live');
const genFile = LIVE
  ? 'https://lowkeyhud.com/generator'
  : pathToFileURL(path.join(ROOT, 'generator.html')).href;

// Avatar demo on the hero card: a randomuser placeholder portrait (a clearly
// fictional person — safe for public marketing). URL-encoded for the hash.
const PIC = 'https%3A%2F%2Frandomuser.me%2Fapi%2Fportraits%2Fmen%2F75.jpg';

const CARDS = [
  { file: 'night-owl', name: 'NIGHT OWL', pic: true, hash: 'mode=personal&name=NIGHT+OWL&cls=ARTIST&status=UP+LATE&lvl=6&tag=DOING+IT+LIVE&s1=68&s2=52&s3=80&chips=VIBES,DELULU,NO+MEETINGS&pic=' + PIC },
  { file: '2am-theorist', name: '2AM THEORIST', hash: 'mode=personal&name=2AM+THEORIST&cls=PHILOSOPHER&status=SLEEPY&lvl=5&tag=ONE+MORE+VIDEO&s1=90&s2=35&s3=72&chips=VIBES,DELULU,SNACK+ECONOMY' },
  { file: 'lowkey-legend', name: 'LOWKEY LEGEND', hash: 'mode=personal&name=LOWKEY+LEGEND&cls=MENACE&status=UNBOTHERED&lvl=11&tag=TOO+CHILL&s1=94&s2=40&s3=66&chips=NO+CAP,OFF+GRID,COLD+EMAILS' }
];

const profile = path.join(os.tmpdir(), 'lkh-chrome-' + process.pid);
mkdirSync(profile, { recursive: true });

// Lightweight GIF structure check (header, dimensions, frame count, loop block).
function gifInfo(buf) {
  if (buf.slice(0, 6).toString('ascii') !== 'GIF89a') throw new Error('not gif89a');
  const w = buf.readUInt16LE(6), h = buf.readUInt16LE(8);
  const packed = buf[10];
  let off = 13 + ((packed & 0x80) ? (2 << (packed & 7)) * 3 : 0);
  let frames = 0, loop = false;
  while (off < buf.length) {
    const b = buf[off];
    if (b === 0x3b) break;                       // trailer
    if (b === 0x21) {                            // extension
      const label = buf[off + 1];
      off += 2;
      if (label === 0xff && buf[off] === 0x0b && buf.slice(off + 1, off + 12).toString('ascii') === 'NETSCAPE2.0') loop = true;
      while (off < buf.length && buf[off] !== 0x00) off += 1 + buf[off];
      off++;
    } else if (b === 0x2c) {                     // image descriptor
      frames++;
      off += 9;
      const ip = buf[off++];
      if (ip & 0x80) off += (2 << (ip & 7)) * 3;
      off++;                                     // LZW min code size
      while (off < buf.length && buf[off] !== 0x00) off += 1 + buf[off];
      off++;
    } else {
      throw new Error('bad gif block at byte ' + off);
    }
  }
  return { w, h, frames, loop };
}

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
  console.log('source: ' + (LIVE ? 'https://lowkeyhud.com/generator (live)' : 'local generator.html'));
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
    // If the card carries a profile pic, wait for it to actually load (it loads
    // asynchronously, and may go through the weserv fallback) before drawing.
    if (card.pic) {
      const picWait = await send(ws, 'Runtime.evaluate', {
        expression: `new Promise(function(resolve){
          var tries = 0;
          (function poll(){
            if (picReady()) return resolve(true);
            if (++tries > 120) return resolve(false);
            setTimeout(poll, 100);
          })();
        })`,
        awaitPromise: true,
        returnByValue: true
      });
      if (!picWait.result || !picWait.result.value) throw new Error('avatar did not load for ' + card.name);
      console.log('  avatar loaded for ' + card.name);
      await sleep(200);
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
        // radar circle centre (cx=242, cy=330, r=150): an avatar fills it with
        // photo pixels; the radar leaves it dark. Sample a small patch there.
        var cx = 242, cy = 330, lit = 0;
        for (var yy = cy-10; yy < cy+10; yy++){
          for (var xx = cx-10; xx < cx+10; xx++){
            var o = (yy*cv.width + xx)*4;
            if (px[o] > 40 || px[o+1] > 40 || px[o+2] > 40) lit++;
          }
        }
        return { w: cv.width, h: cv.height, dark: dark, green: green, avatarLit: lit, dataUrl: cv.toDataURL('image/png') };
      })()`,
      returnByValue: true
    });
    const v = r.result && r.result.value;
    if (!v || !v.dataUrl || !v.dataUrl.startsWith('data:image/png')) throw new Error('no png for ' + card.name);
    if (v.w !== 1080 || v.h !== 1350 || v.dark < 5 || v.green < 5) throw new Error('canvas looks wrong for ' + card.name + ' ' + JSON.stringify({ w: v.w, h: v.h, dark: v.dark, green: v.green }));
    // The avatar card must show a photo in the radar circle; non-avatar cards
    // must show the dark radar centre instead.
    if (card.pic && v.avatarLit < 200) throw new Error('avatar not visible in export for ' + card.name + ' avatarLit=' + v.avatarLit);
    if (!card.pic && v.avatarLit > 50) throw new Error('unexpected avatar pixels for ' + card.name + ' avatarLit=' + v.avatarLit);
    if (card.pic) console.log('  avatar visible in export (avatarLit=' + v.avatarLit + '/400)');
    const png = Buffer.from(v.dataUrl.split(',')[1], 'base64');
    const out = path.join(OUT_DIR, card.file + '.png');
    writeFileSync(out, png);
    console.log('✓ ' + card.name + ' -> ' + path.relative(ROOT, out) + ' (' + (png.length / 1024).toFixed(0) + ' KB, ' + v.w + 'x' + v.h + ')');

    // Looping GIF via the page's own dependency-free encoder (watermarked free tier).
    // The browser decodes the blob into a real Image first, proving it's valid.
    const g = await send(ws, 'Runtime.evaluate', {
      expression: `new Promise(function(resolve){
        buildGifBlob(function(blob){
          var url = URL.createObjectURL(blob);
          var img = new Image();
          img.onload = function(){
            var fr = new FileReader();
            fr.onload = function(){ resolve({ w: img.naturalWidth, h: img.naturalHeight, dataUrl: fr.result }); };
            fr.readAsDataURL(blob);
          };
          img.onerror = function(){ resolve({ error: 'browser could not decode the gif' }); };
          img.src = url;
        });
      })`,
      awaitPromise: true,
      returnByValue: true
    });
    const gv = g.result && g.result.value;
    if (!gv || gv.error || !gv.dataUrl || !gv.dataUrl.startsWith('data:image/gif')) throw new Error('no gif for ' + card.name + (gv && gv.error ? ' (' + gv.error + ')' : ''));
    if (gv.w !== 540 || gv.h !== 675) throw new Error('gif wrong size for ' + card.name + ': ' + gv.w + 'x' + gv.h);
    const gif = Buffer.from(gv.dataUrl.split(',')[1], 'base64');
    const info = gifInfo(gif);
    console.log('  [debug] gif info ' + card.name + ': ' + JSON.stringify(info) + ' size=' + gif.length);
    if (!info.loop || info.frames < 10) throw new Error('gif not looping/multi-frame for ' + card.name);
    const gout = path.join(OUT_DIR, card.file + '.gif');
    writeFileSync(gout, gif);
    console.log('✓ ' + card.name + ' gif -> ' + path.relative(ROOT, gout) + ' (' + (gif.length / 1024).toFixed(0) + ' KB, ' + info.w + 'x' + info.h + ', ' + info.frames + ' frames, looping)');
  }

  ws.close();
  chrome.kill();
  // Give Chrome a beat to release the profile dir before cleanup.
  await sleep(800);
  try { rmSync(profile, { recursive: true, force: true }); } catch (e) {}
}

main().catch((e) => {
  console.error('export failed: ' + e.message);
  try { chrome.kill(); } catch (e2) {}
  setTimeout(function(){
    try { rmSync(profile, { recursive: true, force: true }); } catch (e3) {}
  }, 1000);
  process.exit(1);
});
