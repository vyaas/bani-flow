# ADR-084: Lecdem-Aware Bundle Ingestion — Writer Forwarding and `bani_add` Parity

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect → carnatic-coder
**Depends on**: ADR-016 (writer validation source-of-truth), ADR-077 (lecdem schema), ADR-082 (lecdem entry CLI + forms), ADR-083 (bundle as canonical write channel)

---

## Context

ADR-077 declares that a `youtube[]` entry tagged `kind: "lecdem"` carries a `subjects` object naming the ragas, compositions, and musicians it discusses. ADR-082 specifies the entry surfaces — the `write_cli.py add-youtube --lecdem …` flag set, and the lecdem toggle inside the in-browser entry form. ADR-083 ratifies the `bani_add` bundle as the only browser→disk write channel and requires that every key on a `YoutubeEntryItem` be forwarded by the ingester to the writer without translation.

Three components stand between a lecdem-bearing bundle and a lecdem-bearing `musicians/{id}.json`:

1. **`carnatic/writer.py :: CarnaticWriter.add_youtube`** — the validation choke point (ADR-016). Today its signature accepts `composition_id`, `raga_id`, `year`, `version`, `tala`, `performers`. It does not accept `kind` or `subjects`. A call passing them today would either fail (unexpected kwarg) or be silently dropped depending on signature.
2. **`carnatic/bani_add.py :: _process_musicians`** — the dispatcher. Today it forwards a fixed list of fields from each `YoutubeEntryItem` to `writer.add_youtube`. `kind` and `subjects` are not in that list. Even if the writer accepted them, they would never arrive.
3. **`carnatic/write_cli.py :: add-youtube`** — the terminal verb. ADR-082 §1 enumerates the new flags (`--lecdem`, `--about-raga`, `--about-composition`, `--about-musician`) and specifies the validation rules. This ADR is the implementation contract for those flags as they cross into the writer.

This ADR specifies the change to all three so that lecdems flow end-to-end with one set of validation rules applied at one place. It is the implementation-level companion of ADR-082's user-facing surface specification and ADR-083's transport contract.

### Forces

| Force | Direction |
|---|---|
| **Single validation point** | All lecdem rules from ADR-077 (kind enum membership, subjects schema, id resolvability, mutual exclusion with `composition_id`/`raga_id`) live in `CarnaticWriter.add_youtube`. The CLI flag-parsing layer and the bundle ingester perform structural shaping only — they do not duplicate semantic checks. |
| **Forward-only ingester** | `_process_musicians` MUST forward the entire entry dict (or every documented key) to `add_youtube`. It MUST NOT decide which fields are valid; that is the writer's job. |
| **Resolvability requires data context** | Subject id resolution needs `musicians_path`, `compositions_path`, `ragas_path` — all already accessible to the writer. No new file reads. |
| **`subjects` is a single object, not three columns** | The writer accepts one `subjects` keyword argument with the full nested shape (per ADR-077 §2). It does not accept three flat lists. The CLI flag layer does the conversion (`--about-raga` flags → `subjects.raga_ids`). |
| **Atomic write semantics unchanged** | The lecdem path uses the same atomic-write infrastructure as recital tracks (the existing `_atomic_write_musician`). No transactional changes. |
| **Backwards compat with non-lecdem entries** | A `YoutubeEntryItem` with no `kind` and no `subjects` MUST behave identically to today (recital track). The writer MUST NOT inject defaults that change the on-disk JSON for the existing 3000+ entries. |
| **`WriteResult` shape unchanged** | The ingester's per-item reporting depends on `WriteResult.ok / .skipped / .message`. The lecdem path uses the same return shape. New message strings (e.g., `[YT+lecdem]`) are encouraged for legibility but are not a contract change. |

---

## Pattern

**Boundaries** (Alexander, *The Nature of Order*, Property 7). The writer is the boundary between transport (bundle/CLI) and storage (per-entity JSON). All semantic rules live at the boundary. Transports are dumb pipes.

