// v338: AI Studio imports at most 1,000 files from GitHub, so the 187 test files travel packed in ONE file,
// dev/tests.tgz (same paths inside). Before testing: `npm run tests:unpack`. After adding / changing tests:
// `npm run tests:pack` (writes dev/tests.tgz again and removes the loose test files so the repo stays small).
// Loose *.test.* files are in .gitignore, so they never get pushed by accident.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ARCHIVE = path.join(ROOT, "dev", "tests.tgz");
const mode = process.argv[2];

function listTests(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git", "dev"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listTests(p, out);
    else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(e.name)) out.push(path.relative(ROOT, p));
  }
  return out;
}

if (mode === "unpack") {
  if (!fs.existsSync(ARCHIVE)) { console.log("No dev/tests.tgz — nothing to unpack."); process.exit(0); }
  execFileSync("tar", ["-xzf", ARCHIVE, "-C", ROOT], { stdio: "inherit" });
  console.log(`Unpacked ${listTests(ROOT).length} test files.`);
} else if (mode === "pack") {
  const files = listTests(ROOT).sort();
  if (!files.length) { console.log("No loose test files — dev/tests.tgz left as it is."); process.exit(0); }
  fs.mkdirSync(path.dirname(ARCHIVE), { recursive: true });
  const listFile = path.join(ROOT, "dev", ".tests-list.txt");
  fs.writeFileSync(listFile, files.join("\n") + "\n");
  execFileSync("tar", ["-czf", ARCHIVE, "-C", ROOT, "-T", listFile], { stdio: "inherit" });
  fs.unlinkSync(listFile);
  for (const f of files) fs.unlinkSync(path.join(ROOT, f));
  console.log(`Packed ${files.length} test files into dev/tests.tgz and removed the loose copies.`);
} else {
  console.log("Usage: node scripts/tests-archive.mjs unpack|pack");
  process.exit(1);
}
