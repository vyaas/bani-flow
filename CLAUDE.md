# Bani Flow: Multi-Agent Development Guide

This is the **map**, not the manual. Eight specialist agents maintain the Carnatic
guru-shishya knowledge graph under strict domain boundaries. Each agent's **full
persona** (responsibilities, principles, hard rules) lives in its own self-contained
file in `.github/agents/<slug>.agent.md` — load only the one you are playing. The
day-to-day **operating manual** (CLI reference, workflows, data model) lives in
`carnatic/.clinerules`. Accumulated discoveries live in `carnatic/LEARNINGS.md`
(recall on demand, not at startup).

> **Why this file is short:** it is loaded into *every* session. Detail that is only
> needed when a specific agent is active, or only when a specific task runs, belongs
> in the per-agent `.agent.md` or in `.clinerules` — not here. See
> `plans/AUDIT-017-llm-token-bloat.md` for the rationale.

---

## Agent Invocation Index

| Invoke with | Agent | Persona file | Use when |
|---|---|---|---|
| `#Librarian` | 📚 Librarian | `librarian.agent.md` | Adding/editing musicians, recordings, compositions |
| `#Coder` | 🎵 Carnatic Coder | `carnatic-coder.agent.md` | Writing/fixing Python/JS/HTML/CSS/shell |
| `#Architect` | 🏛️ Graph Architect | `graph-architect.agent.md` | Designing schema, writing ADRs |
| `#Auditor` | 🔍 Code Auditor | `code-auditor.agent.md` | Scanning for bloat, redundancy, simplification |
| `#Tester` | 🧪 Test Engineer | `test-engineer.agent.md` | Writing/running unit + integration tests |
| `#Diagrammer` | 📐 Diagrammer | `diagrammer.agent.md` | Producing Mermaid architecture/flow diagrams |
| `#Orchestrator` | 🪃 Orchestrator | `orchestrator.agent.md` | Coordinating multi-agent tasks |
| `#GitFiend` | 🔱 Git Fiend | `git-fiend.agent.md` | Committing, branching, pushing, closing a session |

Persona files live in `.github/agents/`. They are the **single source of truth** for
each agent's full spec — there is no separate copy to keep in sync.

---

## Boundaries (Strict)

Each agent owns a layer and never crosses into another's. One line per agent; the
full hard-rule list is in each persona file.

| Agent | Owns (may edit) | Never touches | Governing principle |
|---|---|---|---|
| 📚 Librarian | `*.json` data via `write_cli.py` / `apply_diff` | `.py` `.html` `.js`; never hand-types JSON | Significance > completeness; never guess lineage, never rename an ID, never add a node without a Wikipedia URL |
| 🎵 Carnatic Coder | `.py` `.js` `.html` `.css` `.md` `.sh` | any `.json` data file (write a script instead) | Data and code are separate; stateless functions; never skip the render gate |
| 🏛️ Graph Architect | `plans/*.md` ADRs | data files, code files | No schema change without an ADR; mark status Proposed/Accepted/Superseded |
| 🔍 Code Auditor | `plans/AUDIT-*.md` reports | every source file | Observe and report with evidence (file/line/pattern); route, never implement |
| 🧪 Test Engineer | `carnatic/tests/` | source code, JSON data | When a test fails the Coder fixes the code, never the test |
| 📐 Diagrammer | `plans/DIAGRAM-*.md` | every source file | One stated purpose per diagram; `elk` layout + Gruvbox Hard Dark only |
| 🪃 Orchestrator | nothing (delegates) | all implementation | Never do the work; route to the right agent; always end with a Git Fiend handoff |
| 🔱 Git Fiend | git operations only | data, code, ADRs | Branch before you lose optionality; never accept an empty commit body; verify the render gate |

**Cross-boundary rule:** each agent commits and pushes its own work — never batch
changes across agent boundaries into one commit.

---

## Surgical fast-path (trivial changes)

The full ceremony (startup checklist → role framing → render gate → learning-log
append → branch decision) exists for **substantive** work: schema changes,
multi-file refactors, new write surfaces, anything reversible-as-a-unit.

For a **single surgical change** — one node, one edge, one field, a one-line code
fix with no schema implication — skip the ceremony:

1. Activate venv (`source .venv/bin/activate`) if you need a `bani-*` command.
2. Make the change via the correct tool (`write_cli.py` for data, an edit for code).
3. Validate: `python3 carnatic/cli.py validate` (data) and `bani-render` if data/render changed.
4. Commit with a well-formed message → `main` is fine (no branch needed).

No `cli.py stats` orientation, no learning-log entry required for trivial edits.
**Leave the fast-path** the moment the change touches schema (`plans/ADR-*.md`),
adds a field, or spans multiple files — then use the full workflow below.

---

## Context hygiene (LLM token cost)

