# AUDIT-005: `source_type` Elimination — Scope and Remediation Plan

**Date**: 2026-05-19  
**Auditor**: Code Auditor  
**Scope**: All production code and tests that declare, validate, emit, or branch on `source.type` / `source_type`.  
**Trigger**: `bani-add` fails with `"raga patch missing 'id' or 'field'"` when the Edit Raga form submits a `fields`-dict patch whose changed field is `sources`.

---

## 1 — Root cause of the immediate error

The entry form (`entry_forms.js` line 2573–2577) emits:

```json
{ "op": "patch", "id": "natakapriya", "fields": { "sources": [{...}] } }
```

The `_process_ragas()` handler in `bani_add.py` (lines 124–128) reads:

```python
raga_id = r.get("id")
field   = r.get("field")   # ← singular "field", not "fields"
value   = r.get("value")
if not raga_id or not field:
    print(f"  ERROR  raga patch missing 'id' or 'field': {r}")
```

`r.get("field")` returns `None` because the bundle key is `"fields"` (plural dict).  
The handler never tries the `fields` dict path; it errors immediately.

This is compounded by a second blocker: even if the dispatcher were fixed to route `fields.sources`, `patch_raga()` in `writer.py` (lines 1688–1690) hard-refuses `sources`:

```python
if field == "sources":
    return _err("sources is immutable via patch-raga — use add-source instead")
```

And `add_source` (`writer.py` line 1353) only operates on musicians — there is no `add-source-to-raga` pathway.

---

## 2 — Findings

### F-01 · `bani_add.py` · `_process_ragas` patch handler ignores `fields` dict
**File**: `carnatic/bani_add.py` lines 124–128  
**Pattern**: Singular/plural key mismatch between bundle schema and handler  
**Evidence**:
```python
field = r.get("field")   # None when bundle has "fields": {...}
if not raga_id or not field:
    print(f"  ERROR  raga patch missing 'id' or 'field': {r}")
    errors += 1
    continue
```
The same `field`/`value` pattern appears for composition patches at line 550. Musician patches route through a different code path that does support multi-field `fields` dicts (not confirmed in this audit). The raga and composition patch handlers are behind the musician patch handler in evolution.

---

### F-02 · `writer.py` · `VALID_SOURCE_TYPES` closed whitelist — already violated by data
**File**: `carnatic/writer.py` line 74  
**Pattern**: Closed enumeration on an open-world attribute  
**Evidence**:
```python
VALID_SOURCE_TYPES = {"wikipedia", "pdf", "article", "archive", "other"}
```
Live scan of `carnatic/data/musicians/*.json` shows 12 distinct type values in production data, 7 of which are outside this set:

| type | count | in whitelist? |
|---|---|---|
| `wikipedia` | 199 | ✓ |
| `article` | 14 | ✓ |
| `archive` | 11 | ✓ |
| `other` | 8 | ✓ |
| `pdf` | 7 | ✓ |
| `mention` | 3 | ✗ |
| `biographical` | 2 | ✗ |
| `karnatik` | 2 | ✗ |
| `forum` | 1 | ✗ |
| `scholarly` | 1 | ✗ |
| `interview` | 1 | ✗ |
| `tribute` | 1 | ✗ |

The whitelist is enforced at write-time (`add_musician`, `add_hindustani_musician`, `add_raga`, `add_her_raga`, `add_source`, `add_composition`), but past writes have already bypassed it (likely via direct JSON patching or earlier code paths that lacked the check). The check now rejects any attempt to correctly classify a source from a non-whitelisted host.

---

### F-03 · `writer.py` · `source_type` validation scattered across 6 writer methods
**File**: `carnatic/writer.py`  
**Pattern**: Duplicated validation block in every create path  
**Evidence** (6 occurrences):
- `add_musician` — lines 681–685
- `add_hindustani_musician` — lines 751–755  
- `add_raga` — lines 1529–1532  
- `add_her_raga` — lines ~1529 (structurally identical)
- `add_source` — lines 1362–1365  
- `add_composition` — lines 1590–1593 (optional guard)

Each block is a verbatim copy:
```python
if source_type not in VALID_SOURCE_TYPES:
    return _err(
        f"--source-type \"{source_type}\" is not a valid source type\n"
        f"       Valid values: {', '.join(sorted(VALID_SOURCE_TYPES))}"
    )
```

---

### F-04 · `writer.py` · `patch_raga` hard-refuses `sources` but no `add-source-to-raga` exists
**File**: `carnatic/writer.py` lines 1688–1690  
**Pattern**: Dead-end refusal that blocks a legitimate operation without an alternative path  
**Evidence**:
```python
if field == "sources":
    return _err("sources is immutable via patch-raga — use add-source instead")
```
`add_source()` (line 1353) takes a `musician_id` parameter — it only operates on musicians. There is no CLI command `add-source-to-raga` and no writer method that can update a raga's `sources[]`. The comment is a lie: there is no "add-source" pathway for ragas.  
`PATCHABLE_RAGA_FIELDS` (line 90) does not include `"sources"`.

