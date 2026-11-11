---
name: ship-enhancement
description: Take one MyVan Assistant roadmap issue from backlog to an open pull request - branch, implement, test, verify, PR, roadmap tick. Use when asked to work on, build, or ship an issue or the next roadmap item.
---
# Ship an enhancement

Argument: an issue number. With none, pick the lowest-numbered open issue in the earliest open milestone labelled `agent-ready` and not `status:in-progress`.

1. **Claim**: `git checkout main && git pull`, then `git checkout -b feat/<N>-<short-slug>`. `gh issue edit <N> --add-label status:in-progress`.
2. **Build**: do it yourself or hand to the `enhancement-implementer` agent. Spec = the issue's acceptance checklist. Any product decision the issue doesn't settle goes back to the owner as a question.
3. **Verify**: `npm test` must pass. For anything visual, also open the demo van via Playwright and look (screenshot at phone width). Optionally run the `verifier` agent for an independent check.
4. **Roadmap**: tick the item in ROADMAP.md (`- [x]`) if this PR completes it.
5. **Commit and PR**: conventional commit (`feat: ... (#N)`), push, `gh pr create --fill --body` using `.github/pull_request_template.md` with `Closes #N` and the verification boxes filled honestly. Note anything needing a real-van check.
6. **Merge** once CI is green: `gh pr checks <PR> --watch`, then `gh pr merge <PR> --merge --delete-branch`. Fix and push if CI fails; never merge red.
7. **Next**: `git checkout main && git pull` before starting another issue. Never base one PR on another PR's branch.
If the issue is `needs-van`, build what you can, but leave the PR as draft and say exactly what the owner must check on the van.
