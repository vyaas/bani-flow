# ADR-142: Chip as Object — Double-Click Opens the Object's Form

**Status**: Accepted
**Date**: 2026-05-16
**Accepted**: 2026-05-16
**Author**: Graph Architect
**Depends on**: ADR-031 (in-browser entry forms), ADR-083 (bundle as canonical write channel), ADR-085 §1 + §3 (self-replicating loop: every read surface implies a write surface), ADR-097 (bundle deltas + unified edit forms), ADR-127 (vocabulary chips as universal section tokens)
**Partially supersedes**: ADR-097 §6 (the single "Unified Edit dispatch window" is replaced by distributed per-chip dispatch); ADR-104, ADR-105, ADR-106, ADR-107 (co-located edit triggers are retired in favour of the chip itself as the trigger)
**Does not touch**: the create/patch *forms themselves* (ADR-031, ADR-097 §§2–3) — only their triggers.

---

## Context

The right sidebar (Musician panel) and left sidebar (Bani Flow panel) have accumulated two parallel families of write affordances:

1. **`+` buttons** colocated at the head of every section (`MUSICIAN +`, `CONCERTS +`, `RECORDINGS +`, `LECDEMS +`, `COMPOSITIONS +`) — each opens a context-sensitive *add* form.
2. **`✎` (edit) buttons** colocated beside each entity header (next to a musician name, next to a raga title, next to a composition title) — each opens an *edit* form for that entity.

The screenshots the user attached show this clutter at full strength: the Musician panel's right column carries one `+` per section plus a pencil icon below the musician name; the Bani Flow panel adds an external-link glyph, a `+`, and a copy glyph in a small toolbar atop every entity header.

Two distinct failures follow:

