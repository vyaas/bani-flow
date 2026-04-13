# ADR-029: Sruti Bar — Tanpura Drone Strip in the Header

**Status:** Proposed  
**Date:** 2026-04-13

---

## Context

Carnatic music is inseparable from *sruti* — the continuous drone that establishes the tonic
and makes every swara audible as a relationship to Sa. The tanpura is the physical embodiment
of sruti: its four strings, tuned Pa–Sa–Sa–Sa (or Ni–Sa–Sa–Sa), sustain the harmonic field
within which a raga lives. Arun Prakash, after a TM Krishna lecture-demonstration of Bhairavi,
observed that Krishna "extracted Bhairavi from the tanpura" — the raga was latent in the drone
before a single melodic phrase was sung. RK Shreeramkumar describes Ramnad Krishnan's singing
as "soaked in sruti." The drone is not accompaniment; it is the ground of the tradition.

The current Bani Flow interface is visually and sonically silent. A rasika or student who opens
the graph to study a raga, trace a lineage, or follow a listening trail has no way to establish
the sonic ground that makes the experience musically meaningful. They must separately open a
tanpura track in another tab, losing the immersive context.

The proposal is to embed a **Sruti Bar** — a strip of 12 clickable pitch buttons (C through B,
covering the full chromatic octave) — permanently at the top of the interface, above the
existing `<header>`. Each button opens the corresponding tanpura YouTube video in a floating
media player, identical in mechanism to the existing concert player. The user can then open
any concert recording alongside the drone, enabling active listening, gamaka exploration, and
riyaz (practice) within a single browser tab.

**Forces in tension:**

1. **Immersion vs. clutter** — the header is already dense (title, stats, controls, view
   selector). A new strip must not crowd the existing chrome.
2. **Prominence vs. hierarchy** — the sruti bar must be visually prominent (the rasika must
   notice it immediately) without visually outranking the graph title or the Bani Flow search.
3. **Simplicity of interaction** — one click opens the drone; clicking the active pitch again
   (or the power indicator) closes it. No modal, no configuration. The pitch label must be
   immediately legible.
4. **Singleton drone** — only one tanpura pitch plays at a time. Switching pitch replaces the
   current drone rather than stacking players. This mirrors the physical reality: a musician
   tunes one tanpura to one pitch.
5. **Power indicator** — the sruti box must have a visible on/off state so the user knows at
   a glance whether the drone is active. A small indicator light (●) to the left of the
   buttons serves this role.
6. **Data location** — `tanpura.json` currently lives at the project root, outside the
   canonical data directory. It must be relocated to `carnatic/data/tanpura.json` so the
   render pipeline can load it alongside `musicians.json` and `compositions.json`.
7. **Schema simplicity** — the tanpura data needs only `note` (Western pitch label) added.
   Kattai equivalents and pitch metadata on recordings are explicitly out of scope for this ADR.

---

## Pattern

**Strong Centres** (Alexander, *The Nature of Order*, Book 1): a living structure has a
hierarchy of centres, each reinforcing the others. The tanpura drone is the strongest centre
in Carnatic music — it is the ground from which all other musical centres (raga, swara,
gamaka, composition) emerge. Placing the Sruti Bar at the very top of the interface — above
the graph title, above the filter bar, above everything — honours this hierarchy. The drone
is not a feature; it is the foundation.

**Levels of Scale** (Alexander, *A Pattern Language*, Pattern 125): good structure has
elements at every scale, from the whole to the detail. The Sruti Bar operates at the scale
of the session (it persists across all three views — Graph, Timeline, Raga Wheel), while the
concert player operates at the scale of the individual recording. The two players coexist
without conflict because they serve different temporal scales of musical engagement.

**Boundaries** (Alexander, *The Nature of Order*, Book 1): a boundary is not a wall but a
zone of transition that connects two centres. The Sruti Bar is the boundary between the
browser chrome (outside the music) and the graph (inside the music). Crossing it — clicking
a pitch button — is the act of entering the sonic world of the tradition.

---

## Decision

### 1. Data: relocate and extend `tanpura.json`

