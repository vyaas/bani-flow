# ADR-171: The Patch Cart — a Reviewable, Editable Staging Surface

**Status**: Proposed
**Date**: 2026-08-23
**Agents**: graph-architect (proposer) → carnatic-coder (implementer) → test-engineer
**Depends on**: ADR-083 (bundle as canonical write channel), ADR-097 (bundle deltas), ADR-143 (bundle as object-oriented patch file), ADR-152 (uniform patch-success dialog), ADR-085 (self-replicating curation loop), ADR-163 (persistent playlists)
**Supersedes**: ADR-152 §`undoFn` (the per-form positional `pop()` Undo)

---

## Context

The browser-side patch is a **write-only accumulator**. `baniBundle` (`entry_forms.js:21-29`) is a keyed
object of append-only arrays; `addToBundle(type, obj)` (`:31-35`) is a bare `push` with no identity, no
dedupe, no merge, and no replace. The only live view of a session's accumulated work is the button label
`⬇ Patch (N ops)` (`:37-54`) — a single integer.

Roughly thirty distinct submit sites feed that accumulator (eleven form-builders in `entry_forms.js` plus
three playlist ops in `media_player.js:1798,1847,2030`). Over a fifteen-minute curation run a rasika will
stage a dozen ops across several buckets and then have **no way to answer "what did I just change?"** short
of downloading the artefact and reading raw JSON. `⬇ Patch` downloads unreviewed.

The one reversal affordance is ADR-152's `undoFn` (`entry_forms.js:167-182`), uniformly implemented as
`baniBundle.<bucket>.pop()`. It is positional, not identified, and therefore:

- pops the *last* op in the bucket, which after any interleaved staging is **not the op the dialog is about**;
- is deliberately set to `null` whenever one submit emitted several ops — musician node + guru edges
  (`:1447`), raga dual-emission (`:2591`) — because `pop()` cannot express "remove those two together";
- is **absent entirely** from every delta-staging form (`buildEditForm` `:4820`, `_openGenericEditForm`
  `:5877`, the segment and lecdem stagers) and from all three playlist ops;
- is unreachable the instant the success dialog closes.

There is no list of staged ops, no per-op edit, no per-op removal, no clear-all, no conflict warning, no
`beforeunload` guard, and **no persistence** — a reload silently destroys the entire session's work.

### Forces

| Force | Direction |
|---|---|
| **Legibility before commitment** | ADR-143 named the artefact a *patch file*. A patch that cannot be read before it is applied is not a patch; it is a leap of faith. The download must be preceded by a review surface. |
| **Identity, not position** | Every reversal or amendment affordance requires a stable handle on an op. `pop()` is the symptom of having no identity. Identity must be introduced before edit/remove can be correct. |
| **The artefact must not change** | `bani_add.py:1055` hard-exits on any unknown key in `items`, before processing a single op. Cart bookkeeping is *browser-side state*, not patch content, and must be invisible to serialization. |
| **Append-only at the entity layer** | ADR-085 §6 forbids a `delete` op. Removing a cart row removes a *staged intention*; it never removes data. The distinction must be visible in the copy, not just in the code. |
| **Bucket-internal order is contractual** | ADR-143 §Forces: "The bundle preserves order; the ingester applies them in order." A `create` must precede an `append` to the same entity. The cart may render and group, but must never reorder within a bucket. |
| **Grouped intent is one act** | A submit that emits a node plus two edges is *one* authored decision. Presenting it as three rows misrepresents the author's intent and makes correct removal the user's problem. |
| **Retrofit cost must not scale with call sites** | Thirty submit handlers exist. A design requiring each to learn about replacement will be implemented for the loud ones and silently skipped for the rest — which is exactly how `undoFn` ended up covering nine sites out of thirty. |
| **Loss aversion beats tidiness** | Work already staged is the only copy. Persistence must not silently resurrect a stale patch into a later session either — both failure modes are real, so restoration is announced and declinable. |

