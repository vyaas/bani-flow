# ADR-005: Right Sidebar Space Utilization and Unified Recording Display

**Status:** Proposed  
**Date:** 2026-04-11

---

## Context

The right sidebar ("Selected" musician panel) currently wastes significant vertical space and presents two different visual structures for recordings, creating confusion and poor space utilization.

### Problem 1: Wasted Vertical Space

The right sidebar has three panels stacked vertically:

1. **"Selected" panel** — Shows musician metadata (name, lifespan, era, instrument, bani, sources)
2. **"Recordings ▶" panel** — Shows legacy `youtube[]` entries from [`musicians.json`](../carnatic/data/musicians.json)
3. **"Concert Performances 🎧" panel** — Shows structured recordings from [`carnatic/data/recordings/`](../carnatic/data/recordings/)

**Current layout (from [`render.py:764-791`](../carnatic/render.py:764)):**

```html
<div id="right-sidebar">
  <div class="panel" id="node-info">
    <h3>Selected</h3>
    <div id="node-name">T. Muktha</div>
    <div id="node-meta">1914–2007 · Golden Age · vocal · dhanammal</div>
    <div id="node-sources">Wikipedia ↗</div>
  </div>

  <div class="panel" id="track-panel">
    <h3>Recordings ▶</h3>
    <ul id="track-list"><!-- 2 items --></ul>
  </div>

  <div class="panel" id="perf-panel">
    <h3>Concert Performances 🎧</h3>
    <ul id="perf-list"><!-- 8 items --></ul>
  </div>
</div>
```

**The problem:** The "Selected" panel occupies ~120px of vertical space (name + metadata + sources), leaving only ~600px for the two recording lists on a 1080p screen. When a musician has many recordings (e.g., T. Muktha has 2 legacy + 8 structured = 10 total), the lists require scrolling even though the "Selected" panel is mostly empty space.

**Screenshot evidence (from user):** The red box in the screenshot shows a large empty area below the "Concert Performances" list. This is wasted space that could display more recordings.

### Problem 2: Two Visual Structures for the Same Data

The "Recordings ▶" panel and "Concert Performances 🎧" panel both display recordings, but use different visual structures:

**"Recordings ▶" (legacy `youtube[]` entries):**
```
▶ Saveri · rupakam · Padams and Javalis – T. Brinda & T. Muktha, Akashvani AIR, 1960s
```
- Play icon (▶)
- Full label string (composition · raga · tala — artist, event, year)
- Click to play in floating player
- No direct YouTube link

**"Concert Performances 🎧" (structured recordings):**
```
abhimanamemnedu
Begada · adi · Srinivasa Farms Concert, Poonamallee 1965    1:02:50 ↗
```
- Composition title (bold)
- Raga · tala · recording title (smaller text)
- Timestamp link with YouTube icon
- Click composition to play; click link to open YouTube

**The inconsistency:** These are both recordings by the same musician, but they look completely different. The rasika must learn two different interaction patterns:
- Legacy recordings: click anywhere to play
- Structured recordings: click title to play, click link to open YouTube

This violates the **Levels of Scale** pattern (ADR-004) — the same data type should have the same visual structure at every level.

### Problem 3: Future Scalability

The user states: *"We envision more types in the future."* Potential future recording types include:

- **Interviews** — no raga/composition, just YouTube title
- **Lecture-demonstrations** — hybrid of teaching and performance
- **Informal sittings** — private recordings, often undocumented
- **Radio broadcasts** — AIR archives, often multi-artist

Each new type will need to be displayed in the right sidebar. If we continue the current pattern of adding a new panel for each type, the sidebar will become a vertical accordion of tiny scrollable lists, each with its own heading and visual structure.

**The architectural question:** How do we design a recording display structure that:
1. Maximizes vertical space utilization
2. Presents all recording types in a unified visual structure
3. Scales gracefully as new types are added
4. Remains discoverable (the user can tell what types of recordings exist)

---

## Pattern

This resolves four Alexander patterns:

### 1. **Strong Centres** (Pattern 1)

The right sidebar is a **centre** in the interface — it is where the rasika goes to see everything about a selected musician. A strong centre must be **self-contained** and **informationally complete** without requiring the rasika to scroll excessively or switch between multiple sub-panels.

Currently, the right sidebar is a **weak centre** because:
- The "Selected" panel occupies space without providing actionable information (the metadata is already visible in the graph node hover popover)
- The recording lists are fragmented across two panels with different visual structures
- Scrolling is required even when there is empty space on screen

### 2. **Levels of Scale** (Pattern 5)

A recording is a recording, regardless of whether it comes from `musicians.json → youtube[]` or `recordings/*.json → sessions[].performances[]`. The visual structure should be the same at every level:
- In the Bani Flow trail (left sidebar)
- In the right sidebar recording list
- In search results (future)

Currently, there is a **scale discontinuity** — the same data (a recording) has three different visual structures depending on where it appears.

### 3. **Gradients** (Pattern 9)

The transition from "no musician selected" to "musician selected" should be a smooth gradient. The right sidebar should show:
- **Minimal state** (no selection): "—"
- **Partial state** (musician selected, no recordings): Name + metadata header
- **Full state** (musician selected, has recordings): Name + metadata header + unified recording list

Currently, there is a **discontinuity** — the sidebar jumps from showing a compact metadata panel to showing two separate scrollable lists with different headings.