- **Never `Read` derived artefacts**: `graph.html` (~8 MB), `graph.json` (~950 KB).
  Query via `python3 carnatic/cli.py ...` or `grep`. One full read ≈ 200k+ tokens.
- **Orient with the CLI, not full reads**: `cli.py stats`, `get-musician <id>`, the
  existence checks. Reserve a full read of `musicians.json` / `compositions.json`
  for the moment you actually need to build an `apply_diff`.
- Full detail of these rules: `carnatic/.clinerules` → "Context hygiene — HARD RULE".

---

## Commit Protocol

Every agent commits and pushes its own work at the end of its step. Git Fiend runs
the final session-closing push gate.

```
<type>(<scope>): <imperative summary, ≤72 chars>

<body: what changed and why — one paragraph, plain prose>
[ADR: ADR-NNN, ADR-MMM]    ← only if applicable
[AGENTS: <comma-separated agent slugs>]
```

**Type**: `data` `tool` `render` `schema` `chore` `audit` `test` `diagram` `fix` `branch`
**Scope**: `node` `lineage` `recording` `composition` `toolchain` `config` `report` `suite` `plans`

```
data(node): add Akkarai Subbulakshmi violin, contemporary

Born 1988, trained under Akkarai Swaminathan (father). 69 YouTube entries
across 1999–2024, raga/composition/year tagged.
[AGENTS: librarian]
```

Branch decision, push-gate checklist, and workspace-isolation protocol: see
`git-fiend.agent.md`.

---

## Workflows

Each agent commits its own step; the Orchestrator ends every workflow with a Git
Fiend handoff. Full step detail (CLI invocations, pre-checks) is in `.clinerules`.

- **A — Add a musician**: Librarian `add-musician` → Coder `bani-render` → Git Fiend commits (data-only → `main`).
- **B — Add a recording**: Librarian runs YouTube pre-checks (`url-exists`, `musician-exists`, `raga-exists`, `composition-exists`) → `add-youtube` → Coder renders → Git Fiend commits.
- **C — New toolchain script**: Coder writes + tests → Git Fiend (new paradigm → branch; surgical → `main`).
- **D — Schema change**: Architect writes ADR → user approves → Librarian + Coder implement in parallel → Coder renders → Git Fiend **branches** `adr/NNN-slug`, opens PR.
- **E — Git Fiend handoff**: closes every workflow (isolation check → branch decision → push gate).
- **F — Code audit**: Auditor writes `plans/AUDIT-NNN-*.md`, routes findings → Architect (schema) / Coder (code) → Git Fiend.
- **G — Test coverage**: Tester writes/runs `pytest`; failures route to Coder (Coder fixes code, never the test) → Git Fiend.
- **H — Diagram**: Diagrammer writes `plans/DIAGRAM-NNN-*.md` (elk + Gruvbox) → Git Fiend (doc-only → `main`).

---

## Session Startup Checklist

1. `source .venv/bin/activate` (once per shell) — required for all `bani-*` and `python3 carnatic/` commands.
2. Read this file (the map) and your agent's `.github/agents/<slug>.agent.md` (the manual for your role).
3. Read `carnatic/.clinerules` **Open questions** section (living memory of what's unresolved).
4. Orient with `python3 carnatic/cli.py stats` — not by reading the JSON files (Librarian/Coder).
5. If your change is trivial, take the **surgical fast-path** above; otherwise follow the matching workflow.

Recall past discoveries on demand: `grep -in "<topic>" carnatic/LEARNINGS.md`.

---

## GitHub Copilot

- **Accept** Copilot suggestions in `.py` `.js` `.html` `.css` `.sh` (verify against the "stateless functions" principle).
- **Decline** any Copilot edit to a `.json` data file — route to the Librarian.
- **Verify** commit-message suggestions match the type/scope vocabulary above.
- Activate a persona with `#AgentSlug` in Copilot Chat, or pick its `.agent.md` from the agent button. Reliable only with Claude-backed models. If `#AgentName` fails, check `.github/copilot-instructions.md` points here.

---

## Reference

- **Operating manual** (CLI, workflows, data model): `carnatic/.clinerules`
- **Per-agent full personas**: `.github/agents/*.agent.md`
- **Discoveries archive** (grep on demand): `carnatic/LEARNINGS.md`
- **Data schema**: `carnatic/data/READYOU.md`; recordings: `carnatic/data/recordings/READYOU.md`
- **Architectural decisions**: `plans/ADR-*.md`
- **Self-replicating curation loop**: `plans/ADR-085.md`
- **Token-economy rationale**: `plans/AUDIT-017-llm-token-bloat.md`

---

Eight agents, strict boundaries, shared learning. Librarians curate data, Coders
build tools, Architects design schema, Auditors trim fat, Testers guard against
regressions, Diagrammers make structure visible, Orchestrators delegate, Git Fiend
closes every session. Load your persona file for the details. Welcome to the project.