---

## Pattern

**Christopher Alexander, *The Nature of Order*, Book 1, Property 7 — *Boundaries*.** ADR-083 made the
bundle the boundary between authored intent and stored state; ADR-097 made that boundary fine-grained. But a
boundary that cannot be *inspected* only pretends to be one. The cart gives the boundary a face: the place
where accumulated intent becomes visible to its own author before it crosses over.

**Property 1, *Strong Centres*.** The cart is one strong centre replacing a scattering of weak ones — a
button label that counts, nine divergent `pop()` closures, seven `setTimeout` "✓ Staged" flashes, and one
collapsible snapshot per success dialog. Each was a partial answer to "what did I just do?". The cart is the
whole answer, and the partial ones are retired into it.

**Property 12, *Not-Separateness*.** The cart is not a new kind of thing. It is an `.entry-window`
(`entry_forms.js:1037`) like every form, with the same `.ew-bar`/`.ew-body`/`.ew-footer` anatomy, the same
`topZ` stacking, the same `.ef-*` vocabulary. It sits *among* the forms rather than above them — reachable
mid-edit, not a modal that interrupts.

**Property 15, *Roughness*.** `describeOp` will not classify every op shape perfectly, and the op shapes are
themselves inconsistent (§4). The design absorbs that rather than denying it: an unrecognised op renders its
raw JSON with a marker and stays fully removable. Degrading legibly is a requirement, not a fallback.

---

## Decision

### 1 — Op identity lives beside the artefact, never inside it

`baniBundle`'s arrays continue to hold **pure op objects, byte-identical to today**. Identity is attached as
a **non-enumerable** property plus a side registry:

```js
let _patchSeq = 0;
const _patchMeta = new Map();   // opId → { bucket, groupId, label, reopen }

Object.defineProperty(obj, '_patchOpId', { value: opId, enumerable: false });
```

Non-enumerability is the whole mechanism: `JSON.stringify` skips non-enumerable properties, so both
`downloadBundle()` (`:56-63`) and the `localStorage` write see exactly the object `bani_add` expects. No
strip pass, no deep clone, no chance of the two paths disagreeing.

Every existing consumer keeps working unchanged: `Object.values(baniBundle).reduce(...)` (`:41`), the
`JSON.stringify` in `downloadJson` (`:96`), and any surviving array operation.

A dev-mode `_assertCleanArtefact()` deep-walks the object handed to `downloadJson` and throws if any
`_patch*` key is enumerable. The invariant is asserted, not assumed.

### 2 — `groupId`: one authored act is one row

Ops emitted by a single submit share a `groupId`, bracketed by `_patchGroupBegin()` / `_patchGroupEnd()`
around the emitting handler. The cart renders a group as **one row** bearing a `⚭N` badge, and edits or
removes it as a unit.

This is exactly the case ADR-152 declared unrepresentable and handled by setting `undoFn: null`. Named
grouping makes it representable, and the two known instances (musician+edges `:1434-1437`, raga
dual-emission `:2582-2583`) become ordinary rows.

### 3 — Replacement is ambient, not per-call-site

The cart's edit flow sets `window._patchStagingTarget` to a `groupId`, reopens the originating form
prefilled, and clears the token in a `finally`. `addToBundle` consults the token:

