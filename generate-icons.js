/**
 * Generates TouchLock extension icons as PNG files.
 * Run once: node generate-icons.js
 * Requires no external dependencies (uses built-in canvas-less PNG encoder).
 */

const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const outDir = path.join(__dirname, 'icons');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function createPNG(size) {
  const pixels = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;

      const r = Math.round(59 + (99 - 59) * nx);
      const g = Math.round(130 + (102 - 130) * nx);
      const b = Math.round(246 + (241 - 246) * nx);

      const cx = (x - size / 2) / (size / 2);
      const cy = (y - size / 2) / (size / 2);
      const dist = Math.sqrt(cx * cx + cy * cy);
      const radius = 0.85;
      const corner = 0.35;

      const chebyshev = Math.max(Math.abs(cx), Math.abs(cy));
      const roundedDist = Math.max(0, chebyshev - (radius - corner)) / corner;
      const alpha = dist < radius ? 255 : roundedDist > 1 ? 0 : Math.round(255 * (1 - roundedDist));

      // Draw a simplified lock shape in white
      let isLock = false;
      const px = cx;
      const py = cy;

      // Lock body
      if (px >= -0.32 && px <= 0.32 && py >= -0.05 && py <= 0.45) isLock = true;
      // Lock shackle (arc)
      const shackleR = Math.sqrt(px * px + (py + 0.05) * (py + 0.05));
      if (shackleR >= 0.18 && shackleR <= 0.28 && py < -0.05 && px >= -0.28 && px <= 0.28) isLock = true;

      if (isLock && alpha > 0) {
        pixels[i]     = 255;
        pixels[i + 1] = 255;
        pixels[i + 2] = 255;
        pixels[i + 3] = Math.min(alpha, 230);
      } else {
        pixels[i]     = r;
        pixels[i + 1] = g;
        pixels[i + 2] = b;
        pixels[i + 3] = alpha;
      }
    }
  }

  return encodePNG(size, size, pixels);
}

// Minimal PNG encoder (no dependencies)
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
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeData = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeData));
    return Buffer.concat([len, typeData, crc]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Raw scanlines (filter byte 0 = None per row)
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw.push(rgba[i], rgba[i+1], rgba[i+2], rgba[i+3]);
    }
  }
  const rawBuf = Buffer.from(raw);

  // Deflate (store blocks, no compression - simple but works)
  const blocks = [];
  let offset = 0;
  while (offset < rawBuf.length) {
    const remaining = rawBuf.length - offset;
    const blockSize = Math.min(remaining, 65535);
    const last = offset + blockSize >= rawBuf.length ? 1 : 0;
    const header = Buffer.alloc(5);
    header[0] = last;
    header.writeUInt16LE(blockSize, 1);
    header.writeUInt16LE(blockSize ^ 0xFFFF, 3);
    blocks.push(header, rawBuf.slice(offset, offset + blockSize));
    offset += blockSize;
  }

  const adler = adler32(rawBuf);
  const adlerBuf = Buffer.alloc(4);
  adlerBuf.writeUInt32BE(adler);

  const zlibHeader = Buffer.from([0x78, 0x01]);
  const compressedData = Buffer.concat([zlibHeader, ...blocks, adlerBuf]);

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressedData), iend]);
}

for (const size of sizes) {
  const png = createPNG(size);
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`Created ${file} (${png.length} bytes)`);
}

console.log('Done!');