### 4. **Accessibility** (Pattern 51)

Every recording should be accessible in the same way:
- Click to play in floating player
- Right-click link to copy YouTube URL
- See raga/composition metadata (if applicable)
- See recording context (event, year, etc.)

Currently, **legacy recordings lack direct YouTube links** (they only have a play button), while **structured recordings have both**. This creates an accessibility gap.

---

## Decision

### Change 1: Collapse "Selected" Panel to Single-Line Header with Era/Instrument Indicators

**Replace the multi-line metadata panel with a single-line header that shows the musician name, era color dot, instrument shape icon, lifespan, and Wikipedia link — all on one line.**

The era color dot and instrument shape icon are the same visual vocabulary established in ADR-004 for the Bani Flow trail. Using them here creates a **consistent visual language** across both sidebars: the rasika learns the icons once and reads them everywhere.

#### Current Rendering ([`render.py:766-770`](../carnatic/render.py:766))

```html
<div class="panel" id="node-info">
  <h3>Selected</h3>
  <div id="node-name">T. Muktha</div>
  <div id="node-meta">1914–2007 · Golden Age · vocal · dhanammal</div>
  <div id="node-sources">Wikipedia ↗</div>
</div>
```

**Height:** ~120px (heading + name + metadata + sources + padding)

#### Proposed Rendering

```html
<div id="node-info">
  <div id="node-header">
    <span id="node-era-dot" class="node-era-dot"></span>
    <span id="node-instr-icon" class="node-instr-icon"></span>
    <span id="node-name">—</span>
    <span id="node-lifespan"></span>
    <a id="node-wiki-link" class="node-wiki-link" href="#" target="_blank" style="display:none">↗</a>
  </div>
  <input id="rec-filter" type="text" placeholder="Filter recordings…" style="display:none" />
</div>
```

**Height:** ~48px (single header line + filter input + padding)

**Visual result:**

**Before:**
```
┌─────────────────────────────────┐
│ SELECTED                        │
│ T. Muktha                       │
│ 1914–2007                       │
│ Golden Age                      │
│ vocal · dhanammal               │
│ Wikipedia ↗                     │
├─────────────────────────────────┤  ← ~120px
│ RECORDINGS ▶                    │
│ ...                             │
```

**After:**
```
┌─────────────────────────────────┐
│ ● ○  T. Muktha  1914–2007  ↗   │  ← ~48px (header + filter)
│ [Filter recordings…           ] │
├─────────────────────────────────┤
│ RECORDINGS                      │
│ ...                             │
```

Where `●` is the era color dot (e.g., teal for Golden Age) and `○` is the instrument shape icon (e.g., ellipse for vocal). The `↗` is the Wikipedia link.

**Space saved:** ~72px vertical space, which can display 3–4 additional recordings.

**Information preserved:**
- **Name** — shown as before
- **Era** — communicated by color dot (same as graph node and Bani Flow trail)
- **Instrument** — communicated by shape icon (same as graph node and Bani Flow trail)
- **Lifespan** — shown inline
- **Wikipedia link** — shown as `↗` at the right edge of the header line

**Information removed:**
- **Bani** — free-text field, not visually encodable; available on hover or in the graph node
- **Era label text** — replaced by color dot (the rasika learns the color vocabulary from the legend)
- **"SELECTED" heading** — redundant; the presence of a name makes the context clear

#### CSS Changes

**Replace ([`render.py:441-454`](../carnatic/render.py:441)):**

```css
.panel { padding: 12px 14px; border-bottom: 1px solid var(--bg2); flex-shrink: 0; }
.panel h3 { font-size: 0.7rem; color: var(--gray); text-transform: uppercase;
            letter-spacing: 0.1em; margin-bottom: 8px; }
#node-info { min-height: 0; }
#node-name { font-size: 0.95rem; color: var(--yellow); font-weight: bold; margin-bottom: 4px; }
#node-meta { color: var(--fg3); line-height: 1.7; }
#node-sources { margin-top: 8px; display: none; }
.node-src-link { display: block; color: var(--blue); text-decoration: none;
                 font-size: 0.75rem; margin-bottom: 3px; }
.node-src-link:hover { text-decoration: underline; }
```

**With:**

