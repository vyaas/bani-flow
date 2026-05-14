# ADR-139: Remove External YouTube Link; Add Copy-to-Clipboard in Media Player Bar

**Status**: Accepted  
**Date**: 2026-05-13  
**Agents**: graph-architect, carnatic-coder

---

## Context

Every recording row in every panel and trail renders a `.trail-acts` container with two interactive elements side by side:

```
[▶] [↗]
```

The play button (`.rec-play-btn`, 26×26 px) and the external YouTube link (`.yt-ext-link`, 22×22 px) are separated by a 4 px gap. On desktop this gap is too small to avoid misclicks; on mobile the touch targets overlap in practice. Clicking ↗ navigates the browser to YouTube — the very action Bani Flow is designed to prevent. Users who do this are handed to the recommendation algorithm and rarely return.

`buildYtLink()` is called at **10 call sites**:
- 6 in `carnatic/render/templates/media_player.js`
- 2 in `carnatic/render/templates/bani_flow.js`

The external link exists to allow sharing a recording URL. That goal is legitimate but does not require a persistent link on every row.

---

## Pattern

**Principle of Centres** (Alexander): every element should reinforce nearby centres, not compete with them. The ↗ link is a competing centre that weakens the ▶ button's affordance and acts as an escape hatch that harms retention. Removing it strengthens the ▶ button as the single intentional action on a recording row.

**Shareability as a secondary action**: sharing a URL is something a user decides to do *after* finding the recording worth sharing — i.e., after the player is open. Placing the copy control inside the open player is both contextually correct and unambiguous.

---

## Decision

### Before

```
Recording row:  [ artist chip ] ... [ ▶ ] [ ↗ ]

Media player bar:  [ chip ] — [ title ] · · · [ ≡ ] [ ✕ ]
```

### After

```
Recording row:  [ artist chip ] ... [ ▶ ]

Media player bar:  [ chip ] — [ title ] · · · [ 📋 ] [ ≡ ] [ ✕ ]
```

1. **Remove** all 10 `buildYtLink(...)` call sites.
2. **Delete** `buildYtLink` function definition and its comment header.
3. **Delete** `.yt-ext-link` CSS block in `base.html`.
4. **Add** a `.mp-copy-btn` clipboard icon button to `buildPlayerBar()`, inserted into `.mp-bar-right` before the tracklist toggle and close button.
5. **Wire** the click handler in `createPlayer()` after the instance is constructed: copy `ytDirectUrl(vid, instance.currentOffset)` to the clipboard via `navigator.clipboard.writeText`; show `.mp-copy-copied` state for 1500 ms.

The copied URL uses `ytDirectUrl` (already present at lines 12–15) which produces `https://youtu.be/{vid}?t={offset}` — a canonical, shareable short URL.

---

## Consequences

**Positive**
- Eliminates the misclick path entirely on both desktop and mobile.
- Recording rows have a single interactive element: the ▶ button. Larger effective target, zero confusion.
- Shareability is preserved and actually improved — the copied URL reflects the current playback offset, not just the video root.
- `.yt-ext-link` CSS and `buildYtLink` are deleted: no dead code.

**Neutral**
- Users who previously clicked ↗ intentionally will find the clipboard icon in the player; one extra step, but only after making a deliberate choice to share.
- `navigator.clipboard.writeText` requires a secure context (HTTPS or localhost). Bani Flow is served over HTTPS via GitHub Pages; the `bani-serve` local dev server at `localhost:8765` also qualifies.

**Negative / Risk**
- None identified. No schema or data changes.

---

## Implementation

### `carnatic/render/templates/media_player.js`
- Delete `buildYtLink` function + comment block (currently lines 526–545)
- Remove 6 call sites:
  - `row1.appendChild(buildYtLink(...))` — musician panel leaf rows
  - `actsDiv.appendChild(buildYtLink(...))` — comp tree leaf rows (×3)
  - `actsDiv.appendChild(buildYtLink(...))` — lecdem ref rows (×2)
- In `buildPlayerBar()`: add `.mp-copy-btn` to `rightGroup` before the tracklist toggle
- In `createPlayer()`: wire `.mp-copy-btn` click → clipboard copy + transient `.mp-copy-copied` class

### `carnatic/render/templates/bani_flow.js`
- Remove 2 call sites in `_buildPlayActsDiv`-equivalent blocks (lines 1136, 1197)

### `carnatic/render/templates/base.html`
- Delete `.yt-ext-link` CSS block (~lines 1602–1637)
- Add `.mp-copy-btn` and `.mp-copy-btn.mp-copy-copied` CSS near `.mp-close`

### Render gate
Run `bani-render` after all template edits. No data changes; `bani validate` is not required.
