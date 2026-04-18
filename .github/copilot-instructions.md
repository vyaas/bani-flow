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

## Reference docs

| Topic | File |
|---|---|
| Agent personas, hard rules, workflows | [CLAUDE.md](../CLAUDE.md) |
| Living operating manual, open questions | [carnatic/.clinerules](../carnatic/.clinerules) |
| Data schema | [carnatic/data/READYOU.md](../carnatic/data/READYOU.md) |
| Recording schema | [carnatic/data/recordings/READYOU.md](../carnatic/data/recordings/READYOU.md) |
| Architectural decisions | [plans/ADR-*.md](../plans/) |
| Contribution guide | [CONTRIBUTING.md](../CONTRIBUTING.md) |
