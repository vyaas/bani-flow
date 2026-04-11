# ADR-011: Left–Right Sidebar Symmetry

**Status:** Accepted
**Date:** 2026-04-11

---

## Context

The screenshot reveals four structural asymmetries between the left sidebar (Bani Flow — music entry points) and the right sidebar (Musician — musician entry points). These asymmetries violate the governing principle of the three-column layout established in ADR-003: *left is the music entry point; right is the musician entry point*. Both are entry points of equal rank; they should look and behave symmetrically.

The four asymmetries are:

### Asymmetry 1 — Unequal widths

Left sidebar: `width: 280px` ([`carnatic/render.py`](carnatic/render.py:490))  
Right sidebar: `width: 240px` ([`carnatic/render.py`](carnatic/render.py:499))

The 40px difference is a legacy of ADR-003's original proposal, which suggested 280px for the left (to accommodate the listening trail) and 240px for the right (the old sidebar width). Now that both panels are first-class entry points, the width difference creates a visual imbalance — the left panel looks heavier and more important.

### Asymmetry 2 — Panel title icon mismatch

Left panel title: `BANI FLOW ♪` — has a music note icon ([`carnatic/render.py`](carnatic/render.py:803))  
Right panel title: `MUSICIAN` — no icon ([`carnatic/render.py`](carnatic/render.py:844))

The music note icon on the left is a *semantic marker* — it signals "this is the music entry point." The right panel, as the *musician entry point*, deserves a parallel semantic marker. Without one, the left panel looks decorated and the right panel looks bare.

### Asymmetry 3 — Post-selection filter behaviour

**Right sidebar (Musician):** After selecting a musician from the dropdown, a `Filter recordings…` input appears ([`carnatic/render.py`](carnatic/render.py:863)). The rasika can type to whittle down the recordings list to a specific raga, composition, or context. This is the "progressive narrowing" pattern — start broad, then refine.

**Left sidebar (Bani Flow):** After selecting a composition or raga from the dropdown, the listening trail appears. There is **no equivalent filter input**. The rasika cannot narrow the trail (e.g., "show only vocal performances of this raga" or "show only recordings from the 1960s"). The trail is all-or-nothing.

This is the most significant functional asymmetry. The user's observation is precise: *"once results show, we should be able to whittle them down, just like how we would do on the right panel."*

### Asymmetry 4 — Search bar visual framing

**Right sidebar search wrap:** Uses `.search-wrap.panel-search-wrap` ([`carnatic/render.py`](carnatic/render.py:845)), which applies:
```css
.panel-search-wrap {
  padding: 8px 14px 0;
  border-bottom: 1px solid var(--bg2);
}
```
([`carnatic/render.py`](carnatic/render.py:738–741))

**Left sidebar search wrap:** Uses `.search-wrap` only ([`carnatic/render.py`](carnatic/render.py:804)), which has no padding or border-bottom. The search input sits flush inside the `.panel` padding without the extra visual separation that the right panel's search bar has.

The result: the right panel's search bar is visually separated from the panel content below it by a border line; the left panel's search bar is not. They look like different UI components even though they serve the same function.

---

## Pattern

This resolves two Alexander patterns:

### **Symmetry** (Pattern 139)

Alexander's *Symmetry* pattern states that local symmetries — not global bilateral symmetry, but symmetry between equivalent centres — create a sense of wholeness and rightness. The left and right sidebars are **equivalent centres** of equal rank: both are entry points into the graph, one via music, one via musician. They must be locally symmetric: same width, same structural framing, same behavioural affordances.

The current asymmetries break this local symmetry. The rasika perceives the left panel as "different" from the right panel, even if they cannot articulate why. The interface feels unfinished.

### **Levels of Scale** (Pattern 5)

The filter-after-selection behaviour (Asymmetry 3) is a *Levels of Scale* issue. The right panel supports two levels of granularity: (1) select a musician, (2) filter their recordings. The left panel supports only one level: (1) select a composition/raga. Adding a trail filter to the left panel creates the same two-level structure on both sides, making the interface coherent at every scale.

---

## Decision

Four targeted changes, one per asymmetry.

---

### Change 1 — Equal sidebar widths

Set both sidebars to `width: 260px`. This is the midpoint between the current 280px and 240px, preserving the total horizontal footprint while achieving symmetry.

#### Before

```css
/* carnatic/render.py line 489 */
#left-sidebar {
  width: 280px; background: var(--bg1);
  border-right: 1px solid var(--bg2);
  display: flex; flex-direction: column;
  overflow-y: auto; font-size: 0.78rem;
  flex-shrink: 0;
}

/* carnatic/render.py line 498 */
#right-sidebar {
  width: 240px; background: var(--bg1);
  border-left: 1px solid var(--bg2);
  display: flex; flex-direction: column;
  overflow-y: auto; font-size: 0.78rem;
  flex-shrink: 0;
}
```

