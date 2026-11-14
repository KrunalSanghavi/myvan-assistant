// Content Security Policy for index.html (#64). GitHub Pages can't send headers, so the policy is a <meta> tag.
// The one inline script is allowed by its SHA-256 hash. Run `npm run csp` after editing the script;
// `npm run check` fails if the hash is stale. Origins are the approved network calls listed in CLAUDE.md.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const CONNECT = [
  "https://vpic.nhtsa.dot.gov", "https://api.nhtsa.gov",                                 // recalls
  "https://www.googleapis.com", "https://oauth2.googleapis.com",                         // cloud sync
  "https://generativelanguage.googleapis.com", "https://api.anthropic.com", "https://api.openai.com", "https://api.x.ai"   // AI answers
];

// Browsers hash the script after turning CRLF into LF, so do the same (Windows checkouts use CRLF).
export const scriptHash = html => {
  const m = html.match(/<script>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  return "sha256-" + createHash("sha256").update(m[1].replace(/\r\n?/g, "\n"), "utf8").digest("base64");
};

export const policy = hash => [
  "default-src 'self'",
  `script-src '${hash}'`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${CONNECT.join(" ")}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join("; ");

export const metaTag = hash => `<meta http-equiv="Content-Security-Policy" content="${policy(hash)}">`;
export const META_RE = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;

if (process.argv.includes("--write")) {
  const html = readFileSync("index.html", "utf8");
  const tag = metaTag(scriptHash(html));
  const out = META_RE.test(html) ? html.replace(META_RE, tag) : html.replace(/(<meta charset="utf-8">\r?\n)/i, `$1${tag}\n`);
  if (out === html) console.log("✓ CSP already up to date");
  else { writeFileSync("index.html", out); console.log("✓ CSP updated in index.html"); }
}
