# ADR-159: Header as the Live Identity Rail

**Status**: Proposed
**Date**: 2026-06-12
**Agents**: graph-architect → carnatic-coder → test-engineer
**Depends on**: ADR-156 (active-segment tracking — the live signal this consumes), ADR-066 (chip-parity classes shared with panels), ADR-142 (chips as entity objects). **Supersedes the chip-placement decision of**: ADR-066 (footer chip row).

---

## Context (forces in tension)

The player header is today a label bar: `[▾] [title] [copy][share][yt][≡][✕]` (`buildPlayerBar`, `media_player.js:464–535`). The chips that actually matter for *discovery* — raga, composition, composer, tala — live in a separate footer below the video (`buildPlayerFooter`, `:586–663`). This split costs us in three ways:

- **The footer is dead vertical space** that pushes the player taller for no payload the header couldn't carry. On a small screen this is the difference between a usable floating window and one that overflows the viewport.
- **The label is the wrong primitive.** A freeform title (`"Poonamallee 1965 — MS Subbulakshmi"`) is a string you read; a chip is a *portal* you tap into the graph. The discovery surface is buried at the bottom while an inert string occupies the prime real estate at the top.
- **The header lies about what is playing.** ADR-156 already tracks the active segment (`_updateActiveSegment`, `:744–761`) and re-renders the *footer* chips as a concert moves from one kriti to the next — but the header title is set once at open and never changes. A listener who entered on Kānaḍa and is now hearing Surutti sees a header that still says whatever it said at minute zero. They must open the tracklist and reconcile timestamps to learn what they are hearing. That is exactly the friction ADR-156 was built to remove, only half-delivered because the *prominent* surface (the header) was never wired to the live signal.

The forces: **immersion** (the player should answer "what am I hearing right now?" without a click), **economy of space** (one identity surface, not two), and **fidelity to the live concert** (the header must follow the playhead, because a Carnatic concert recording is a sequence, not a single item).

## Pattern

**One Strong Centre.** There should be exactly one place that answers "what is this?" — and it should be the most prominent place, the header. Collapse the two identity surfaces (label + footer) into a single live chip rail in the bar. The rail is not decoration; it is the centre of the player's meaning, and it is *alive* — bound to the playhead, not to the open event.

## Decision

### 1. The header carries a chip lineup; the freeform label is retired

`buildPlayerBar` stops rendering `.mp-title` as the primary element. In its place, the bar renders a horizontal chip rail in this order:

1. **Performer chip** (stable anchor, leftmost) — era-tinted musician chip (`_buildMusicianChipForFooter`, `:540–584`). *Rationale for keeping it despite the user's raga-first list:* the performer is **concert-stable** — it does not change as the recording moves between kritis — whereas everything after it is **segment-live**. Keeping "who" as a fixed left anchor and letting the rest update is what makes the live-sync legible rather than vertiginous. **Open for review:** if you'd rather drop the performer from the rail entirely (it is still reachable from the source title / panel), say so and I'll cut it.
2. **Raga chip** — `.raga-chip`, teal (`--chip-raga-border`).
3. **Composition chip** — `.comp-chip`, amber (`--chip-comp-border`).
4. **Composer chip** — `buildComposerChip` (`:1272–1335`), era-tinted.
5. **Tala** — demoted to last, inline text (`trail-tala`), rendered **only if present** (`formatTala`).

All chips keep their existing classes, colors, click-to-navigate handlers, and ADR-142 entity roles — this is a *relocation*, not a reinvention. Colors already exist as tokens (`base.html:20–58`); no new palette.

### 2. The footer is retired

`.mp-footer` and its CSS (`base.html:1111–1127`) are removed. `buildPlayerFooter` is **renamed and repurposed** into the rail builder (`buildPlayerRail` or folded into `buildPlayerBar`) so the chip-construction logic is reused verbatim, not duplicated. The video sits directly below the bar; the player loses one horizontal band of height.

### 3. The source/concert title is demoted, not deleted

The concert/source string (venue, occasion, date — e.g. "Poonamallee 1965") still matters, but it is no longer the *primary* header element. It moves to:
- the bar's `title=` tooltip (hover/long-press), and
- the tracklist/queue header, which already displays it.

It is therefore one affordance away, never gone — but the prime surface now belongs to the live chips.

### 4. The rail is bound to the playhead — the live-sync advance

This is the core advance and it is **cheap**, because ADR-156 already built the signal. `_updateActiveSegment` (`:744–761`) currently calls `updatePlayerFooter` on every segment crossing. We **repoint that call** at the header rail. When the concert crosses from Kānaḍa into Surutti, the header chips swap to Surutti — automatically, with no user action. The performer chip (concert-stable) does not flicker; only the segment chips (raga/composition/composer/tala) update.

`updatePlayerFooter(player, ragaId, compositionId, displayTitle, tala)` is renamed `updatePlayerRail(...)` with the same signature and the same "preserve `player.meta.nodeId`/`artistName` across changes" behaviour (`:669–692`), so the performer anchor persists. Non-composition fallback (interview/lecture: `displayTitle` via `.yt-label-chip`) is preserved in the rail.

### 5. Overflow behaviour

A four-or-five-chip rail plus the button group can exceed a narrow window. The rail must degrade, not wrap into a tall mess:
- Chips are individually `text-overflow: ellipsis` capped at a max-width; the full name remains in `title=`.
- If the rail still overflows, it scrolls horizontally within the bar (the button group stays pinned right). The existing `.mp-footer-overflow`/`.mp-footer-toggle` idiom (`base.html:1117–1127`) can be retired or repurposed for this.

## Consequences

**Positive**
- One identity surface, at the most prominent position, and it is *alive* — the header finally answers "what am I hearing now?" with zero clicks, completing ADR-156's promise.
- The player is shorter by one band; directly helps the minimize work (ADR-160) and mobile.
- Pure relocation of existing chip builders — no new palette, no new navigation, no schema change.

**Negative / costs**
- Horizontal space in the bar is now contested between chips and buttons; the overflow rules (§5) must be solid or a long raga+composition pair crowds the buttons. This is the main implementation risk.
- The freeform title loses prominence; users who navigated by reading the concert string must now read chips or hover. Mitigated by §3.
- The performer-chip decision (§1) is a genuine fork left open for review.

## Implementation (for Coder, after acceptance)

1. Refactor `buildPlayerFooter` → `buildPlayerRail` (chip construction unchanged); render it inside `buildPlayerBar` between the fold-cue and the right-anchored button group, in the §1 order. Remove the `.mp-title` primary element (keep the string as the bar `title=`).
2. Delete `.mp-footer` markup + CSS (`base.html:1111–1127`); ensure the video wrap sits flush under the bar.
3. Rename `updatePlayerFooter` → `updatePlayerRail`; repoint `_updateActiveSegment` (`:754–755`) at it. Verify the performer anchor persists and only segment chips swap.
4. Add the overflow rules (§5): per-chip ellipsis + horizontal scroll of the rail, button group pinned right.
5. Run `.venv/bin/bani-render`; verify chip parity, navigation, and tala-only-if-present.
6. **Test Engineer**: header renders raga→comp→composer→tala (tala omitted when null); crossing a segment boundary swaps segment chips but not the performer; non-composition recordings show the `.yt-label-chip` fallback in the rail; no `.mp-footer` remains in `graph.html`; long names ellipsize and the rail scrolls without pushing the button group off-screen.

**Branch**: `adr/159-header-live-identity-rail` → PR.

---
[ADR: ADR-159, ADR-156, ADR-066, ADR-142]
[AGENTS: graph-architect]
