# Bani Flow — Agent Guide

Carnatic guru-shishya knowledge graph. Structured JSON data is rendered into a
self-contained `graph.html`. No server, no database, no framework.

This file is the **map**. The operating manual (CLI reference, workflows, data
model, open questions) lives in `carnatic/OPERATIONS.md`. Past discoveries live
in `carnatic/LEARNINGS.md` — grep on demand, never read at startup.

## Hard rules

1. **Venv**: activate the project venv (`source .venv/bin/activate` or
   `source .bani-flow/bin/activate` — whichever exists in this checkout) before
   any `bani-*` or `python3 carnatic/` command. Never use system `python3` or
   global `pip`.
2. **Context hygiene**: never read derived artefacts into context —
   `carnatic/graph.html` (~8 MB), `carnatic/data/graph.json` (~950 KB). Orient
   with `python3 carnatic/cli.py stats` and targeted `get-*` queries; reserve
   full reads of `musicians.json`/`compositions.json` for building a diff.
3. **Data/code separation**: `.json` data changes go through
   `carnatic/write_cli.py` (or an atomic Python script for uncovered
   operations) — never hand-edited when a verb exists. Code changes never touch
   data files.
4. **Render gate**: after any data or code change, run `bani-render` and
   `python3 carnatic/cli.py validate` before committing.

## Roles (pi skills)

Invoke directly, or let the harness match by description:

| Invoke | Role | Use when |
|---|---|---|
| `/skill:librarian` | 📚 Data curation | Adding/editing musicians, recordings, ragas, compositions, edges |
| `/skill:coder` | 🎵 Toolchain | Writing/fixing `.py` `.js` `.html` `.css` `.sh` |
| `/skill:tester` | 🧪 Regression guard | Writing/running pytest, render-gate integration tests |
| `/commit` | 🔱 Close session | Push-gate checklist and commit (`.pi/prompts/commit.md`) |

Skill definitions live in `.agents/skills/<role>/SKILL.md` (Agent Skills spec —
portable across harnesses). Schema changes don't need a persona: write
`plans/ADR-NNN-<slug>.md` (status Proposed → Accepted), get user approval, then
implement on a branch `adr/NNN-<slug>`.

## Session startup

1. Activate the project venv (`.venv` or `.bani-flow`)
2. `python3 carnatic/cli.py stats` to orient
3. Skim **Open questions** in `carnatic/OPERATIONS.md` (living memory of what is unresolved)

## Surgical fast-path

For a single-node/edge/field change or a one-line code fix: skip ceremony.
Make the change → `validate` (+ `bani-render` if data/render changed) → commit
to `main`. One-line commit message is acceptable for trivial data adds
(`data(node): add Trichur Brothers`). Leave the fast-path the moment a change
touches schema, adds a field, or spans multiple files.

## Commit protocol

```
<type>(<scope>): <imperative summary, ≤72 chars>

<body: what changed and why — one paragraph, plain prose; optional for trivial data adds>
[ADR: ADR-NNN]        ← only if applicable
```

**Type**: `data` `tool` `render` `schema` `chore` `audit` `test` `fix`
**Scope**: `node` `lineage` `recording` `composition` `toolchain` `config` `suite` `plans`

Branch only when a change is a new paradigm, schema shape, or independently
revertable unit; everything else goes to `main`. Full push gate: `/commit`.

## Memory

- **Open questions** (what's unresolved): end of `carnatic/OPERATIONS.md` —
  update when something is resolved or newly blocked. Resolved items move to
  `plans/open-questions-archive.md`.
- **Learning log** (`carnatic/LEARNINGS.md`): append a terse dated line **only
  when you hit a reusable pitfall or pattern** — not every session. Recall:
  `grep -in "<topic>" carnatic/LEARNINGS.md`.

## Reference

- Operating manual: `carnatic/OPERATIONS.md`
- Data schema: `carnatic/data/READYOU.md`; recordings: `carnatic/data/recordings/READYOU.md`
- Architectural decisions: `plans/ADR-*.md`