**Strong Centres preserved** (Property 1). Each subject id is the strong centre of its referenced entity. The ingester's job is to deliver the centre's identifier intact; the writer's job is to verify the centre exists. Neither layer invents centres or relabels them.

---

## Decision

### 1 — `CarnaticWriter.add_youtube` accepts `kind` and `subjects`

The signature is extended additively:

```python
def add_youtube(
    self,
    musicians_path: Path,
    *,
    musician_id: str,
    url: str,
    label: str,
    composition_id: str | None = None,
    raga_id: str | None = None,
    year: int | None = None,
    version: str | None = None,
    tala: str | None = None,
    performers: list[dict] | None = None,
    kind: str | None = None,                          # NEW
    subjects: dict | None = None,                     # NEW
    compositions_path: Path | None = None,
    ragas_path: Path | None = None,                   # NEW (needed for subject resolution)
) -> WriteResult:
```

Defaults are `None` for both new fields, so every existing call site keeps working.

### 2 — Validation rules applied inside `add_youtube`

Applied in this order (fail-fast on first error):

1. **`kind` membership.** If `kind` is not None, it MUST be in `YOUTUBE_KINDS` (introduced by ADR-077: `("recital", "lecdem")`). Reject otherwise: `WriteResult(ok=False, message="kind must be one of {YOUTUBE_KINDS}; got 'X'")`.
2. **Recital path (kind in (None, "recital")).** Existing rules unchanged. `subjects` MUST be None or omitted; if present, reject: `WriteResult(ok=False, message="subjects field is only valid on lecdem entries")`.
3. **Lecdem path (kind == "lecdem").**
   - `subjects` MUST be a dict with exactly the keys `raga_ids`, `composition_ids`, `musician_ids`. Missing any key, or extra keys, is a rejection: `WriteResult(ok=False, message="lecdem subjects must have keys raga_ids, composition_ids, musician_ids")`.
   - Each value MUST be a list of strings (possibly empty).
   - `composition_id` MUST be None and `raga_id` MUST be None (ADR-077 invariant). Reject otherwise.
   - **Resolvability.** Each id in `subjects.raga_ids` MUST resolve in the ragas store (`ragas_path`). Each id in `subjects.composition_ids` MUST resolve in the compositions store. Each id in `subjects.musician_ids` MUST resolve in the musicians store. The first unresolved id produces: `WriteResult(ok=False, message="subject not found: <kind>='<id>' (did you mean <suggestions>?)")`. The "did you mean" suggestion uses the same fuzzy-match helper that powers `cli.py musician-exists`.
   - The empty-subjects case (all three arrays empty) is **valid** — the "Manodharma" lecdem (ADR-077 invariant C).
4. **Idempotence.** Existing duplicate-URL detection applies unchanged (per ADR-016): a `youtube[]` entry whose extracted `video_id` matches an existing entry on the same musician returns `WriteResult(ok=False, skipped=True, message="[SKIP] entry exists: …")`.
5. **Storage shape.** On success, the new entry is appended to `musicians/{musician_id}.json :: youtube[]`. The serialised entry omits `kind` when it is `None` or `"recital"` (back-compat: 3000+ existing entries stay byte-identical). It includes `kind: "lecdem"` and the full `subjects` dict (with all three array keys present, even if empty) when on the lecdem path. Recital and lecdem entries co-exist in the same array; ordering is append-only.

### 3 — `bani_add.py :: _process_musicians` forwards `kind` and `subjects`

