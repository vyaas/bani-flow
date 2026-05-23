# ADR-151 — Shareable State Permalink: URL Hash as Navigation Recipe

**Status**: Accepted  
**Date**: 2026-05-22  
**Depends on**: ADR-016 (writer validation), ADR-085 (self-replicating loop), ADR-148 (bani-flow navigable history)

---

## Context

Bani Flow is a knowledge graph meant to be explored. But exploration produces knowledge that is hard to share: "I followed Harikambhoji → Nattakurinji → Lalgudi Jayaraman → *that* recording." The journey is as valuable as the destination.

Currently there is no way to share a view of the system. All navigation state is ephemeral (in-memory only). The copy button in the player bar copies a raw YouTube URL — the destination without the journey. No `window.location.hash`, no `history.pushState`, no `URLSearchParams` exists anywhere in the codebase.

Forces in tension:
- **Fidelity to the trail**: the user's exploration path is meaningful; a bare video link discards it
- **Static hosting**: `graph.html` is deployed as a single self-contained file on GitHub Pages — no server, no database, no short-URL service
- **Simplicity**: the state we need to transmit is small (≤5 trail entries + one player state + one musician panel ID)
- **Forward compatibility**: the URL format must be versioned so future schema changes don't silently break old links
- **SICP principle**: the permalink should be a *recipe* (a description of how to arrive at the state) not a *snapshot* (a byte-for-byte copy of the DOM). Data and program are one: the hash encodes the sequence of function calls that produce the view.

---

## Pattern

**Levels of Scale** (Alexander): the share button lives at the smallest scale (player bar), but it captures structure at a larger scale (the trail). The URL hash is the boundary at which the local session becomes a public artefact.

**Self-Replicating Loop** (ADR-085): the permalink closes the loop — a user who arrived through exploration can now share that exploration, which can seed another user's journey in the same graph.

---

## Decision

Encode the full navigable state as a versioned JSON payload, base64-encoded into the URL fragment (`#s=...`). The fragment is never sent to the server, works with static hosting, and is parseable with `atob()` in any browser.

### URL Hash Schema (v1)

```
https://vyaas.github.io/bani-flow/#s=<url-safe-base64>
```

The decoded JSON payload:

```json
{
  "v": 1,
  "vid": "dQw4w9WgXcQ",
  "t": 45,
  "meta": {
    "nid": "lalgudi_jayaraman",
    "rid": "nattakurinji",
    "cid": "manasu_vishaya",
    "rec": "rec_abc123"
  },
  "trail": [
    { "tp": "raga", "id": "harikambhoji" },
    { "tp": "raga", "id": "nattakurinji" },
    { "tp": "comp", "id": "manasu_vishaya" }
  ],
  "panel": "lalgudi_jayaraman"
}
```

**Field reference:**

| Field | Type | Required | Description |
|---|---|---|---|
| `v` | int | yes | Schema version. Currently always `1`. |
| `vid` | string (11 chars) | yes | YouTube video ID |
| `t` | int | no | Playback offset in seconds |
| `meta.nid` | string | no | Musician node ID (matches `elements` graph node) |
| `meta.rid` | string | no | Raga ID |
| `meta.cid` | string | no | Composition ID |
| `meta.rec` | string | no | Recording ID (e.g. `"rec_abc123"`) — stable Bani Flow identifier |
| `trail` | array (max 5) | no | Left panel (Bani Flow) navigation back-stack, oldest→newest |
| `trail[].tp` | string | yes | Type: `'raga'`, `'comp'`, `'perf'`, or `'yt'` |
| `trail[].id` | string | yes | Subject ID (raga ID, composition ID, or `"recId::perfIdx"` for perf/yt) |
| `panel` | string | no | Current right-panel musician node ID |

### Encoding

```javascript
function encodePermalink(instance) {
  const trail   = window.getBaniTrail   ? window.getBaniTrail()          : { back: [] };
  const panelId = window.getCurrentPanelNode ? window.getCurrentPanelNode() : null;
  const state = {
    v:     1,
    vid:   instance.vid,
    ...(instance.currentOffset > 0 && { t: instance.currentOffset }),
    meta: {
      ...(instance.meta.nodeId        && { nid: instance.meta.nodeId }),
      ...(instance.meta.ragaId        && { rid: instance.meta.ragaId }),
      ...(instance.meta.compositionId && { cid: instance.meta.compositionId }),
      ...(instance.meta.recId         && { rec: instance.meta.recId }),
    },
    ...(trail.back.length && { trail: trail.back.map(e => ({ tp: e.type, id: e.id })) }),
    ...(panelId && { panel: panelId }),
  };
  const json   = JSON.stringify(state);
  const b64    = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return '#s=' + b64;
}
```

