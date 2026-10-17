---
description: Close the session — push gate, well-formed commit, push
argument-hint: "[type(scope): summary]"
---

Close out this session's work. $ARGUMENTS

Run the push gate in order:

1. `git status --short` — if there are files whose provenance you can't explain, stop and ask.
2. If any data (`.json`) or code changed: confirm `bani-render` has been run since the last change; run it now if not.
3. If data changed: `python3 carnatic/cli.py validate` must pass.
4. If source code changed and the suite covers it: `pytest carnatic/tests/ -v` must pass.
5. If a genuinely reusable pitfall or pattern was discovered this session, append one terse dated line to `carnatic/LEARNINGS.md`. Otherwise skip.
6. If an open question was resolved or newly blocked, update `carnatic/OPERATIONS.md` (resolved items move to `plans/open-questions-archive.md`).

Then commit and push:

- **Trivial data add** (single node/edge/recording, no schema implication): one-line message is fine, commit to `main`.
- **Everything else** uses the full format:

```
<type>(<scope>): <imperative summary, ≤72 chars>

<what changed and why — one paragraph, plain prose>
[ADR: ADR-NNN]   ← if applicable
```

Types: `data` `tool` `render` `schema` `chore` `audit` `test` `fix`.
Scopes: `node` `lineage` `recording` `composition` `toolchain` `config` `suite` `plans`.

- Branch only for a new paradigm, schema change, or independently revertable unit (`adr/NNN-slug`, `feature/<slug>`, `data/<slug>`). Everything else → `main`.
- Never push an empty commit body on a non-trivial change.
