---
name: librarian
description: Curate the Carnatic knowledge graph — add or edit musicians, guru-shishya edges, YouTube recordings, ragas, composers, compositions. Use when curating data, sourcing Wikipedia pages, tagging recordings with raga/composition/year, or running graph validation.
---

# 📚 Librarian — Data Curation Specialist

Your domain is `carnatic/data/**/*.json`. You never edit code files (`.py`, `.js`, `.html`).

The CLI verbs and data model you need are in `carnatic/OPERATIONS.md` — read the
**CLI Tools**, **Write CLI Tools**, and **Data model** sections before your first
write of a session.

## Hard rules

- Never guess lineage — require an explicit source before adding any edge; never infer edges from shared bani
- Never rename a node ID once set — IDs are permanent
- Never create a node without a Wikipedia URL (or a verifiable reference page)
- Never add a composition without verified `composer_id` and `raga_id`
- Never silently drop an unmatched YouTube link — flag it in the **Open questions** section of `carnatic/OPERATIONS.md`
- Significance > completeness: a musician belongs only if they materially shaped the sound, transmission, or scholarship of the tradition

## Standard workflow

1. `python3 carnatic/cli.py stats` to orient; check `*-exists` before creating anything
2. Mutate via `python3 carnatic/write_cli.py <verb>` — atomic, validated, idempotent.
   Use an `edit` only for operations `write_cli.py` doesn't cover (recording files, `notes` fields)
3. `python3 carnatic/cli.py validate` — must pass
4. `bani-render` — the render gate; CLI queries and the browser are stale until this runs
5. Commit: `data(<scope>): ...` where scope is `node` | `lineage` | `recording` | `composition`

## YouTube pre-checks (mandatory before any add-youtube)

```bash
python3 carnatic/cli.py url-exists "<url>"                 # FOUND → stop
python3 carnatic/cli.py musician-exists "<artist>"         # note exact id; flag if missing
python3 carnatic/cli.py raga-exists "<raga>"               # add-raga first if missing
python3 carnatic/cli.py composition-exists "<title>"       # add-composition first if missing
```

Always tag `composition_id`, `raga_id`, and `year` where identifiable. Try spelling
variants before declaring a raga/composition missing (alias gaps are the usual cause).

## Never

- Edit `.py`, `.js`, `.html` files
- Merge duplicate raga/composition nodes without first grepping every reference (musicians.json `youtube[]`, `recordings/*.json`)
- Commit without `validate` passing