### Restoration Protocol (the replay)

On page load, after `graphData` is injected into the page and Cytoscape is initialised:

```
1. Check window.location.hash for '#s=' prefix.
2. If absent: no-op.
3. If present:
   a. URL-safe-decode the base64: replace '-'→'+', '_'→'/', re-pad with '=' as needed
   b. atob(padded) → JSON.parse()
   c. Validate: state.v === 1 (log warning and abort if not)
   d. Replay trail (if present):
      for each entry in state.trail:
        call triggerBaniSearch(entry.tp, entry.id, /*fromHistory=*/true)
   e. Open musician panel (if state.panel is present):
        call _openMusicianPanelForTransit(state.panel) or selectNode equivalent
   f. Open player:
        call openOrFocusPlayer(state.vid, ..., state.t, ..., {
          nodeId: state.meta.nid,
          ragaId: state.meta.rid,
          compositionId: state.meta.cid,
          recId:  state.meta.rec,
        })
   Entire block wrapped in try/catch. Failures are silent (console.warn only).
```

### Graceful degradation rules

| Condition | Behaviour |
|---|---|
| `v !== 1` | Log `"Permalink v${state.v} not supported"`, abort restoration |
| Trail entry's `id` not found | Skip the entry, continue with remaining entries |
| `panel` nodeId not in graph | Skip panel opening |
| YouTube embed fails | YouTube iframe shows native error — outside Bani Flow's control |
| Malformed base64 | `atob()` throws → caught by try/catch, no crash |
| Hash present but no `vid` | Abort restoration (vid is the minimum required field) |

### Share button placement

- **Location**: `.mp-bar` in the player bar, between `.mp-copy-btn` and `.mp-tracklist-toggle`
- **Icon**: SVG share glyph (upward arrow from box — standard social share iconography)
- **Class**: `mp-share-btn`
- **Title attribute**: `"Copy permalink"`
- **On click**:
  1. Call `encodePermalink(instance)` → set `window.location.hash`
  2. Copy `window.location.href` to clipboard via `navigator.clipboard.writeText()`
  3. Flash button state + show toast: `"Permalink copied!"`
- Also present in mobile player bar

---

## Consequences

**Positive**:
- Users can share not just a video but the trail that led them there
- Zero infrastructure: works from the existing static GitHub Pages deployment
- The hash is human-debuggable: `atob(hash.slice(3))` in DevTools reveals the full state
- Forward-compatible: `v` field allows future schema evolution without breaking old links
- The SICP insight is honoured: the permalink is a recipe, not a snapshot

**Negative / risks**:
- Very long trails (5 entries) produce base64 strings of ~250-350 characters — URL length is fine, but visually dense
- No server-side short-URL option in this ADR; if desired, that is a separate ADR
- `recording_id` must be plumbed through to the player `meta` (currently absent at `openOrFocusPlayer` call sites — a minor code change required)
- Mobile share UI uses the same clipboard mechanism (no native OS share sheet in this ADR)

**Out of scope**:
- Server-side URL shortening
- QR code generation
- OG preview tags for social media cards (a future ADR)
- Native OS share sheet integration (iOS/Android)
- Browser back/forward integration with `history.pushState` (a separate concern)

---

## Implementation Steps

### Carnatic Coder

1. **`bani_flow.js`**: Add `window.getBaniTrail()` exposing `{ current: _currentBaniSubject, back: [...baniHistory.back] }`
2. **`graph_view.js`**: Add `window.getCurrentPanelNode()` exposing `_currentPanelNodeId`
3. **`bani_flow.js`** (~L830, ~L844): add `rec: row.track.recording_id` to both `openOrFocusPlayer` `meta` call sites
4. **`media_player.js`**: Add `recId` to player instance `meta`; add `encodePermalink(instance)` function; add share button to `buildPlayerBar()` with click handler
5. **`base.html`**: Add `.mp-share-btn` CSS; add `restoreStateFromHash()` function called from the post-data-load init block
6. Run `bani-render` to verify

### Test Engineer

1. Unit: round-trip encode/decode for a known state object
2. Unit: malformed/absent hash → no crash
3. Unit: `v: 999` → ignored
4. Unit: empty trail and no panel → encodes/decodes correctly
5. Integration: navigate → share → reload with hash → verify player + trail restored

[ADR: ADR-016, ADR-085, ADR-148]  
[AGENTS: graph-architect]
