// Đóng gói extension thành file .zip để chia sẻ / lưu trữ.
// Không dùng dependency ngoài: tự viết ZIP writer bằng node:zlib (xem ADR-0001).
//   npm run pack
// Chỉ đóng gói file runtime của extension (whitelist), bỏ docs/, scripts/, test.
import { deflateRawSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/** Chỉ những gì Chrome cần để chạy. */
const INCLUDE_FILES = ['manifest.json'];
const INCLUDE_DIRS = ['popup', 'options', 'lib', 'css', 'assets'];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function collectFiles() {
  const files = [];
  for (const name of INCLUDE_FILES) {
    const full = join(ROOT, name);
    if (!statSync(full).isFile()) throw new Error(`Thiếu file bắt buộc: ${name}`);
    files.push(full);
  }
  for (const dirName of INCLUDE_DIRS) {
    const full = join(ROOT, dirName);
    if (!statSync(full).isDirectory()) throw new Error(`Thiếu thư mục bắt buộc: ${dirName}`);
    files.push(...walk(full));
  }
  return files.sort();
}

// DOS date/time cố định (1980-01-01 00:00) để zip tạo ra giống nhau mỗi lần build.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = relative(ROOT, file).split('\\').join('/');
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = readFileSync(file);
    const data = deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, data);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4); // version made by
    dir.writeUInt16LE(20, 6); // version needed
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(DOS_TIME, 12);
    dir.writeUInt16LE(DOS_DATE, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt16LE(0, 30); // extra
    dir.writeUInt16LE(0, 32); // comment
    dir.writeUInt16LE(0, 34); // disk
    dir.writeUInt16LE(0, 36); // internal attrs
    dir.writeUInt32LE(0, 38); // external attrs
    dir.writeUInt32LE(offset, 42);

    central.push(dir, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, end]);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const files = collectFiles();
const zip = buildZip(files);

mkdirSync(DIST, { recursive: true });
const outFile = join(DIST, `chatbeauty-${manifest.version}.zip`);
writeFileSync(outFile, zip);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
console.log(`ChatBeauty ${manifest.version} → ${relative(ROOT, outFile)}`);
console.log(`  ${files.length} files · ${kb(zip.length)}`);
for (const file of files) console.log(`  · ${relative(ROOT, file)}`);
console.log('\nCài đặt: giải nén file zip → chrome://extensions → Load unpacked → chọn thư mục vừa giải nén.');
