// Static checks that need no browser: the inline script parses, and versions agree.
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const sw = readFileSync("sw.js", "utf8");
const fail = [];

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!scripts.length) fail.push("No inline <script> found in index.html");
for (const s of scripts) { try { new Function(s); } catch (e) { fail.push("index.html script does not parse: " + e.message); } }

const appVer = (html.match(/const APP_VERSION = "([\d.]+)"/) || [])[1];
const swVer = (sw.match(/const VERSION = "myvan-assistant-v([\d.]+)"/) || [])[1];
if (!appVer) fail.push('index.html is missing `const APP_VERSION = "x.y"`');
if (!swVer) fail.push('sw.js is missing `const VERSION = "myvan-assistant-vX.Y"`');
if (appVer && swVer && appVer !== swVer) fail.push(`Version mismatch: index.html APP_VERSION ${appVer} vs sw.js ${swVer}. Bump both together.`);

if (/tardis/i.test(html + sw)) fail.push("Old 'Tardis' branding found");
if (!/^<!doctype html>/i.test(html)) fail.push("index.html must start with <!doctype html> (otherwise the page renders in quirks mode)");
if (!/<meta name="viewport" content="width=device-width[^"]*">/.test(html)) fail.push('index.html is missing <meta name="viewport" content="width=device-width, ..."> (phones would show a shrunken desktop page)');
if (!/<meta charset="utf-8">/i.test(html)) fail.push('index.html is missing <meta charset="utf-8">');

if (fail.length) { console.error(fail.map(f => "✗ " + f).join("\n")); process.exit(1); }
console.log(`✓ static checks passed (version ${appVer})`);