#### After

```css
#left-sidebar {
  width: 260px; background: var(--bg1);
  border-right: 1px solid var(--bg2);
  display: flex; flex-direction: column;
  overflow-y: auto; font-size: 0.78rem;
  flex-shrink: 0;
}

#right-sidebar {
  width: 260px; background: var(--bg1);
  border-left: 1px solid var(--bg2);
  display: flex; flex-direction: column;
  overflow-y: auto; font-size: 0.78rem;
  flex-shrink: 0;
}
```

---

### Change 2 — Add music icon to Musician panel title

The right panel title `MUSICIAN` has no icon. Use the same `&#9835;` (♪) music note that the left panel already uses. Both panels are music entry points; both get the same icon.

#### Before

```html
<!-- carnatic/render.py line 803 -->
<h3>Bani Flow &#9835;</h3>

<!-- carnatic/render.py line 844 -->
<h3>Musician</h3>
```

#### After

```html
<h3>Bani Flow &#9835;</h3>

<h3>Musician &#9835;</h3>
```

---

### Change 3 — Add trail filter to Bani Flow panel

After a Bani Flow selection produces a listening trail, show a `Filter trail…` input that narrows the trail entries by artist name or composition title. This mirrors the `rec-filter` input on the right panel exactly.

#### HTML change — add filter input inside `#bani-flow-panel`

**Before** ([`carnatic/render.py`](carnatic/render.py:813–818)):

```html
<button id="bani-clear" onclick="clearBaniFilter()">&#10005; Clear filter</button>
<div id="listening-trail">
  <div id="trail-composer-label"></div>
  <ul id="trail-list"></ul>
</div>
```

**After:**

```html
<button id="bani-clear" onclick="clearBaniFilter()">&#10005; Clear filter</button>
<input id="trail-filter" type="text" placeholder="Filter trail&#8230;"
       style="display:none" autocomplete="off" spellcheck="false" />
<div id="listening-trail">
  <div id="trail-composer-label"></div>
  <ul id="trail-list"></ul>
</div>
```

#### CSS — add `#trail-filter` rule, mirroring `#rec-filter`

**Before** ([`carnatic/render.py`](carnatic/render.py:541–548)):

```css
#rec-filter {
  width: 100%; background: var(--bg2); color: var(--fg2);
  border: 1px solid var(--bg3); padding: 4px 8px;
  font-family: inherit; font-size: 0.72rem; border-radius: 2px;
  margin-top: 6px; display: none; box-sizing: border-box;
}
#rec-filter:focus { outline: none; border-color: var(--yellow); }
#rec-filter::placeholder { color: var(--gray); font-style: italic; }
```

**After (add alongside existing `#rec-filter` rules):**

```css
#rec-filter,
#trail-filter {
  width: 100%; background: var(--bg2); color: var(--fg2);
  border: 1px solid var(--bg3); padding: 4px 8px;
  font-family: inherit; font-size: 0.72rem; border-radius: 2px;
  margin-top: 6px; display: none; box-sizing: border-box;
}
#rec-filter:focus,
#trail-filter:focus { outline: none; border-color: var(--yellow); }
#rec-filter::placeholder,
#trail-filter::placeholder { color: var(--gray); font-style: italic; }
```

#### JS — show `#trail-filter` when trail is populated; wire its `input` event

**In `applyBaniFilter` function** ([`carnatic/render.py`](carnatic/render.py:1803)):

**Before:**
```javascript
document.getElementById('bani-clear').style.display = 'block';
```

**After:**
```javascript
document.getElementById('bani-clear').style.display = 'block';
document.getElementById('trail-filter').style.display = 'block';
document.getElementById('trail-filter').value = '';
```

**In `clearBaniFilter` function** ([`carnatic/render.py`](carnatic/render.py:1985)):

**Before:**
```javascript
function clearBaniFilter() {
  activeBaniFilter = null;
  cy.elements().removeClass('faded highlighted bani-match');
  document.getElementById('bani-search-input').value = '';
  document.getElementById('bani-clear').style.display = 'none';
  document.getElementById('listening-trail').style.display = 'none';
  applyZoomLabels();
  clearAllChipFilters();
}
```

**After:**
```javascript
function clearBaniFilter() {
  activeBaniFilter = null;
  cy.elements().removeClass('faded highlighted bani-match');
  document.getElementById('bani-search-input').value = '';
  document.getElementById('bani-clear').style.display = 'none';
  document.getElementById('trail-filter').style.display = 'none';
  document.getElementById('trail-filter').value = '';
  document.getElementById('listening-trail').style.display = 'none';
  applyZoomLabels();
  clearAllChipFilters();
}
```