```css
.panel { padding: 12px 14px; border-bottom: 1px solid var(--bg2); flex-shrink: 0; }
.panel h3 { font-size: 0.7rem; color: var(--gray); text-transform: uppercase;
            letter-spacing: 0.1em; margin-bottom: 8px; }

/* ── node header (collapsed) ── */
#node-info { padding: 8px 14px; border-bottom: 1px solid var(--bg2); flex-shrink: 0; }
#node-header {
  display: flex; align-items: center; gap: 5px;
}
#node-name {
  font-size: 0.85rem; color: var(--yellow); font-weight: bold;
}
#node-lifespan {
  font-size: 0.70rem; color: var(--gray); margin-left: 4px;
}
.node-wiki-link {
  margin-left: auto; flex-shrink: 0;
  color: var(--blue); font-size: 0.72rem; text-decoration: none;
}
.node-wiki-link:hover { text-decoration: underline; }

/* era dot and instrument icon in node header — same vocabulary as Bani Flow trail */
.node-era-dot {
  width: 8px; height: 8px; border-radius: 50%;
  display: inline-block; flex-shrink: 0;
}
.node-instr-icon {
  width: 8px; height: 8px; display: inline-block;
  background: var(--gray); flex-shrink: 0;
}
.node-instr-icon.ellipse   { border-radius: 50%; }
.node-instr-icon.diamond   { transform: rotate(45deg); border-radius: 1px; }
.node-instr-icon.rectangle { border-radius: 1px; }
.node-instr-icon.triangle  {
  width: 0; height: 0; background: none;
  border-left: 4px solid transparent; border-right: 4px solid transparent;
  border-bottom: 8px solid var(--gray);
}
.node-instr-icon.hexagon {
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
}

/* ── recording filter input ── */
#rec-filter {
  width: 100%; background: var(--bg2); color: var(--fg2);
  border: 1px solid var(--bg3); padding: 4px 8px;
  font-family: inherit; font-size: 0.72rem; border-radius: 2px;
  margin-top: 6px; display: none;
}
#rec-filter:focus { outline: none; border-color: var(--yellow); }
#rec-filter::placeholder { color: var(--gray); font-style: italic; }
```

#### JavaScript Changes (in `selectNode`)

**Replace ([`render.py:1127-1143`](../carnatic/render.py:1127)):**

```javascript
document.getElementById('node-name').textContent = d.label;
document.getElementById('node-meta').innerHTML =
  `<div>${d.lifespan || ''}</div>` +
  `<div style="color:var(--gray)">${d.era_label}</div>` +
  `<div>${d.instrument} · ${d.bani || ''}</div>`;
const srcDiv = document.getElementById('node-sources');
if (d.sources && d.sources.length > 0) {
  srcDiv.style.display = 'block';
  srcDiv.innerHTML = d.sources.map(s =>
    `<a class="node-src-link" href="${s.url}" target="_blank">${s.label} &#8599;</a>`
  ).join('');
} else {
  srcDiv.style.display = 'none';
  srcDiv.innerHTML = '';
}
```

**With:**

```javascript
document.getElementById('node-name').textContent = d.label;
document.getElementById('node-lifespan').textContent = d.lifespan || '';

// Era color dot
const eraDot = document.getElementById('node-era-dot');
eraDot.style.background = d.color || 'var(--gray)';

// Instrument shape icon
const instrIcon = document.getElementById('node-instr-icon');
instrIcon.className = `node-instr-icon ${d.shape || 'ellipse'}`;

// Wikipedia / primary source link
const wikiLink = document.getElementById('node-wiki-link');
const primarySrc = d.sources && d.sources.length > 0 ? d.sources[0] : null;
if (primarySrc) {
  wikiLink.href = primarySrc.url;
  wikiLink.title = primarySrc.label;
  wikiLink.style.display = 'inline';
} else {
  wikiLink.style.display = 'none';
}
```

---

### Change 2: Merge Recording Lists into Single Unified Panel

**Combine "Recordings ▶" and "Concert Performances 🎧" into a single "Recordings" panel with a unified visual structure.**

#### Current Structure

Two separate panels with different headings and different visual structures:

```html
<div class="panel" id="track-panel">
  <h3>Recordings ▶</h3>
  <ul id="track-list"><!-- legacy youtube[] entries --></ul>
</div>

<div class="panel" id="perf-panel">
  <h3>Concert Performances 🎧</h3>
  <ul id="perf-list"><!-- structured recordings --></ul>
</div>
```

#### Proposed Structure

Single panel with a unified list:

```html
<div class="panel" id="recordings-panel">
  <h3>Recordings</h3>
  <ul id="recordings-list">
    <!-- All recordings (legacy + structured) in chronological order -->
  </ul>
</div>
```

#### Unified Visual Structure — Two-Row Layout

**Every recording entry (legacy or structured) uses the same two-row layout:**

```
Row 1:  [Composition Title]                    [Year]
Row 2:  [Raga · Tala · Context]          [00:00:00 ↗]
```

**For raga/composition recordings:**

```
Row 1:  abhimanamemnedu                        1965
Row 2:  Begada · Adi · Poonamallee 1965    1:02:50 ↗
```

**For non-composition recordings (interviews, lectures, etc.):**

```
Row 1:  🎤 Interview with Brhaddhvani           2019
Row 2:  Discussing the Dhanammal bani          00:00 ↗
```

**Key principle:** The `00:00 ↗` link is shown for **all** recordings, including those without a timestamp offset. This ensures visual consistency — the rasika always sees a link in the same position on row 2, regardless of recording type. Non-timestamped links open YouTube at the beginning of the video.

**Interaction:**
- Click anywhere on the `<li>` to play in floating player
- Click the YouTube link to open in new tab (event propagation stopped)
- Right-click the YouTube link to copy URL

#### CSS for Unified Recording List

```css
/* ── unified recordings panel ── */
#recordings-panel { display: none; }
#recordings-list { list-style: none; margin-top: 4px; }
#recordings-list li {
  padding: 5px 0; border-bottom: 1px solid var(--bg2);
  cursor: pointer; display: flex; flex-direction: column; gap: 2px;
  line-height: 1.4;
}
#recordings-list li:last-child { border-bottom: none; }
#recordings-list li:hover { color: var(--yellow); }
#recordings-list li.playing { color: var(--aqua); }