Move `tanpura.json` from the project root to `carnatic/data/tanpura.json`.

Add one field to each entry:

| field | type | meaning |
|---|---|---|
| `note` | string | Western pitch label: `"C"`, `"C#"`, `"D"`, … `"B"` |

The `index` field (1–12) already encodes chromatic order; `note` makes the label explicit
for the render pipeline without requiring it to derive the pitch name from the title string.

**Before (root `tanpura.json`, entry 1):**
```json
{
  "index": 1,
  "id": "ETswzWXqjMs",
  "url": "https://www.youtube.com/watch?v=ETswzWXqjMs",
  "title": "Tanpura | C Scale Tanpura | Best For Meditation",
  "description": "...",
  "uploader": "The Flute Guruji",
  "duration": 4219,
  "upload_date": "20220915"
}
```

**After (`carnatic/data/tanpura.json`, entry 1):**
```json
{
  "index": 1,
  "note": "C",
  "id": "ETswzWXqjMs",
  "url": "https://www.youtube.com/watch?v=ETswzWXqjMs",
  "title": "Tanpura | C Scale Tanpura | Best For Meditation",
  "description": "...",
  "uploader": "The Flute Guruji",
  "duration": 4219,
  "upload_date": "20220915"
}
```

The full 12-entry mapping (index → note):

| index | note |
|---|---|
| 1  | C  |
| 2  | C# |
| 3  | D  |
| 4  | D# |
| 5  | E  |
| 6  | F  |
| 7  | F# |
| 8  | G  |
| 9  | G# |
| 10 | A  |
| 11 | A# |
| 12 | B  |

---

### 2. Render pipeline: inject `tanpura_data` as a JS global

[`carnatic/render/html_generator.py`](../carnatic/render/html_generator.py) loads
`carnatic/data/tanpura.json` and injects it as a JS constant `tanpuraData` alongside the
existing `elements`, `ragas`, `recordings`, etc. globals.

```python
# in render_html() — new parameter: tanpura_data: list[dict]
tanpura_json = json.dumps(tanpura_data, indent=2, ensure_ascii=False)
# appended to data_js:
f"const tanpuraData = {tanpura_json};\n"
```

[`carnatic/render/data_loaders.py`](../carnatic/render/data_loaders.py) gains a new loader:

```python
def load_tanpura(data_dir: Path) -> list[dict]:
    path = data_dir / "tanpura.json"
    with path.open(encoding="utf-8") as f:
        return json.load(f)
```

---

### 3. HTML: Sruti Bar strip above `<header>`

A new `<div id="sruti-bar">` is inserted **above** the existing `<header>` in
[`carnatic/render/templates/base.html`](../carnatic/render/templates/base.html).

```html
<!-- ── Sruti Bar (ADR-029) ── -->
<div id="sruti-bar">
  <span class="sruti-label">ஸ்ருதி</span>
  <!-- Power indicator: dim when off, aqua when on. Click to turn off. -->
  <span id="sruti-power" class="sruti-power" title="Tanpura on/off">●</span>
  <!-- 12 pitch buttons injected by sruti_bar.js from tanpuraData -->
  <div id="sruti-buttons"></div>
</div>
```

The static Tamil label "ஸ்ருதி" (sruti) anchors the strip culturally. The power indicator
`●` is a clickable glyph that reflects the on/off state and can be clicked to silence the
drone. The 12 buttons are rendered by JavaScript from `tanpuraData` so the HTML template
remains data-agnostic.

**CSS for the Sruti Bar** (added to `base.html` `<style>`):

