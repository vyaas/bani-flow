# ADR-020: Raga / Composition Header Parity with the Musician Panel

**Status:** Proposed
**Date:** 2026-04-12

---

## Context

### The symptom

The screenshot shows the two sidebars side by side:

**Left sidebar (Bani Flow — composition/raga selected):**

```
BANI FLOW ♩
[Search raga / composition]
[Filter trail…]

Composed by Patnam Subramanya Iyer · Begada · Adi   ← 0.72rem teal italic, no link
```

**Right sidebar (Musician — node selected):**

```
MUSICIAN ♩
[Search musician…]

● Ramnad Krishnan  1918–1973  ↗   ← 0.85rem yellow bold, Wikipedia link
[Filter recordings…]
```

The composition/raga metadata is rendered in small, muted, italic teal text
(`#trail-composer-label`, `font-size: 0.72rem; color: var(--teal); font-style: italic`).
The musician name is rendered in large, bold, yellow text with a Wikipedia outbound link
(`#node-name`, `font-size: 0.85rem; color: var(--yellow); font-weight: bold`).

The filter input appears **above** the composition/raga metadata on the left, but
**below** the musician name on the right.

### Why this matters architecturally

Carnatic music is not a tradition of performers alone. The raga is the primary
structural unit of the tradition — it is the tonal universe within which a musician
improvises. The composition is the crystallised form of that universe — a text
transmitted across generations, carrying the composer's name, the raga's grammar,
and the tala's pulse. When a rasika searches for "Begada" or "Abhimanamennedu",
they are not searching for a container for recordings. They are entering a musical
world with its own identity, history, and lineage.

The current rendering communicates the opposite: the composition/raga label is
visually subordinate — smaller, muted, italic — while the musician name is the
primary visual anchor. This is a structural misrepresentation of the tradition.

The filter input placement compounds the problem. On the right, the filter appears
*after* the musician name — the name is the heading, the filter is the tool. On the
left, the filter appears *before* the composition/raga label — the tool precedes the
subject. This inverts the natural reading order.

### Root cause in the code

[`#trail-composer-label`](../carnatic/render.py:764) is styled as:

```css
#trail-composer-label {
  font-size: 0.72rem; color: var(--teal); font-style: italic;
  margin-bottom: 6px; padding-bottom: 5px;
  border-bottom: 1px solid var(--bg2); line-height: 1.5;
}
```

It is populated in [`buildListeningTrail()`](../carnatic/render.py:2093) as plain
`textContent` — no links, no structure:

```javascript
// For composition:
composerLabel.textContent = parts.join(' · ');
// e.g. "Composed by Patnam Subramanya Iyer · Begada · Adi"

// For raga:
composerLabel.textContent = 'Raga: ' + raga.name;
```

The filter input [`#trail-filter`](../carnatic/render.py:908) is placed in the HTML
*before* `#listening-trail` (which contains `#trail-composer-label`):

```html
<input id="trail-filter" …>          ← filter FIRST
<div id="listening-trail">
  <div id="trail-composer-label"></div>   ← label SECOND
  <ul id="trail-list"></ul>
</div>
```

The right sidebar places the filter *after* the node name:

```html
<div id="node-info">
  <div id="node-header">
    <span id="node-name">—</span>       ← name FIRST
    …
  </div>
  <input id="rec-filter" …>            ← filter SECOND
</div>
```

---

## Forces in tension

1. **Equal footing for ragas and compositions** — The tradition treats ragas and
   compositions as primary musical entities, not as metadata tags on recordings.
   The graph must honour this by giving them the same visual weight as musicians.

2. **Outbound navigation** — The musician panel provides a Wikipedia link (`↗`) that
   takes the rasika out of the page to learn more. Ragas and compositions have
   Wikipedia pages too. The rasika must be able to navigate to them with the same
   affordance.

3. **Reading order** — The natural reading order is: *what am I looking at?* (the
   heading) → *how do I filter it?* (the tool). The filter must appear below the
   heading, not above it.

4. **Structural symmetry (ADR-011)** — The left and right panels are symmetric axes
   of the tradition. If the right panel gives the musician a bold heading with a link,
   the left panel must give the raga/composition the same treatment.

5. **Immersion** — The rasika who searches for "Begada" must feel they have entered
   the world of Begada — not that they have applied a filter tag. The heading is the
   threshold of that world.

6. **Composer as a linked entity** — The composer (e.g. Patnam Subramanya Iyer) is
   also a node in the graph (via `musician_node_id` in `compositions.json`). When the
   composer has a `musician_node_id`, clicking their name in the header should select
   that node in the graph — the same affordance as clicking a co-performer name in the
   trail (ADR-019).