**1. Triggers are not self-describing.**
Five `+` icons in one panel each mean a different thing. The user cannot tell, without clicking, whether `+` on the Musician panel header adds a *musician* (the panel's subject), a *concert* (the section above the cursor), a *recording* (the section below), or something else. The icon vocabulary collapses meaning: a single glyph stands for "add *something*, contextually". ADR-097 §6 attempted to fix this by introducing a *separate* unified Edit window with a dropdown ("Entity type: …"), but that solution moves the ambiguity into the form itself — the user must still pick the entity type from a list. The information is in the wrong place: it lives on the entity (which the user is already looking at), not on a global menu.

**2. The visual vocabulary is unfinished.**
ADR-127 elevated the four base nouns (Musician, Raga, Composition, Lecdem) to *chips* — colored, bold, recognisable tokens that work as both navigation and as section labels. ADR-127 §Pattern names the chip as the system's first-class affordance. But under the current write surface, chips do nothing on double-click: they are read-only labels with click-to-navigate behaviour. The system has built a strong vocabulary and is using it only for half its purpose.

The proposal is the inverse of ADR-097 §6: instead of pulling all write affordances into one global window, push the affordances onto the entities themselves, using the vocabulary the system already has — the chip. **Every chip becomes its own edit surface.**

### Forces

| Force | Direction |
|---|---|
| **Single visual vocabulary (ADR-127)** | Chips already carry entity identity. Adding *write* semantics to chips reuses an established visual language instead of inventing new icons. |
| **Loop closure (ADR-085 §3)** | Every read surface implies a write surface. The chip *is* the read surface for an entity — making it the write surface too is the strongest possible co-location. |
| **Self-describing triggers** | A `+` icon next to "CONCERTS" tells the user *something* will be added. A double-click on the `CONCERTS` chip tells the user *a concert* will be added. The trigger names its own outcome. |
| **One pattern, not five** | Today there are at least three affordance families (header `+`, inline `+`, pencil `✎`) with overlapping semantics. After this ADR there is one: double-click a chip. The user learns the pattern once. |
| **Affordance discoverability** | Double-click is a learned interaction; nothing on a chip *advertises* that double-click is meaningful. Mitigation: cursor hint on hover, brief tooltip on first interaction, help-deck callout. (See Consequences §Risks.) |
| **Discriminate add vs. edit** | The same gesture must distinguish "create a new instance of this type" from "edit this specific instance". The chip's *role* in the panel disambiguates: a **section-header chip** (a type label like `CONCERTS`) implies add; an **entity chip** (a named instance like `Vina Dhanammal`) implies edit. The rule is structural, not arbitrary. |
| **Recording labels are not yet chips** | The current Musician panel renders concert / lecdem / misc-recording titles as plain prose (`Columbia 1932`, `Lecdem on Kambhoji`, `Untitled 1956 broadcast`). Under the new rule, double-clicking any of them must edit that recording — therefore each must *be* a chip. Promoting **all** recording-kind labels (concert, lecdem, misc) to chips is in scope. Segment labels and inline subject labels inside a recording are likewise promoted. |
| **Backward-compat with mouse-only users** | Double-click is a standard pointing-device gesture; keyboard users need an equivalent. `Enter` on a focused chip, or a long-press on touch, are the natural equivalents. Touch escapes are scoped to desktop today; see Consequences §Negative. |
| **Mobile is read-only (ADR-129 D2)** | Mobile already disables the entry surface. This ADR does not change that. The chip-as-edit gesture activates on desktop only. |

---

## Pattern

**Strong Centre + Levels of Scale** (Alexander).
A chip is a Strong Centre: visually distinct, semantically loaded, present at every level of scale in the panel (the panel-title chip, the section-header chip, the entity chip, the inline subject chip). Strong centres should accumulate function, not lose it. Adding the edit/add gesture *enriches* the centre without diluting it: the chip still navigates on single-click, still highlights on hover, still anchors the section it labels — it now also writes on double-click.

The chip becomes an **object** in the OOP sense: a thing with both state (what entity it represents) and behaviour (what gestures it accepts). The behaviour matrix is small and total:

| Chip role | Single-click | Double-click |
|---|---|---|
| **Panel-title chip** (`MUSICIAN`, `BANI FLOW`) | toggle panel | open *Add* form for the panel's primary type (musician; raga-or-composition) |
| **Section-header chip** (`CONCERTS`, `RECORDINGS`, `LECDEMS`, `COMPOSITIONS`) | toggle section open/closed (existing) | open *Add* form for that section's type, prefilled with the panel's subject |
| **Entity chip** (`Vina Dhanammal`, `Begada`, `Pattakura`, `Tyagaraja`, `Columbia 1932`, `Lecdem on Kambhoji`, `Untitled 1956 broadcast`) | navigate to / focus the entity (existing) | open *Edit* form for that specific entity |

The rule is **structural and total**: every chip in the system falls into exactly one of three roles, and each role has exactly one double-click outcome. No exceptions, no per-chip configuration.

**Corollary — every listed object has a chip.** If the system *renders* the label of a stored entity anywhere in a panel (under any section: CONCERTS, LECDEMS, RECORDINGS, COMPOSITIONS, RAGAS, subjects-of-a-recording, performers-of-a-recording, segments-of-a-recording, …), that label MUST be a chip. There is no such thing as a "plain prose" entity label in a panel after this ADR. A lecdem title, a misc-recording title, a segment label, a co-performer name, a subject raga inside a recording — each is an entity chip with `data-entity-type` and `data-entity-id`, and each responds to double-click with its own Edit form. The chip is the universal label primitive for entities; non-entity prose (descriptions, dates, durations) remains prose.

This corollary is what makes the rule total. The user's eight cases are illustrative, not exhaustive; the matrix below enumerates the cases that exist *today* in the panels, but the rule applies to every future listed entity by construction.

---

## Decision

### 1 — The chip-role taxonomy is normative

Every chip rendered by the system MUST be one of the three roles above, and MUST carry a data attribute declaring its role:

```html
<!-- panel-title chip -->
<button class="musician-chip chip" data-chip-role="panel-title" data-entity-type="musician">MUSICIAN</button>

<!-- section-header chip -->
<button class="concert-chip chip" data-chip-role="section-header" data-entity-type="recording" data-section="concerts">CONCERTS</button>

<!-- entity chip -->
<button class="musician-chip chip" data-chip-role="entity" data-entity-type="musician" data-entity-id="vina_dhanammal">Vina Dhanammal</button>
```

`data-chip-role` and `data-entity-type` are the contract. A single delegated double-click handler at the document root inspects these attributes and dispatches to the correct form.

### 2 — Double-click bindings (the full matrix)

The user's eight cases plus the lecdem and misc-recording cases (added under the corollary in §Pattern) are all special cases of the three-role rule:

| Case | Chip | Role | Double-click outcome |
|---|---|---|---|
| (1) `MUSICIAN` at panel top | panel-title chip | panel-title | Add Musician form |
| (2) `Vina Dhanammal` (panel subject) | entity chip | entity (musician) | Edit Musician form, pre-loaded with `vina_dhanammal` |
| (3) `CONCERTS` section header | section-header chip | section-header (recording) | Add Concert Recording form, musician = panel subject, `recording_kind = concert` |
| (4) `Columbia 1932` concert title | **new** entity chip | entity (recording) | Edit Concert form (subjects, segments, timings) |
| (5) `RECORDINGS` section header | section-header chip | section-header (recording) | Add Recording form, musician = panel subject, `recording_kind = misc` |
| (6) `Begada` raga | entity chip | entity (raga) | Edit Raga form |
| (7) `Pattakura` composition | entity chip | entity (composition) | Edit Composition form |
| (8) `Tyagaraja` composer | entity chip | entity (musician) | Edit Musician form |
| (9) `LECDEMS` section header | section-header chip | section-header (recording) | Add Lecdem Recording form, musician = panel subject, `recording_kind = lecdem` |
| (10) `Lecdem on Kambhoji` lecdem title | **new** entity chip | entity (recording) | Edit Lecdem form (same form body as case 4; field set may differ when `recording_kind = lecdem`) |
| (11) `Untitled 1956 broadcast` misc-recording label | **new** entity chip | entity (recording) | Edit Recording form (same as case 4/10; field set per `recording_kind = misc`) |
| (12) Inline subject chip inside a recording (raga / composition / co-performer / lecdem subject) | entity chip | entity (raga / composition / musician) | Edit form for that subject entity — **not** the containing recording (chip identity wins over container) |
| (13) Segment label inside a recording (`00:14:32 — Pattakura`) | entity chip | entity (recording-segment, selector `recording_id + start`) | Edit Segment form (start, end, composition_id, raga_id, performers[]) — per ADR-143 §2 segment-selector grammar |

All thirteen (and any future row) collapse to: "look at the chip; read its role and type; dispatch." Cases (3), (5), (9) share one Add-Recording form whose `recording_kind` is set by which section opened it; cases (4), (10), (11) share one Edit-Recording form whose visible field set is conditional on the loaded recording's `recording_kind`. The form layer is **not** a per-kind fork; it is one form parameterised by kind.

**Recording-kind is not a chip-role discriminator.** Concert, lecdem, and misc recordings are all the same chip role (`entity` of type `recording`); their kind selects which Add/Edit form variant renders. The chip itself doesn't need a `data-recording-kind` attribute for dispatch — the loader reads kind from the recording file — but renderers MAY add it for CSS theming (e.g., a lecdem chip with a subtle 🎓 glyph, a concert chip with a 🎶 glyph). That decoration is a Coder choice; it does not change the dispatch contract.

### 3 — The `+` buttons and pencil buttons are retired

After this ADR is implemented:

- Every panel-section `+` button is removed.
- The standalone edit (`✎`) buttons under entity headers are removed (ADR-104..107 affordances are retired in favour of the chip itself).
- The footer global edit bar (already deprecated per ADR-103 §3) remains removable per its existing schedule; this ADR does not require it to be deleted, but its remaining triggers become redundant once chip dispatch covers all entity types.

The bottom-centre `Bundle (N items)` button (ADR-129 D2) stays — it is not an entry trigger; it is the *output* trigger. Unchanged.

### 4 — Every recording label is promoted to a chip (not just concerts)

Every recording's display title — concert, lecdem, *and* misc — becomes a chip with class `.recording-chip` (new) or reuses an appropriate existing class. This covers:

- Concert titles in the CONCERTS section (today: plain text inside `.concert-header`, e.g., `Columbia 1932`).
- Lecdem titles in the LECDEMS section (today: plain text or a list item, e.g., `Lecdem on Kambhoji`).
- Misc recording titles in the RECORDINGS section (today: a YouTube label or a derived title, e.g., `Untitled 1956 broadcast`, or the composition name when the recording is single-piece).

The chip's `data-entity-id` is the recording's stable id (the YouTube `video_id` for direct recordings; the concert/lecdem/recording file's id for file-shaped recordings). `data-entity-type="recording"` for all three kinds. Double-click opens the Edit Recording form, which exposes the recording's editable fields per ADR-143 §3 (the field set is conditional on the loaded recording's `recording_kind` but the dispatch is uniform).

The chip's *single-click* behaviour is unchanged from today's per-kind behaviour:
- Concert chip: toggle the bracket of tracks (existing).
- Lecdem chip: navigate / expand (existing).
- Misc recording chip: play / focus (existing).

No single-click semantics are changed by this ADR. Double-click is purely additive on top of whatever the chip does today.

### 5 — Discoverability layer

To address the "double-click is learned" risk:

- Chips render `cursor: pointer` on hover (already true for most); chips additionally render a subtle hover-state hint (e.g., a tiny pencil-on-hover badge in the top-right corner of the chip, fading in on `mouseenter`) — visual treatment is a Coder choice. The hint is the *only* new icon introduced; it appears on hover only, never persistently.
- A one-time tooltip appears on first double-click attempt: "Double-click any chip to edit it. Double-click a section header to add a new one." Stored in `localStorage` with a dismiss flag.
- The help-deck (`?` button) gets a new entry: "Editing entries — every chip is a door."

### 6 — Keyboard equivalent

A focused chip MUST respond to `Enter` with the same dispatch as double-click. Focus order is the DOM order of chips within their panel. This addresses keyboard accessibility and gives mobile/touch users a (future) equivalent: long-press → focus → activate. Mobile remains read-only per ADR-129 D2 in this ADR; the gesture infrastructure is laid but the entry forms are still desktop-only until mobile entry is separately accepted.

### 7 — Single dispatch surface in code (not in UI)

ADR-097 §6 introduced a *user-facing* dispatch window. This ADR removes that window from the proposal (see §Supersedes) and replaces it with a *code-internal* dispatch function:

```javascript
// openChipForm(chipEl) — the single entry point for every chip double-click.
// Reads data-chip-role, data-entity-type, data-entity-id from the element
// and routes to the correct existing form (openAddForm or openEditForm).
function openChipForm(chipEl) { /* … */ }
```

There is one dispatcher in code; there is no dispatcher in the UI. The user never picks an entity type from a dropdown — the chip carries that information.

### 8 — Forms are unchanged

The Add and Edit *forms* (the modals themselves, their fields, their validation, their staging into the bundle) are not the subject of this ADR. They are governed by ADR-031 (creates) and ADR-097 §§2–7 (deltas, notes, source inference). This ADR changes only *how forms open*. A Coder implementing this ADR should not touch the form bodies; only the trigger paths.

The corresponding backend (`bani-add` ingester) needs to accept the patch ops that chip-double-click implies. That is **ADR-143**.

---

## Consequences

### Positive

- **One pattern replaces five.** Every write affordance is "double-click a chip". Users learn one rule and apply it everywhere.
- **The visual vocabulary closes its loop.** ADR-127 said chips are the first-class affordance; this ADR makes that literally true on both read and write axes.
- **The Musician panel and Bani Flow panel lose visible clutter.** The eye is drawn to content, not to toolbars.
- **Discoverability scales with vocabulary.** Adding a new chip type in future automatically gets the edit gesture for free — no new icon to design.
- **Code simplifies.** One delegated handler + per-type form dispatch replaces N section-specific `onclick="openAddForm(...)"` handlers strewn across the templates.

### Negative / accepted tradeoffs

- **Double-click is a learned gesture.** First-time users will not discover it without the hover hint and help-deck callout (§5). This is an accepted cost in exchange for vocabulary cleanliness.
- **Touch users lose ambient access.** Long-press on touch is the natural equivalent but mobile is read-only today (ADR-129 D2), so the actual loss is hypothetical. When mobile entry is accepted, long-press becomes the chip-edit gesture.
- **Single-click and double-click on the same chip risk timing collisions.** The dispatcher must use `dblclick` (a real DOM event) rather than emulating it from two `click`s, so the single-click navigation is not delayed waiting for a potential second click.
- **Concert-title promotion to chip is a visible style change.** Recording titles will look like chips, which is a deliberate elevation but a visible shift.

### Risks

- **Affordance silence.** If the hover hint is too subtle, users may not discover edit at all. Mitigation: A/B-readable hover treatment + help-deck. If after a week of dogfooding the user still cannot find edit, fall back to a *persistent* pencil corner on entity chips (still better than separate edit buttons).
- **Accidental edits from stray double-clicks.** Edit forms are modal and require explicit `Stage` to commit to the bundle. Closing the form without staging is a no-op. Risk is low.
- **Chip pollution.** If every chip is double-clickable, the temptation to make *more* things chips grows. The chip-role taxonomy (§1) is the bound: a chip exists only if it represents a panel, a section, or an entity. No "decorative" chips. Enforce in code review.

---

## Implementation

This ADR governs the trigger surface. The forms themselves (ADR-031 / ADR-097) and the backend op coverage (ADR-143) are separate work. The Coder phase is:

### Phase A — Chip role attributes
A Coder annotates every existing chip render-site with `data-chip-role`, `data-entity-type`, and (for entity chips) `data-entity-id`. No behaviour change yet. Render gate, validate.

### Phase B — Delegated double-click handler
Add `openChipForm(chipEl)` and bind one `dblclick` listener at `document` root (or at the two panel roots). Dispatch by role + type to existing `openAddForm` / `openEditForm` paths. Verify all eight user-listed cases (§Decision §2) work end-to-end into the bundle.

### Phase C — Recording-label chip promotion (all kinds)
Convert every recording-label render-site to a chip:
- `.concert-header` title → chip (concert).
- Lecdem list-item label → chip (lecdem).
- Misc-recording label → chip (misc).
- Inline subject labels (raga / composition / musician) inside a recording's subjects → chips of the respective entity type (case 12).
- Segment labels (`HH:MM:SS — Composition`) → chips of `entity-type="recording-segment"` with selector `recording_id + start` (case 13; depends on ADR-143 §2 segment-selector grammar).

Preserve each chip's existing single-click behaviour. Verify edit forms open on double-click for every kind. Audit the panels for any remaining plain-prose entity labels and convert them; after this phase, the panel-level invariant is: *every label of a stored entity is a chip*.

### Phase D — Retire `+` and `✎` buttons
Remove all panel-section `+` buttons and entity-edit `✎` buttons from the templates. Run regression: every previous trigger path now reachable via chip double-click.

### Phase E — Discoverability layer
Hover hint, first-use tooltip, help-deck entry.

### Verification
- Manual: every chip on the Musician panel and Bani Flow panel responds to double-click with the correct form.
- Bundle: a sequence of double-clicks across panels produces a v2 bundle whose item ops match the ADR-143 matrix.
- Render: `bani-render` passes; no orphaned event handlers; no leftover `+` glyphs in panels.

### Branch

This is a governing UX ADR. Branch: `adr/142-chip-as-object`. PR before merging to `main`. Implementation branches descend per phase (`feature/142A-chip-roles`, `feature/142B-dblclick-dispatch`, …) or are folded into one `feature/142-chip-as-object` branch depending on Coder preference.