The forwarding loop is updated to thread the two new fields. The change is a small extension to two existing loops (the `youtube_append` branch and the `new` branch's youtube loop), shown here for the `youtube_append` case:

```python
result = writer.add_youtube(
    musicians_path,
    musician_id=musician_id,
    url=yt["url"],
    label=yt.get("label", ""),
    composition_id=yt.get("composition_id"),
    raga_id=yt.get("raga_id"),
    year=yt.get("year"),
    version=yt.get("version"),
    tala=yt.get("tala"),
    performers=yt.get("performers"),
    kind=yt.get("kind"),                              # NEW
    subjects=yt.get("subjects"),                      # NEW
    compositions_path=comp_path,
    ragas_path=ragas_path,                            # NEW (passed by main())
)
```

Per ADR-083 §2d, the ingester is a transport. It does no semantic checks. If the bundle delivers `kind: "tani"` (a future kind), the ingester forwards it; the writer rejects it; the per-item error line surfaces the rejection. The ingester does not gain knowledge of which kinds exist.

`bani_add.main()` resolves a default `ragas_path` (from `writer._default_ragas_path()`, mirroring how `comp_path` is resolved today) and threads it into the writer factory and per-item calls.

### 4 — `write_cli.py :: add-youtube` flag parsing

ADR-082 §1a specifies the user-facing flag set. This ADR specifies the bridge to the writer:

- `--lecdem` (boolean) sets `kind = "lecdem"`.
- `--about-raga <id>` (repeatable, `action="append"`) collects into `subjects["raga_ids"]`.
- `--about-composition <id>` (repeatable) collects into `subjects["composition_ids"]`.
- `--about-musician <id>` (repeatable) collects into `subjects["musician_ids"]`.
- The CLI **only** assembles the dict and calls `writer.add_youtube(…, kind=…, subjects=…)`. All validation (kind enum membership, mutual exclusion with `--composition-id`/`--raga-id`, resolvability) happens in the writer.
- The CLI's job at the flag-parsing layer is shape: if `--lecdem` is absent and any `--about-*` flag is present, argparse rejects at parse time with a custom validator hook (`add_youtube` would also reject, but a parse-time error gives a better UX). This is a thin convenience, not a duplication of semantic rules.

The new `add-lecdem-subject` verb (ADR-082 §1b) is implemented as a wrapper that loads the entry, mutates one `subjects.<axis>_ids` array, and re-writes via the same atomic path.

### 5 — `WriteResult` messages are legible per kind

The successful append message distinguishes recital from lecdem for log readability:

- Recital: `[YT+]   tm_krishna ← https://youtu.be/abcd1234 (Sri / Endaro Mahanubhavulu)`
- Lecdem:  `[YT+L]  tm_krishna ← https://youtu.be/lecdem8888 (lecdem; 3 raga · 0 comp · 0 musician subjects)`

Message string format is for humans, not for downstream parsing. It is documented but not a contract.

### 6 — Test surface

Three new test fixtures live under `carnatic/tests/`:

1. **`test_writer_add_youtube_lecdem_happy.py`** — adds a lecdem with three raga subjects to a sandbox musician; asserts the entry is appended with `kind: "lecdem"` and full `subjects`; asserts validate passes.
2. **`test_writer_add_youtube_lecdem_invariants.py`** — asserts every rejection rule from §2 produces the right `WriteResult.message`.
3. **`test_bani_add_lecdem_e2e.py`** — feeds a bundle containing one `youtube_append` musician item with one lecdem entry through `bani_add.main`; asserts the on-disk JSON is correct and `cli.py validate` exits 0.

These tests live with the Coder; the Architect's job in this ADR is naming what they cover.

---

## Consequences

### Positive

- **Lecdems become end-to-end functional** with three small, surgical changes (one signature extension, one forwarding-loop extension, one flag-parser bridge). No new modules, no architectural restructuring.
- **One validation site for the whole lecdem subsystem.** `CarnaticWriter.add_youtube` owns every rule. ADR-082's CLI and form layers describe behaviour but don't re-implement checks. Bug-fixing is local.
- **The bundle round-trip closes for lecdems.** A lecdem authored in the form (ADR-082) → bundled (ADR-083) → ingested (this ADR) → rendered (ADR-078) → surfaced on panels (ADR-080, 081) is now a single contiguous path with no manual editing.
- **Future kinds (`tani`, `alapana_demo`, …) cost almost nothing** at this layer. Add the new value to `YOUTUBE_KINDS`, decide its `subjects` shape (or absence), branch in `add_youtube`. The transport (`bani_add.py`) does not change.

### Negative / accepted tradeoffs

- **`add_youtube`'s body grows** from one validation phase (recital) to two (recital, lecdem) plus a kind-dispatch preamble. Mitigated by extracting `_validate_lecdem_entry(subjects, …)` as a pure helper. The writer remains shorter than `bani_add._process_musicians`.
- **`ragas_path` becomes a kwarg of `add_youtube`** to enable subject resolution. Existing callers (recital-only) need not pass it. Slight signature growth in service of validation completeness.
- **Two new test files** add maintenance surface. Accepted: lecdem invariants are exactly the kind of multi-rule validation that breaks silently without dedicated tests.

### Risks

- **A bundle authored against a future schema (`kind: "tani"`)** will surface as a per-item error rather than a bundle-level refusal. This is acceptable per ADR-083's per-item-isolation rule, but the user's mental model may expect "the bundle didn't load". Mitigated by the error message naming the unknown kind explicitly and the bundle's `schema_version` mechanism for breaking shapes.
- **Subject resolvability is checked at write time, not at bundle-build time.** A rasika could download a bundle that fails to ingest because they typo'd a raga id. Mitigated entirely on the form side: ADR-082's combobox-only inputs make a typo'd subject id unauthorable. The CLI path (`--about-raga foo`) is the only remaining typo surface, and the writer's "did you mean" suggestion handles it.

---

## Implementation

1. **`carnatic/writer.py`** (Coder)
   - Extend `add_youtube` signature with `kind`, `subjects`, `ragas_path`.
   - Add `_validate_lecdem_entry(subjects, ragas_path, compositions_path, musicians_path) -> str | None` returning an error message or None.
   - Branch in `add_youtube` body: kind-dispatch preamble → recital-or-lecdem validation → atomic append.
   - Update `[YT+]` log line to `[YT+L]` on lecdem path.

2. **`carnatic/bani_add.py`** (Coder)
   - Resolve a default `ragas_path` in `main()` (mirror `_default_compositions_path` precedent).
   - Thread `kind=yt.get("kind")` and `subjects=yt.get("subjects")` and `ragas_path=…` into both `writer.add_youtube` call sites in `_process_musicians`.
   - No changes to other `_process_*` functions.

3. **`carnatic/write_cli.py`** (Coder)
   - Add `--lecdem`, `--about-raga`, `--about-composition`, `--about-musician` flags to `add-youtube` subparser.
   - Add a parse-time hook that rejects `--about-*` without `--lecdem`.
   - Build `subjects` dict from the three repeatable flags; pass to `writer.add_youtube`.
   - Implement `add-lecdem-subject` verb (load → append → re-write via writer).

4. **`carnatic/render/youtube_kinds.py`** (Coder; pre-req from ADR-077)
   - Export `YOUTUBE_KINDS = ("recital", "lecdem")`.

5. **`carnatic/tests/`** (Coder)
   - Add the three test files named in §6.

6. **Documentation** (Coder)
   - Update `bani_add.py` module docstring's bundle schema sketch to mention `kind` and `subjects` on `YoutubeEntryItem`, and link to ADR-083 and this ADR.
   - Update `carnatic/.clinerules` "Write CLI Tools" entry per ADR-082's documentation step.

7. **Verification**
   - Recital ingestion paths produce byte-identical on-disk diffs to current behaviour for non-lecdem entries.
   - The end-to-end test (`test_bani_add_lecdem_e2e.py`) passes.
   - `python3 carnatic/cli.py validate` exits 0 after a fresh ingest of a mixed-kind bundle.
   - Manual smoke: author a lecdem in `entry_forms.js`'s form, download the bundle, run `bani-add`, run `bani-render`, click the lecturer in the graph, see the lecdem in their panel (ADR-080), click a subject raga, see the lecdem in the bani-flow strip (ADR-081).
