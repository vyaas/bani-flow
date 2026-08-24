"""
test_patch_cart_drift.py — ADR-171 drift guards for the patch cart.

The patch cart makes three claims about the ingester that a comment cannot keep
true: which buckets exist, the order they are applied in, and which ops each
bucket accepts. Each of those is asserted here against bani_add.py itself.

Failure here means the browser and the ingester have drifted. Fix both in the
same commit and re-run bani-render so graph.html picks up the change.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

TEMPLATES = PROJECT_ROOT / "carnatic" / "render" / "templates"
ENTRY_FORMS_JS = TEMPLATES / "entry_forms.js"
PATCH_CART_JS = TEMPLATES / "patch_cart.js"
BANI_ADD_PY = PROJECT_ROOT / "carnatic" / "bani_add.py"
BASE_HTML = TEMPLATES / "base.html"
HTML_GENERATOR = PROJECT_ROOT / "carnatic" / "render" / "html_generator.py"


# ── fixtures ───────────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def entry_forms_js() -> str:
    assert ENTRY_FORMS_JS.exists(), f"not found: {ENTRY_FORMS_JS}"
    return ENTRY_FORMS_JS.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def patch_cart_js() -> str:
    assert PATCH_CART_JS.exists(), f"not found: {PATCH_CART_JS}"
    return PATCH_CART_JS.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def bani_add_py() -> str:
    assert BANI_ADD_PY.exists(), f"not found: {BANI_ADD_PY}"
    return BANI_ADD_PY.read_text(encoding="utf-8")


# ── helpers ────────────────────────────────────────────────────────────────────


def _bani_bundle_keys(js: str) -> list[str]:
    """Parse the bucket keys out of the `const baniBundle = { ... }` literal."""
    m = re.search(r"const baniBundle\s*=\s*\{(.*?)\n\};", js, re.DOTALL)
    assert m, "could not locate the baniBundle literal in entry_forms.js"
    return re.findall(r"^\s*([a-z_]+)\s*:", m.group(1), re.M)


def _known_item_types(py: str) -> set[str]:
    """Parse KNOWN_ITEM_TYPES out of bani_add.main()."""
    m = re.search(r"KNOWN_ITEM_TYPES\s*=\s*\{(.*?)\}", py, re.DOTALL)
    assert m, "could not locate KNOWN_ITEM_TYPES in bani_add.py"
    return {s.strip().strip("\"'") for s in m.group(1).split(",") if s.strip()}


def _cart_bucket_order(js: str) -> list[str]:
    m = re.search(r"const PATCH_BUCKET_ORDER\s*=\s*\[(.*?)\];", js, re.DOTALL)
    assert m, "could not locate PATCH_BUCKET_ORDER in patch_cart.js"
    return [s.strip().strip("\"'") for s in m.group(1).split(",") if s.strip()]


def _dispatch_order(py: str, buckets: set[str]) -> list[str]:
    """The order main() actually processes the buckets in.

    Read from the `if <bucket>:` guards rather than the `_process_*` call names:
    the deprecated composers shim (ADR-110) routes through `_process_musicians`,
    so matching on function names reports `musicians` where `composers` belongs.
    """
    start = py.index("def main(")
    body = py[start:]
    seen: list[str] = []
    for name in re.findall(r"^    if (\w+):$", body, re.M):
        if name in buckets and name not in seen:
            seen.append(name)
    return seen


def _known_ops_per_bucket(py: str) -> dict[str, set[str]]:
    """Harvest the ingester's own "Known ops:" error strings — its self-description.

    e.g. "raga item has unknown op '{op}'. Known ops: create, patch, annotate, append."
    """
    out: dict[str, set[str]] = {}
    for noun, ops in re.findall(
        r"(\w+) item has unknown op[^\n]*?Known ops:\s*([a-z, ]+)\.", py
    ):
        out[noun] = {o.strip() for o in ops.split(",") if o.strip()}
    return out


# ── bucket parity ──────────────────────────────────────────────────────────────


def test_bani_bundle_keys_match_ingester(entry_forms_js, bani_add_py):
    """baniBundle's buckets must equal bani_add.py's KNOWN_ITEM_TYPES.

    A bucket in the browser but not the ingester is a hard exit at ingest time
    (bani_add.py rejects unknown keys before processing anything). A bucket in the
    ingester but not the browser makes addToBundle() throw mid-handler, killing the
    form silently — which is exactly how `talas` was unreachable before ADR-171.
    """
    js_keys = set(_bani_bundle_keys(entry_forms_js))
    py_keys = _known_item_types(bani_add_py)
    only_js = js_keys - py_keys
    only_py = py_keys - js_keys
    assert not only_js and not only_py, (
        "ADR-171 bucket drift:\n"
        f"  browser only (baniBundle):        {sorted(only_js)}\n"
        f"  ingester only (KNOWN_ITEM_TYPES): {sorted(only_py)}\n"
        "Fix: reconcile both, then re-run bani-render."
    )


def test_cart_covers_every_bucket(entry_forms_js, patch_cart_js):
    """Every bucket must have a cart section, or its ops are staged invisibly."""
    js_keys = set(_bani_bundle_keys(entry_forms_js))
    order = set(_cart_bucket_order(patch_cart_js))
    missing = js_keys - order
    extra = order - js_keys
    assert not missing and not extra, (
        f"PATCH_BUCKET_ORDER is out of step with baniBundle:\n"
        f"  staged but never rendered: {sorted(missing)}\n"
        f"  rendered but never staged: {sorted(extra)}"
    )


def test_every_bucket_has_a_display_noun(entry_forms_js, patch_cart_js):
    """PATCH_BUCKET_NOUN feeds every row title; a gap prints the raw bucket key."""
    m = re.search(r"const PATCH_BUCKET_NOUN\s*=\s*\{(.*?)\};", patch_cart_js, re.DOTALL)
    assert m, "could not locate PATCH_BUCKET_NOUN in patch_cart.js"
    nouns = set(re.findall(r"([a-z_]+)\s*:", m.group(1)))
    missing = set(_bani_bundle_keys(entry_forms_js)) - nouns
    assert not missing, f"PATCH_BUCKET_NOUN is missing: {sorted(missing)}"


# ── ordering ───────────────────────────────────────────────────────────────────


def test_cart_order_matches_dispatch_order(patch_cart_js, bani_add_py):
    """The cart's section order is a claim about what bani-add will do.

    ADR-171 §7. Note this is deliberately NOT the order of baniBundle's literal,
    nor ADR-083 §1's prose — compositions are processed before musicians so that
    segment composition_id references resolve. The dispatcher is authoritative.
    """
    cart = _cart_bucket_order(patch_cart_js)
    dispatch = _dispatch_order(bani_add_py, set(cart))
    assert cart == dispatch, (
        "ADR-171 §7 order drift:\n"
        f"  patch_cart.js PATCH_BUCKET_ORDER: {cart}\n"
        f"  bani_add.py main() dispatch:      {dispatch}"
    )


# ── op coverage ────────────────────────────────────────────────────────────────


def test_describe_op_handles_every_ingester_op(patch_cart_js, bani_add_py):
    """describeOp must branch on every op the ingester accepts.

    An op with no branch renders through the unknown-shape path — legible, but it
    loses its human summary, which is the whole point of the cart.
    """
    known = _known_ops_per_bucket(bani_add_py)
    assert known, "harvested no 'Known ops:' strings from bani_add.py — parser drift"
    all_ops = set().union(*known.values())
    # 'create' is the default when `op` is absent, so it is always in play.
    all_ops.add("create")

    m = re.search(r"function describeOp\(.*?\n\}\n", patch_cart_js, re.DOTALL)
    assert m, "could not locate describeOp in patch_cart.js"
    cases = set(re.findall(r"case '([a-z]+)':", m.group(0)))

    missing = all_ops - cases
    assert not missing, (
        f"describeOp has no case for ops the ingester accepts: {sorted(missing)}\n"
        f"  ingester ops by bucket: { {k: sorted(v) for k, v in known.items()} }"
    )


def test_json_editor_op_whitelist_matches_ingester(patch_cart_js, bani_add_py):
    """The raw-JSON editor's whitelist must not reject an op bani-add would accept."""
    known = _known_ops_per_bucket(bani_add_py)
    all_ops = set().union(*known.values()) | {"create"}
    m = re.search(r"const known = \[([^\]]*)\];", patch_cart_js)
    assert m, "could not locate the JSON-editor op whitelist in patch_cart.js"
    allowed = {s.strip().strip("\"'") for s in m.group(1).split(",") if s.strip()}
    assert not (all_ops - allowed), (
        f"the JSON editor would reject valid ops: {sorted(all_ops - allowed)}"
    )


