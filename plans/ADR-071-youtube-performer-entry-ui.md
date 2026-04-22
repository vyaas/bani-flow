# ADR-071: Performer Entry for YouTube Recordings (CLI + Forms)

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect → carnatic-coder
**Depends on**: ADR-031 (data entry forms), ADR-070 (youtube performers schema)

---

## Context

ADR-070 introduces the `performers[]` field on `musician.youtube[]` entries. The schema only matters if librarians can populate it without typos. Two existing surfaces accept new YouTube recording data:

1. **`carnatic/write_cli.py add-youtube`** — terminal verb used during scripted ingestion (e.g., when crawling a playlist into `musicians/<id>.json`).
2. **`carnatic/render/templates/entry_forms.js`** — in-browser data entry forms (ADR-031) used for ad-hoc additions; `addYoutubeBlock` builds the YouTube subsection inside both the new-musician form (~line 751) and the existing-musician form (~lines 2083, 2389).

Neither surface currently has a way to attach accompanists. Free-text musician_id and free-text role would let typos and unknown ids slip through. We need controlled-vocabulary inputs in both surfaces.

### Forces

| Force | Direction |
|---|---|
| **Two equal surfaces** | The CLI and the in-browser form must reach feature parity — no surface should be the only path. |
| **Combobox-first inputs** | Musician picker uses existing `efCombobox(graphData.nodes)`; role picker uses a fixed vocabulary list. Avoids orphan ids and unknown roles. |
| **Host auto-injection** | Users should type only accompanists; tools auto-add the host with the host's `instrument` as role. The stored JSON is then validator-clean. |
| **Diff-minimality** | If the user adds zero accompanists, omit the `performers` field entirely (back-compat invariant from ADR-070). |
| **Single source for role list** | The vocabulary must live in one place (Python + JS mirror) to avoid drift between CLI and form. |

---

## Pattern

**Boundary as filter**: each entry surface filters user input through known ids and known roles. Bad data cannot enter at the boundary.

**Levels of Scale**: the role vocabulary is small enough to inline; the musician list is large but already loaded in `graphData.nodes` for the form and in `musicians/*.json` for the CLI. Same data, different surface.

---

## Decision

### 1 — Role vocabulary (single source)

A controlled list lives in one place per side, kept in sync by code review:

- **Python**: `carnatic/render/roles.py` (new module) exporting `PERFORMER_ROLES: tuple[str, ...]`.
- **JS**: `carnatic/render/templates/roles.js` (new template) exporting `window.PERFORMER_ROLES = [...]`.

Initial vocabulary mirrors the values currently used across `recordings/*.json`:
`vocal, violin, viola, veena, flute, mridangam, ghatam, kanjira, morsing, tanpura, tampura, nadaswaram, tavil, harmonium`.

Any addition is a one-line edit on both sides; the validator rejects roles outside the Python list.

### 2 — `write_cli.py` — two changes

**a. Extend `add-youtube` with repeatable `--performer`:**

```bash
python3 carnatic/write_cli.py add-youtube \
  --musician-id md_ramanathan \
  --url https://youtu.be/M4J_HtniTQA \
  --label "Gitarthamu · Surutti · Adi" \
  --composition-id gitarthamu \
  --raga-id surutti \
  --performer lalgudi_jayaraman:violin \
  --performer umayalpuram_sivaraman:mridangam
```

When one or more `--performer` flags are present, the writer:
1. Auto-injects the host `(musician_id=<host>, role=<host_node.instrument>)` if not already listed.
2. Validates each `<id>:<role>` pair: id must exist in musicians; role must be in `PERFORMER_ROLES`.
3. Emits the `performers` array on the new entry.

When no `--performer` flag is given, the entry is written exactly as today (no `performers` field — host-implicit per ADR-070).

**b. New verb `add-youtube-performer`** for incremental enrichment of an existing entry:

```bash
python3 carnatic/write_cli.py add-youtube-performer \
  --musician-id md_ramanathan \
  --url https://youtu.be/M4J_HtniTQA \
  --performer-id lalgudi_jayaraman \
  --role violin
```

Behaviour:
1. Locate the entry on the host musician by extracted video_id.
2. If the entry has no `performers[]`, initialise it with the host musician auto-injected (`role = host_node.instrument`).
3. Append the new performer (or skip with `[SKIP]` if already present).
4. Reject if `--performer-id` is unknown (and no `--unmatched-name` provided), or if `--role` is outside `PERFORMER_ROLES`.

### 3 — `entry_forms.js` — `addYoutubeBlock` extended

Inside the existing YouTube block (after the Year/Version rows), add a "Performers" repeating subsection mirroring the existing edge-block pattern:

