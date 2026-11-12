// Page numbers for the printed company profile's table of contents, measured per language.
//
// Browsers can't fill in TOC page numbers themselves (CSS target-counter is unsupported in
// Chrome/Safari). So after a build, this prints each language's /profile/ to an A4 PDF with
// headless Chrome, reads the page of every section anchor from the PDF's named destinations
// (`pdfinfo -dests`), and writes src/_data/profile_toc.json; the second build puts the numbers
// into the TOC. Each language is measured from its own layout, so longer translations get their
// own page numbers. The deploy workflow runs build → this script → build, so the numbers always
// match the published layout.
//
// Local:  npx @11ty/eleventy && node scripts/profile-toc.mjs && npx @11ty/eleventy
// Needs Google Chrome (CHROME_BIN to override the path) and poppler's pdfinfo. No npm packages.
import { createServer } from "node:http";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, extname, normalize } from "node:path";
import { existsSync } from "node:fs";

const run = promisify(execFile);
const root = new URL("../", import.meta.url).pathname;
const site = join(root, "_site");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".webm": "video/webm", ".mp4": "video/mp4" };

const chrome = process.env.CHROME_BIN || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
].find(existsSync);
if (!chrome) throw new Error("Google Chrome not found; set CHROME_BIN");

const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (path.endsWith("/")) path += "index.html";
  try {
    const body = await readFile(join(site, path));
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;

const langs = { "zh-tw": "/profile/", "zh-cn": "/zh-cn/profile/", en: "/en/profile/", ja: "/ja/profile/" };
const dir = await mkdtemp(join(tmpdir(), "profile-toc-"));
const out = {};
try {
  for (const [code, path] of Object.entries(langs)) {
    const pdf = join(dir, `${code}.pdf`);
    await run(chrome, [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
      `--user-data-dir=${join(dir, "profile")}`,
      "--window-size=1440,900",
      "--virtual-time-budget=15000", // let web fonts load before printing
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdf}`,
      base + path,
    ], { timeout: 120000 });
    const pages = {};
    for (const line of execFileSync("pdfinfo", ["-dests", pdf], { encoding: "utf8" }).split("\n")) {
      const m = line.match(/^\s*(\d+)\s+\[.*\]\s+"(pf-[^"]+)"/);
      if (m) pages[m[2]] = Number(m[1]);
    }
    if (!pages["pf-contact"]) throw new Error(`${code}: no section anchors found in the PDF`);
    out[code] = pages;
    console.log(code, JSON.stringify(pages));
  }
} finally {
  server.close();
  await rm(dir, { recursive: true, force: true });
}
await writeFile(join(root, "src/_data/profile_toc.json"), JSON.stringify(out, null, 2) + "\n");