.rec-row1 {
  display: flex; align-items: baseline; width: 100%; gap: 4px;
}
.rec-title {
  color: var(--yellow); font-weight: bold; font-size: 0.74rem;
  flex: 1; min-width: 0; word-break: break-word;
}
.rec-year {
  flex-shrink: 0; color: var(--gray); font-size: 0.68rem;
  margin-left: auto; padding-left: 6px;
}

.rec-row2 {
  display: flex; align-items: baseline; width: 100%; gap: 4px;
}
.rec-meta {
  color: var(--fg3); font-size: 0.70rem;
  flex: 1; min-width: 0;
}
.rec-link {
  flex-shrink: 0; color: var(--blue); font-size: 0.70rem;
  text-decoration: none; white-space: nowrap;
}
.rec-link:hover { text-decoration: underline; }
```

---

### Change 3: Filter Bar Under Musician Header

**Add a search/filter input under the musician header to filter the recordings list.**

The filter bar is always visible when a musician is selected. It filters by **musicological content** — composition title, raga name, and event/context — not by year or timestamp. Time is not a primary search axis for the rasika; the rasika searches by *what* was played, not *when*.

#### Filter Scope

The filter matches against:
- **Composition title** (row 1 text)
- **Raga name** (row 2 text)
- **Event/context** (row 2 text, e.g., "Poonamallee", "AIR", "Brhaddhvani")

The filter does **not** match against:
- Year (row 1 right-aligned text)
- Timestamp (row 2 right-aligned link)

**Implementation note:** The filter operates on the rendered text content of `.rec-title` and `.rec-meta` spans only, not the full `li.textContent`. This ensures year and timestamp strings do not produce false positives.

#### Filter Behavior

- Typing `"beg"` → shows only recordings in Begada raga
- Typing `"padam"` → shows only recordings with "padam" in the context/notes
- Typing `"poonamallee"` → shows only recordings from the Poonamallee concert
- Typing `"g"` → shows all recordings whose title, raga, or context contains "g"

**Visual feedback:**
- Matching recordings remain visible
- Non-matching recordings are hidden (`display: none`)
- If no recordings match, show a "no match" message in muted text

#### JavaScript

```javascript
const recFilter = document.getElementById('rec-filter');

recFilter.addEventListener('input', () => {
  const q = recFilter.value.toLowerCase().trim();
  const recList = document.getElementById('recordings-list');
  const items = recList.querySelectorAll('li');
  let anyVisible = false;

  items.forEach(li => {
    if (!q) {
      li.style.display = 'flex';
      anyVisible = true;
      return;
    }
    // Match only against musicological content, not year or timestamp
    const titleText = (li.querySelector('.rec-title')  || {}).textContent || '';
    const metaText  = (li.querySelector('.rec-meta')   || {}).textContent || '';
    const matches = titleText.toLowerCase().includes(q) ||
                    metaText.toLowerCase().includes(q);
    li.style.display = matches ? 'flex' : 'none';
    if (matches) anyVisible = true;
  });

  // Show "no match" message if nothing visible
  let noMatch = recList.querySelector('.rec-no-match');
  if (!anyVisible && q) {
    if (!noMatch) {
      noMatch = document.createElement('li');
      noMatch.className = 'rec-no-match';
      noMatch.style.cssText = 'color:var(--gray);font-style:italic;cursor:default;';
      noMatch.textContent = 'no match';
      recList.appendChild(noMatch);
    }
    noMatch.style.display = 'flex';
  } else if (noMatch) {
    noMatch.style.display = 'none';
  }
});

