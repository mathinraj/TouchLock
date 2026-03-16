/**
 * Generates TouchLock extension icons (Option 8: Shield + Fingerprint).
 * Run once: node generate-icons.js
 * No external dependencies.
 */

const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const outDir = path.join(__dirname, 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function createPNG(size) {
  const px = new Uint8Array(size * size * 4);
  const S = size;
  const cx = S / 2, cy = S / 2;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const nx = x / S, ny = y / S;

      // Gradient: indigo #6366f1 → purple #a855f7
      const r = Math.round(99 + (168 - 99) * (nx * 0.5 + ny * 0.5));
      const g = Math.round(102 + (85 - 102) * (nx * 0.5 + ny * 0.5));
      const b = Math.round(241 + (247 - 241) * (nx * 0.5 + ny * 0.5));

      // Rounded rect mask (rx=28/128 = 0.21875 of size)
      const rx = 0.21875 * S;
      const alpha = roundedRectAlpha(x, y, 0, 0, S, S, rx);
      if (alpha === 0) { px[i + 3] = 0; continue; }

      // Normalised coordinates (0–1)
      const u = x / S, v = y / S;

      // -- Shield shape --
      const shieldAlpha = shieldMask(u, v);

      // -- Fingerprint arcs (simplified for pixel rendering) --
      const fpAlpha = fingerprintMask(u, v, S);

      let fr = r, fg = g, fb = b, fa = alpha;

      // Shield fill: semi-transparent white
      if (shieldAlpha > 0) {
        const sa = shieldAlpha * 0.12;
        fr = blend(fr, 255, sa);
        fg = blend(fg, 255, sa);
        fb = blend(fb, 255, sa);
      }

      // Shield stroke: white at 0.4 opacity
      const sd = shieldStrokeDist(u, v);
      const strokeW = 3.0 / S;
      if (sd < strokeW) {
        const t = Math.max(0, 1 - sd / strokeW) * 0.45;
        fr = blend(fr, 255, t);
        fg = blend(fg, 255, t);
        fb = blend(fb, 255, t);
      }

      // Fingerprint lines: white
      if (fpAlpha > 0) {
        fr = blend(fr, 255, fpAlpha);
        fg = blend(fg, 255, fpAlpha);
        fb = blend(fb, 255, fpAlpha);
      }

      px[i]     = fr;
      px[i + 1] = fg;
      px[i + 2] = fb;
      px[i + 3] = fa;
    }
  }
  return encodePNG(S, S, px);
}

// Shield region test (normalised coords 0-1)
function shieldMask(u, v) {
  const sx = 0.5, sy = 0.203;
  const botY = 0.828;
  const sideX = 0.75, sideY = 0.3125;
  const midSideY = 0.515;

  // Rough shield: top point, expands to sides at sideY, then narrows to bottom
  if (v < sy || v > botY) return 0;
  if (v < midSideY) {
    const t = (v - sy) / (midSideY - sy);
    const halfW = t * (sideX - sx);
    if (Math.abs(u - sx) > halfW) return 0;
  } else {
    const t = (v - midSideY) / (botY - midSideY);
    const halfW = (1 - t * t) * (sideX - sx);
    if (Math.abs(u - sx) > halfW) return 0;
  }
  return 1;
}

function shieldStrokeDist(u, v) {
  // Approximate distance to shield boundary
  const sx = 0.5, sy = 0.203;
  const botY = 0.828;
  const sideX = 0.75, midSideY = 0.515;

  let edgeX;
  if (v < sy || v > botY) return 1;
  if (v < midSideY) {
    const t = (v - sy) / (midSideY - sy);
    edgeX = sx + t * (sideX - sx);
  } else {
    const t = (v - midSideY) / (botY - midSideY);
    edgeX = sx + (1 - t * t) * (sideX - sx);
  }
  const mirrorU = sx + Math.abs(u - sx);
  const dx = Math.abs(mirrorU - edgeX);

  // Top edge distance
  const dy = (v < sy + 0.02) ? sy + 0.02 - v : (v > botY - 0.02 ? v - (botY - 0.02) : 1);
  return Math.min(dx, dy);
}