# ── artefact shape ─────────────────────────────────────────────────────────────


def test_download_envelope_unchanged(entry_forms_js):
    """downloadBundle must still emit exactly schema_version / generated_at / items.

    bani_add.py rejects an unknown top-level key in `items` with a hard exit before
    processing anything, so a leak here breaks every download at once.
    """
    m = re.search(r"function downloadBundle\(\)\s*\{(.*?)\n\}", entry_forms_js, re.DOTALL)
    assert m, "could not locate downloadBundle in entry_forms.js"
    body = m.group(1)
    keys = set(re.findall(r"^\s*([a-z_]+):", body, re.M))
    assert keys == {"schema_version", "generated_at", "items"}, (
        f"downloadBundle envelope changed: {sorted(keys)}"
    )
    assert "_assertCleanArtefact" in body, (
        "downloadBundle must assert the artefact carries no cart bookkeeping (ADR-171 §1)"
    )


def test_op_identity_is_non_enumerable(entry_forms_js):
    """_patchOpId must be non-enumerable — that is what keeps it out of the artefact.

    ADR-171 §1: JSON.stringify skips non-enumerable properties, so downloadBundle
    and the localStorage write cannot disagree about what gets stripped.
    """
    m = re.search(
        r"Object\.defineProperty\(obj,\s*'_patchOpId',\s*\{(.*?)\}", entry_forms_js, re.DOTALL
    )
    assert m, "could not find the _patchOpId defineProperty call in entry_forms.js"
    assert re.search(r"enumerable:\s*false", m.group(1)), (
        "_patchOpId must be defined with enumerable: false, or it leaks into the "
        "downloaded patch and bani-add will reject the file."
    )


