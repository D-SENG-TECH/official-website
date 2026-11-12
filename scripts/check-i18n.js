// Verify every language file has exactly the same key structure as zh-tw.json.
import { readFileSync } from "node:fs";

const dir = new URL("../src/_data/i18n/", import.meta.url);
const load = (code) => JSON.parse(readFileSync(new URL(`${code}.json`, dir), "utf8"));

function shape(value, path, out) {
  if (Array.isArray(value)) {
    out.add(`${path}[${value.length}]`);
    value.forEach((v, i) => shape(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) shape(v, path ? `${path}.${k}` : k, out);
  } else {
    out.add(`${path}:${value === null ? "null" : typeof value}`);
  }
  return out;
}

const source = shape(load("zh-tw"), "", new Set());
let failed = false;
for (const code of ["zh-cn", "en", "ja"]) {
  const target = shape(load(code), "", new Set());
  const missing = [...source].filter((p) => !target.has(p));
  const extra = [...target].filter((p) => !source.has(p));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`✗ ${code}: ${missing.length} missing, ${extra.length} extra`);
    missing.slice(0, 10).forEach((p) => console.error(`  - ${p}`));
    extra.slice(0, 10).forEach((p) => console.error(`  + ${p}`));
  } else {
    console.log(`✓ ${code}`);
  }
}
process.exit(failed ? 1 : 0);
