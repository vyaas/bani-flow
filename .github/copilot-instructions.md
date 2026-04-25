This project uses a multi-agent protocol defined in CLAUDE.md at the repo root.
When the user invokes #Librarian, #Architect, #Coder, #Orchestrator, or #GitFiend,
adopt that agent's persona, constraints, and commit protocol exactly as defined there.

# Bani Flow — Copilot Workspace Instructions

Carnatic guru-shishya knowledge graph. Single-page app rendered from structured JSON into a self-contained `graph.html`. Four specialist agents with strict domain boundaries.

**Read first**: [CLAUDE.md](../CLAUDE.md) (agent personas, hard rules, commit protocol) and [carnatic/.clinerules](../carnatic/.clinerules) (living operating manual, open questions, learning logs).

---

## Agents and ownership

| Agent | Owns | Never touches |
|---|---|---|
| Librarian | `carnatic/data/**/*.json` | Code files (`.py`, `.js`, `.html`) |
| Carnatic Coder | `carnatic/**/*.py`, `carnatic/render/templates/**`, `.github/**` | JSON data files directly |
| Graph Architect | `plans/ADR-*.md` | Data files, code files |
| Orchestrator | Delegation only | Implementation |

When in doubt about which agent to invoke, read the CLAUDE.md Orchestrator section.

---

## Build and test

```bash
# One-time setup
pip install -e .

# Render graph.html from data (required after any data change)
bani-render                          # output: carnatic/graph.html

# Serve locally (YouTube embeds need a real origin, not file://)
bani-serve                           # http://localhost:8765/graph.html

# Validate data integrity
python3 carnatic/cli.py validate

# Orientation stats
python3 carnatic/cli.py stats
```

**Render gate**: `bani-render` must run after any data change before CLI queries or the browser reflect it.

---

## Architecture

- **`carnatic/data/graph.json`** — single source of truth (synced from per-entity files on render)
- **`carnatic/render/`** — render pipeline: `_main.py` → `data_loaders` → `data_transforms` → `graph_builder` → `html_generator` reads templates from `carnatic/render/templates/` and inlines everything into a single self-contained HTML file
- **`carnatic/graph.html`** — build artifact; do not edit by hand
- **`carnatic/cli.py`** — read-only queries against `graph.json`
- **`carnatic/write_cli.py`** — Librarian mutations (add-musician, add-edge, add-youtube, etc.)

---

## GitHub Pages

The workflow at [`.github/workflows/deploy-pages.yml`](./workflows/deploy-pages.yml):
- Triggers on push to `main` when `carnatic/data/**`, `carnatic/render/**`, or `pyproject.toml` change, or manually via `workflow_dispatch`
- Installs `bani-flow`, runs `bani-render`, copies `carnatic/graph.html` → `_site/index.html`
- Deploys to `https://vyaas.github.io/bani_flow/` via OIDC (no secrets needed)

**One-time repo setup**: Settings → Pages → Source = "GitHub Actions".

---

## Key conventions

- **Never edit JSON data files by hand** — use `carnatic/write_cli.py` commands or `apply_diff`
- **Every musician node requires a Wikipedia URL** — no exceptions
- **Commit format**: `type(scope): imperative summary` — see CLAUDE.md Commit Protocol
- **Learning logs** go only in `carnatic/.clinerules`, never here or in CLAUDE.md
- Schema changes require an ADR in `plans/` before any implementation

---

## Parallel agent sessions — workspace isolation

**Local agent mode (Chat → Agent) has NO branch isolation.** All sessions share the same working directory and branch. Running two agents simultaneously in local mode will cause silent file conflicts.

**For parallel autonomous tasks**, use Copilot CLI sessions with Worktree isolation:
1. Open Chat → `New Chat (+)` → select **Copilot CLI** → choose **Worktree** isolation
2. Each worktree session gets a `copilot/`-prefixed branch in an isolated directory
3. Multiple sessions can run in parallel without conflicting

**Git Fiend must always run the workspace isolation check first**:
```bash
git branch --show-current   # copilot/* prefix = isolated; anything else = shared workspace
git worktree list            # reveals any other active agent worktrees
git status --short           # unexpected changes = stop and confirm provenance
```

If not in a `copilot/*` branch and multiple worktrees exist: **stop, do not commit until the user confirms which session owns each changed file.**

---

## Reference docs

| Topic | File |
|---|---|
| Agent personas, hard rules, workflows | [CLAUDE.md](../CLAUDE.md) |
| Living operating manual, open questions | [carnatic/.clinerules](../carnatic/.clinerules) |
| Data schema | [carnatic/data/READYOU.md](../carnatic/data/READYOU.md) |
| Recording schema | [carnatic/data/recordings/READYOU.md](../carnatic/data/recordings/READYOU.md) |
| Architectural decisions | [plans/ADR-*.md](../plans/) |
| Contribution guide | [CONTRIBUTING.md](../CONTRIBUTING.md) |