```css
/* ── Sruti Bar (ADR-029) ── */
#sruti-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 18px;
  background: var(--bg-deep);
  border-bottom: 1px solid var(--border-strong);
  flex-shrink: 0;
}
.sruti-label {
  font-size: 0.72rem;
  color: var(--fg-muted);
  letter-spacing: 0.05em;
  flex-shrink: 0;
  margin-right: 2px;
}
/* Power indicator ● */
.sruti-power {
  font-size: 0.65rem;
  color: var(--fg-muted);
  cursor: pointer;
  flex-shrink: 0;
  margin-right: 6px;
  transition: color 0.15s;
  user-select: none;
  line-height: 1;
}
.sruti-power.sruti-on {
  color: var(--accent-sub);   /* aqua glow when active */
}
.sruti-power:hover {
  color: var(--accent-danger);  /* red on hover = "click to stop" affordance */
}
#sruti-buttons {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
}
.sruti-btn {
  min-width: 32px;
  padding: 3px 6px;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  color: var(--fg-muted);
  font-size: 0.72rem;
  font-family: var(--font-ui);
  border-radius: 2px;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.1s, color 0.1s, background 0.1s;
  white-space: nowrap;
  user-select: none;
}
.sruti-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-input);
}
.sruti-btn.sruti-active {
  border-color: var(--accent-sub);
  color: var(--accent-sub);
  background: var(--bg-input);
}
/* Sharp notes (C#, D#, F#, G#, A#) — slightly dimmer to mirror piano keyboard logic */
.sruti-btn.sharp {
  color: var(--fg-muted);
  font-size: 0.68rem;
}
.sruti-btn.sharp:hover {
  color: var(--accent);
}
```

---

### 4. JavaScript: `sruti_bar.js` template

A new template file [`carnatic/render/templates/sruti_bar.js`](../carnatic/render/templates/sruti_bar.js)
handles button rendering, power indicator state, and player launch. It is injected **after**
`media_player.js` (which defines `openPlayer` and `closePlayer`) and **before** `graph_view.js`.

**Singleton model:** only one tanpura player (`playerId = 'sruti'`) exists at any time.
Clicking a new pitch closes the previous player and opens a fresh one. Clicking the active
pitch again, or clicking the power indicator, closes the player and resets the bar to off.

**Power indicator:** a `●` glyph to the left of the pitch buttons reflects the on/off state.
- Off state: `color: var(--fg-muted)` — dim, unobtrusive
- On state: `color: var(--accent-sub)` — aqua glow, clearly active
- Hover (when on): `color: var(--accent-danger)` — red, "click to stop" affordance

```javascript
// sruti_bar.js — Sruti Bar (ADR-029)
// Singleton tanpura drone. One pitch at a time.
// Power indicator (●) shows on/off state.

(function () {
  const container = document.getElementById('sruti-buttons');
  const indicator = document.getElementById('sruti-power');
  if (!container || !window.tanpuraData) return;

  let activeBtn = null;   // currently lit button

  function deactivate() {
    if (activeBtn) { activeBtn.classList.remove('sruti-active'); activeBtn = null; }
    if (indicator) indicator.classList.remove('sruti-on');
    closePlayer('sruti');  // defined in media_player.js
  }

  // Power indicator click = toggle off
  if (indicator) indicator.addEventListener('click', deactivate);

  tanpuraData.forEach(function (entry) {
    const btn = document.createElement('button');
    btn.className = 'sruti-btn' + (entry.note.includes('#') ? ' sharp' : '');
    btn.textContent = entry.note;
    btn.title = entry.note + ' tanpura';

    btn.addEventListener('click', function () {
      // Clicking the active pitch = toggle off
      if (activeBtn === btn) { deactivate(); return; }

      // Switch to new pitch: close old player, open new one
      deactivate();
      btn.classList.add('sruti-active');
      activeBtn = btn;
      if (indicator) indicator.classList.add('sruti-on');

      // openPlayer(videoId, title, playerId) — singleton 'sruti' player
      openPlayer(entry.id, entry.note + ' tanpura', 'sruti');
    });

    container.appendChild(btn);
  });
})();
```

**Interaction contract with `media_player.js`:**

The existing [`openPlayer(videoId, title)`](../carnatic/render/templates/media_player.js)
signature must be extended to accept an optional `playerId` parameter. When `playerId` is
`'sruti'`, the player is created or reused at a fixed position (top-right of the canvas,
below the header) rather than the default stacked position. A matching `closePlayer(playerId)`
function closes and removes the named player. Both extensions are the Carnatic Coder's domain.

---