7. **Scalability** — The header must work for both raga searches (one entity: the raga)
   and composition searches (two entities: the composition + its raga). The structure
   must accommodate both without special-casing the layout.

---

## Pattern

### **Strong Centres** (Alexander, Pattern 1)

A raga is a **strong centre** — a bounded musical universe with its own identity,
grammar, and emotional character. A composition is a strong centre — a crystallised
text with a composer, a raga, a tala, and a transmission history. The current rendering
treats them as weak centres: small, muted, subordinate to the musician. The fix
restores them as strong centres by giving them the same visual weight as the musician
node header.

### **Levels of Scale** (Alexander, Pattern 5)

The left panel has three natural levels of scale:

```
Level 1: The raga or composition (the heading — what the rasika searched for)
Level 2: The filter (the tool — how to narrow the trail)
Level 3: The trail (the content — who performed it, when, where)
```

The current rendering collapses levels 1 and 2 by placing the filter before the
heading. The fix restores the correct three-level structure: heading first, filter
second, trail third.

### **Mirroring** (Alexander, Pattern 27)

The left and right panels are mirrors of each other along the music/event axis. The
right panel has: heading (musician name + link) → filter → content (recordings). The
left panel must mirror this: heading (raga/composition name + link) → filter → content
(trail). Mirroring is not cosmetic symmetry — it is the structural principle that makes
both panels legible as parts of the same whole.

### **Gradients** (Alexander, Pattern 9)

The heading is the broadest context (what world are we in?). The filter is a narrowing
tool. The trail is the specific content. The gradient runs from broad to specific, top
to bottom. The current layout inverts this gradient on the left panel.

---

## Decision

### The new left-panel header structure

Replace the single `#trail-composer-label` `<div>` with a structured header that
mirrors `#node-info` on the right panel. The header contains:

- **For a composition search:** The composition title (large, bold, yellow) + a
  Wikipedia/source link (`↗`). Below it: the raga name (linked) · tala · composer
  name (linked to graph node if `musician_node_id` exists).
- **For a raga search:** The raga name (large, bold, yellow) + a Wikipedia/source
  link (`↗`). Below it: aliases if any (muted, small).

The filter input moves to *below* the header, matching the right panel's layout.

### Visual structure — before and after

#### Before (current)

```
┌─────────────────────────────────────────────┐
│ BANI FLOW ♩                                 │
│ [♩ Search raga / composition]               │
│ [Filter trail…]                             │  ← filter BEFORE label
│                                             │
│ Composed by Patnam Subramanya Iyer          │  ← 0.72rem teal italic
│ · Begada · Adi                              │
│ ─────────────────────────────────────────── │
│ ● Ramnad Krishnan  1918–1973                │
│   Abhimanamennedu  4:00 ↗                   │
│ …                                           │
└─────────────────────────────────────────────┘
```

#### After (composition search — "Abhimanamennedu")

```
┌─────────────────────────────────────────────┐
│ BANI FLOW ♩                                 │
│ [♩ Search raga / composition]               │
│                                             │
│ ● Abhimānamenneḍu              ↗            │  ← 0.85rem yellow bold + link
│   Begada ↗ · Adi · Tyagaraja ↗             │  ← 0.72rem fg3, each part linked
│ ─────────────────────────────────────────── │
│ [Filter trail…]                             │  ← filter AFTER header
│                                             │
│ ● Ramnad Krishnan  1918–1973                │
│   Abhimanamennedu  4:00 ↗                   │
│ …                                           │
└─────────────────────────────────────────────┘
```

#### After (raga search — "Begada")

```
┌─────────────────────────────────────────────┐
│ BANI FLOW ♩                                 │
│ [♩ Search raga / composition]               │
│                                             │
│ ◈ Begada                       ↗            │  ← 0.85rem yellow bold + link
│   also: Bhegada, Vegada                     │  ← 0.68rem gray, aliases
│ ─────────────────────────────────────────── │
│ [Filter trail…]                             │  ← filter AFTER header
│                                             │
│ ● Vina Dhanammal  1867–1938                 │
│   Viruttam (Pasuram) — Kulam  45:08 ↗       │
│ …                                           │
└─────────────────────────────────────────────┘
```

### The shape icon for ragas and compositions

