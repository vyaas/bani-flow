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

Invoke directly (`/skill:bani-librarian`), or with the `$` sigil
(`$bani-librarian`, pi-multi-skills), or let the harness match by description:

| Invoke | Role | Use when |
|---|---|---|
| `/skill:bani-librarian` | 📚 Data curation | Adding/editing musicians, recordings, ragas, compositions, edges |
| `/skill:bani-coder` | 🎵 Toolchain | Writing/fixing `.py` `.js` `.html` `.css` `.sh` |
| `/skill:bani-tester` | 🧪 Regression guard | Writing/running pytest, render-gate integration tests |
| `/skill:bani-flow-panel` | 🎛️ Bani-flow panel | Changing the left panel/listening trail, its subject chips, filters, rows, playlists, or lecdem strip — map: `carnatic/render/UIMAP.md` §1 |
| `/skill:bani-musician-panel` | 🎛️ Musician panel | Changing the right panel, musician header/lineage, recordings list, filters, or sections — map: `carnatic/render/UIMAP.md` §2 |
| `/skill:bani-graph-view` | 🎛️ Guru-shishya view | Changing the Cytoscape canvas, layouts, filters, labels, or graph interactions — map: `carnatic/render/UIMAP.md` §3 |
| `/skill:bani-wheel` | 🎛️ Mela-janya view | Changing the raga wheel, its cards/annotations/sync, or app view switching — map: `carnatic/render/UIMAP.md` §4 |
| `/skill:bani-player` | 🎛️ Media player | Changing player chrome, queue, playlist bar/editor, docking, or grand track search — map: `carnatic/render/UIMAP.md` §5 |
| `/skill:bani-commit` (`/commit` alias) | 🔱 Git closeout | Auditing the worktree, running validation gates, creating a well-formed commit, and pushing safely |

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
**Scope (render type, ADR-174)**: `bani-panel` `musician-panel` `graph-view` `wheel` `player` `theme`

Branch only when a change is a new paradigm, schema shape, or independently
revertable unit; everything else goes to `main`. Full push gate:
`/skill:bani-commit` (also available through the `/commit` alias).

## Memory

- **Open questions** (what's unresolved): end of `carnatic/OPERATIONS.md` —
  update when something is resolved or newly blocked. Resolved items move to
  `plans/open-questions-archive.md`.
- **Learning log** (`carnatic/LEARNINGS.md`): append a terse dated line **only
  when you hit a reusable pitfall or pattern** — not every session. Recall:
  `grep -in "<topic>" carnatic/LEARNINGS.md`.

## Reference

- Operating manual: `carnatic/OPERATIONS.md`
- UI surface map (five graphical elements → code): `carnatic/render/UIMAP.md`
- Data schema: `carnatic/data/READYOU.md`; recordings: `carnatic/data/recordings/READYOU.md`
- Architectural decisions: `plans/ADR-*.md`
