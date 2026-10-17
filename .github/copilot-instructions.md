# Bani Flow — Copilot Workspace Instructions

Carnatic guru-shishya knowledge graph. Single-page app rendered from structured JSON into a self-contained `graph.html`.

**Read first**: [AGENTS.md](../AGENTS.md) (the single source of truth: hard rules, roles, commit protocol) and [carnatic/OPERATIONS.md](../carnatic/OPERATIONS.md) (CLI reference, data model, open questions). Past discoveries: [carnatic/LEARNINGS.md](../carnatic/LEARNINGS.md) — grep on demand, do not read at startup.

Roles are defined as portable Agent Skills in `.agents/skills/<role>/SKILL.md`
(`librarian`, `coder`, `tester`). Adopt the matching skill's constraints when the
user invokes a role.
