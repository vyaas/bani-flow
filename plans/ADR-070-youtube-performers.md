# ADR-070: Performers on Legacy YouTube Recording Entries

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect → carnatic-coder → librarian
**Depends on**: ADR-018 (concert-bracketed recording groups), ADR-019 (co-performer bracketed trail entries), ADR-024 (render refactor), ADR-055 (no dead ends)
**Companion**: ADR-071 (write_cli + entry-form UX for adding performers)

---

## Context

### The asymmetry

The Carnatic graph stores recordings in two distinct schemas:

1. **Structured recordings** (`carnatic/data/recordings/*.json`) — concert-shaped events with `sessions[].performers[]` and `sessions[].performances[]`. Every accompanist is a first-class participant: vocalist, violinist, mridangist, ghatam player. The render pipeline indexes every performer as listenable for every composition and raga sounded in their session (`data_transforms.build_listenable_set`, `build_composition_raga_to_nodes_lookups`). Bani-flow trail rows for these tracks render co-performer chips (ADR-019).

2. **Legacy youtube tracks** (`musician.youtube[]` arrays inside each `musicians/<id>.json` file) — single-track entries pinned to one musician node. There is no performers field. The graph treats the host musician as the *only* musician on the track. An accompanying violinist is invisible.

A real example: `md_ramanathan.json` contains a single track for *Gītārthamu · Surutti · Ādi*. MD Ramanathan is listed; the recording's accompanying violinist and mridangist exist as graph nodes but have no link to this recording. Their musician panels do not list it. Bani-flow rows referencing the track do not show co-performer chips. They are silent participants.

### Why this matters

The unifying principle of the graph is that **a node is a centre of musical life**. An accompanist who played on a recording shaped its sound and shaped that musician's repertoire. Hiding them from the index suppresses a real lineage axis: "show me everything Lalgudi Jayaraman accompanied" is currently incomplete because solo recordings on other artists' nodes never list him.

The structured recordings schema solved this for concerts. Solo-track YouTube entries deserve the same affordance — without forcing the lighter container (one-track entry on a musician node) into the heavier container (full concert with sessions).

### Forces

| Force | Direction |
|---|---|
| **Schema symmetry** | Performers should mean the same thing whether the container is `recordings/*.json` session or a `musician.youtube[]` entry. |
| **Backward compatibility** | The 100s of existing `youtube[]` entries with no performers field must render exactly as today. No data migration. |
| **Render uniformity** | One indexing path is better than two. The render pipeline should treat both schemas through equivalent code. |
| **Lightweight container** | Solo-track recordings should not have to pretend to be concerts. The container stays small: one entry, optional performers, no sessions. |
| **Discoverability** | An accompanist tagged on a track must become listenable through that track and surface it in their musician panel. |
| **Validator strictness** | When the field is present it must be well-formed: known musician_ids, known roles, host included. |

---

## Pattern

**Strong Centres extended with shared boundary**: the `Performer` shape already established by `recordings/*.json` becomes the canonical co-participant atom. By reusing it inside `youtube[]` entries we extend the strong centre rather than inventing a parallel vocabulary.

**Levels of Scale**: a *performer* fits inside a *track* (youtube entry) the same way it fits inside a *session* (recording). Each level uses the same atom, different containers.

**Boundary as filter**: presence/absence of the field draws a clean back-compat line. Old entries (no field) are host-implicit; new entries (field present) carry the full performer roster including the host.

---

## Decision

### 1 — Schema: optional `performers` on each `youtube[]` entry

```jsonc
// musician node, BEFORE
{
  "id": "md_ramanathan",
  "instrument": "vocal",
  "youtube": [
    {
      "url": "https://youtu.be/M4J_HtniTQA",
      "label": "Gitarthamu · Surutti · Adi - MD Ramanathan",
      "composition_id": "gitarthamu",
      "raga_id": "surutti"
    }
  ]
}

// musician node, AFTER (with performers)
{
  "id": "md_ramanathan",
  "instrument": "vocal",
  "youtube": [
    {
      "url": "https://youtu.be/M4J_HtniTQA",
      "label": "Gitarthamu · Surutti · Adi - MD Ramanathan",
      "composition_id": "gitarthamu",
      "raga_id": "surutti",
      "performers": [
        { "musician_id": "md_ramanathan",     "role": "vocal" },
        { "musician_id": "lalgudi_jayaraman", "role": "violin" },
        { "musician_id": "umayalpuram_sivaraman", "role": "mridangam" }
      ]
    }
  ]
}
```

The `Performer` object schema is **identical** to the one defined in `carnatic/data/recordings/READYOU.md`:

| field | type | notes |
|---|---|---|
| `musician_id` | string \| null | references a musician node id; `null` if unmatched |
| `role` | string | one of `vocal`, `violin`, `viola`, `veena`, `flute`, `mridangam`, `ghatam`, `kanjira`, `morsing`, `tanpura`, `tampura`, `nadaswaram`, `tavil`, `harmonium` |
| `unmatched_name` | string \| null | raw name string when `musician_id` is null — never silently dropped |

### 2 — Two invariants

#### Invariant A — host-implicit (back-compat)