// Clear filter when a new node is selected
// (called at the top of selectNode before buildRecordingsList)
function clearRecFilter() {
  const recFilter = document.getElementById('rec-filter');
  if (recFilter) {
    recFilter.value = '';
    recFilter.dispatchEvent(new Event('input'));
  }
}
```

---

### Change 4: Distinguish Recording Types with Visual Indicators

**Use icon prefixes to distinguish raga/composition recordings from other types (interviews, lectures, etc.).**

#### Type Vocabulary

| `type` value | Icon prefix | Meaning |
|---|---|---|
| `"performance"` (default) | *(none)* | Raga/composition performance |
| `"interview"` | `🎤 ` | Spoken interview |
| `"lecture"` | `🎓 ` | Lecture or lecture-demonstration |
| `"radio"` | `📻 ` | Radio broadcast (AIR, etc.) |
| `"misc"` | *(none)* | Anything else |

**Key principle:** Raga/composition is the **first-class citizen**. Recordings with a `composition_id` and `raga_id` are displayed in the standard format (composition title, raga · tala · context). All other recordings are displayed with the YouTube title string and an icon prefix. This communicates to the rasika that raga/composition recordings are the primary content, and all others are supplementary.

#### Rendering Logic

```javascript
if (rec.composition_id && rec.raga_id) {
  // Standard raga/composition recording — first-class citizen
  const comp = compositions.find(c => c.id === rec.composition_id);
  titleSpan.textContent = comp ? comp.title : rec.title;
  const raga = ragas.find(r => r.id === rec.raga_id);
  const ragaName = raga ? raga.name : '';
  const parts = [ragaName, rec.tala, rec.context].filter(Boolean);
  metaSpan.textContent = parts.join(' · ');
} else {
  // Non-composition recording — supplementary
  const typeIcon = { interview: '🎤 ', lecture: '🎓 ', radio: '📻 ' }[rec.type] || '';
  titleSpan.textContent = typeIcon + rec.title;
  metaSpan.textContent = rec.context || rec.notes || '';
}
```

#### Data Model Change for `youtube[]` Entries

The `type` field is **optional** on `youtube[]` entries in [`musicians.json`](../carnatic/data/musicians.json). The old `{url, label}` format remains valid. The new extended format adds `type`:

```json
{
  "url":   "https://youtu.be/XXXXXXXXXXX",
  "label": "Interview with Brhaddhvani — T. Muktha on the Dhanammal bani",
  "type":  "interview",
  "year":  2019
}
```

**Default:** If `type` is absent, the renderer checks for `composition_id` and `raga_id`. If both are present, it renders as a performance. If neither is present, it renders as `"misc"` (no icon, YouTube title string shown).

**No migration required.** Existing `youtube[]` entries without `type` continue to work. The Librarian adds `type` only when adding non-performance recordings.

---

### Change 5: Chronological Sort

**Sort all recordings chronologically (oldest first), with non-composition recordings sorted after composition recordings within the same year.**

#### Sort Key

```
Primary:   year (ascending; nulls last)
Secondary: type (performances before non-performances)
Tertiary:  title (alphabetical)
```

**Rationale:** Chronological order shows the musician's stylistic evolution. The rasika can trace how a musician's treatment of a raga changed over decades. Non-composition recordings (interviews, lectures) are sorted after performances within the same year because they are supplementary content.

---

## Before / After Summary

### Before (current state)

```
┌─────────────────────────────────┐
│ SELECTED                        │  ← 120px
│ T. Muktha                       │
│ 1914–2007                       │
│ Golden Age                      │
│ vocal · dhanammal               │
│ Wikipedia ↗                     │
├─────────────────────────────────┤
│ RECORDINGS ▶                    │  ← separate panel, legacy format
│ ▶ Saveri · rupakam · Padams…    │
│ ▶ Kambhoji · tisra_triputa…     │
├─────────────────────────────────┤
│ CONCERT PERFORMANCES 🎧         │  ← separate panel, structured format
│ abhimanamemnedu                 │
│ Begada · adi · Poonamallee…     │
│ bālē bālēndu bhūṣaṇi            │
│ Reetigowla · adi · Poonamallee… │
│ ...                             │
│                                 │
│ [large empty area]              │  ← wasted space
└─────────────────────────────────┘
```

### After (proposed state)

```
┌─────────────────────────────────┐
│ ● ○  T. Muktha  1914–2007  ↗   │  ← 48px (header + filter)
│ [Filter recordings…           ] │
├─────────────────────────────────┤
│ RECORDINGS                      │  ← single unified panel
│ Intha Chalamu              1932 │
│ Saveri · Adi · Columbia 1932    00:00 ↗ │
│ Vala Padare               1960s │
│ Saveri · Rupakam · AIR 1960s    00:00 ↗ │
│ abhimanamemnedu            1965 │
│ Begada · Adi · Poonamallee 1965 1:02:50 ↗ │
│ bālē bālēndu bhūṣaṇi       1965 │
│ Reetigowla · Adi · Poonamallee  1:08:30 ↗ │
│ ...                             │
│ [no empty area — list fills]    │
└─────────────────────────────────┘
```

---

## Consequences

### Positive

1. **~72px of vertical space reclaimed** — The collapsed header frees space for 3–4 additional recordings
2. **Unified visual structure** — All recordings use the same two-row layout, reducing cognitive load
3. **Era and instrument preserved** — Color dot and shape icon communicate era and instrument in 16px of horizontal space, with no vertical cost
4. **Wikipedia link preserved** — The `↗` link is always visible in the header, one click away
5. **Scalability** — New recording types (interviews, lectures, etc.) fit into the same structure with only an icon change
6. **Discoverability** — The filter bar makes it easy to find specific recordings without scrolling
7. **Visual consistency** — `00:00 ↗` appears on every recording row, so the rasika always knows where to look for the YouTube link
8. **Raga/composition as first-class citizen** — The rendering logic explicitly distinguishes composition recordings from supplementary content, communicating the tradition's hierarchy to the rasika
9. **Consistency with Bani Flow** — The era dot and instrument icon in the header use the same CSS classes as the Bani Flow trail (ADR-004), creating a unified visual language

### Negative

1. **Loss of bani field in header** — The `bani` free-text field is no longer shown in the header
   - **Mitigation:** `bani` is available in the graph node hover popover. It is not visually encodable in a single glyph, and the Bani Flow trail already surfaces it contextually when the rasika searches by composition or raga.

2. **Loss of era label text** — "Golden Age", "Disseminators" etc. are no longer shown as text
   - **Mitigation:** The color dot is the same vocabulary used in the graph legend and the Bani Flow trail. The rasika learns it once. The hover popover still shows the full era label.

3. **Filter bar occupies ~30px** — The filter input adds vertical space to the header
   - **Mitigation:** It is hidden when no musician is selected, and it replaces the need to scroll through long lists. The net space gain (72px saved from header collapse, 30px spent on filter) is still +42px.

4. **`buildPerfPanel` and `track-panel` must be removed** — Existing code paths that populate the two separate panels must be deleted and replaced with `buildRecordingsList`
   - **Mitigation:** This is a clean replacement, not a migration. The old functions have no callers outside `selectNode` and the edge-tap handler. The Carnatic Coder removes them in the same commit.

5. **`type` field on `youtube[]` entries is new** — Existing entries without `type` must be handled gracefully
   - **Mitigation:** The renderer defaults to checking `composition_id` + `raga_id`. If both are present, it renders as a performance regardless of `type`. If neither is present and `type` is absent, it renders as misc (no icon). No existing data breaks.

---

### What the Carnatic Coder Must Implement

#### 1. Update HTML template ([`render.py:764-791`](../carnatic/render.py:764))

Replace the three-panel right sidebar with:

```html
<div id="right-sidebar">
  <div id="node-info">
    <div id="node-header">
      <span id="node-era-dot" class="node-era-dot"></span>
      <span id="node-instr-icon" class="node-instr-icon ellipse"></span>
      <span id="node-name">—</span>
      <span id="node-lifespan"></span>
      <a id="node-wiki-link" class="node-wiki-link" href="#" target="_blank"
         style="display:none">&#8599;</a>
    </div>
    <input id="rec-filter" type="text" placeholder="Filter recordings…"
           style="display:none" autocomplete="off" spellcheck="false" />
  </div>

  <div class="panel" id="recordings-panel" style="display:none">
    <h3>Recordings</h3>
    <ul id="recordings-list"></ul>
  </div>

  <div class="panel" id="edge-info" style="display:none">
    <h3>Selected Edge</h3>
    <div id="edge-guru"></div>
    <div id="edge-arrow">&#8595; guru &middot; shishya</div>
    <div id="edge-shishya"></div>
    <div id="edge-note"></div>
    <div id="edge-conf"></div>
    <a id="edge-src" href="#" target="_blank">source &#8599;</a>
  </div>