**Add `trail-filter` event listener** (place immediately after the `rec-filter` event listener at [`carnatic/render.py`](carnatic/render.py:1512)):

```javascript
// ── trail-filter event listener ───────────────────────────────────────────────
document.getElementById('trail-filter').addEventListener('input', function() {
  const q         = this.value.toLowerCase().trim();
  const trailList = document.getElementById('trail-list');
  const items     = trailList.querySelectorAll('li:not(.trail-no-match)');
  let anyVisible  = false;

  items.forEach(li => {
    if (!q) { li.style.display = 'flex'; anyVisible = true; return; }
    // Match artist name (trail-artist text) and composition title (trail-label)
    const artistText = (li.querySelector('.trail-artist') || {}).textContent || '';
    const labelText  = (li.querySelector('.trail-label')  || {}).textContent || '';
    const matches    = artistText.toLowerCase().includes(q) ||
                       labelText.toLowerCase().includes(q);
    li.style.display = matches ? 'flex' : 'none';
    if (matches) anyVisible = true;
  });

  let noMatch = trailList.querySelector('.trail-no-match');
  if (!anyVisible && q) {
    if (!noMatch) {
      noMatch = document.createElement('li');
      noMatch.className = 'trail-no-match';
      noMatch.style.cssText = 'color:var(--gray);font-style:italic;cursor:default;padding:5px 0;';
      noMatch.textContent = 'no match';
      trailList.appendChild(noMatch);
    }
    noMatch.style.display = 'flex';
  } else if (noMatch) {
    noMatch.style.display = 'none';
  }
});
```

**Behaviour contract:**
- Filter input is hidden until a Bani Flow selection is active (mirrors `rec-filter` which is hidden until a node is selected)
- Typing in the filter narrows `#trail-list li` items by artist name OR composition title
- Clearing the filter (empty string) restores all items
- `clearBaniFilter()` hides and resets the filter input
- The filter does **not** affect the graph highlighting — it only narrows the visible trail entries. The graph continues to show all matched nodes with `bani-match` styling.

---

### Change 4 — Uniform search bar framing

Apply the `.panel-search-wrap` class (and its padding + border-bottom) to the left sidebar's search wrap, so both search bars have identical visual framing.

#### Before ([`carnatic/render.py`](carnatic/render.py:804)):

```html
<div class="search-wrap" id="bani-search-wrap">
  <input id="bani-search-input" class="search-input panel-search" type="text"
         placeholder="&#9833; Search raga / composition"
         autocomplete="off" spellcheck="false">
  <div id="bani-search-dropdown" class="search-dropdown" style="display:none"></div>
  <div class="search-scope-label" id="bani-scope-label" style="display:none">
    searching all compositions
  </div>
</div>
```

#### After:

```html
<div class="search-wrap panel-search-wrap" id="bani-search-wrap">
  <input id="bani-search-input" class="search-input panel-search" type="text"
         placeholder="&#9833; Search raga / composition"
         autocomplete="off" spellcheck="false">
  <div id="bani-search-dropdown" class="search-dropdown" style="display:none"></div>
  <div class="search-scope-label" id="bani-scope-label" style="display:none">
    searching all compositions
  </div>
</div>
```

The only change is adding `panel-search-wrap` to the class list of the outer `div`. This applies:
```css
.panel-search-wrap {
  padding: 8px 14px 0;
  border-bottom: 1px solid var(--bg2);
}
```

This gives the left panel's search bar the same visual separation (padding above, border below) as the right panel's search bar.

**Note:** The `.panel` class already provides `padding: 12px 14px` on the `#bani-flow-panel` container. Adding `panel-search-wrap` to the inner search div will create a slight double-padding effect at the top. To avoid this, the `#bani-flow-panel` panel's `<h3>` and search wrap should be restructured so the search wrap sits outside the panel's default padding — exactly as the right panel does with `#musician-panel` (which wraps the search in `panel-search-wrap` and relies on that class for its own padding, not the `.panel` class).

The right panel's structure is:
```html
<div class="panel" id="musician-panel">
  <h3>Musician</h3>
  <div class="search-wrap panel-search-wrap" id="musician-search-wrap">
    ...
  </div>
</div>
```

The left panel's structure should match:
```html
<div class="panel" id="bani-flow-panel">
  <h3>Bani Flow &#9835;</h3>
  <div class="search-wrap panel-search-wrap" id="bani-search-wrap">
    ...
  </div>
  <button id="bani-clear" ...>...</button>
  <input id="trail-filter" .../>
  <div id="listening-trail">...</div>
</div>
```