- token absent → `push` (today's behaviour, unchanged);
- token present → splice the new op into the **same index** the old one occupied, preserving
  bucket-internal order (§Forces). For a group, remove the whole group and insert at its lowest former index.

**Every one of the thirty existing submit handlers gains correct replace semantics with no edit to its
code.** This directly answers the retrofit-cost force: the design cannot be partially implemented, because
there is nothing per-site to implement.

The optional third argument `addToBundle(type, obj, meta)` carries only the *reopen descriptor* —
`{ label, reopen: { form, args } }` — and is purely additive. An op with no descriptor is not broken; it
falls back to §5's JSON editor.

### 4 — `describeOp(bucket, op)` — legibility is a first-class concern

Op shapes are heterogeneous **and mutually inconsistent**, and the cart must render all of them as one
sentence. The known inconsistencies are recorded here because they are contract facts, not implementation
details:

| Divergence | Sites |
|---|---|
| `append` addressing an array via `field:` instead of `array:` | `entry_forms.js:2567`, `:2583` (`hindustani_equivalents`) |
| `annotate` emitted flat as `{op,id,text}` instead of `{op,id,note:{text}}` | `_openGenericEditForm` `:6047` vs `buildEditForm` `:5108` |
| `patch` carrying `fields:{}` (ADR-108) vs legacy `field`/`value` | throughout |
| Value-envelope `{op,value:{}}` used by recordings and playlists alone | `:3909`, `media_player.js:1798` |
| Path-addressed arrays `youtube[<vid>].segments`, `youtube[<vid>].subjects.<axis>` | `:5619`, `:5628` |
| Edges keyed by `(source,target)` rather than `id` | `:4741` |

`describeOp` normalizes all of these into `{ title, detail, entityId }` and resolves ids to human labels
through `graphData`. **Ids alone are not legibility**: a row reading `tm_krishna` has not told the author
what they changed.

Unrecognised shapes render their JSON with a `⚠` marker and remain removable. Rendering blank would be worse
than the status quo, because it would report absence where there is content.

### 5 — Editing: reopen preferred, JSON universal

`✎` on a row reopens the originating form prefilled (§3). Most forms already accept prefill
(`buildMusicianForm({prefill})` `:1147`, `buildAddConcertForm(isEdit)`, `buildFocusedYouTubeForm`,
`buildLecdemEditForm`, `buildAddMusicianForm(isEdit)`, `buildSegmentForm`), so descriptors are recorded
incrementally in traffic order.

Any op without a descriptor gets an **editable JSON textarea**, validated on blur (parse + bucket/op
whitelist). Coverage is therefore total from the first commit, and descriptor rollout is an enhancement
rather than a precondition.

### 6 — Removal is patch-scoped

`✕` removes the op or its group from the patch. The control is labelled **"Remove from patch"** — never
"Delete". ADR-085 §6 forbids a `delete` op, and copy that suggests otherwise teaches the wrong model of what
the loop can do.

### 7 — Ordering: grouped by bucket, in ingest order

Sections follow `bani_add.py:1093-1156` exactly:

**ragas → composers → compositions → musicians → recordings → playlists → edges → talas**

Empty buckets are hidden. This ordering is a claim about what will happen, so it must track the ingester —
Step §10 pins it with a test rather than a comment.

Note this is *not* the order in `baniBundle`'s literal, and *not* the order in ADR-083 §1 prose
(which predates the compositions-before-musicians correction). The code is authoritative.

### 8 — Conflict detection is advisory

Two ops sharing `(bucket, entityId, field)` both carry a `⚠` badge. `bani-add` applies both in order and
last wins; the cart reports the collision rather than resolving it. Coalescing ops would change the
artefact's semantics and is out of scope (§11).

### 9 — Persistence: announced, versioned, declinable

```js
const _PATCH_LS_KEY = 'baniPatch.v1';
// { version: 1, saved_at: ISO, items: baniBundle,
//   meta: [ { bucket, index, groupId, label, reopen } ] }
```

- Written on every mutation, `try/catch`-wrapped and silent on failure (matching `raga_wheel.js:1642`,
  `mobile.js:237`).
- `meta` is persisted **separately, keyed by `(bucket, index)`**, precisely because `_patchOpId` is
  non-enumerable and cannot survive serialization (§1). On restore the arrays are walked, fresh opIds minted,
  and meta re-attached positionally.
- On load, staged ops are **never silently resurrected**. A notice offers `[Review]` / `[Discard]`. A stale
  patch quietly restored and then downloaded into a later session is a worse failure than losing it.
- A `version` mismatch discards with a notice. Never partially parse.
- After download the cart banners "Downloaded — apply with `bani-add`, then `bani-render`" plus
  `[Clear patch]`. It does **not** auto-clear: `bani-add` may fail, and the staged ops are the only copy.
- A `beforeunload` guard fires while ops are staged.

### 10 — ADR-152's `undoFn` is retired

The `undoFn` parameter and its ten `pop()` call sites (`:1447, 2573, 2591, 2939, 3135, 3914, 4338, 6555,
6819, 7257`) are removed. Retaining both would leave two reversal models that disagree about *which* op they
act on — and the positional one is the defect the cart exists to correct.

`showPatchSuccess` keeps its headline, its collapsible snapshot, and its next-step block. Its footer becomes
`[Review patch] [Add another] [OK]`, routing reversal to the surface that can do it correctly.

### 11 — Out of scope

- **Mobile.** `#bundle-download-btn` is `display:none` outside the desktop media query
  (`base.html:3963`) and `createEntryWindow` refuses under 768px (`entry_forms.js:1038`). The patch is
  already unreachable on mobile; the cart inherits that. A read-only mobile cart is a worthwhile follow-up
  ADR, but it is a different problem.
- **Reordering ops within a bucket** — order is contractual (ADR-143).
- **A `delete` op** — forbidden by ADR-085 §6.
- **Coalescing redundant ops on download** — flagging is in scope (§8), rewriting the artefact is not.

---

## Consequences

**Gained**

- The patch becomes readable by its author before it is applied — the property ADR-143 named the artefact for
  but never gave it a surface for.
- Reversal and amendment become *correct* rather than approximately correct, and cover all thirty submit
  sites instead of nine.
- A reload no longer destroys a curation session.
- Conflicting ops surface at review time rather than as a silent last-wins at ingest time.
- Two latent defects are closed in passing: `talas` is missing from `baniBundle` (so `entry_forms.js:742`
  throws and `buildTalaMiniForm` dies mid-handler, though `bani_add.py:1055` accepts the bucket), and the
  download emits `bani_add_patch.json` while every instruction string says `bani_add_bundle.json` (`:150`,
  `:3964`, `:6158`).

**Costs**

- A new template file, `patch_cart.js`, registered in `html_generator.py` after `entry_forms.js`.
- `describeOp` is a normalization layer over shapes that are inconsistent by history. It will need a branch
  each time a new op shape is introduced — §10's drift test is what makes that failure loud instead of blank.
- `window._patchStagingTarget` is ambient state. It buys thirty free call sites at the cost of a token that
  must be cleared in a `finally`; a leak would silently turn the next staged op into a replacement.
- Reopen descriptors are additive and rolled out incrementally, so early on some rows edit as JSON. That is
  a deliberate gradient, not an unfinished state.

---

## Verification

Drift guards in `carnatic/tests/test_patch_cart_drift.py`, following the established regex-over-template
pattern of `test_edit_form_spec_drift.py` (the repo has no JS harness):

- `baniBundle` keys == `KNOWN_ITEM_TYPES` (`bani_add.py:1055`) — **fails today** on `talas`, which is what
  pins §Consequences' first fix.
- The cart's section order == the dispatch order in `bani_add.py:1093-1156` (§7).
- Every `(bucket, op)` pair the ingester accepts has a branch in `describeOp`, with the ingester's own
  `unknown op '<op>'. Known ops:` strings (`:224, 524, 676, 896, 951`) as the source of truth.
- `downloadBundle` still emits exactly `schema_version` / `generated_at` / `items`.

End-to-end acceptance is browser-side and manual; the sequence is recorded in the implementation plan. Its
load-bearing assertions: editing a row leaves the op **count unchanged** (proving replace, not append);
removing a group row drops **all** its ops; and the downloaded artefact contains **no `_patch*` key**.
