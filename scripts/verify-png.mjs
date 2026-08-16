#!/usr/bin/env node
// scripts/verify-png.mjs — dependency-free PNG decoder that renders the
// launch-cards as ASCII so you can eyeball the layout without a browser.
//
// Usage:  node scripts/verify-png.mjs [file.png ...]   (defaults to launch-cards/*.png)

import { readFileSync, readdirSync } from 'fs';
import { inflateSync } from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function decodePNG(buf) {
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a png');
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    off += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : (colorType === 2 ? 3 : (colorType === 0 ? 1 : 4));
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const ls = y * stride, ps = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const cur = raw[src++];
      const a = x >= bpp ? out[ls + x - bpp] : 0;
      const b = y > 0 ? out[ps + x] : 0;
      const c = x >= bpp && y > 0 ? out[ps + x - bpp] : 0;
      let val;
      switch (filter) {
        case 0: val = cur; break;
        case 1: val = (cur + a) & 0xff; break;
        case 2: val = (cur + b) & 0xff; break;
        case 3: val = (cur + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          val = (cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default: throw new Error('bad filter ' + filter);
      }
      out[ls + x] = val;
    }
  }
  return { width, height, bpp, pixels: out };
}

function classify(r, g, b) {
  if (r < 40 && g < 40 && b < 45) return '.';
  if (g > 150 && r < 210 && b < 210) return 'G';
  if (r > 180 && g > 120 && g < 225 && b < 160) return 'A';
  if (r > 180 && g < 130 && b < 130) return 'R';
  const lum = r * 0.3 + g * 0.6 + b * 0.1;
  if (lum > 170) return '#';
  if (lum > 90) return '+';
  return ':';
}

function asciiPreview(png, cols = 44) {
  const { width, height, bpp, pixels } = png;
  const rows = Math.round(cols * height / width);
  const cellW = width / cols, cellH = height / rows;
  const grid = [];
  for (let gy = 0; gy < rows; gy++) {
    let line = '';
    for (let gx = 0; gx < cols; gx++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = Math.floor(gy * cellH); y < Math.min(height, Math.ceil((gy + 1) * cellH)); y++) {
        for (let x = Math.floor(gx * cellW); x < Math.min(width, Math.ceil((gx + 1) * cellW)); x++) {
          const i = (y * width + x) * bpp;
          r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; n++;
        }
      }
      if (n) { r /= n; g /= n; b /= n; }
      line += classify(r, g, b);
    }
    grid.push(line);
  }
  return grid.join('\n');
}

function stats(png) {
  const { width, height, bpp, pixels } = png;
  let green = 0, amber = 0, white = 0, red = 0, total = 0;
  for (let i = 0; i < pixels.length; i += bpp) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    total++;
    if (g > 150 && r < 210 && b < 210) green++;
    if (r > 180 && g > 120 && g < 225 && b < 160) amber++;
    if (r * 0.3 + g * 0.6 + b * 0.1 > 170) white++;
    if (r > 180 && g < 130 && b < 130) red++;
  }
  return { green: (green / total * 100).toFixed(1) + '%', amber: (amber / total * 100).toFixed(1) + '%', white: (white / total * 100).toFixed(1) + '%', red: (red / total * 100).toFixed(1) + '%' };
}

const args = process.argv.slice(2);
const files = args.length
  ? args
  : readdirSync(path.join(ROOT, 'launch-cards')).filter(f => f.endsWith('.png')).map(f => path.join(ROOT, 'launch-cards', f));

for (const f of files) {
  const png = decodePNG(readFileSync(f));
  console.log('\n=== ' + path.basename(f) + ' — ' + png.width + 'x' + png.height + ' · colors ' + JSON.stringify(stats(png)) + ' ===');
  console.log(asciiPreview(png));
}
