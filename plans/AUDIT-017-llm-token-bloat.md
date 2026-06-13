# AUDIT-017 — LLM Token Bloat in Instruction & Context Surfaces

**Date**: 2026-06-13
**Auditor**: 🔍 Code Auditor
**Status**: All findings (F1–F5) implemented

## Scope

Not a code-quality pass — a **context-economy** pass. Goal: reduce the number of
tokens sent to LLMs (Claude especially) per session, with focus on what is loaded
*automatically or by mandate* before any task begins, and on artifacts that can
blow the context window if read accidentally.

Surfaces examined: `CLAUDE.md`, `carnatic/.clinerules`, `.github/agents/*.agent.md`,
`.github/copilot-instructions.md`, the derived artifacts (`graph.json`, `graph.html`),
and `plans/`.

## Baseline (before this audit)

A cold session that obeys the session-startup checklist loaded **~45k tokens before
any work**:

| Source | Size | Load trigger |
|---|---|---|
| `carnatic/.clinerules` | 842 lines / **28,374 words (~37k tok)** | "**MUST** read at session start" |
| `CLAUDE.md` | 791 lines / **6,044 words (~8k tok)** | auto-loaded every session |
| 8 × `.agent.md` | 3,737 words | per active persona |
| `graph.json` / `graph.html` | **955 KB / 7.95 MB** | catastrophic if `Read` |

## Findings

### F1 — `.clinerules` conflates a stable manual with a 304-entry append-only log
- **File/lines**: `carnatic/.clinerules:397–842` (pre-split)
- **Pattern**: *Hot/cold data mixed in one mandated-read file.* Lines 1–396 are a
  stable operating manual (CLI reference, workflows, rules). Lines 397–842 are 304
  dated learning-log entries — write-often, read-almost-never-for-the-current-task
  (e.g. the 2026-05-16 entry is a ~200-word paragraph on writer internals).
- **Cost**: ~32k of the ~37k tokens were the cold archive, paid on every session.

### F2 — No guard against reading multi-MB derived artifacts
- **File/lines**: `carnatic/.clinerules:15` only said graph.html is "NEVER hand-edit"
- **Pattern**: *Missing context-hygiene boundary.* Nothing forbade `Read graph.json`
  (955 KB) or `Read graph.html` (8 MB) into LLM context. A single accidental read
  ≈ 200k–2M tokens.

### F3 — `CLAUDE.md` triple-encodes the same eight role definitions
- **File/lines**: `CLAUDE.md` — "Agent Personas" (~L60–520), "Agent Boundaries
  (Strict)" table (~L600–640), "Hard Rules (NEVER/MUST)" (~L645–740)
- **Pattern**: *Say-it-thrice redundancy.* Three encodings of the same per-agent
  rules, all auto-loaded. The Diagrammer Gruvbox init block and Git Fiend
  worktree-isolation tables are reference detail, not every-turn context.

### F4 — `CLAUDE.md` ↔ `.agent.md` duplication maintained by hand
- **File/lines**: `CLAUDE.md` GitHub-Copilot section — "update CLAUDE.md first, then
  sync the corresponding `.agent.md`"
- **Pattern**: *Two-copy drift hazard.* Full personas live in both places; alignment
  is a manual chore and a correctness risk.

### F5 — Eight-agent ceremony has no fast path for trivial work
- **File/lines**: `CLAUDE.md` "Session Startup Checklist"; `.clinerules:42–50`
- **Pattern**: *Fixed overhead regardless of task size.* A one-edge fix nominally
  triggers venv + read CLAUDE.md + read .clinerules + role ID + `cli.py stats` +
  render gate + learning-log append + commit protocol.

## Recommendations & status

| # | Action | Status |
|---|---|---|
| F1 | Split `.clinerules`: lean manual stays; 304 entries → `carnatic/LEARNINGS.md` (recall via `grep`, not read at startup) | ✅ **Done** |
| F2 | Add "Context hygiene — HARD RULE" forbidding `Read` of graph.json/graph.html; query via `cli.py`/grep | ✅ **Done** |
| F3 | Aggressively trim `CLAUDE.md` to: invocation index + one-line `owns/never` per agent + pointers to `.agent.md`. | ✅ **Done** |
| F4 | Make `.agent.md` the single home for full personas; `CLAUDE.md` keeps only the index. Dropped the "sync by hand" instruction. | ✅ **Done** |
| F5 | Add a "surgical fast-path" to `CLAUDE.md`: single-node/edge/line changes skip the startup checklist + learning-log mandate; validate + commit only. | ✅ **Done** |

### Measured results
- `.clinerules`: **28,374 → 3,526 words** (~37k → ~4.6k tokens); 304 entries
  preserved verbatim in `carnatic/LEARNINGS.md` (diff-verified, zero loss).
- `CLAUDE.md`: **791 → 169 lines / 6,044 → 1,323 words** (~8k → ~1.7k tokens).
  Three redundant encodings (Personas + Boundaries + Hard Rules) collapsed to one
  boundaries table; full personas now sourced only from `.github/agents/*.agent.md`.
- Artifact-read guard added to `.clinerules` + `CLAUDE.md`.
- Surgical fast-path added to `CLAUDE.md`.
- Learning-log destination updated across all 8 `.agent.md` files +
  `copilot-instructions.md` (`.clinerules` → `LEARNINGS.md`).
- **Cold-session load: ~45k → ~6.3k tokens** (~86% reduction).

## Aggressive CLAUDE.md restructuring spec (F3/F4 — for review)

Target shape (~250 lines, down from 791):

1. **Bani Flow — one-paragraph intro** (what the project is, the 8-agent model exists).
2. **Agent Invocation Index** — keep the existing table as-is.
3. **Boundaries** — single table: `Agent | Owns | Never touches | One-line principle`.
   Delete the long-form "Agent Personas" prose and the separate "Hard Rules" section
   (their content collapses into this table + the `.agent.md` files).
4. **Surgical fast-path** (new) — explicit license to skip ceremony for trivial edits.
5. **Commit protocol** — keep (it is genuinely referenced often), condense examples to one.
6. **Workflows A–H** — condense each to its step list; drop repeated rationale.
7. **Pointers** — "Full persona for agent X: `.github/agents/x.agent.md`. Operating
   manual: `carnatic/.clinerules`. Learnings archive: `carnatic/LEARNINGS.md`."

Net: full detail still exists, but is loaded **only when relevant** (the active
persona's `.agent.md`, or an on-demand grep), not pushed into every session.

## Routing

- **F3, F4, F5** → 🎵 Carnatic Coder owns `.md` files, so the `CLAUDE.md` and
  `.agent.md` edits are Coder tasks. None are schema changes → **no ADR required**;
  these are documentation/operating-surface edits. If the team wants the
  surgical-path policy ratified, 🏛️ Graph Architect could record it as a short ADR.
- **F1, F2** → already implemented; 🔱 Git Fiend to commit (branch:
  `refactor/clinerules-token-diet` — structural change to the curation loop's
  read surface, warrants a branch + review per Git Fiend protocol rule 1).