</div>
```

#### 2. Replace CSS for right sidebar panels ([`render.py:441-506`](../carnatic/render.py:441))

Add the CSS blocks specified in Change 1 and Change 2 above. Remove the old `#node-info`, `#node-name`, `#node-meta`, `#node-sources`, `.node-src-link`, `#perf-panel`, `#perf-list`, `.perf-title`, `.perf-raga`, `.perf-link`, `#track-panel`, `#track-list`, `.play-icon` rules. Replace with the new `#node-info`, `#node-header`, `#node-name`, `#node-lifespan`, `.node-wiki-link`, `.node-era-dot`, `.node-instr-icon`, `#rec-filter`, `#recordings-panel`, `#recordings-list`, `.rec-row1`, `.rec-title`, `.rec-year`, `.rec-row2`, `.rec-meta`, `.rec-link` rules.

#### 3. Replace `selectNode` function ([`render.py:1126`](../carnatic/render.py:1126))

```javascript
function selectNode(node) {
  const d = node.data();

  // Header
  document.getElementById('node-name').textContent = d.label;
  document.getElementById('node-lifespan').textContent = d.lifespan || '';

  const eraDot = document.getElementById('node-era-dot');
  eraDot.style.background = d.color || 'var(--gray)';

  const instrIcon = document.getElementById('node-instr-icon');
  instrIcon.className = `node-instr-icon ${d.shape || 'ellipse'}`;

  const wikiLink = document.getElementById('node-wiki-link');
  const primarySrc = d.sources && d.sources.length > 0 ? d.sources[0] : null;
  if (primarySrc) {
    wikiLink.href = primarySrc.url;
    wikiLink.title = primarySrc.label;
    wikiLink.style.display = 'inline';
  } else {
    wikiLink.style.display = 'none';
  }

  document.getElementById('node-info').style.display = 'block';
  document.getElementById('edge-info').style.display = 'none';

  // Clear filter and rebuild recordings list
  const recFilter = document.getElementById('rec-filter');
  recFilter.value = '';

  buildRecordingsList(d.id, d);

  cy.elements().addClass('faded');
  node.removeClass('faded');
  node.connectedEdges().removeClass('faded').addClass('highlighted');
  node.connectedEdges().connectedNodes().removeClass('faded');
}
```

#### 4. Add `buildRecordingsList` function (replaces `buildPerfPanel` and track-list logic)

