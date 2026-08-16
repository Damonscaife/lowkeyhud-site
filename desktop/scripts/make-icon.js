/* Generates assets/icon.png (512x512) with zero dependencies: a dark rounded
   square, a green ring, and a green dot — the lowkeyhud mark. */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const SIZE = 512;

/* ---------- PNG encoding ---------- */
let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------- drawing ---------- */
function roundRectSDF(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

const C = SIZE / 2;
const HS = 236;      // half side of the rounded square
const R = 108;       // corner radius
const T = 18;        // ring thickness
const DOT = 58;      // dot radius
const GREEN = [134, 224, 171];
const DARK = [14, 19, 22];

const rgba = Buffer.alloc(SIZE * SIZE * 4);

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const px = x + 0.5, py = y + 0.5;
    const dOuter = roundRectSDF(px, py, C, C, HS, HS, R);
    if (dOuter > 0) continue; // transparent
    const dInner = roundRectSDF(px, py, C, C, HS - T, HS - T, R - T);
    if (dInner > 0) {
      [rgba[i], rgba[i + 1], rgba[i + 2]] = GREEN;
      rgba[i + 3] = 255;
    } else if (Math.hypot(px - C, py - C) <= DOT) {
      [rgba[i], rgba[i + 1], rgba[i + 2]] = GREEN;
      rgba[i + 3] = 255;
    } else {
      [rgba[i], rgba[i + 1], rgba[i + 2]] = DARK;
      rgba[i + 3] = 255;
    }
  }
}

const out = path.join(__dirname, "..", "assets", "icon.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
const png = encodePNG(SIZE, SIZE, rgba);
fs.writeFileSync(out, png);
console.log("wrote", out, "(" + png.length + " bytes)");
