# ADR-174 — UI Surface Map: Vocabulary Layer for the Five Graphical Elements

**Status**: Accepted
**Date**: 2026-10-17 (accepted same day, user approval)
**Agents**: graph-architect (proposer) → carnatic-coder / test-engineer (implementation on acceptance)
**Depends on**: ADR-028 (design-token single source of truth), ADR-128 (shared panel components), ADR-155/157/161/162 (media player + queue), ADR-023/025 (three-view selector + bani↔wheel sync)
**Informed by**: AUDIT-017 (LLM token bloat), the context-hygiene hard rule in `AGENTS.md`

---

## Context

Bani Flow's look and feel is fully specified by **five graphical elements**:

| User vocabulary | DOM root | Owning module |
|---|---|---|
| Bani-flow panel (left sidebar) | `#bani-flow-panel` | `bani_flow.js` |
| Musician panel (right sidebar) | `#musician-panel` + `#recordings-panel` | `graph_view.js` + `media_player.js` |
| Guru-shishya view | `#cy` (Cytoscape) | `graph_view.js` + `timeline_view.js` |
| Mela-janya view (raga wheel) | `#raga-wheel` | `raga_wheel.js` |
| Media player (+ queue/playlist) | dynamic `.media-player` | `media_player.js` |

The existing pi skills are *domain*-oriented — coder owns the Python toolchain,
librarian owns JSON data, tester owns pytest. None of them names a DOM id, a
view, or a player method. There is no place where "media player" resolves to
`openOrFocusPlayer` / `MediaQueue` / `buildPlayerBar`, or where "mela-janya
wheel" resolves to `drawRagaWheel` / `_expandMela` / `_labelWithBg`. The connective
logic is likewise undocumentated in agent-visible form: view switching lives in
`raga_wheel.js` (`switchView`), the bani filter is the shared state bus
(`activeBaniFilter`), and the musician panel is split across two modules — all
discoverable only by grep-thrash.

Consequence: abstract prompts in the user's own vocabulary ("add a randomize
play button to the media player", "add a count at the periphery of the mela
wheel") require rediscovering 3–5 latent facts per task. Each rediscovery costs
context tokens (AUDIT-017) and invites edits in the wrong module.

The knowledge exists but is scattered: 173 ADRs in `plans/`, inline ADR
citations in every template (base.html alone has 251), and UI-surface lore
filed under the Coder section of `LEARNINGS.md` with no index by element.
`carnatic/render/README.md` documents only 7 of the 19 templates and is stale.

## Decision

Introduce a **vocabulary layer** with four components:

### 1. `carnatic/render/UIMAP.md` — the map (primary deliverable)

A grep-first reference, maintained under the same discipline as
`LEARNINGS.md`: **never read wholesale at session start; recalled on demand in
slices**. One section per element with a fixed template — Aliases, DOM, Owns,
Entry points, State globals, CSS hooks, Connects to, ADRs — plus three
cross-cutting sections:

- **Script load order** (the contract currently recorded only in
  `html_generator.py` comments).
- **The sync graph** (bani filter ⇄ wheel; wheel → musician panel; everything
  → player/queue; permalink restores all).
- **Recipes**: worked micro-playbooks for recurring task shapes, seeded with
  the two canonical examples (player-bar button; wheel-periphery annotation).

### 2. New skill: `/skill:surface` — 🎛️ UI Surgeon

`.agents/skills/surface/SKILL.md` (Agent Skills spec, portable like the
existing three). Small always-loaded front matter (~60 lines): the
five-element resolution table, the load-order contract, and a pointer to
`UIMAP.md` for depth. Owns `carnatic/render/templates/**`, `base.html`,
`theme.py/js` — presentation only. Coder keeps the Python pipeline; its
SKILL.md gains one delegation line. AGENTS.md roles table gains the
`/skill:surface` row.

### 3. Memory plumbing

- `LEARNINGS.md` gains a `### 🎛️ Surface` subsection for UI pitfalls (existing
  Coder entries stay put; new UI lore accrues under the new heading).
- `carnatic/render/README.md` template list refreshed (19 templates) and
  pointed at `UIMAP.md`.
- `AGENTS.md` Reference section links `UIMAP.md`.

### 4. Drift guard: `carnatic/tests/test_ui_surface_map_drift.py`

The map is derived documentation and will rot. Following the established
pattern (`test_instrument_registry_drift.py`, `test_edit_form_spec_drift.py`),
the test greps each template for the DOM ids and entry-point function names
`UIMAP.md` claims, and fails with an "update UIMAP.md" message when one is
renamed or removed. This is what keeps abstract prompts fast *permanently*.

## Consequences

**Positive**

- Abstract, vocabulary-level prompts become directly executable: the skill
  resolves element → DOM id → entry points → recipes before any edit.
- The undocumented connective logic (switchView location, activeBaniFilter bus,
  musician-panel split) is written down once, not rediscovered per session.
- Drift test turns silent map-rot into a red test, the same mechanism that
  keeps the instrument registry and edit-form spec honest.
- Token cost per UI task drops (targeted slices instead of template greps),
  aligned with AUDIT-017.

**Negative / costs**

- One more artefact to maintain, deliberately mitigated by the drift guard.
- Skill count grows to four; the boundary with coder (presentation vs.
  pipeline) must be respected — `html_generator.py` and everything upstream
  stay with coder.

**Alternatives considered**

- *Extend the coder skill with a UI section*: rejected — SKILL.md is
  always-loaded when invoked; folding ~60 lines of UI vocabulary into coder
  would tax every toolchain task, and the persona boundary (data/code/test)
  is a proven strength of the current setup.
- *A `bani-uimap` CLI verb*: rejected — grep + drift test gives the same
  recall at zero maintenance.
- *Restructure OPERATIONS.md to include the UI*: rejected — OPERATIONS.md is
  the data/CLI manual; UIMAP.md is a sibling, preserving the map-vs-manual
  separation in `AGENTS.md`.

## Implementation checklist (on acceptance)

1. Branch `adr/174-ui-surface-map`.
2. Write `carnatic/render/UIMAP.md` (full five-element map, drafted alongside
   this ADR).
3. Write `.agents/skills/surface/SKILL.md` (drafted alongside this ADR).
4. Write `carnatic/tests/test_ui_surface_map_drift.py`.
5. Touch-ups: `AGENTS.md` (roles row + Reference link), coder `SKILL.md`
   (delegation line), `carnatic/render/README.md` (template refresh),
   `LEARNINGS.md` (new subsection header).
6. Render gate (`bani-render` + `cli.py validate`) + full pytest.
7. Commit `tool(config): add UI surface map and surface skill [ADR: ADR-174]`;
   flip this ADR to Accepted.
