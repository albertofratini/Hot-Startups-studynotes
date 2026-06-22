// Generates PWA PNG icons with zero dependencies (pure Node + zlib).
// Draws a white pill/tablet on a pink rounded background.
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// CRC32
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }

function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const [br, bg, bb] = hex('#F06C8C');       // pink background
  const [wr, wg, wb] = hex('#FFFFFF');       // pill body
  const [lr, lg, lb] = hex('#FFB3C6');       // score line
  const cx = size / 2, cy = size / 2;
  const r = size * 0.27;                      // pill radius
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // full-bleed pink background (works as maskable)
      let R = br, G = bg, B = bb;
      const dx = x - cx, dy = y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist <= r) {
        // pill body, with a vertical score line in the middle
        if (Math.abs(dx) < size * 0.012 && Math.abs(dy) < r * 0.78) {
          R = lr; G = lg; B = lb;
        } else {
          R = wr; G = wg; B = wb;
        }
      }
      buf[i] = R; buf[i + 1] = G; buf[i + 2] = B; buf[i + 3] = 255;
    }
  }
  return buf;
}

for (const size of [192, 512]) {
  fs.writeFileSync(path.join(OUT, `icon-${size}.png`), encodePNG(size, size, draw(size)));
  console.log(`wrote icon-${size}.png`);
}
// Apple touch icon (180x180)
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), encodePNG(180, 180, draw(180)));
console.log('wrote apple-touch-icon.png');
