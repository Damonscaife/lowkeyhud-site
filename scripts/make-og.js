#!/usr/bin/env node
// Generates og.png (1200x630) for social unfurl — zero dependencies.
// Usage: node scripts/make-og.js
const fs = require("fs");
const zlib = require("zlib");

const W = 1200, H = 630;
const px = new Uint8Array(W * H * 4); // RGBA

function blend(i, r, g, b, a) {
  if (a <= 0) return;
  const da = px[i + 3];
  const oa = a + da * (1 - a / 255);
  if (oa === 0) return;
  px[i]     = Math.round((r * a + px[i]     * da * (1 - a / 255)) / oa);
  px[i + 1] = Math.round((g * a + px[i + 1] * da * (1 - a / 255)) / oa);
  px[i + 2] = Math.round((b * a + px[i + 2] * da * (1 - a / 255)) / oa);
  px[i + 3] = Math.round(oa);
}

function set(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  blend((y * W + x) * 4, r, g, b, a);
}

function fill(r, g, b, a) {
  for (let i = 0; i < px.length; i += 4) { px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a; }
}

function fillRect(x0, y0, w, h, r, g, b, a) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, r, g, b, a);
}
function hline(x0, x1, y, r, g, b, a) { fillRect(x0, y, x1 - x0, 1, r, g, b, a); }
function vline(x, y0, y1, r, g, b, a) { fillRect(x, y0, 1, y1 - y0, r, g, b, a); }

function ring(cx, cy, rad, thick, r, g, b, a) {
  const aa = 1.3, lo = rad - thick / 2, hi = rad + thick / 2;
  for (let y = Math.floor(cy - hi - aa); y <= Math.ceil(cy + hi + aa); y++)
    for (let x = Math.floor(cx - hi - aa); x <= Math.ceil(cx + hi + aa); x++) {
      const d = Math.hypot(x - cx, y - cy);
      let t = 0;
      if (d >= lo + aa && d <= hi - aa) t = 1;
      else if (d >= lo && d <= hi) t = Math.min((d - lo) / aa, (hi - d) / aa);
      if (t > 0) set(x, y, r, g, b, a * t);
    }
}

function dot(cx, cy, rad, r, g, b, a) {
  const aa = 1.3;
  for (let y = Math.floor(cy - rad - aa); y <= Math.ceil(cy + rad + aa); y++)
    for (let x = Math.floor(cx - rad - aa); x <= Math.ceil(cx + rad + aa); x++) {
      const d = Math.hypot(x - cx, y - cy);
      let t = 0;
      if (d <= rad - aa) t = 1;
      else if (d <= rad) t = (rad - d) / aa;
      if (t > 0) set(x, y, r, g, b, a * t);
    }
}

// --- draw ---
fill(10, 13, 15, 255); // #0a0d0f

// grid
const gstep = 70;
for (let x = gstep; x < W; x += gstep) vline(x, 0, H, 255, 255, 255, 8);
for (let y = gstep; y < H; y += gstep) hline(0, W, y, 255, 255, 255, 8);

// corner brackets (mint)
const M = 70, L = 110, T = 8;
const G = [134, 224, 171];
fillRect(M, M, L, T, G[0], G[1], G[2], 235);            // TL horizontal
fillRect(M, M, T, L, G[0], G[1], G[2], 235);            // TL vertical
fillRect(W - M - L, M, L, T, G[0], G[1], G[2], 235);    // TR horizontal
fillRect(W - M - T, M, T, L, G[0], G[1], G[2], 235);    // TR vertical
fillRect(M, H - M - T, L, T, G[0], G[1], G[2], 235);    // BL horizontal
fillRect(M, H - M - L, T, L, G[0], G[1], G[2], 235);    // BL vertical
fillRect(W - M - L, H - M - T, L, T, G[0], G[1], G[2], 235); // BR horizontal
fillRect(W - M - T, H - M - L, T, L, G[0], G[1], G[2], 235); // BR vertical

// center mark: ring + dot
ring(W / 2, H / 2, 130, 9, G[0], G[1], G[2], 235);
dot(W / 2, H / 2, 60, G[0], G[1], G[2], 255);

// --- PNG encode ---
const crcTable = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0; // filter none
  Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (1 + W * 4) + 1);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0))
]);

fs.writeFileSync("og.png", png);
console.log("og.png written:", png.length, "bytes,", W + "x" + H);
