// Golden fixtures for the Android app (#85). Loads index.html in a browser, runs the real JS
// (PARAMS decoders, parseMsgs, FIND_SAFE, demo.emulate) and writes what it produced as JSON.
// The Kotlin tests check that their ports give the same answers. Run `npm run fixtures` after
// changing PARAMS, parseMsgs, FIND_SAFE or the demo van; CI fails if the files are stale.
// Math.random and performance.now are replaced by a seeded generator and a fake clock, so the
// output is the same on every run.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const OBD = resolve(root, "android/core/obd/src/test/resources/fixtures");
const DEMO = resolve(root, "android/core/testing/src/main/resources/demo-van.json");

const browser = await chromium.launch({ channel: process.env.CI ? undefined : (process.env.PW_CHANNEL || "chrome") });
const page = await browser.newPage();
await page.goto(pathToFileURL(resolve(root, "index.html")).href);
await page.waitForFunction(() => typeof PARAMS !== "undefined" && typeof demo !== "undefined");

const out = await page.evaluate(() => {
  // Seeded random (mulberry32) and a clock the script moves by hand.
  let seed = 85, clock = 0;
  Math.random = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  performance.now = () => clock;
  const val = v => (Number.isFinite(v) ? v : null);

  // 1. PID decoders: the standard PID and any alternative PID each parameter can be read from.
  const pids = [];
  const fixed = [[0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE], [0x80, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00], [0x7F, 0xFF, 0x01, 0x02, 0x03, 0x04, 0x05], [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]];
  const add = (key, pid, n, f, enc, g, extra = []) => {
    const inputs = [Array(n).fill(0), Array(n).fill(0xFF), ...fixed.map(b => b.slice(0, n)), ...extra];
    if (enc && g) for (const v of [g[0], (g[0] + g[1]) / 2, g[1], g[0] + (g[1] - g[0]) * 0.37]) inputs.push(enc(v));
    const seen = new Set(), samples = [];
    for (const bytes of inputs) { const k = bytes.join(","); if (seen.has(k)) continue; seen.add(k); samples.push({ bytes, value: val(f(bytes)) }); }
    pids.push({ key, pid, n, samples });
  };
  for (const p of PARAMS) {
    if (p.pid == null || !p.f) continue;
    add(p.key, p.pid, p.n, p.f, p.enc, p.g);
    if (p.alt != null) add(p.key, p.alt, p.altN || p.n, p.altF || p.f, p.altEnc || p.enc, p.g,
      p.altF ? [[0x02, 0x50, 0x60], [0x04, 0x10, 0x20, 0x30, 0x40], [0x02, 0x50], [0x00, 0x30, 0x40, 0x50, 0x60]] : []);
  }
  pids.sort((a, b) => a.pid - b.pid);

  // 2. Raw ELM replies through parseMsgs. Hand-written cases plus the demo van's own multi-frame VIN.
  const raws = [
    "41 0C 0A C4", "410D3A", "41 05 7B \r\r", "SEARCHING...\r41 00 BE 3F A8 13", "BUS INIT: ...OK\r41 00 BE 3F A8 13",
    "NO DATA", "SEARCHING...\rNO DATA", "UNABLE TO CONNECT", "SEARCHING...\rUNABLE TO CONNECT", "CAN ERROR", "?", "STOPPED", "BUS BUSY", "BUFFER FULL",
    "41 00 BE 3F A8 13\r41 00 00 18 00 00", "7E8 06 41 00 BE 3F A8 13\r7E9 06 41 00 00 18 00 00",
    "014\r0: 49 02 01 35 46 4E\r1: 52 4C 36 48 39 58 4A\r2: 42 44 45 4D 4F 30 31",
    "00A\r0:43040456\r1:0174000000", "0:490201\r1:3546",
    "43 01 04 56\r43 00", "7F 22 31", "7F 22 78\r62 F1 90 41", "ELM327 v1.5", "OK", "12.4V", "41 0C 0A C", "41 0c 0a c4", "\r\r"
  ];
  demo.t0 = 0;
  for (const c of ["0902", "0100", "03", "07", "0A", "0600", "0605", "020C00", "010C"]) raws.push(demo.emulate(c));
  const transcripts = raws.map(raw => { try { return { raw, msgs: parseMsgs(raw).map(m => m.bytes) }; } catch (e) { return { raw, error: e.message }; } });

  // 3. The finder's read-only allowlist, with examples it must accept and refuse.
  const cand = ["22F190", "222202", "220000", "22FFFF", "2100", "21FF", "1A87", "1A9B", "1902FF", "190208",
    "2E F190", "2EF19000", "3101FF00", "1003", "1001", "04", "1101", "14FFFFFF", "2701", "22F19", "22F1900", "21F", "1902", "19020", "1A", "1903FF", "22f190", "ATMA", "ATPP0CSV", "0100", "03", ""];
  const findSafe = { source: FIND_SAFE.source, accept: cand.filter(c => FIND_SAFE.test(c)), reject: cand.filter(c => !FIND_SAFE.test(c)) };

  // 4. The demo van for the Android fake transport: setup answers, then every live PID once a second over one 70-second loop.
  demo.t0 = 0; demo.cleared = false; demo.engineOff = false; demo.silent = false; demo.p29 = false; demo.hdr = undefined; clock = 0;
  const init = {};
  for (const c of ["ATZ", "ATI", "ATDPN", "ATDP", "0902", "0101", "03", "07"]) init[c] = demo.emulate(c);
  for (let b = 0; b <= 0xC0; b += 0x20) init["01" + hex2(b)] = demo.emulate("01" + hex2(b));
  const live = [...demo.sup].filter(p => p % 0x20 && p !== 1).sort((a, b) => a - b);
  const series = { ATRV: [] };
  for (const p of live) series["01" + hex2(p)] = [];
  for (let s = 0; s < 70; s++) {
    clock = s * 1000;
    for (const k of Object.keys(series)) series[k].push(demo.emulate(k));
  }
  return { pids, transcripts, findSafe, demoVan: { source: "index.html demo.emulate(), seeded", periodSec: 70, init, series } };
});
await browser.close();

// One entry per line keeps diffs readable.
const pretty = d => Array.isArray(d) ? "[\n" + d.map(x => JSON.stringify(x)).join(",\n") + "\n]"
  : "{\n" + Object.entries(d).map(([k, v]) => JSON.stringify(k) + ": " + (v && typeof v === "object" && !Array.isArray(v) ? pretty(v) : JSON.stringify(v))).join(",\n") + "\n}";
const write = (file, data) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, pretty(data) + "\n"); };
write(resolve(OBD, "pids.json"), out.pids);
write(resolve(OBD, "transcripts.json"), out.transcripts);
write(resolve(OBD, "find_safe.json"), out.findSafe);
write(DEMO, out.demoVan);
console.log(`✓ fixtures: ${out.pids.length} PID decoders, ${out.transcripts.length} transcripts, ${out.findSafe.accept.length} + ${out.findSafe.reject.length} finder examples, demo van with ${Object.keys(out.demoVan.series).length} series`);
