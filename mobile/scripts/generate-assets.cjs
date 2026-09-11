const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });

function makePng(size, background, transparent = false) {
  const png = new PNG({ width: size, height: size });
  const bg = background;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) << 2;
      png.data[i] = bg[0];
      png.data[i + 1] = bg[1];
      png.data[i + 2] = bg[2];
      png.data[i + 3] = transparent ? 0 : 255;
    }
  }
  return png;
}

function fillRect(png, x, y, w, h, rgba) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(png.width, Math.ceil(x + w));
  const y1 = Math.min(png.height, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (png.width * yy + xx) << 2;
      png.data[i] = rgba[0];
      png.data[i + 1] = rgba[1];
      png.data[i + 2] = rgba[2];
      png.data[i + 3] = rgba[3] ?? 255;
    }
  }
}

function circle(png, cx, cy, r, rgba) {
  const r2 = r * r;
  for (let y = Math.max(0, cy - r); y < Math.min(png.height, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x < Math.min(png.width, cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) fillRect(png, x, y, 1, 1, rgba);
    }
  }
}

function drawMark(png, ox, oy, scale) {
  const white = [248, 250, 252, 255];
  const gold = [242, 177, 52, 255];
  fillRect(png, ox + 70 * scale, oy + 65 * scale, 62 * scale, 290 * scale, white);
  fillRect(png, ox + 70 * scale, oy + 65 * scale, 245 * scale, 62 * scale, white);
  fillRect(png, ox + 70 * scale, oy + 185 * scale, 190 * scale, 58 * scale, white);
  fillRect(png, ox + 205 * scale, oy + 300 * scale, 45 * scale, 45 * scale, gold);
  fillRect(png, ox + 240 * scale, oy + 265 * scale, 45 * scale, 80 * scale, gold);
  circle(png, Math.round(ox + 300 * scale), Math.round(oy + 90 * scale), Math.round(34 * scale), gold);
}

function save(png, name) {
  fs.writeFileSync(path.join(out, name), PNG.sync.write(png));
}

const icon = makePng(1024, [8, 18, 37]);
fillRect(icon, 112, 112, 800, 800, [13, 45, 115, 255]);
drawMark(icon, 270, 270, 1.2);
save(icon, 'icon.png');

const adaptive = makePng(1024, [0, 0, 0], true);
drawMark(adaptive, 270, 270, 1.2);
save(adaptive, 'adaptive-icon.png');

const splash = makePng(1280, [8, 18, 37]);
fillRect(splash, 390, 390, 500, 500, [13, 45, 115, 255]);
drawMark(splash, 485, 485, 0.85);
save(splash, 'splash.png');

console.log('Assets do AulaFácil Mobile gerados em mobile/assets.');
