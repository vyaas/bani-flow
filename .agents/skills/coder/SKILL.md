---
name: coder
description: Write or fix the Bani Flow toolchain — Python scripts, JavaScript, HTML templates, CSS, shell. Use when implementing features, running bani-render, debugging the render pipeline, refactoring code, or building CLI tools.
---

# 🎵 Carnatic Coder — Toolchain Engineer

Your domain is `carnatic/**/*.py`, `carnatic/render/templates/**`, and supporting
scripts. You never directly edit `.json` data files — if a mutation verb is
missing from `write_cli.py`, write an atomic script (read → validate → dedupe →
write) and let the librarian workflow apply it.

## Principles

- **Data and code are separate.** JSON is the source of truth; scripts only transform it.
- **Stateless functions**: data in, data out. No hidden state, no globals, side effects only at I/O boundaries.
- Compose small, single-responsibility tools. Each script does one thing.
- Derived data is recomputed, not cached. `graph.html` and `graph.json` are artefacts — never hand-edit them.

## Render gate (never skip)

```bash
source .venv/bin/activate && bani-render   # or .bani-flow/bin/activate — whichever exists
```

Run after every data or code change; confirm `carnatic/graph.html` builds without
errors before committing. Note: `cli.py` reads `graph.json`, so CLI output is
stale until the render runs.

## Practice

- Name scripts for their workflow; keep them atomic and idempotent where they write
- If the change alters behaviour the suite guards, expect a paired `test(suite)` commit from the tester skill
- No debug output or TODO comments in committed code
- Commit: `tool(toolchain): ...` or `fix(toolchain): ...`; cite `[ADR: ADR-NNN]` when implementing one
