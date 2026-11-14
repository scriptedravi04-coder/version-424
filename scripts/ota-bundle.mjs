// v336: after `vite build`, pack the web build for the iPhone app's live update (backend/appUpdate.ts).
// Writes dist/client/ota/bundle-<version>.zip + dist/client/ota/latest.json. Version = hash of the files, so the
// app only downloads when something really changed. Never fails the deploy (any problem → a warning, exit 0).
// No packages needed (Node's zlib + a tiny zip writer).
import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";

const ROOT = process.cwd();
const DIST = fs.existsSync(path.join(ROOT, "dist", "client", "index.html")) ? path.join(ROOT, "dist", "client") : path.join(ROOT, "dist");
const OUT = path.join(DIST, "ota");
// Not needed inside the iPhone app: the website landing page photos, older OTA zips, the service worker.
const SKIP = [/^ota\//, /^landing\//, /^splash\//, /^sw\.js$/, /^workbox-.*\.js$/, /^registerSW\.js$/, /\.map$/];

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function walk(dir, base = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (SKIP.some((r) => r.test(rel))) continue;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}

export function zipFiles(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = comp.length < data.length;
    const body = useDeflate ? comp : data;
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(useDeflate ? 8 : 0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(useDeflate ? 8 : 0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

function main() {
  if (!fs.existsSync(path.join(DIST, "index.html"))) { console.warn("[ota] no web build found — skipped"); return; }
  const files = walk(DIST);
  const hash = crypto.createHash("sha256");
  const entries = files.map((name) => {
    const data = fs.readFileSync(path.join(DIST, name));
    hash.update(name).update(data);
    return { name, data };
  });
  const version = `1.0.0-w${hash.digest("hex").slice(0, 12)}`;
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/^bundle-.*\.zip$/.test(f)) fs.rmSync(path.join(OUT, f));
  const file = `bundle-${version}.zip`;
  const zip = zipFiles(entries);
  fs.writeFileSync(path.join(OUT, file), zip);
  // v367 fix (Ravi: "webapp update Android app mein nahi aa raha"): the live-update plugin (@capgo 7.x) refuses to
  // download a bundle without its SHA-256 checksum ("Checksum required"), so every app stayed on its built-in screens.
  const checksum = crypto.createHash("sha256").update(zip).digest("hex");
  fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify({ version, file, checksum, files: entries.length, bytes: zip.length, built_at: new Date().toISOString() }, null, 2));
  console.log(`[ota] ${file} — ${entries.length} files, ${(zip.length / 1048576).toFixed(1)} MB`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try { main(); } catch (e) { console.warn("[ota] skipped:", e?.message || e); }
  process.exitCode = 0;
}
