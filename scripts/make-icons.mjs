// Sinh icon PNG cho extension, không dùng dependency ngoài (chỉ node:zlib + node:fs).
// Chạy: npm run icons  → assets/icon-{16,32,48,128}.png
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling mỗi chiều

const BG_FROM = [99, 102, 241]; // indigo-500
const BG_TO = [67, 56, 202]; // indigo-700
const BUBBLE = [255, 255, 255];
const DOT = [67, 56, 202];

const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

const inTriangle = (x, y, [ax, ay], [bx, by], [cx, cy]) => {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  const a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
  const b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
  return a >= 0 && b >= 0 && a + b <= 1;
};

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

/** Trả về [r,g,b,a] cho toạ độ chuẩn hoá 0..1, hoặc null nếu trong suốt. */
function colorAt(u, v) {
  if (!inRoundRect(u, v, 0, 0, 1, 1, 0.22)) return null;

  const bubble = inRoundRect(u, v, 0.2, 0.22, 0.8, 0.6, 0.1);
  const tail = inTriangle(u, v, [0.29, 0.56], [0.45, 0.56], [0.29, 0.73]);

  if (bubble || tail) {
    const dot =
      inCircle(u, v, 0.34, 0.41, 0.045) ||
      inCircle(u, v, 0.5, 0.41, 0.045) ||
      inCircle(u, v, 0.66, 0.41, 0.045);
    return [...(dot ? DOT : BUBBLE), 255];
  }

  const t = (u + v) / 2;
  return [lerp(BG_FROM[0], BG_TO[0], t), lerp(BG_FROM[1], BG_TO[1], t), lerp(BG_FROM[2], BG_TO[2], t), 255];
}

function renderRGBA(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const c = colorAt(u, v);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 255;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const alpha = a / n;
      if (alpha === 0) continue;
      buf[i] = Math.round(r / (a / 255) / 1); // trung bình trên các mẫu đục
      buf[i + 1] = Math.round(g / (a / 255));
      buf[i + 2] = Math.round(b / (a / 255));
      buf[i + 3] = Math.round(alpha);
    }
  }
  return buf;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // no interlace

  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter type 0
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = resolve(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, encodePNG(size, renderRGBA(size)));
  console.log(`wrote ${file}`);
}