```
┌─ YouTube Entry ───────────────────────────────×┐
│ URL:        [____________________]            │
│ Label:      [____________________]            │
│ Composition:[combobox ▾]                      │
│ Raga:       [combobox ▾]                      │
│ Year:       [____]                            │
│ Version:    [____]                            │
│                                               │
│ Accompanists                                  │
│ ┌─────────────────────────────────────────×┐  │
│ │ Musician: [combobox ▾]   Role: [▾]       │  │
│ └──────────────────────────────────────────┘  │
│ [+ Add Accompanist]                           │
└───────────────────────────────────────────────┘
```

Implementation notes:
- New helper `addPerformerBlock(container, formWin)` — repeating row identical in pattern to `addEdgeBlock`.
- Musician picker: `efCombobox(null, graphData.nodes.map(...))`.
- Role picker: `efCombobox(null, window.PERFORMER_ROLES.map(r => ({value: r, label: r})))`.
- The host musician is **not shown** as a row in the form. The user adds only accompanists.
- The form copy below the section reads: *"Add accompanying artists. The lead artist (this musician) is added automatically."*
- If the accompanist musician is missing from the graph, the user is directed: *"Add the accompanist as a musician first if they are not in the dropdown."*

### 4 — `generateMusicianJson` — emit performers[]

For each YouTube block in the form, the JSON generator:
1. Reads each `addPerformerBlock` row → builds `[{musician_id, role}, ...]`.
2. If the list is empty, omit the `performers` field entirely (back-compat).
3. If the list is non-empty, prepend the host `{musician_id: <host_id>, role: <host_instrument>}` (auto-injected; deduped if user somehow added it manually).

This rule applies to the new-musician form *and* both invocations of the existing-musician form.

### 5 — Validator (`carnatic/cli.py validate`)

Add checks per ADR-070 invariants:
- For every `node.youtube[].performers` (when present): host inclusion, known musician_ids (or `unmatched_name`), roles ∈ `PERFORMER_ROLES`.

---

## Consequences

### Positive

- One feature crosses both surfaces: librarians can choose CLI or form depending on workflow.
- Host auto-injection means the user always types the smaller, interesting half (just the accompanists).
- Combobox sourcing makes orphan ids structurally impossible from either surface.

### Negative / accepted tradeoffs

- The role vocabulary lives in two files (Python + JS). Small list; drift cost is low and caught by validator.
- Existing-musician form has two `addYoutubeBlock` invocations to update (entry_forms.js lines ~2083 and ~2389) — both must change.
- `addPerformerBlock` introduces a new pattern in entry_forms.js but mirrors `addEdgeBlock` closely — minimal reviewer surprise.

### Risks

- A user could fill the role combobox with a free-text value if combobox is permissive. Mitigation: bound the role combobox to choices-only (no free text); musician combobox stays free-text-tolerant for `unmatched_name` cases (rare).

---

## Implementation

1. **Roles vocabulary** (Coder)
   - Create `carnatic/render/roles.py` with `PERFORMER_ROLES` tuple.
   - Create `carnatic/render/templates/roles.js` exporting `window.PERFORMER_ROLES`.
   - Wire `roles.js` into `html_generator.py`'s template inlining list (load before `entry_forms.js`).

2. **CLI** (Coder, in `carnatic/writer.py` + `carnatic/write_cli.py`)
   - Extend `writer.add_youtube` to accept `performers: list[Performer] | None`; validate against musicians, roles, host inclusion; emit `performers[]` only when non-empty.
   - New `writer.add_youtube_performer(musicians_path, *, musician_id, url, performer_id, role, unmatched_name)`.
   - In `write_cli.py`: extend `add-youtube` parser with repeatable `--performer "<id>:<role>"`; new `add-youtube-performer` subcommand.

3. **Entry forms** (Coder)
   - In `entry_forms.js`: implement `addPerformerBlock(container, formWin)`; call it from `addYoutubeBlock` (one call site, since the function is shared by all three invocations of `addYoutubeBlock`).
   - Update `generateMusicianJson` (and the existing-musician variant) to read performer rows and emit the `performers` array per the rules above.

4. **Validator** (Coder)
   - Extend `carnatic/cli.py validate` with the three checks described in ADR-070.

5. **Verification**
   - `bani-render` exits 0; `python3 carnatic/cli.py validate` exits 0.
   - CLI smoke: add a fake performer to a copy of `md_ramanathan.json`, run validate (pass); remove the host (fail); use unknown role (fail); revert.
   - Form smoke: open in-browser entry form, add a YouTube entry plus one accompanist; downloaded JSON contains `performers: [host, accompanist]`.
   - Backward compat: render against current data; `git diff` on data files is empty.

---

## Open Questions

- Should the form expose a "remove the host from performers" toggle? Recommendation: **no** — the host is structurally always present per ADR-070 invariant B; toggling it off would silently produce invalid JSON.
- Should `--performer` on `add-youtube` accept a third optional segment for `unmatched_name` (e.g., `"::Some Name:violin"`)? Recommendation: **defer** — unmatched performers on solo tracks are rare; use `add-youtube-performer --unmatched-name` for that one-off case.