The `panel-search-wrap` class provides `padding: 8px 14px 0` and `border-bottom`. Since the `.panel` class provides `padding: 12px 14px` on the outer container, the `<h3>` gets that padding, and the search wrap overrides with its own padding. This is exactly how the right panel works — the `<h3>` sits inside `.panel` padding, and the search wrap has its own padding via `panel-search-wrap`.

---

## Summary of Changes

| # | What | Where | Type |
|---|------|-------|------|
| 1 | Set both sidebars to `width: 260px` | CSS lines 489–504 | CSS |
| 2 | Add `&#9675;` icon to `<h3>Musician</h3>` | HTML line 844 | HTML |
| 3 | Add `#trail-filter` input, show/hide logic, and `input` event listener | HTML line 813, CSS lines 541–548, JS lines 1803 and 1985, new JS block | HTML + CSS + JS |
| 4 | Add `panel-search-wrap` class to `#bani-search-wrap` | HTML line 804 | HTML |

---

## Consequences

### Positive

1. **Visual symmetry** — The two sidebars now look like a matched pair. A new user immediately understands the three-column layout: left = music entry, centre = graph, right = musician entry.
2. **Behavioural symmetry** — Both panels support the same two-level interaction: (1) search and select, (2) filter results. The rasika learns one interaction pattern and applies it to both panels.
3. **Scalability** — The trail filter is a natural home for future refinements: filter by era, by instrument, by decade. The input is already wired; future enhancements extend it without structural changes.
4. **Immersion** — The rasika can now narrow a large Bani Flow trail (e.g., "all recordings of Begada raga") to a specific artist or composition without clearing the filter and starting over.

### Negative

1. **Slight canvas width reduction** — Changing left from 280px to 260px and right from 240px to 260px is net-neutral (total sidebar width stays 520px). No canvas impact.
2. **Trail filter does not affect graph highlighting** — This is intentional. The graph shows all matched nodes; the filter only narrows the visible trail. A rasika who wants to see only one musician's recordings can click that musician's name in the trail to select them in the graph. The filter is a *reading aid*, not a *graph control*.

### What the Carnatic Coder Must Implement

All four changes are in [`carnatic/render.py`](carnatic/render.py). No data model changes. No changes to `musicians.json`, `compositions.json`, or any recording file.

1. **CSS** — Change `#left-sidebar` width to 260px; change `#right-sidebar` width to 260px; merge `#rec-filter` and `#trail-filter` CSS rules.
2. **HTML** — Add `&#9675;` to `<h3>Musician</h3>`; add `panel-search-wrap` class to `#bani-search-wrap`; add `<input id="trail-filter">` after `<button id="bani-clear">`.
3. **JS** — In `applyBaniFilter`: show and reset `#trail-filter`. In `clearBaniFilter`: hide and reset `#trail-filter`. Add `trail-filter` `input` event listener (mirrors `rec-filter` listener).

### What the Librarian Must Do

**Nothing.** Pure UI change.

---

## Verification

After implementing, verify:

1. **Width parity** — Both sidebars are visually the same width. Measure in browser DevTools if uncertain.
2. **Icon parity** — Both panel titles have an icon. `BANI FLOW ♪` and `MUSICIAN ○` render at the same visual weight.
3. **Filter parity** — After selecting a composition in Bani Flow, the `Filter trail…` input appears. Typing "Ramnad" narrows the trail to entries with "Ramnad" in the artist name. Typing "Begada" narrows to entries with "Begada" in the composition title. Clearing the input restores all entries.
4. **Search bar framing parity** — Both search bars have the same padding above and a border-bottom separating them from the content below. Inspect in DevTools: both should show `padding: 8px 14px 0` and `border-bottom: 1px solid #504945`.
5. **Clear filter resets trail filter** — Clicking `✕ Clear filter` hides and empties the trail filter input.
6. **No regression** — The right panel's `rec-filter` still works. The Bani Flow trail still populates correctly. Node selection still works from trail artist names.

---

## Query This Enables

**Rasika query:** "I searched for Begada raga and got 12 trail entries. I want to see only the vocal performances."

**Before this fix:** Impossible without clearing the filter and re-searching. The rasika must scroll through all 12 entries.

**After this fix:** Type "vocal" in the trail filter — or type the name of a specific vocalist — to narrow the trail to matching entries. The graph continues to highlight all 12 matched nodes; the trail shows only the filtered subset.

**Rasika query:** "I want to compare how the left and right panels work before showing this tool to a student."

**Before this fix:** The student notices immediately that the panels look different (different widths, different title styles, different filter behaviour) and asks why. The teacher has no good answer.

**After this fix:** The panels are visually and behaviourally symmetric. The student learns one interaction pattern and applies it to both.