### 5. `body` flex layout adjustment

The `<body>` currently uses `flex-direction: column` with `height: 100vh`. The Sruti Bar
is a new `flex-shrink: 0` child inserted before `<header>`, so no layout change is needed —
the bar simply takes its natural height (~32px) and the rest of the layout compresses
accordingly. The graph canvas (`#cy`) already uses `flex: 1; min-height: 0` and will absorb
the reduction.

---

## Consequences

### Enables

- **Sonic immersion during graph exploration**: a rasika can set the drone to their preferred
  pitch before opening a concert track. The power indicator confirms the drone is live.
- **Active practice (riyaz)**: a student opens a tanpura drone, then navigates to a
  composition in the Bani Flow trail and plays the concert recording alongside the drone —
  enabling singing along, gamaka exploration, and sruti training in a single tab.
- **Singleton discipline**: only one drone plays at a time, mirroring the physical reality
  of a single tanpura. Switching pitch is instantaneous — the old player closes, the new one
  opens. The power indicator tracks the state without ambiguity.
- **Persistent across views**: the Sruti Bar sits above the view selector, so the drone
  continues playing when the user switches from Graph to Timeline to Raga Wheel.
- **Queries enabled**:
  - *"I want to practice Bhairavi alongside TM Krishna's recording"* → user clicks the
    matching pitch button, then opens the recording from the Bani Flow trail.
  - *"Is the drone on?"* → user glances at the power indicator (● aqua = on, dim = off).

### Forecloses

- The Sruti Bar occupies ~32px of vertical space. On very small screens (< 600px height)
  this may compress the graph canvas. Acceptable: the target audience uses desktop browsers.
- The `tanpura.json` root file is superseded by `carnatic/data/tanpura.json`. The root file
  should be deleted after migration to avoid confusion.

### Does not foreclose

- Future addition of kattai labels on buttons (currently out of scope; note name only).
- Future addition of alternative drone sources (e.g. a shruti box, a different tanpura
  channel) — the schema accommodates multiple entries per note via a future `sources` array.
- Future integration with the Raga Wheel: when a raga is selected, the Sruti Bar could
  auto-highlight the typical pitch for that raga's tonic.

---

## Implementation

| Task | Agent | File(s) |
|---|---|---|
| Relocate `tanpura.json` → `carnatic/data/tanpura.json`; add `note` field | Carnatic Coder | `carnatic/data/tanpura.json` |
| Delete root `tanpura.json` after migration confirmed | Carnatic Coder | `tanpura.json` (root) |
| Add `load_tanpura()` to `data_loaders.py` | Carnatic Coder | [`carnatic/render/data_loaders.py`](../carnatic/render/data_loaders.py) |
| Extend `render_html()` to accept + inject `tanpura_data` | Carnatic Coder | [`carnatic/render/html_generator.py`](../carnatic/render/html_generator.py) |
| Add `#sruti-bar` HTML + CSS to `base.html` | Carnatic Coder | [`carnatic/render/templates/base.html`](../carnatic/render/templates/base.html) |
| Create `sruti_bar.js` template | Carnatic Coder | [`carnatic/render/templates/sruti_bar.js`](../carnatic/render/templates/sruti_bar.js) |
| Extend `openPlayer()` + add `closePlayer()` for `playerId` support | Carnatic Coder | [`carnatic/render/templates/media_player.js`](../carnatic/render/templates/media_player.js) |
| Wire `sruti_bar.js` into `html_generator.py` script block | Carnatic Coder | [`carnatic/render/html_generator.py`](../carnatic/render/html_generator.py) |

---

## Open questions

1. **Player position**: the sruti player should appear at a fixed position (e.g. top-right
   of the canvas) rather than the default stacked position used by concert players. The exact
   coordinates are a Carnatic Coder decision.

2. **Kattai display**: out of scope for this ADR. Note name only on buttons. Revisit in a
   future ADR if practitioners request kattai labels.

3. **Auto-sruti**: out of scope. No pitch metadata on recordings. The user selects the sruti
   manually, which is the correct practice — the musician chooses their own tonic.
