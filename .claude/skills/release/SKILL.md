---
name: release
description: Cut a MyVan Assistant release - bump APP_VERSION and the service worker VERSION, tag, publish GitHub release, close the milestone. Use when asked to release, ship a version, or tag.
---
# Release

1. Confirm with the owner which version (e.g. `2.1`) and that merged work is what they want to ship. `gh issue list --milestone <m> --state open` shows what's left; `needs-van` items may stay open.
2. On a branch `release/vX.Y`: set `const APP_VERSION = "X.Y"` in index.html and `const VERSION = "myvan-assistant-vX.Y"` in sw.js. `npm test`.
3. PR `chore: release vX.Y`, merge after the owner approves.
4. On updated main: `git tag vX.Y && git push origin vX.Y`. The Release workflow re-runs tests, checks the tag matches APP_VERSION, and publishes notes.
5. Close the milestone if everything in it is done: `gh api -X PATCH repos/KrunalSanghavi/myvan-assistant/milestones/<n> -f state=closed`.
Bumping VERSION is what makes installed copies drop their old cache, so never skip step 2.