---

### F-05 · `write_cli.py` · `--source-type` required=True on 4 subcommands
**File**: `carnatic/write_cli.py` lines 417–418, 435–436, 534–535, 576  
**Pattern**: CLI requires a field whose validation the backend needs to drop  
**Evidence**:
```python
p.add_argument("--source-type", required=True, dest="source_type",
               help="Source type: wikipedia|pdf|article|archive|other")
```
Affected subcommands: `add-musician`, `add-hindustani-musician`, `add-raga`, `add-her`.  
`add-source` at line 559 also has `--type required=True`.  
`add-composition` has `--source-type default=None` (already optional — not a blocker).

---

### F-06 · `entry_forms.js` · `inferSource()` produces `type` that is validated downstream
**File**: `carnatic/render/templates/entry_forms.js` lines 803–840  
**Pattern**: Front-end produces a field that triggers back-end rejection  
**Evidence**:
```javascript
const SOURCE_HOST_LABELS = [
  ['wikipedia.org',  'Wikipedia',  'wikipedia'],
  ['karnatik.com',   'karnatik.com', 'article'],
  ['archive.org',    'Internet Archive', 'archive'],
  ...
];
function inferSource(url) {
  ...
  return { url: trimmed, label: host || trimmed, type: 'other' };
}
```
`inferSource()` is called on source URL submission and emits `type`. For hosts not in `SOURCE_HOST_LABELS`, it falls back to `type: 'other'`. The emitted `type` then flows into bundle items that hit `VALID_SOURCE_TYPES` validation in `writer.py`. Since `inferSource()` only emits types within the whitelist, this combination currently works — but is fragile: adding a new host mapping with a custom type would break the backend.

---

### F-07 · `entry_forms.js` · Two inline add-new sub-forms hardcode `type: 'wikipedia'`
**File**: `carnatic/render/templates/entry_forms.js` lines 2686, 2735  
**Pattern**: Hardcoded label that contradicts the intent of URL-based inference  
**Evidence**:
```javascript
sources: srcInp.value.trim()
  ? [{ url: srcInp.value.trim(), label: 'Wikipedia', type: 'wikipedia' }]
  : [],
```
Both the "Add missing raga" (line 2686) and "Add missing composer" (line 2735) inline sub-forms hardcode `label: 'Wikipedia', type: 'wikipedia'` regardless of what URL is entered. A non-Wikipedia URL would produce a misleading `type` label. These forms should call `inferSource()` instead.

---

### F-08 · `graph_builder.py` · Legacy `wikipedia` field fallback injects `type: "wikipedia"`
**File**: `carnatic/render/graph_builder.py` lines 69–70  
**Pattern**: Unnecessary type injection into a field the render layer never reads  
**Evidence**:
```python
if not raw_sources and node.get("wikipedia"):
    raw_sources = [{"url": node["wikipedia"], "label": "Wikipedia", "type": "wikipedia"}]
primary_url = raw_sources[0]["url"] if raw_sources else ""
```
The JS rendering layer (`graph_view.js` lines 1166–1168, `bani_flow.js` lines 282–284, 420–422) only accesses `sources[0].url` and `sources[0].label`. It never reads `sources[0].type`. The `type` field injected here is dead weight in the render pipeline — written but never consumed downstream.

---

### F-09 · `tests/` · Two test files assert that `source_type` validation works
**File**: `carnatic/tests/test_musician_traditions.py` lines 68, 93, 130  
**File**: `carnatic/tests/test_her_dual_emission.py` lines 116–139  
**Pattern**: Tests that will need updating when the validated field is removed  
**Evidence** (`test_her_dual_emission.py`):
```python
def test_dual_emission_create_fails_no_append(tmp_path):
    """If the HER create fails (bad source_type), append is not attempted."""
    bundle_ragas = [
        { "op": "create", ...,
          "sources": [{"url": "...", "label": "Wikipedia", "type": "invalid_type"}] }
    ]
    added, skipped, errors = _process_ragas(bundle_ragas, ...)
    assert errors >= 1, "Expected at least 1 error from bad source_type"
```
This test's semantic purpose — confirming that a failed create blocks the downstream append — is still valid. But its *trigger* (invalid `source_type`) will no longer cause a failure once validation is removed. A new trigger is needed. All three calls in `test_musician_traditions.py` pass `source_type="wikipedia"` to `add_musician`/`add_hindustani_musician` — those parameters will disappear from the writer API.

---

## 3 — Summary Map

