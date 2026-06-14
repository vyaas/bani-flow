# ADR-170 — Permalink Compression: Shrink the Share URL with Native DEFLATE

**Status**: Accepted
**Date**: 2026-06-14
**Depends on**: ADR-151 (the permalink state model + `encodePermalink`/`restoreStateFromHash`), ADR-154 (`v:2` media-key schema), ADR-155 (vendored-asset precedent)
**Raised by**: user, 2026-06-14 — "the share URL is too long; does the hashmap have to be that long?"

---

## Context (forces in tension)

ADR-151 serialises the navigable view (trail + player + panel) as a JSON object,
then `btoa`-encodes it into a `#s=` URL fragment. It works and faithfully
round-trips, but the fragment is long. Measured against real-shaped IDs:

| Case | Current `#s=` length |
|---|---|
| Minimal (media + timestamp) | ~83 chars |
| Realistic full state (5-entry trail + meta + panel) | ~582 chars (585 with `#s=`) |

Decomposing the 436-byte JSON of the worst case: **~190 chars are the actual IDs**
(the irreducible payload) and **~246 chars are pure structure** — key names
(`trail`, `meta`, `panel`, `tp`, `id`), braces, quotes, commas. Base64 then
inflates the whole thing by 33% (3 bytes → 4 chars). So **more than half the
length is JSON verbosity, and a third of what remains is base64 overhead** —
neither carries information.

The forces:
- **No server.** `graph.html` is a self-contained static artefact on GitHub
  Pages (ADR-151). A short-URL service or id→state table needs a backend we
  don't have. Any fix must be 100% client-side and keep the "link unhashes
  offline" property the user values.
- **Not a functional limit, an aesthetic one.** ~585 chars is nowhere near any
  browser/messenger URL ceiling (~2,000 chars is safe everywhere). The complaint
  is "too long to paste comfortably," so the fix should be the highest
  size-reduction for the least risk — not a heroic re-architecture.
- **Old links must keep resolving.** People may already hold `#s=` links. The
  reader must continue to decode them forever.
- **Simplicity now.** The user asked for the simplest available approach.

### Measured options (worst-case 582 → ?)

| Approach | Worst-case | Minimal | Notes |
|---|---|---|---|
| Current plain base64 (`#s=`) | 582 | 83 | baseline |
| LZ-string `compressToEncodedURIComponent` | 384 | 83 | 6-bit alphabet; no win on small payloads |
| Schema trim (short keys, drop dup `vid`, dedup trail/panel/meta) | ~322 | — | new wire schema + migration; modest win |
| **raw DEFLATE + base64url** | **280** | **68** | **best; algorithm available natively in-browser** |

raw DEFLATE wins decisively, and it dedups the repeated IDs (`abhishek_raghuram`
appears 3× across trail/panel/meta) essentially for free — which is exactly why
the manual schema-trim is low value once compression is in place, and is
therefore deferred.

## Pattern

**Transport, not schema.** The fragment's *information content* is already
minimal-ish (mostly IDs we genuinely need). The waste is in how it's serialised
on the wire. So compress the transport and leave the `v:2` JSON state object
**completely untouched** — the smallest possible conceptual surface, no field
migration, no new schema version. The decision lives entirely between
`JSON.stringify` and the URL fragment.

## Decision

1. **Compress with native `CompressionStream('deflate-raw')`**, then base64url
   the bytes, into a new fragment prefix **`#z=`** (z = zipped). No vendored
   library, no `html_generator.py` change — the algorithm is built into every
   modern browser (Chrome/Edge ≥103, Firefox ≥113, Safari ≥16.4; baseline since
   2023). This is the "simplest available" path: nothing to add.
2. **The JSON state schema is frozen at `v:2`.** `#z=` and `#s=` carry the
   *identical* payload; only the transport differs. No `v:3`.
3. **The reader (`decodePermalinkHash`) accepts both prefixes:**
   - `#z=` → base64url-decode → `DecompressionStream('deflate-raw')` → JSON.
   - `#s=` → the existing plain-base64 + UTF-8 path, **unchanged** (legacy links
     resolve forever).
   After either path, the same `v ∈ {1,2}` and `m || vid` validation applies.
4. **Graceful fallback on write.** If `CompressionStream` is undefined (ancient
   browser), `encodePermalink` emits the legacy `#s=` plain form. The reader
   understands it, so old and new builds interoperate in both directions.
5. **`encode`/`decode`/`restore` become `async`.** `CompressionStream` is
   stream-based. The share-button click handlers `await encodePermalink(...)`;
   `restoreStateFromHash` awaits the decode. This is the only structural cost,
   and it is small — the codec stays a pair of pure functions.

### Wire format

```
#z=<base64url( deflate-raw( JSON.stringify(state) ) )>     ← new, default
#s=<base64url( utf8( JSON.stringify(state) ) )>            ← legacy, still read
```

Expected sizes: realistic full state **585 → ~283 chars (~52% shorter)**;
minimal **86 → ~71 chars**.

## Consequences

**Positive**
- Share URLs roughly halve with zero new dependencies and zero infrastructure.
- The static-hosting / offline-faithful property is preserved.
- Old `#s=` links keep working; the change is purely additive on the read side.
- `v:2` schema untouched — no migration, no new degradation matrix.

**Negative / costs**
- `encode`/`decode`/`restore` become async (trivial `await`s at three sites).
- A `#z=` link opened in a stale cached build that predates this ADR won't
  decode — acceptable per ADR-151's existing silent-degradation stance, and
  moot in practice since GitHub Pages serves one current build to everyone.
- Further shrinking (schema trim, id interning) is **deferred**: compression
  already captures the bulk of the win and the residue isn't worth the
  schema-migration risk now. Revisit only if queue permalinks (ADR-164) make
  payloads large again.

**Out of scope** (unchanged from ADR-151): server-side shortening, QR codes,
OG preview tags, native OS share sheet. Queue/playlist permalink encoding is
ADR-164's concern; this ADR's `#z=` transport will carry whatever `q` block
ADR-164 later adds, for free.

---

## Implementation Steps

### Carnatic Coder
1. **`media_player.js`** `encodePermalink`: make `async`; build `state`
   unchanged; if `CompressionStream` exists, deflate-raw → base64url → `#z=`;
   else fall back to the existing `#s=` plain form.
2. **`media_player.js`**: both share-button handlers (desktop ~L1289, mobile
   ~L4348) `await encodePermalink(...)`.
3. **`permalink.js`** `decodePermalinkHash`: make `async`; branch on `#z=`
   (inflate) vs `#s=` (existing plain path); shared validation after.
4. **`permalink.js`** `restoreStateFromHash`: make `async`; `await` the decode.
   The page-load IIFE call stays fire-and-forget.
5. Run `bani-render`; verify `#z=`, `DecompressionStream`, `CompressionStream`
   appear in `graph.html`.

### Test Engineer
1. Update the Python codec mirror in `test_permalink.py`: add a raw-DEFLATE
   (`zlib`, `wbits=-15`) `#z=` encode and teach the decoder both prefixes.
2. Round-trip tests for `#z=` (minimal, full, unicode).
3. Regression: legacy `#s=` fragments still decode (back-compat).
4. Assert the `#z=` form is materially shorter than `#s=` for the full state.
5. Integration: `#z=`, `CompressionStream`, `DecompressionStream` present in
   `graph.html`.

**Branch**: `adr/170-permalink-compression` → PR.

---
[ADR: ADR-170, ADR-151, ADR-154, ADR-155]
[AGENTS: graph-architect]
