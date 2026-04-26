# ADR-104: Panel Header Edit Buttons (Musician, Raga, Composition, Composer)

**Status**: Accepted
**Date**: 2026-04-26
**Agents**: graph-architect (proposer), carnatic-coder (implementer)
**Depends on**: ADR-097 (unified Edit form, esp. §6), ADR-103 (co-located edit affordances)
**Related**: ADR-105, ADR-106, ADR-107

---

## Context

The musician panel currently displays the artist's name as the first line beneath the search input (e.g., *TM Krishna · b. 1976*). The raga panel displays the raga name (e.g., *Kharaharapriya · Mela 22 · Cakra 4 — Veda*). Composition and composer panels follow the same shape: name first, metadata under.

There is no in-panel affordance to edit the entity these headers identify. To fix a typo in the lifespan, change an instrument, attach a `notes[]` entry, or correct a born-year, the rasika must open the global edit bar (ADR-103, deprecated) and re-pick the entity by name.

The header is the strongest centre of the panel. It is where the rasika's attention lands first. It is the right place for the edit affordance.

### Forces

| Force | Direction |
|---|---|
| **Co-location (ADR-103 §1)** | The edit-this-entity button must sit on the same visual unit as the entity's name. |
| **Pre-targeting (ADR-103 §2)** | The form must open with the entity already selected. |
| **Single dispatch (ADR-097 §6)** | The button opens the existing unified Edit form, not a new form. |
| **Visual restraint** | The button is a small chip beside the name, never larger than the name itself. |
| **Schema asymmetry** | All four entity types (musician, raga, composition, composer) are field-patchable. They get edit buttons. Recordings are file-shaped (ADR-097 §3) and not field-patched through this affordance — they have their own per-segment editors (ADR-101). |

---

## Pattern

**Property 1, *Strong Centres*.** The header is the panel's primary centre. Adding the edit chip to the header gives the centre a second function (write) without disturbing its first (identify). The two functions are related — both concern the entity named — so the chip *strengthens* the centre rather than competing with it.

**Property 11, *Roughness*.** A perfectly minimal header would not advertise its writeability. A maximally chrome header would smother it. The small chip beside the name is the right amount of roughness — it is noticeable to the contributor and ignorable to the reader.

---

## Decision

### 1 — Every entity panel header gains a `✎` chip beside the entity name

Affected panels:

- **Musician panel** — chip beside the artist name (e.g., *TM Krishna* `✎`).
- **Raga panel** (bani-flow) — chip beside the raga name (e.g., *Kharaharapriya* `✎`).
- **Composition panel** (when displayed standalone, e.g., from a deep link or composition pivot) — chip beside the composition title.
- **Composer panel** (when a composer is the subject) — chip beside the composer name.

The chip uses the visual language defined in ADR-103 §6: pencil glyph, chip border-radius, softer-than-primary contrast, tooltip *"Edit this <entity-type>"*.

### 2 — Click behaviour

Clicking the chip opens the unified Edit form (ADR-097 §6) with:

- `entity_type` filled and locked to the panel's entity type.
- `pick` (the entity selector) filled and locked to the panel's entity id.
- Both fields rendered as locked chips with a small `change` link (ADR-103 §2).

The form opens *as a floating window over the panel*, not as a route change. Closing it returns the rasika to her unchanged scroll position. This matches the existing ADR-031 form launch behaviour.

### 3 — What the form exposes per entity type

The unified Edit form's three blocks (PATCH FIELD / APPEND TO ARRAY / ADD NOTE — ADR-097 §6) populate per the writer's `PATCHABLE_*_FIELDS` whitelists:

| Entity | Patch fields | Append arrays | Notes |
|---|---|---|---|
| Musician | `born`, `died`, `era`, `instrument`, `bani`, `wikipedia_url` | `youtube`, `sources`, `aliases` | ✓ |
| Raga | `name`, `parent_raga`, `mela`, `cakra`, `wikipedia_url` | `aliases` | ✓ |
| Composition | `title`, `language`, `tala`, `wikipedia_url` | `aliases` | ✓ |
| Composer | `name`, `born`, `died`, `era`, `wikipedia_url` | `aliases` | ✓ |

Field whitelists are defined authoritatively by the writer's Python constants per ADR-097 §3; the JS metadata in `entry_forms.js` mirrors them. Changes to the whitelist happen in writer.py first, then the JS metadata follows in the same commit.

### 4 — What this ADR does NOT do

- **Does not add a `+ Add new musician/raga/...`** at the panel header. Adding new entities of these types remains the job of the global launcher and (per ADRs 105/106) the parent-mediated triggers.
- **Does not change the panel header layout** beyond adding one inline chip.
- **Does not introduce a new bundle item shape.** Every staged change goes through ADR-097 §3's `op`-discriminated items.
- **Does not couple to any panel state** (selection, history, view mode). The chip's behaviour is identical regardless of which view the rasika is in.

---

## Consequences

### Positive

- **The most common edit case (fix a field on the entity I am reading) becomes one click.** Today it is approximately seven clicks (open bar → pick entity type → search → select → pick PATCH FIELD → field → submit).
- **Every panel teaches its writeability.** A reader who never edited anything before now sees, on every panel header, that the entity is editable.
- **Zero new write channels.** The bundle, writer, and ingester are unchanged. Only the launch surface multiplies.

### Negative / accepted tradeoffs

- **Header crowding on long entity names.** Mitigated by the chip being inline with the name (wraps with it on narrow viewports per ADR-075).
- **Discoverability vs. quietness.** A pencil chip is small. Some users may not notice. Mitigated by the empty-panel tutorial (ADR-086) being updated to point at it once.

### Risks

- **A locked entity-type chip that the rasika tries to edit by clicking it could be confusing.** Mitigated by the explicit `change` link rendering beside the locked chip per ADR-103 §2.

---

## Implementation

Carnatic Coder, single change spanning the four panel renderers and the entry-form file.

### Phase 1 — Header chip rendering

In the panel render templates (likely `bani_flow.js` for raga panels, the musician-panel renderer, and any composition/composer panels):

1. After rendering the entity name in the panel header, append a `✎` chip element.
2. The chip's class matches the existing chip parity classes (ADR-073/074).
3. The chip's click handler calls `openEditForm({entityType, id})` — a new helper exported from `entry_forms.js`.

### Phase 2 — `openEditForm` helper in entry_forms.js

In `carnatic/render/templates/entry_forms.js`:

1. Add `openEditForm({entityType, id})` that opens the unified Edit form window from ADR-097 Phase C.
2. The helper sets the `entity_type` selector and `pick` combobox values, then renders both as locked chips with a `change` link that, when clicked, unlocks both selectors and clears them.
3. If the unified Edit form (ADR-097 Phase C) has not yet shipped, ADR-104's chip is wired but inactive; clicking it opens a stub modal that says *"Edit form coming with ADR-097 Phase C."* This keeps the visual change shippable independent of Phase C readiness.

### Verification

- `bani-render` succeeds; the rendered musician panel shows `✎` beside the artist name.
- Clicking the chip opens the Edit form with the musician pre-selected.
- The locked chips render with a `change` link that unlocks them.
- Submitting a patch produces a bundle item of shape `{ op: "patch", id: "<entity_id>", field: "...", value: ... }`.

---

## Closing note

The header is the panel's name. The chip beside the name is the panel's signature. ADR-104 makes signing the panel the simplest write the system supports.