def test_no_stale_bundle_filename(entry_forms_js, patch_cart_js):
    """UI copy must name the file the browser actually downloads."""
    for name, text in (("entry_forms.js", entry_forms_js), ("patch_cart.js", patch_cart_js)):
        assert "bani_add_bundle.json" not in text, (
            f"{name} still tells the user to run `bani-add bani_add_bundle.json`, "
            "but downloadBundle emits bani_add_patch.json."
        )


# ── wiring ─────────────────────────────────────────────────────────────────────


def test_patch_cart_is_registered_after_entry_forms():
    """patch_cart.js depends on entry_forms.js globals, so load order matters."""
    gen = HTML_GENERATOR.read_text(encoding="utf-8")
    assert '_load("patch_cart.js")' in gen, "patch_cart.js is never loaded"
    block = gen[gen.index("script_block = "):]
    assert "entry_forms," in block and "patch_cart," in block, (
        "patch_cart is missing from the assembled script block"
    )
    assert block.index("entry_forms,") < block.index("patch_cart,"), (
        "patch_cart.js must load AFTER entry_forms.js — it needs baniBundle, "
        "_patchMetaOf, createEntryWindow and topZ."
    )


def test_patch_button_opens_the_cart():
    """ADR-171 §Decision: the button reviews, it no longer downloads blind."""
    html = BASE_HTML.read_text(encoding="utf-8")
    m = re.search(r'<button id="bundle-download-btn"[^>]*onclick="([^"]+)"', html)
    assert m, "could not find the #bundle-download-btn markup in base.html"
    assert m.group(1) == "openPatchCart()", (
        f"#bundle-download-btn still calls {m.group(1)!r}; it must open the cart so "
        "nothing is downloaded unreviewed."
    )

def test_prefill_forms_support_force_create(entry_forms_js):
    """Reopening a staged CREATE must not flip the form into edit mode.

    ADR-171 §3. In these forms `prefill` doubles as the edit-mode discriminator
    (`const isEdit = !!prefill`), so a cart reopen that merely prefills would make
    the form emit `{op:'patch', id, fields}` against an entity that does not exist
    yet — silently converting a create into a patch that the writer will reject.
    Every form the cart can reopen with a prefill must honour `forceCreate`.
    """
    for fn in ("buildMusicianForm", "buildRagaForm", "buildCompositionForm",
               "buildAddMusicianForm"):
        m = re.search(
            re.escape(f"function {fn}(") + r"([^)]*)\)\s*\{(.{0,600}?)const isEdit = ([^;]+);",
            entry_forms_js, re.DOTALL,
        )
        assert m, f"could not locate {fn}'s signature and isEdit in entry_forms.js"
        assert "forceCreate" in m.group(1), f"{fn} does not accept forceCreate"
        assert "forceCreate" in m.group(3), (
            f"{fn} accepts forceCreate but does not use it when computing isEdit"
        )
    # buildAddConcertForm takes (musicianId, opts) rather than a destructured object.
    m = re.search(r"const isEdit = !!rec([^;]*);", entry_forms_js)
    assert m and "forceCreate" in m.group(1), (
        "buildAddConcertForm must honour opts.forceCreate, or a reopened staged "
        "recording create silently becomes an upsert."
    )


def test_reopen_descriptors_name_registered_forms(entry_forms_js, patch_cart_js):
    """Every `reopen: { form: X }` must resolve in PATCH_REOPEN_FORMS.

    An unregistered name would fall through to the JSON editor with no signal —
    the descriptor would look present and simply never be honoured.
    """
    m = re.search(r"const PATCH_REOPEN_FORMS\s*=\s*\{(.*?)\n\};", patch_cart_js, re.DOTALL)
    assert m, "could not locate PATCH_REOPEN_FORMS in patch_cart.js"
    registered = set(re.findall(r"^\s*([a-z_]+):", m.group(1), re.M))
    used = set(re.findall(r"reopen:\s*\{\s*form:\s*'([a-z_]+)'", entry_forms_js))
    assert used, "no reopen descriptors found — Step 4 of the rollout is missing"
    assert not (used - registered), (
        f"descriptors name unregistered forms: {sorted(used - registered)}"
    )
    # And every registered form must actually exist in entry_forms.js.
    fns = set(re.findall(r"return (build\w+)\.apply", m.group(1)))
    for fn in sorted(fns):
        assert f"function {fn}(" in entry_forms_js, (
            f"PATCH_REOPEN_FORMS references {fn}(), which entry_forms.js does not define"
        )