```javascript
function buildRecordingsList(nodeId, nodeData) {
  const recPanel  = document.getElementById('recordings-panel');
  const recList   = document.getElementById('recordings-list');
  const recFilter = document.getElementById('rec-filter');
  recList.innerHTML = '';

  const legacyTracks   = (nodeData || cy.getElementById(nodeId).data()).tracks || [];
  const structuredPerfs = musicianToPerformances[nodeId] || [];

  const allRecs = [];

  legacyTracks.forEach(t => {
    allRecs.push({
      vid:            t.vid,
      title:          t.label,
      composition_id: t.composition_id,
      raga_id:        t.raga_id,
      year:           t.year || null,
      offset_seconds: 0,
      tala:           null,
      context:        null,
      type:           t.type || null,
      isLegacy:       true,
    });
  });

  structuredPerfs.forEach(p => {
    allRecs.push({
      vid:            p.video_id,
      title:          p.display_title,
      composition_id: p.composition_id,
      raga_id:        p.raga_id,
      year:           p.date ? parseInt(p.date) : null,
      offset_seconds: p.offset_seconds || 0,
      tala:           p.tala || null,
      context:        p.title || null,
      type:           p.type || null,
      isLegacy:       false,
    });
  });

  // Sort: year asc (nulls last), performances before non-performances, then title
  allRecs.sort((a, b) => {
    if (a.year !== b.year) {
      if (a.year == null) return 1;
      if (b.year == null) return -1;
      return a.year - b.year;
    }
    const aIsPerf = !!(a.composition_id && a.raga_id);
    const bIsPerf = !!(b.composition_id && b.raga_id);
    if (aIsPerf !== bIsPerf) return aIsPerf ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  const artistLabel = (nodeData || cy.getElementById(nodeId).data()).label || '';

  allRecs.forEach(rec => {
    const li = document.createElement('li');
    li.dataset.vid = rec.vid;
    li.className   = playerRegistry.has(rec.vid) ? 'playing' : '';
    li.addEventListener('click', () =>
      openOrFocusPlayer(rec.vid, rec.title, artistLabel, rec.offset_seconds || undefined));

    // Row 1: title + year
    const row1 = document.createElement('div');
    row1.className = 'rec-row1';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'rec-title';

    if (rec.composition_id && rec.raga_id) {
      const comp = compositions.find(c => c.id === rec.composition_id);
      titleSpan.textContent = comp ? comp.title : rec.title;
    } else {
      const typeIcon = { interview: '🎤 ', lecture: '🎓 ', radio: '📻 ' }[rec.type] || '';
      titleSpan.textContent = typeIcon + rec.title;
    }

    const yearSpan = document.createElement('span');
    yearSpan.className = 'rec-year';
    yearSpan.textContent = rec.year || '';

    row1.appendChild(titleSpan);
    row1.appendChild(yearSpan);

    // Row 2: metadata + link
    const row2 = document.createElement('div');
    row2.className = 'rec-row2';

    const metaSpan = document.createElement('span');
    metaSpan.className = 'rec-meta';

    if (rec.composition_id && rec.raga_id) {
      const raga = ragas.find(r => r.id === rec.raga_id);
      const ragaName = raga ? raga.name : (rec.raga_id || '');
      const parts = [ragaName, rec.tala, rec.context].filter(Boolean);
      metaSpan.textContent = parts.join(' · ');
    } else {
      metaSpan.textContent = rec.context || '';
    }

    const linkA = document.createElement('a');
    linkA.className = 'rec-link';
    linkA.href = ytDirectUrl(rec.vid, rec.offset_seconds > 0 ? rec.offset_seconds : undefined);
    linkA.target = '_blank';
    // Always show a timestamp for visual consistency; non-timestamped → 00:00
    linkA.textContent = rec.offset_seconds > 0
      ? `${formatTimestamp(rec.offset_seconds)} \u2197`
      : `00:00 \u2197`;
    linkA.title = rec.offset_seconds > 0
      ? 'Open in YouTube at this timestamp'
      : 'Open in YouTube';
    linkA.addEventListener('click', e => e.stopPropagation());

    row2.appendChild(metaSpan);
    row2.appendChild(linkA);

    li.appendChild(row1);
    li.appendChild(row2);
    recList.appendChild(li);
  });

  if (allRecs.length > 0) {
    recPanel.style.display = 'block';
    recFilter.style.display = 'block';
  } else {
    recPanel.style.display = 'none';
    recFilter.style.display = 'none';
  }
}
```

#### 5. Add filter bar event listener (after `buildRecordingsList`)

```javascript
document.getElementById('rec-filter').addEventListener('input', function() {
  const q = this.value.toLowerCase().trim();
  const recList = document.getElementById('recordings-list');
  const items = recList.querySelectorAll('li:not(.rec-no-match)');
  let anyVisible = false;

  items.forEach(li => {
    if (!q) { li.style.display = 'flex'; anyVisible = true; return; }
    // Match only musicological content — title and meta, not year or timestamp
    const titleText = (li.querySelector('.rec-title') || {}).textContent || '';
    const metaText  = (li.querySelector('.rec-meta')  || {}).textContent || '';
    const matches = titleText.toLowerCase().includes(q) ||
                    metaText.toLowerCase().includes(q);
    li.style.display = matches ? 'flex' : 'none';
    if (matches) anyVisible = true;
  });

  let noMatch = recList.querySelector('.rec-no-match');
  if (!anyVisible && q) {
    if (!noMatch) {
      noMatch = document.createElement('li');
      noMatch.className = 'rec-no-match';
      noMatch.style.cssText = 'color:var(--gray);font-style:italic;cursor:default;padding:5px 0;';
      noMatch.textContent = 'no match';
      recList.appendChild(noMatch);
    }
    noMatch.style.display = 'flex';
  } else if (noMatch) {
    noMatch.style.display = 'none';
  }
});
```

#### 6. Update edge-tap handler ([`render.py:1186-1209`](../carnatic/render.py:1186))

Replace references to `track-panel` and `perf-panel` with `recordings-panel`:

```javascript
document.getElementById('node-info').style.display      = 'none';
document.getElementById('recordings-panel').style.display = 'none';
document.getElementById('edge-info').style.display      = 'block';
```

#### 7. Update background-tap handler ([`render.py:1212-1222`](../carnatic/render.py:1212))