If `performers` is absent or empty on a `youtube[]` entry, the entry implies a single performer:

```jsonc
{ "musician_id": <parent node id>, "role": <parent node.instrument> }
```

The render pipeline MUST behave identically to today for any entry without the field. Existing data renders unchanged.

#### Invariant B — explicit-includes-host (validator-enforced)

If `performers` is present (non-empty), it MUST contain at least one entry whose `musician_id` equals the parent musician node's `id`. This collapses indexing to a single uniform path: walk `entry.performers || [implicit_host]`.

The validator (`carnatic/cli.py validate`) rejects:
- `performers[]` present but missing the host musician_id
- `musician_id` not found in the musician node set (and `unmatched_name` not provided)
- `role` outside the controlled vocabulary above

### 3 — Render pipeline updates

**`carnatic/render/graph_builder.py`** — track payload (~line 47):

```python
tracks.append({
    "vid":            vid,
    "label":          t.get("label", vid),
    "composition_id": t.get("composition_id"),
    "raga_id":        t.get("raga_id"),
    "year":           t.get("year"),
    "version":        t.get("version"),
    "performers":     t.get("performers", []),   # ← new; defaults to []
})
```

**`carnatic/render/data_transforms.py`** — both indexers learn the host-implicit rule:

```python
def _track_performer_ids(host_node_id: str, yt: dict) -> list[str]:
    perfs = yt.get("performers") or []
    if not perfs:
        return [host_node_id]            # implicit host
    return [p["musician_id"] for p in perfs if p.get("musician_id")]
```

`build_composition_raga_to_nodes_lookups` (~line 112) and `build_listenable_set` (~line 171) call `_track_performer_ids` and contribute every returned id to `composition_to_nodes[cid]`, `raga_to_nodes[rid]`, and `listenable`.

**`carnatic/render/templates/bani_flow.js`** — legacy `rawRows.push` (~line 459) sets `allPerformers: t.performers || null` so co-performer chip rendering already implemented for structured rows applies uniformly.

### 4 — Cytoscape data shape

Each track on `node.data.tracks[i]` gains a `performers: Performer[]` field, defaulting to `[]`. Downstream JS that did not previously read it continues to work; new co-performer rendering reads it where present.

---

## Consequences

### Positive

- **Accompanists become discoverable**: tagging Lalgudi on MDR's Gitarthamu surfaces the recording in Lalgudi's musician panel and marks him listenable through that track.
- **Bani-flow trail parity**: ADR-019 co-performer chips work identically for solo-track entries and concert sessions — one render path covers both.
- **No migration cost**: existing data files are untouched until a librarian opts to enrich a specific entry.
- **Container clarity preserved**: solo tracks stay in `youtube[]`; concerts stay in `recordings/*.json`. The choice of container reflects the recording's nature.

### Negative / accepted tradeoffs

- **Slight redundancy in storage**: a youtube entry with performers always lists the host musician explicitly even though the container already knows it. Accepted in exchange for one uniform indexing code path.
- **Validator surface grows**: new shape rules must be enforced in `cli.py validate`.
- **Two schemas remain**: this ADR does not unify recordings and youtube tracks into one container. That remains a possible future move (out of scope).

### Risks

- A librarian could partially populate `performers[]` (e.g., list only the violinist, omit the host). The validator catches this.
- A composer renamed in `musicians/` must be renamed in every `youtube[].performers[].musician_id` reference. Standard ID-stability rule already covers this (ADR-015).

---

## Implementation

Sequenced under ADR-071's CLI/UI delivery.

1. **Render pipeline** (Coder)
   - `carnatic/render/graph_builder.py`: add `performers` to track payload.
   - `carnatic/render/data_transforms.py`: introduce `_track_performer_ids` helper; update both indexers.
   - `carnatic/render/templates/bani_flow.js`: thread `t.performers` into `rawRows.push`'s `allPerformers`.
   - `carnatic/render/README.md`: extend the youtube section to mention performers.

2. **Validator** (Coder, in `carnatic/cli.py validate`)
   - Walk every `node.youtube[].performers || []`; check host inclusion, known `musician_id`s (or `unmatched_name`), known `role`s.

3. **Data schema docs** (Coder)
   - `carnatic/data/musicians/READYOU.md` — document the new optional field with a worked example.
   - `carnatic/data/recordings/READYOU.md` — cross-link, noting the shared `Performer` shape.

4. **Verification**
   - `bani-render` exits 0; `python3 carnatic/cli.py validate` exits 0.
   - Render against current data → `git diff carnatic/graph.html` shows only the additive `performers: []` shape on tracks; no behavioural change.
   - Forward fixture (temporary): add a performer to one entry; observe accompanist's musician panel listing the track and bani-flow row showing the co-performer chip; revert before commit.

---

## Open Questions

- Should the validator enforce that every accompanist musician also exists with a Wikipedia source? Recommendation: **no** — that is already the global musician-node rule (CLAUDE.md hard rules); the performer field merely references existing nodes.
- Should `performers[]` allow per-performer composition/raga metadata? Recommendation: **no** — a single track has one performance. If breakdown is needed, promote the recording to `recordings/*.json` (see ADR-018).
