# ADR-009: Right Sidebar Panel Title, Instrument Chip Capitalisation, and Era/Instrument Separator

**Status:** Accepted
**Date:** 2026-04-11  
**Depends on:** ADR-008 (era/instrument topbar filters), ADR-007 (search bar colocation)

---

## Context

The screenshot reveals three left–right asymmetries and one typographic inconsistency
in the current rendered state of [`carnatic/graph.html`](carnatic/graph.html):

### Problem 1 — Right sidebar has no panel title

The left sidebar opens with a clear, substantive section header:

```
BANI FLOW ♩
· Search raga / composition
  searching all compositions
```

The right sidebar opens with only a search input placeholder:

```
🔍 Search musician…
   searching all 61 musicians
```

There is no panel title above the search bar. The left sidebar communicates *what
this panel is for* before asking the user to act. The right sidebar asks the user to
act without first naming the surface. This is a **Strong Centres** failure: the right
sidebar has no named centre — it is a collection of widgets without an identity.

The fix is a panel title `MUSICIAN` (matching the typographic register of `BANI FLOW`)
placed above the search bar, giving the right sidebar the same structural grammar as
the left.

### Problem 2 — Instrument chip labels are lowercase

In the `#filter-bar`, the era chips are rendered with title-case labels:
`Trinity`, `Bridge`, `Golden Age`, `Disseminators`, `Living Pillars`, `Contemporary`.

The instrument chips are rendered in all-lowercase:
`vocal`, `veena`, `violin`, `flute`, `mridangam`.

This is a typographic inconsistency within the same row. The era labels are proper
nouns (names of historical periods); the instrument labels are common nouns. Both
are rendered as UI labels in the same chip component. UI labels should follow a
consistent capitalisation convention — title case for all chips — regardless of
whether the underlying data value is a proper noun.

The current [`instrLabels`](carnatic/render.py:1046) object in the JavaScript
`buildFilterChips()` function maps each instrument key to its own lowercase string.
Changing these to title case is a one-line-per-instrument change with no data model
impact.

### Problem 3 — Era/instrument separator is visually weak

The `#filter-bar` contains a `.filter-separator` element between the era group and
the instrument group. In the screenshot, the separator is present but visually
indistinct — the two groups read as a single undifferentiated run of chips. The
rasika cannot immediately tell where eras end and instruments begin without reading
the chip labels carefully.

The separator needs to be more visually prominent: taller, slightly wider margins,
and a colour that reads clearly against the dark background. The current CSS sets
`height: 14px` and `background: var(--bg3)` — both too subtle at the rendered scale.

---

## Forces in Tension

| Force | Pressure |
|---|---|
| **Symmetry** | Left and right sidebars are the two primary navigation surfaces. They should share the same structural grammar: title → search bar → content. The right sidebar currently lacks the title. |
| **Strong Centres** | A named panel is a stronger centre than an unnamed collection of widgets. `MUSICIAN` names the right sidebar's purpose before the user interacts with it. |
| **Typographic Consistency** | All chip labels in the same row should follow the same capitalisation convention. Mixed case (title-case eras, lowercase instruments) signals inconsistency without communicating a meaningful distinction. |
| **Boundaries** | The separator between era chips and instrument chips is a **Boundary** in Alexander's sense — it marks the transition between two different classification systems (temporal vs. timbral). A weak boundary fails to communicate this distinction. A strong boundary makes the two groups legible as separate systems. |
| **Immersion** | The rasika should be able to orient themselves instantly. A missing title and inconsistent typography create micro-friction that interrupts immersion. |

---

## Pattern

**Strong Centres** (Alexander, Pattern 1): a named panel is a stronger centre than
an unnamed one. Adding `MUSICIAN` above the right sidebar search bar gives the panel
an identity that matches the left sidebar's `BANI FLOW ♩`.

**Symmetry** (Alexander, Pattern 139): the left and right sidebars are mirror
surfaces in the three-column layout. They should share the same structural grammar.
The current asymmetry (left has a title, right does not) is a symmetry failure that
the rasika perceives as visual imbalance even if they cannot name it.

**Boundaries** (Alexander, Pattern 13): the separator between era chips and
instrument chips is a boundary between two classification systems. A strong boundary
makes both systems more legible. A weak boundary makes the filter bar read as a
single undifferentiated list.

---

## Decision

Three targeted changes to [`carnatic/render.py`](carnatic/render.py):

---

### Change 1 — Add `MUSICIAN` panel title to the right sidebar

#### Before (lines 841–851)

```html
<!-- ── right sidebar: node-specific (selection, recordings, edge) ── -->
<div id="right-sidebar">
  <div class="search-wrap panel-search-wrap" id="musician-search-wrap">
    <input id="musician-search-input" class="search-input panel-search" type="text"
           placeholder="&#128269; Search musician&#8230;"
           autocomplete="off" spellcheck="false">
    <div id="musician-search-dropdown" class="search-dropdown" style="display:none"></div>
    <div class="search-scope-label" id="musician-scope-label" style="display:none">
      searching all {node_count} musicians
    </div>
  </div>
```

#### After

```html
<!-- ── right sidebar: node-specific (selection, recordings, edge) ── -->
<div id="right-sidebar">
  <div class="panel" id="musician-panel">
    <h3>Musician</h3>
    <div class="search-wrap panel-search-wrap" id="musician-search-wrap">
      <input id="musician-search-input" class="search-input panel-search" type="text"
             placeholder="&#128269; Search musician&#8230;"
             autocomplete="off" spellcheck="false">
      <div id="musician-search-dropdown" class="search-dropdown" style="display:none"></div>
      <div class="search-scope-label" id="musician-scope-label" style="display:none">
        searching all {node_count} musicians
      </div>
    </div>
  </div>
```