// Fingerprint: concentric arc segments
function fingerprintMask(u, v, S) {
  const cx = 0.5, cy = 0.5;
  const lineW = 2.5 / S;
  let alpha = 0;

  // Arc 1: top-left quarter - outer
  alpha = Math.max(alpha, arcAlpha(u, v, cx, 0.375, 0.125, Math.PI, Math.PI * 1.5, lineW));
  // Arc 2: top-right quarter - outer
  alpha = Math.max(alpha, arcAlpha(u, v, cx, 0.375, 0.125, Math.PI * 1.5, Math.PI * 2, lineW));

  // Arc 3: wider arc
  alpha = Math.max(alpha, arcAlpha(u, v, cx, 0.375 + 0.005, 0.172, Math.PI * 0.8, Math.PI * 2.2, lineW));

  // Arc 4: middle arc
  alpha = Math.max(alpha, arcAlpha(u, v, cx, 0.42, 0.094, Math.PI * 0.85, Math.PI * 2.15, lineW));

  // Arc 5: inner small arc
  alpha = Math.max(alpha, arcAlpha(u, v, cx, 0.484, 0.062, Math.PI * 0.9, Math.PI * 2.1, lineW));

  // Vertical line center
  const lineDist = Math.abs(u - cx);
  if (lineDist < lineW && v > 0.547 && v < 0.688) {
    alpha = Math.max(alpha, Math.max(0, 1 - lineDist / lineW));
  }

  // Clip to shield interior
  if (shieldMask(u, v) === 0) alpha = 0;

  return Math.min(1, alpha);
}

function arcAlpha(u, v, cx, cy, radius, a1, a2, w) {
  const dx = u - cx, dy = v - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ringDist = Math.abs(dist - radius);
  if (ringDist > w) return 0;
  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle += Math.PI * 2;
  // Normalise a1,a2
  while (a1 < 0) { a1 += Math.PI * 2; a2 += Math.PI * 2; }
  let inArc = (angle >= a1 && angle <= a2);
  if (!inArc && a2 > Math.PI * 2) inArc = (angle + Math.PI * 2 >= a1 && angle + Math.PI * 2 <= a2);
  if (!inArc) return 0;
  return Math.max(0, 1 - ringDist / w);
}

function blend(base, over, t) {
  return Math.round(base * (1 - t) + over * t);
}

function roundedRectAlpha(x, y, rx1, ry1, w, h, r) {
  const dx = Math.max(0, Math.max(rx1 + r - x, x - (rx1 + w - r)));
  const dy = Math.max(0, Math.max(ry1 + r - y, y - (ry1 + h - r)));
  if (dx === 0 && dy === 0) return 255;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > r + 1) return 0;
  if (dist > r) return Math.round(255 * (1 - (dist - r)));
  return 255;
}

// ── Minimal PNG encoder ──────────────────────
function encodePNG(width, height, rgba) {
  function crc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function adler32(data) {
    let a = 1, b = 0;
    for (let i = 0; i < data.length; i++) {
      a = (a + data[i]) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, c]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw.push(rgba[i], rgba[i+1], rgba[i+2], rgba[i+3]);
    }
  }
  const rawBuf = Buffer.from(raw);
  const blocks = [];
  let off = 0;
  while (off < rawBuf.length) {
    const rem = rawBuf.length - off;
    const bs = Math.min(rem, 65535);
    const last = off + bs >= rawBuf.length ? 1 : 0;
    const hdr = Buffer.alloc(5);
    hdr[0] = last; hdr.writeUInt16LE(bs, 1); hdr.writeUInt16LE(bs ^ 0xFFFF, 3);
    blocks.push(hdr, rawBuf.slice(off, off + bs));
    off += bs;
  }
  const adl = Buffer.alloc(4); adl.writeUInt32BE(adler32(rawBuf));
  const comp = Buffer.concat([Buffer.from([0x78, 0x01]), ...blocks, adl]);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', comp), chunk('IEND', Buffer.alloc(0))]);
}

// ── Generate ─────────────────────────────────
for (const size of sizes) {
  const png = createPNG(size);
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`Created ${file} (${png.length} bytes)`);
}
console.log('Done – Option 8: Shield + Fingerprint');