```javascript
cy.on('tap', evt => {
  if (evt.target !== cy) return;
  cy.elements().removeClass('faded highlighted');
  document.getElementById('node-name').textContent        = '—';
  document.getElementById('node-lifespan').textContent    = '';
  document.getElementById('node-wiki-link').style.display = 'none';
  document.getElementById('rec-filter').style.display     = 'none';
  document.getElementById('rec-filter').value             = '';
  document.getElementById('node-info').style.display      = 'block';
  document.getElementById('recordings-panel').style.display = 'none';
  document.getElementById('edge-info').style.display      = 'none';
  applyZoomLabels();
});
```

#### 8. Delete dead code

Remove the following functions and their CSS entirely:
- `buildPerfPanel()` ([`render.py:1076`](../carnatic/render.py:1076))
- The `track-list` population block inside `selectNode` ([`render.py:1148-1164`](../carnatic/render.py:1148))

---

### What the Librarian Must Do

1. **When adding non-performance `youtube[]` entries** (interviews, lectures, radio broadcasts), set the `type` field to the appropriate value from the type vocabulary above.
2. **No migration required** for existing entries — the renderer handles absent `type` gracefully.

---

## Alternatives Considered

### Alternative 1: Keep Two Panels, Add Scroll Synchronisation

Keep the "Recordings ▶" and "Concert Performances 🎧" panels separate, but make the right sidebar a single scrollable container so both lists are visible without switching.

**Rejected.** This does not solve the visual inconsistency problem — the two panels still use different visual structures. It also does not solve the space problem — the "Selected" panel still occupies 120px. The unified panel approach is strictly better.

### Alternative 2: Tabbed Interface (Recordings | Performances | Info)

Replace the stacked panels with a tabbed interface: one tab for legacy recordings, one for structured performances, one for musician info.

**Rejected.** Tabs hide information behind a click. The rasika cannot see at a glance how many recordings of each type exist. The filter bar approach is superior: all recordings are visible by default, and the rasika narrows them down by typing. Tabs also add UI complexity (tab state management, active tab styling) for no gain.

### Alternative 3: Keep Full Metadata in "Selected" Panel, Collapse Recording Lists

Keep the full metadata panel (name, lifespan, era, instrument, bani, sources) and instead collapse the recording lists into a compact format.

**Rejected.** The metadata panel is the wrong thing to keep large. The rasika selects a musician *because* they want to see their recordings. The metadata is secondary — it is already visible in the hover popover and the Bani Flow trail. The recordings are the primary content of the right sidebar.

### Alternative 4: Show Era Label Text Instead of Color Dot in Header

Show "Golden Age" or "Disseminators" as text next to the musician name.

**Rejected.** This is too verbose for a single-line header. The color dot is a **visual mnemonic** that the rasika learns from the graph legend. It communicates era in 8px of horizontal space. Text would require 60–80px and would crowd the name and lifespan.

### Alternative 5: Filter by Year

Include year in the filter scope so the rasika can type "1965" to find recordings from that year.

**Rejected.** Time is not a primary search axis for the rasika. The rasika searches by *what* was played (composition, raga, event), not *when*. Including year in the filter scope would produce false positives (e.g., typing "1" would match "1965", "1932", "1960s" — nearly every recording). The filter is most useful when it narrows by musicological content.

---

## Queries This Enables

**Rasika query 1:** "I've selected T. Muktha. I want to find all her recordings in Begada raga quickly."

**Before:** Scroll through two separate panels (legacy + structured), reading each entry to find Begada.

**After:** Type `"beg"` in the filter bar. All non-Begada recordings disappear instantly. The rasika sees only the Begada recordings, with raga name confirmed in row 2.

---

**Rasika query 2:** "I've selected Vina Dhanammal. I want to know at a glance: what era is she from, and what instrument does she play?"

**Before:** Read the "Selected" panel: "Golden Age · veena · dhanammal". Three lines of text.

**After:** See the teal dot (Golden Age) and diamond icon (veena) in the header, next to her name. Two glyphs, zero lines of text, same information.

---

**Rasika query 3:** "I've selected a musician who has both concert recordings and an interview. I want to find the interview quickly."

**Before:** Scroll through the "Concert Performances" panel looking for the interview (which doesn't appear there — it's in the "Recordings ▶" panel above).

**After:** Type `"interview"` in the filter bar, or scroll to the bottom of the unified list (interviews sort after performances). The `🎤` icon makes the interview immediately recognisable.

---

**Rasika query 4:** "I want to share a specific recording with a student. I need the YouTube link."

**Before:** Find the recording in the appropriate panel, right-click the timestamp link (only available in "Concert Performances", not in "Recordings ▶").

**After:** Every recording in the unified list has a `00:00 ↗` or `HH:MM:SS ↗` link in the same position (row 2, right edge). Right-click any link to copy the URL.

---

## Implementation Priority

**High.** This is a direct usability fix that serves the rasika's immersion. The current sidebar wastes space and fragments recordings across two panels with different visual structures. The proposed changes:

1. Reclaim ~72px of vertical space
2. Unify all recordings into a single visual structure
3. Preserve all metadata (era, instrument, lifespan, Wikipedia) in compressed form
4. Add a filter bar for rapid navigation
5. Ensure visual consistency (`00:00 ↗` on every row)

Recommend implementing immediately after ADR-004, as the CSS classes (`.node-era-dot`, `.node-instr-icon`) are shared with the Bani Flow trail and should be defined once in the stylesheet.
