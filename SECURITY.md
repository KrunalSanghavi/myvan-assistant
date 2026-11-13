# Security

MyVan Assistant is a static web app with no server. Your data stays on your device, unless you choose cloud sync (your own Google Drive) or ask an AI provider with your own key. The approved network calls are listed in [CLAUDE.md](CLAUDE.md).

## Reporting a problem

Please don't open a public issue for a security problem. Use **Security → Report a vulnerability** on this repository (private), or contact the owner through their GitHub profile.

## What's checked automatically

Every pull request, every push to `main`, and a weekly run (`.github/workflows/security.yml`):

| Check | Tool | What it covers |
|---|---|---|
| SAST | GitHub CodeQL, `security-extended` queries | The app's JavaScript (including the inline script in `index.html`) and the GitHub Actions workflows |
| Dependencies | `npm audit`, Dependabot | Dev tooling (the app itself has no runtime dependencies) and pinned Actions |
| Secrets | gitleaks | Full git history |
| DAST | OWASP ZAP baseline (passive) | The app served from the commit, plus the live site weekly |
| Hardening | `npm run check` | A Content Security Policy that only allows the approved origins. The inline script is allowed by its hash, there are no external scripts, and `eval` isn't used |

Accepted ZAP findings and the reason for each are in `.zap/rules.tsv`. GitHub Pages doesn't let us set response headers, so header-only protections are covered by the `<meta>` policy where browsers allow it.