| # | File | Lines | Pattern | Severity |
|---|---|---|---|---|
| F-01 | `bani_add.py` | 124–128 | `fields` dict ignored by raga patch handler | **BLOCKER** — immediate error |
| F-02 | `writer.py` | 74 | `VALID_SOURCE_TYPES` closed whitelist already violated | **BLOCKER** — rejects valid data |
| F-03 | `writer.py` | 681–685, 751–755, 1529–1532, ~1529, 1362–1365, 1590–1593 | Validation block copy-pasted 6× | Code smell |
| F-04 | `writer.py` | 1688–1690, 90 | `patch_raga` hard-refuses `sources`; no raga `add-source` exists | **BLOCKER** — dead-end |
| F-05 | `write_cli.py` | 417–418, 435–436, 534–535, 576 | `--source-type required=True` on 4+ subcommands | CLI friction |
| F-06 | `entry_forms.js` | 803–840 | `inferSource()` type flows to validated backend | Latent fragility |
| F-07 | `entry_forms.js` | 2686, 2735 | Hardcoded `type: 'wikipedia'` in two sub-forms | Data quality |
| F-08 | `graph_builder.py` | 69–70 | `type: "wikipedia"` injected but never read by renderer | Dead code |
| F-09 | `tests/` | `test_her_dual_emission.py` 116–139; `test_musician_traditions.py` 68, 93, 130 | Tests assert source_type validation works | Will break on removal |

---

## 4 — Recommendations

### R-01 (IMMEDIATE): Fix the raga `patch` handler in `bani_add.py`
The raga patch handler should accept both the legacy `field`+`value` shape (for single-field CLI patches) and the newer `fields` dict shape (for multi-field form patches). The composition patch handler (lines 550–556) has the same gap and should be fixed in the same pass.

Suggested dispatch:
```python
fields_dict = r.get("fields")   # new multi-field form shape
field       = r.get("field")    # legacy single-field CLI shape
value       = r.get("value")

if fields_dict and isinstance(fields_dict, dict):
    # multi-field patch: iterate and call patch_raga for each
    for fld, val in fields_dict.items():
        result = writer.patch_raga(comp_path, raga_id=raga_id, field=fld, value=val, ...)
elif field:
    result = writer.patch_raga(comp_path, raga_id=raga_id, field=field, value=value, ...)
else:
    print(f"  ERROR  raga patch missing 'id', 'field', or 'fields': {r}")
```

### R-02: Remove `VALID_SOURCE_TYPES` and all its validation guards
Delete the constant and remove the six validation blocks listed in F-03. The `source_type` parameter should either be removed from all writer signatures or left as an optional pass-through with no enumeration check. The former (remove entirely) is cleaner given that the render layer never reads it.

### R-03: Allow `sources` in `patch_raga` and add `"sources"` to `PATCHABLE_RAGA_FIELDS`
Remove the hard refusal in `patch_raga` (F-04). Add `"sources"` to `PATCHABLE_RAGA_FIELDS`. The writer should accept a `sources` value (a list of `{url, label}` dicts) and write it directly, with no type validation.

This is sufficient for the natakapriya use case and all future raga source URL edits from the form. An analogous `add-source-to-raga` CLI command can be added later if needed.

### R-04: Make `--source-type` optional (or remove) in `write_cli.py`
Change `required=True` → `default=None` on all four `--source-type` arguments in `write_cli.py`. This is a non-breaking change for existing callers (they can still pass it; it just won't be validated). Alternatively, remove the argument entirely from the CLI spec.

### R-05: Replace hardcoded `type: 'wikipedia'` with `inferSource()` in `entry_forms.js`
In the two inline sub-forms (lines 2686, 2735), replace:
```javascript
[{ url: srcInp.value.trim(), label: 'Wikipedia', type: 'wikipedia' }]
```
with:
```javascript
[inferSource(srcInp.value.trim())]
```
This ensures the emitted source label is host-accurate regardless of what URL is entered.

### R-06: Remove `type` from the legacy fallback in `graph_builder.py`
Simplify line 70 to emit only `{url, label}` without a `type` field, since `type` is never read by the renderer:
```python
raw_sources = [{"url": node["wikipedia"], "label": "Wikipedia"}]
```

### R-07: Update tests
- `test_her_dual_emission.py` test 2: replace the `invalid_type` trigger with a different failure (e.g. missing `name`, or a non-existent `parent_raga` FK) to preserve the structural "failed create blocks downstream append" coverage.
- `test_musician_traditions.py`: remove `source_type=` keyword arguments from the three `add_musician`/`add_hindustani_musician` calls.

---

## 5 — Routing

| Finding | Routed to | Notes |
|---|---|---|
| F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08 | **Carnatic Coder** | Code changes in `bani_add.py`, `writer.py`, `write_cli.py`, `entry_forms.js`, `graph_builder.py` |
| F-09 | **Test Engineer** | Test updates after the writer API changes |
| None | **Graph Architect** | No schema change required; `type` is already an optional field in practice. No ADR needed unless the team wants to formally document `sources[]` as `{url, label}` only. |

---

## 6 — Implementation order

1. **Carnatic Coder** — R-02 first (remove `VALID_SOURCE_TYPES`), then R-03 (`sources` patchable on raga), then R-01 (fix `fields` dict in bani_add.py). This unblocks all current errors.
2. **Carnatic Coder** — R-04, R-05, R-06 in any order (clean-up pass).
3. **Test Engineer** — R-07 after the writer API is stable.
4. `bani-render` must be run after entry_forms.js changes (render gate).

---

*[AGENTS: code-auditor]*