The `<h3>Musician</h3>` uses the same `.panel h3` styling already applied to
`BANI FLOW ♩` in the left sidebar — no new CSS required. The wrapper `<div
class="panel" id="musician-panel">` gives the title and search bar a shared
container with the same visual treatment as the Bani Flow panel.

**Note on capitalisation:** `Musician` (title case) rather than `MUSICIAN` (all
caps). The `h3` element in the existing CSS renders in small-caps via
`font-variant: small-caps` or `text-transform: uppercase` — whichever the current
stylesheet applies. The source text should be title case; the CSS controls the
rendered appearance. This matches `Bani Flow ♩` in the source, which renders as
`BANI FLOW ♩` in the browser.

---

### Change 2 — Capitalise instrument chip labels

#### Before (lines 1046–1052 in [`render.py`](carnatic/render.py:1046))

```javascript
const instrLabels = {
  vocal:     'vocal',
  veena:     'veena',
  violin:    'violin',
  flute:     'flute',
  mridangam: 'mridangam',
};
```

#### After

```javascript
const instrLabels = {
  vocal:     'Vocal',
  veena:     'Veena',
  violin:    'Violin',
  flute:     'Flute',
  mridangam: 'Mridangam',
};
```

No data model change. No CSS change. The `instrLabels` object is used only in
[`buildFilterChips()`](carnatic/render.py:1067) to set `label.textContent`. The
underlying `chip.dataset.key` values remain lowercase (they are matched against
`node.data().instrument` which is lowercase in the data). Only the display label
changes.

---

### Change 3 — Strengthen the era/instrument separator

#### Before (CSS, around line 430 in [`render.py`](carnatic/render.py:430))

```css
.filter-separator {
  width: 1px;
  height: 14px;
  background: var(--bg3);
  flex-shrink: 0;
  margin: 0 2px;
}
```

#### After

```css
.filter-separator {
  width: 1px;
  height: 18px;
  background: var(--fg3);
  flex-shrink: 0;
  margin: 0 6px;
  opacity: 0.4;
}
```

Changes:
- `height: 14px → 18px` — taller, spans the full chip height
- `background: var(--bg3) → var(--fg3)` — uses the foreground tertiary colour
  (a muted warm grey) rather than the background tertiary (nearly invisible against
  the dark bar background)
- `margin: 0 2px → 0 6px` — wider breathing room on both sides of the separator,
  making the two groups read as distinct clusters rather than a continuous run
- `opacity: 0.4` — present but subordinate; the separator marks the boundary
  without competing with the chip labels for attention

---

## Consequences

### What this enables

| Before | After |
|---|---|
| Right sidebar: unnamed widget collection | Right sidebar: named panel `Musician`, matching left sidebar grammar |
| Instrument chips: `vocal veena violin flute mridangam` | Instrument chips: `Vocal Veena Violin Flute Mridangam` |
| Era/instrument boundary: visually weak, groups merge | Era/instrument boundary: clear, two groups read as distinct classification systems |
| Left–right asymmetry in panel structure | Left–right symmetry: both sidebars have title → search → content |

### What this forecloses

Nothing. These are purely presentational changes. No data model fields are touched.
No JavaScript logic changes. No existing queries or rendering pipelines are affected.

### Queries this supports

**Rasika orientation query:** "What is this panel on the right for?" — answered
immediately by the `Musician` title before the rasika reads the placeholder text.

**Filter legibility query:** "Are these chips all the same kind of thing, or are
there two different groups?" — answered by the strengthened separator: two groups,
clearly bounded.

---

## Implementation

**Agent:** Carnatic Coder  
**File:** [`carnatic/render.py`](carnatic/render.py) only  
**Scope:** Three targeted edits, all within the HTML template string in
[`render_html()`](carnatic/render.py:342):

| Edit | Location | Change |
|---|---|---|
| 1 | HTML, right sidebar (~line 841) | Wrap search bar in `<div class="panel" id="musician-panel">` with `<h3>Musician</h3>` above it |
| 2 | JS, `instrLabels` object (~line 1046) | Capitalise all five instrument label strings |
| 3 | CSS, `.filter-separator` rule (~line 430) | `height`, `background`, `margin`, `opacity` as specified |

No changes to [`musicians.json`](carnatic/data/musicians.json),
[`compositions.json`](carnatic/data/compositions.json), or any recording file.
Run `python3 carnatic/render.py` after the edits to regenerate
[`carnatic/graph.html`](carnatic/graph.html).

---

## Verification

After implementation:

1. **Right sidebar title visible** — `MUSICIAN` (or `Musician` rendered in small-caps)
   appears above the search bar in the right sidebar, at the same vertical position
   as `BANI FLOW ♩` in the left sidebar.

2. **Instrument chips capitalised** — The filter bar shows `Vocal`, `Veena`,
   `Violin`, `Flute`, `Mridangam` (title case), matching the capitalisation register
   of the era chips (`Trinity`, `Bridge`, `Golden Age`, etc.).

3. **Separator visible** — A clear vertical line separates the era chip group from
   the instrument chip group. The two groups read as distinct clusters at a glance,
   without needing to read the chip labels to understand the boundary.

4. **No functional regression** — Clicking instrument chips still filters correctly
   (the `chip.dataset.key` values are unchanged). The musician search bar still
   functions. The scope label still appears when chip filters are active.

5. **Symmetry achieved** — Left sidebar: `BANI FLOW ♩` → search bar. Right sidebar:
   `MUSICIAN` → search bar. The structural grammar is identical.