The right panel uses the musician's instrument shape icon (ellipse, rectangle, etc.)
to identify the node type. The left panel needs an analogous icon for ragas and
compositions. Use a **diamond** (`◈`) for ragas (the raga is the structural diamond
of the tradition) and the **composition shape** (a small filled circle `●` in teal,
distinct from the musician's yellow) for compositions. These are purely CSS/HTML
decorations — no schema change.

Alternatively, and more simply: use a **teal dot** for both raga and composition
headers (matching the existing `--teal` colour used for the search bar), to visually
distinguish the left-panel header from the right-panel header (yellow). This preserves
the colour-coding: yellow = musician, teal = musical entity.

### HTML structure — new `#bani-subject-header`

Replace `#trail-composer-label` with a new `#bani-subject-header` block. Move
`#trail-filter` to after `#listening-trail`'s header div.

#### New HTML shape (inside `#bani-flow-panel`)

```html
<!-- ── Bani Flow panel ── -->
<div class="panel" id="bani-flow-panel">
  <h3>Bani Flow &#9835;</h3>

  <!-- Search box (unchanged) -->
  <div class="search-wrap panel-search-wrap" id="bani-search-wrap">
    <input id="bani-search-input" …>
    <div id="bani-search-dropdown" …></div>
    <div class="search-scope-label" id="bani-scope-label" …>…</div>
  </div>

  <!-- Subject header — shown when a raga/composition is selected -->
  <div id="bani-subject-header" style="display:none">
    <!-- Row 1: name + outbound link -->
    <div id="bani-subject-name-row">
      <span id="bani-subject-icon" class="bani-subject-icon"></span>
      <span id="bani-subject-name"></span>
      <a id="bani-subject-link" class="bani-subject-link" href="#"
         target="_blank" style="display:none">&#8599;</a>
    </div>
    <!-- Row 2: sub-label (raga · tala · composer, or aliases) -->
    <div id="bani-subject-sub"></div>
  </div>

  <!-- Filter — now BELOW the header, ABOVE the trail list -->
  <input id="trail-filter" type="text" placeholder="Filter trail&#8230;"
         style="display:none" autocomplete="off" spellcheck="false" />

  <!-- Trail -->
  <div id="listening-trail">
    <ul id="trail-list"></ul>
  </div>
</div>
```

**Key changes:**
- `#trail-composer-label` is removed; replaced by `#bani-subject-header`
- `#trail-filter` moves from before `#listening-trail` to after `#bani-subject-header`
  and before `#trail-list`
- `#listening-trail` no longer contains `#trail-composer-label`

### CSS additions / changes

```css
/* ── bani subject header (ADR-020) ── */
#bani-subject-header {
  padding: 8px 0 6px;
  border-bottom: 1px solid var(--bg2);
  flex-shrink: 0;
}

#bani-subject-name-row {
  display: flex; align-items: center; gap: 5px;
}

#bani-subject-name {
  font-size: 0.85rem; color: var(--yellow); font-weight: bold;
  flex: 1; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.bani-subject-link {
  margin-left: auto; flex-shrink: 0;
  color: var(--blue); font-size: 0.72rem; text-decoration: none;
}
.bani-subject-link:hover { text-decoration: underline; }

.bani-subject-icon {
  width: 10px; height: 10px; display: inline-block;
  flex-shrink: 0;
  background: var(--teal);
  border-radius: 50%;   /* teal dot for musical entities */
}

#bani-subject-sub {
  font-size: 0.70rem; color: var(--fg3);
  margin-top: 3px; line-height: 1.5;
  display: flex; flex-wrap: wrap; gap: 2px 0;
}

/* Links within the sub-label (raga, composer) */
.bani-sub-link {
  color: var(--blue); text-decoration: none; cursor: pointer;
}
.bani-sub-link:hover { text-decoration: underline; }

/* Aliases line */
#bani-subject-aliases {
  font-size: 0.68rem; color: var(--gray);
  margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Remove old trail-composer-label styles (replaced) */
/* #trail-composer-label — DELETE this rule */
```

### JavaScript changes — `buildListeningTrail` header section

Replace the `composerLabel.textContent = ...` block with structured DOM construction:

```javascript
function buildListeningTrail(type, id, matchedNodeIds) {
  // … (unchanged preamble) …

  // ── Subject header ────────────────────────────────────────────────────────
  const subjectHeader = document.getElementById('bani-subject-header');
  const subjectName   = document.getElementById('bani-subject-name');
  const subjectLink   = document.getElementById('bani-subject-link');
  const subjectSub    = document.getElementById('bani-subject-sub');

  subjectSub.innerHTML = '';
  subjectLink.style.display = 'none';
  subjectLink.href = '#';

  if (type === 'comp') {
    const comp     = compositions.find(c => c.id === id);
    const raga     = comp ? ragas.find(r => r.id === comp.raga_id) : null;
    const composer = comp ? composers.find(c => c.id === comp.composer_id) : null;

    // Row 1: composition title + source link
    subjectName.textContent = comp ? comp.title : id;
    const compSrc = comp && comp.sources && comp.sources[0];
    if (compSrc) {
      subjectLink.href = compSrc.url;
      subjectLink.style.display = 'inline';
    }

    // Row 2: raga (linked) · tala · composer (linked to graph node if available)
    const parts = [];

    if (raga) {
      const ragaSpan = document.createElement('span');
      const ragaSrc  = raga.sources && raga.sources[0];
      if (ragaSrc) {
        const a = document.createElement('a');
        a.className = 'bani-sub-link';
        a.href = ragaSrc.url;
        a.target = '_blank';
        a.textContent = raga.name;
        ragaSpan.appendChild(a);
      } else {
        ragaSpan.textContent = raga.name;
      }
      parts.push(ragaSpan);
    }

    if (comp && comp.tala) {
      const talaSpan = document.createElement('span');
      talaSpan.textContent = comp.tala.charAt(0).toUpperCase() + comp.tala.slice(1);
      parts.push(talaSpan);
    }

    if (composer) {
      const composerSpan = document.createElement('span');
      // If composer has a musician_node_id, make it a graph-navigation link
      if (composer.musician_node_id) {
        const a = document.createElement('a');
        a.className = 'bani-sub-link';
        a.href = '#';
        a.textContent = composer.name;
        a.addEventListener('click', e => {
          e.preventDefault();
          const n = cy.getElementById(composer.musician_node_id);
          if (n && n.length) {
            cy.elements().removeClass('faded highlighted bani-match');
            selectNode(n);
          }
        });
        composerSpan.appendChild(a);
      } else {
        composerSpan.textContent = composer.name;
      }
      parts.push(composerSpan);
    }

    // Join with ' · ' separators
    parts.forEach((part, i) => {
      subjectSub.appendChild(part);
      if (i < parts.length - 1) {
        const sep = document.createElement('span');
        sep.textContent = ' \u00b7 ';
        sep.style.color = 'var(--gray)';
        subjectSub.appendChild(sep);
      }
    });

  } else {
    // Raga search
    const raga = ragas.find(r => r.id === id);

    // Row 1: raga name + Wikipedia link
    subjectName.textContent = raga ? raga.name : id;
    const ragaSrc = raga && raga.sources && raga.sources[0];
    if (ragaSrc) {
      subjectLink.href = ragaSrc.url;
      subjectLink.style.display = 'inline';
    }

    // Row 2: aliases (if any)
    if (raga && raga.aliases && raga.aliases.length > 0) {
      const aliasSpan = document.createElement('span');
      aliasSpan.id = 'bani-subject-aliases';
      aliasSpan.textContent = 'also: ' + raga.aliases.join(', ');
      subjectSub.appendChild(aliasSpan);
    }
  }

  subjectHeader.style.display = 'block';

  // … (rest of buildListeningTrail unchanged) …
}
```

### Before / After JSON shape

No data schema change is required. All required fields are already present:

- `compositions[].title` — composition display name
- `compositions[].sources[0].url` — outbound link for composition
- `compositions[].raga_id` — references `ragas[].id`
- `compositions[].tala` — tala name
- `compositions[].composer_id` — references `composers[].id`
- `composers[].musician_node_id` — links composer to a musician node (may be `null`)
- `ragas[].name` — raga display name
- `ragas[].sources[0].url` — outbound link for raga (Wikipedia)
- `ragas[].aliases` — alternate names

#### Composition object (unchanged — fields already present)

```json
{
  "id":          "abhimanamennedu",
  "title":       "Abhimānamenneḍu",
  "composer_id": "tyagaraja",
  "raga_id":     "begada",
  "tala":        "adi",
  "sources": [
    { "url": "https://en.wikipedia.org/wiki/Abhimanamennedu", "label": "Wikipedia", "type": "wikipedia" }
  ]
}
```

#### Raga object (unchanged — fields already present)

```json
{
  "id":      "begada",
  "name":    "Begada",
  "aliases": ["Bhegada", "Vegada"],
  "sources": [
    { "url": "https://en.wikipedia.org/wiki/Begada", "label": "Wikipedia", "type": "wikipedia" }
  ]
}
```

#### Composer object (unchanged — `musician_node_id` already present)

```json
{
  "id":               "tyagaraja",
  "name":             "Tyagaraja",
  "musician_node_id": "tyagaraja",
  "born":             1767,
  "died":             1847,
  "sources": [
    { "url": "https://en.wikipedia.org/wiki/Tyagaraja", "label": "Wikipedia", "type": "wikipedia" }
  ]
}
```

---

## Consequences

### Queries this enables

| Rasika query | Before | After |
|---|---|---|
| "I searched for Begada. What is this raga?" | Small italic label "Raga: Begada" — no link | Bold "Begada" heading + Wikipedia link `↗` |
| "I searched for Abhimanamennedu. Who composed it?" | "Composed by Tyagaraja · Begada · Adi" — plain text | "Tyagaraja" as a clickable link that selects the Tyagaraja node in the graph |
| "What raga is Abhimanamennedu in?" | "Begada" in plain text | "Begada" as a clickable Wikipedia link |
| "I want to learn more about this raga" | No affordance | `↗` link opens Wikipedia in a new tab |
| "Where is the filter relative to the subject?" | Filter appears before the subject label | Filter appears after the subject heading — natural reading order |

### What this enables beyond the current data

- **Composer-as-node navigation** — When a composition is selected, clicking the
  composer name in the sub-label selects the composer's musician node in the graph.
  This creates a new navigation path: composition → composer → lineage. This is the
  first time the left panel becomes a navigation surface for the graph itself, not
  just a filter for the trail.

- **Raga Wikipedia navigation** — Every raga in `compositions.json` has a Wikipedia
  source. The `↗` link makes this accessible without leaving the page flow.

- **Visual parity as a statement** — The equal visual weight of musician and raga/
  composition headers communicates to the rasika that this is a graph of the
  *tradition*, not a graph of *performers*. Ragas and compositions are first-class
  citizens of the tradition.

### What this forecloses

- **The `#trail-composer-label` element** — It is removed and replaced by
  `#bani-subject-header`. Any code that references `trail-composer-label` by ID must
  be updated. A search of [`render.py`](../carnatic/render.py) shows it is only
  referenced in `buildListeningTrail()` — a single update point.

- **Plain-text composer attribution** — The current "Composed by X" phrasing is
  replaced by a structured sub-label. The phrase "Composed by" is dropped in favour
  of the composer name appearing as a linked entity in the sub-label row. This is
  more compact and more navigable.

### Interaction with ADR-011 (left-right sidebar symmetry)

ADR-011 established structural symmetry between the two panels. ADR-020 completes
that symmetry at the *heading level*: both panels now have a bold yellow heading with
an outbound link, followed by a sub-label with secondary metadata, followed by a
filter input, followed by the content list.

### Interaction with ADR-019 (co-performer trail entries)

ADR-019 restructured the trail list items. ADR-020 restructures the trail header.
They are independent changes to different DOM regions and do not conflict.

### Interaction with ADR-003 (Bani Flow left sidebar)

ADR-003 established the Bani Flow panel layout. ADR-020 refines the header region
within that panel. The search box, trail list, and filter behaviour are unchanged.

---

## Implementation

**Agent:** Carnatic Coder
**Files:**
- [`carnatic/render.py`](../carnatic/render.py) — all changes are in the HTML
  template and the JavaScript `buildListeningTrail()` function:
  1. **HTML:** Replace `#trail-composer-label` with `#bani-subject-header` block.
     Move `#trail-filter` to after `#bani-subject-header`.
  2. **CSS:** Add `#bani-subject-header`, `#bani-subject-name-row`,
     `#bani-subject-name`, `.bani-subject-link`, `.bani-subject-icon`,
     `#bani-subject-sub`, `.bani-sub-link`, `#bani-subject-aliases`.
     Remove `#trail-composer-label` rule.
  3. **JavaScript:** Replace the `composerLabel.textContent = ...` block in
     `buildListeningTrail()` with the structured DOM construction shown above.
     Update the `composerLabel` variable reference to `subjectHeader` / `subjectName`
     / `subjectLink` / `subjectSub`.

**No data schema changes.** All required fields are already present in
`compositions.json`.

**Verification:**

```bash
# Regenerate graph.html
python3 carnatic/render.py

# UI: open graph, search "Begada" in Bani Flow
# → bold yellow "Begada" heading with ↗ Wikipedia link
# → aliases "also: Bhegada, Vegada" in gray below
# → filter input appears BELOW the heading
# → trail list appears below the filter

# UI: search "Abhimanamennedu" in Bani Flow
# → bold yellow "Abhimānamenneḍu" heading with ↗ source link
# → sub-label: "Begada ↗ · Adi · Tyagaraja ↗"
# → clicking "Tyagaraja" in sub-label selects the Tyagaraja node in the graph
# → clicking "Begada" opens Wikipedia in a new tab
# → filter input appears BELOW the heading

# UI: compare left and right panels side by side
# → both headings are the same size, weight, and colour (yellow bold 0.85rem)
# → both have ↗ outbound links
# → both have filter inputs below the heading
```
