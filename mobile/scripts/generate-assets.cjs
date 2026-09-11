const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  t.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
  return out;
}

function makeCanvas(width, height, rgba) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    pixels[p] = rgba[0];
    pixels[p + 1] = rgba[1];
    pixels[p + 2] = rgba[2];
    pixels[p + 3] = rgba[3];
  }
  return { width, height, pixels };
}

function rect(img, x, y, w, h, rgba) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(img.width, Math.ceil(x + w));
  const y1 = Math.min(img.height, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const p = (yy * img.width + xx) * 4;
      img.pixels[p] = rgba[0];
      img.pixels[p + 1] = rgba[1];
      img.pixels[p + 2] = rgba[2];
      img.pixels[p + 3] = rgba[3];
    }
  }
}

function circle(img, cx, cy, radius, rgba) {
  const r2 = radius * radius;
  for (let y = Math.max(0, cy - radius); y < Math.min(img.height, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x < Math.min(img.width, cx + radius); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) rect(img, x, y, 1, 1, rgba);
    }
  }
}

function drawMark(img, ox, oy, s) {
  const white = [248, 250, 252, 255];
  const gold = [242, 177, 52, 255];
  rect(img, ox, oy, 62 * s, 290 * s, white);
  rect(img, ox, oy, 245 * s, 62 * s, white);
  rect(img, ox, oy + 120 * s, 190 * s, 58 * s, white);
  rect(img, ox + 135 * s, oy + 235 * s, 45 * s, 45 * s, gold);
  rect(img, ox + 170 * s, oy + 200 * s, 45 * s, 80 * s, gold);
  circle(img, Math.round(ox + 255 * s), Math.round(oy + 34 * s), Math.round(34 * s), gold);
}

function encodePng(img) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(img.width, 0);
  header.writeUInt32BE(img.height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((img.width * 4 + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    const row = y * (img.width * 4 + 1);
    raw[row] = 0;
    img.pixels.copy(raw, row + 1, y * img.width * 4, (y + 1) * img.width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function save(img, name) {
  fs.writeFileSync(path.join(out, name), encodePng(img));
}

const icon = makeCanvas(512, 512, [8, 18, 37, 255]);
rect(icon, 56, 56, 400, 400, [13, 45, 115, 255]);
drawMark(icon, 155, 138, 0.62);
save(icon, 'icon.png');

const adaptive = makeCanvas(512, 512, [0, 0, 0, 0]);
drawMark(adaptive, 155, 138, 0.62);
save(adaptive, 'adaptive-icon.png');

const splash = makeCanvas(1024, 1024, [8, 18, 37, 255]);
rect(splash, 312, 312, 400, 400, [13, 45, 115, 255]);
drawMark(splash, 410, 395, 0.62);
save(splash, 'splash.png');

console.log('Assets do AulaFácil Mobile gerados.');
