# ADR-102: Help Deck Colophon — Vision, Curation Loop, Contribute, Listening Ethic, Author

**Status**: Accepted
**Date**: 2026-04-25
**Agents**: graph-architect → librarian, carnatic-coder
**Depends on**: ADR-085 (self-replicating curation loop), ADR-086/087/091 (empty panels), ADR-098 (concept anchoring & Lakshmi Sreeram integration)
**Related**: ADR-031 (entry forms), ADR-083 (bundle channel)

---

## Context

The help deck has, through ADRs 086 → 098, become a working tutorial: chip catalogue, cross-panel seeds, view-section, anchored vocabulary. It teaches the rasika *how to read* the panels.

It does not yet teach the rasika **why the panels exist**. Five forces are unresolved.

**Force 1 — The vision is unspoken.** The site is built on a philosophical commitment: that Carnatic music is an aural-oral tradition transmitted as living relationship, not as catalogued metadata; that a graph of guru-shishya edges is the most honest documentation of that tradition; that the rasika's listening is itself an act of participation, not consumption. TMK's *A Southern Music* names this stance — music is not the sounds, but "what they do to us" (ch. 1); aesthetics is "not what you sense, but how to sense" (ch. 1); the receiver is "drawn completely into the world of the art" and there enters a created, impersonal space. Bani Flow's chip catalogue assumes this stance but never declares it. A first-time visitor sees a tutorial about chips and never learns *what kind of object* this site is or *what kind of attention* it asks of them.

**Force 2 — The curation loop (ADR-085) is invisible.** The system is self-editing — every reader is a potential author. Entry forms generate bundles; `bani-add` ingests them; `bani-render` regenerates `graph.html`. This is the constitutional commitment that distinguishes Bani Flow from a publication. But none of the six surfaces named in ADR-085 (graph.html, bundle, bani-add, writer, entity files, render) appears in the empty panels. The rasika reads the graph as a finished artefact. The affordance to extend it is buried in a `+` button without an explanation of what pressing it means.

**Force 3 — No path to contribute.** The repository is on GitHub. The site does not say so. There is no link from the rendered `graph.html` back to the source repository. A rasika who notices a missing recording, a wrong birth year, a missing lineage, has no surfaced path to fix it. The "every reader a potential author" promise of ADR-085 is structurally undermined when the source location is hidden.

**Force 4 — YouTube's ad-driven interface contradicts the listening ethic.** Every recording chip and lecdem chip on Bani Flow opens — by default — into the YouTube watch page, which surrounds the music with ads, autoplay queues, recommendation rails, and engagement-optimised UI chrome. This is the opposite of the attention the music asks for. The site already supports `libredirect` transparently in the floating player (`media_player.js` line 507), but the rasika is never told this exists. A small, optional pointer to LibRedirect — a browser extension that intercepts YouTube links and redirects them to a player of the user's choice (Invidious, Piped, FreeTube, mpv) — is the cheapest and most direct expression of the listening ethic the site embodies.

**Force 5 — The author is anonymous.** The site is curated by a single human with a name and a Wikipedia-style identity (Gravatar, GitHub profile). The Librarian persona in CLAUDE.md is a workflow role; the actual person doing the work is invisible to the rasika. This anonymity is a barrier to trust, to correspondence, and to the social contract of a curatable corpus: *who is responsible for this graph*, and *who do I write to when I want to discuss it*?

These five forces share a shape. Each is a missing piece of a **colophon** — the traditional book-form section that names the publisher, the typesetter, the press, the paper, the principles. In a self-editing system, the colophon must also name the loop, the contribution path, and the listening ethic.

---

## Pattern

### **Pattern 13, *A Pattern Language* — Sub-cultures' Boundary**, and Pattern 24 — Sacred Sites

A culture marks its edges so that a visitor knows when they have crossed in. The help deck currently has no edge — it begins with chips and ends with chips. A colophon names the edge: *this is the kind of place this is, this is who tends it, this is how you join the tending.*

### **Property 4, *The Nature of Order* — Alternating Repetition**

The two panels (musician_panel, bani_flow_panel) repeat the same structural rhythm: chip catalogue → cross-panel seeds → view-section. A colophon, rendered identically below both panels, completes the rhythm. It is the same closing chord both panels resolve into — independent of which entry the rasika landed on first.

### **Levels of Scale (Alexander, Pattern 5) — extended from ADR-098**

ADR-098 introduced three grain sizes of *concept* anchoring (inline ext_link, lecture chip, full curriculum). This ADR introduces four grain sizes of *vision* anchoring:

| Grain | Surface | Purpose |
|---|---|---|
| Smallest | Author avatar (Gravatar) + name | One-tap identification of the human responsible |
| Small | Listening-ethic note (LibRedirect) | One-paragraph technical pointer with one external link |
| Medium | Contribute card (GitHub repo + curation-loop summary) | Names the loop, links the source, invites the bundle workflow |
| Largest | Vision card (TMK-toned philosophical preface) | Declares what the site is and what listening it asks for |

The colophon is the level-of-scale completion of the help deck.

### **Property 7, *The Nature of Order* — Boundaries**

The colophon is the boundary between the rasika's attention inside the panel and their attention in the wider world (the source repo, the LibRedirect docs, the author). A boundary is what makes the inside coherent. Without a colophon, the panel's chip catalogue blurs into the broader internet without a transition.

---

## Decision

### A. Add a top-level `colophon` block to `empty_panels.json` (new field, additive)

A single `colophon` object lives at the root of `empty_panels.json`, parallel to `musician_panel` and `bani_flow_panel`. It is rendered identically beneath both panel tutorials. Its presence is optional; absence yields no rendered colophon (backwards-compatible with all prior `empty_panels.json` files).

```json
{
  "schema_version": 4,
  "musician_panel": { ... },
  "bani_flow_panel": { ... },
  "colophon": {
    "vision": { ... },
    "curation_loop": { ... },
    "contribute": { ... },
    "listening_ethic": { ... },
    "author": { ... }
  }
}
```

**`schema_version` bumps to 4.** This is additive — no existing field changes shape — but the bump signals to the validator that the `colophon` field is now recognised. Older `empty_panels.json` files with `schema_version: 3` and no `colophon` continue to validate and render without colophon.

### B. Sub-block schemas

Each sub-block is independently optional. The renderer skips any sub-block that is absent or empty. Order in the rendered DOM is fixed: vision → curation_loop → contribute → listening_ethic → author.

#### B.1 — `vision`

```json
"vision": {
  "heading": "What this is",
  "paragraphs": [
    "Carnatic music is not a catalogue. It is a living transmission — guru to shishya — across a hundred and fifty years of recorded sound and a thousand years of unrecorded teaching. This site documents that transmission as a graph: nodes are musicians, edges are the relationships through which sound is taught.",
    "TM Krishna writes that music is not the sounds themselves but what they do to us; that aesthetics is not what you sense but how to sense. This graph is a tool for the second kind of listening. The chips are not records. They are entry-points into a field of relationship.",
    "The two views — Guru-Shishya and Mela-Janya — are the two organs through which a rasika holds the tradition: the human lineage and the modal world. Switch between them. The same musician sounds different when you hear them inside their bani; the same raga sounds different when you hear it in three different lineages."
  ],
  "epigraph": {
    "text": "The receiver is drawn completely into the world of the art, and there develops a personal relationship with it.",
    "source": "TM Krishna, A Southern Music, ch. 1"
  }
}
```

Validator rules:
- `heading` non-empty string when present
- `paragraphs` array of non-empty strings, length ≥ 1
- `epigraph` optional object with `text` and `source`, both non-empty strings

#### B.2 — `curation_loop`

```json
"curation_loop": {
  "heading": "A self-editing graph",
  "paragraphs": [
    "Every chip you see was authored by the same surfaces that you can use. The + buttons in each panel open entry forms that produce a bundle file; the bundle file is ingested by a single command (bani-add); the next render of graph.html includes your contribution. The reader and the author are the same person, by construction.",
    "This shape is named in ADR-085 as the curation loop. It is the constitutional commitment of the project: there is no privileged author, no remote service, no schema enforced only on a server. The data, the schema, the entry forms, the validators, and the render pipeline all live inside a single clone of the repository."
  ],
  "diagram_text": "graph.html  →  bundle  →  bani-add  →  writer  →  entity files  →  render  →  graph.html",
  "ext_links": [
    { "label": "ADR-085 · the curation loop", "url": "https://github.com/vyaas/bani_flow/blob/main/plans/ADR-085-self-replicating-curation-loop.md" },
    { "label": "Entry forms (ADR-031, ADR-082)", "url": "https://github.com/vyaas/bani_flow/blob/main/plans/ADR-031-data-entry-forms.md" }
  ]
}
```

Validator rules:
- `diagram_text` optional non-empty string (rendered as monospace `<pre>` block)
- `ext_links` validated identically to ADR-098 §A (`label`, `url`, `https://`)

#### B.3 — `contribute`

```json
"contribute": {
  "heading": "Contribute",
  "summary": "Bani Flow is open source. Add a musician, a recording, a lineage edge — clone the repo, run the entry form, submit a pull request.",
  "repo": {
    "label": "vyaas/bani_flow",
    "url": "https://github.com/vyaas/bani_flow",
    "icon": "github"
  },
  "quickstart": [
    "git clone https://github.com/vyaas/bani_flow",
    "pip install -e .",
    "bani-serve  # opens http://localhost:8765/graph.html",
    "use a + button to author your contribution",
    "bani-add ~/Downloads/bani_add_bundle.json && bani-render"
  ],
  "ext_links": [
    { "label": "CONTRIBUTING.md", "url": "https://github.com/vyaas/bani_flow/blob/main/CONTRIBUTING.md" },
    { "label": "Open issues", "url": "https://github.com/vyaas/bani_flow/issues" }
  ]
}
```

Validator rules:
- `repo.url` must match `^https://github\.com/[^/]+/[^/]+/?$`
- `repo.icon` enum: `"github"` (extensible later; for now this is the only value)
- `quickstart` optional array of non-empty strings, rendered as ordered list

#### B.4 — `listening_ethic`

```json
"listening_ethic": {
  "heading": "On listening — and a note about LibRedirect",
  "paragraphs": [
    "YouTube is the substrate this site rests on. It is also an attention-extraction machine: every recording opens into a page surrounded by ads, autoplay queues, recommendation rails, and engagement-optimised chrome. This is the opposite of the attention Carnatic music asks for.",
    "We separate the music from the interface. The floating player on this site embeds the video without the surrounding chrome. For the open-in-new-tab links, install LibRedirect — a browser extension that transparently redirects YouTube URLs to a player of your choosing (Invidious, Piped, FreeTube, mpv). Once installed, every ↗ link from this site opens into a clean, ad-free, algorithmically-quiet player. You read the graph; the music plays. Nothing else is asked of you."
  ],
  "ext_links": [
    { "label": "LibRedirect · install & configure", "url": "https://libredirect.github.io/" },
    { "label": "Invidious instances", "url": "https://invidious.io/" }
  ]
}
```

Validator rules: identical to `vision`.

#### B.5 — `author`

```json
"author": {
  "name": "Vyaas",
  "tagline": "Curator · maintainer · single human responsible",
  "avatar_url": "https://gravatar.com/avatar/<hash>?s=120&d=identicon",
  "gravatar_profile_url": "https://gravatar.com/vyaas",
  "ext_links": [
    { "label": "GitHub · @vyaas", "url": "https://github.com/vyaas" },
    { "label": "Gravatar profile", "url": "https://gravatar.com/vyaas" }
  ]
}
```

Validator rules:
- `name` non-empty string
- `avatar_url` must begin with `https://`
- `gravatar_profile_url` optional, must begin with `https://gravatar.com/`
- The rendered avatar is a 36–48px circular `<img>` (CSS class `pt-author-avatar`) with `alt={name}`, `loading="lazy"`, `referrerpolicy="no-referrer"`

**Gravatar hash resolution.** The Librarian computes the avatar URL once and stores the resolved URL (Gravatar's URL scheme is `https://gravatar.com/avatar/<md5(lowercase email)>?s=120`). If the email is private, the Librarian uses Gravatar's "profile image" URL pattern (`https://gravatar.com/userimage/<id>/<hash>.jpeg` — visible from the public profile page) and stores that directly. The schema does not encode the email; the resolved URL is the stored field.

### C. Rendering placement

The `colophon` div is appended to **the same container** as the existing tutorial body (`bani-tutorial`, `musician-tutorial`), beneath the existing `view_section`. It is rendered once per panel — not shared as a single DOM node — because the panels are independent scroll containers and a sibling element cannot be parented to both.

A single `colophon` data block produces two rendered colophons (one per panel). The Coder is permitted to factor the rendering helper accordingly.

The colophon is **not** affected by ADR-098's tutorial-filter interactivity (the search-bar typing filter). The colophon is institutional content, not chip catalogue. It always renders fully when the tutorial is visible.

### D. Visual specification (Coder)

- **Heading**: `<h3 class="pt-colophon-head">` — reuses existing tutorial heading typography
- **Section dividers**: a single thin `border-top` between sub-blocks; no boxes, no cards
- **Avatar**: 40px circle, `border-radius: 50%`, 1px subtle border, anchored inline with author name (flex row)
- **GitHub icon**: inline SVG (octocat outline, 16px) beside the repo URL — the Coder may inline the GitHub Mark SVG
- **Diagram text** (`curation_loop.diagram_text`): rendered in `<pre class="pt-loop-diagram">` with monospace font and no syntax highlighting
- **Quickstart**: rendered as `<ol class="pt-quickstart">` with each step in `<code>`-styled mono
- **Epigraph**: italic, indented, with `— source` attribution

The colophon must remain readable on a 390px-wide mobile panel. No multi-column layouts.

### E. Phase plan

This ADR introduces a schema version bump (3 → 4). The phases are sequenced so that no half-shipped state breaks the existing render.

**Phase 1 — Architect (this ADR).** Land ADR-102 as Accepted. No code, no data.

**Phase 2 — Coder.**
- Bump `schema_version` recognised values to include 4 in the validator.
- Implement renderer for `colophon` block in `empty_tutorials.js` (new function `_renderColophon(block, container)`).
- Add CSS for `pt-colophon-head`, `pt-author-avatar`, `pt-loop-diagram`, `pt-quickstart`, `pt-listening-ethic`, `pt-contribute-repo`, `pt-vision-epigraph` in the existing tutorials stylesheet.
- Validator extension: per-sub-block field rules per §B above.
- No data file changes; the renderer no-ops when `colophon` is absent.

**Phase 3 — Librarian.**
- Patch `data/help/empty_panels.json`:
  - Bump `schema_version` to 4.
  - Add the `colophon` block using the prose drafted in §B as a starting point. The Librarian may refine the prose for tone but must preserve the TMK epigraph citation (chapter and book) and the LibRedirect content (it is not optional voice — it is the listening ethic the site declares). Quotations from *A Southern Music* are short, attributed, and used for commentary — fair-use scope.
  - Resolve the Gravatar avatar URL by visiting `https://gravatar.com/vyaas` and copying the resolved profile image URL.
- Run `python3 carnatic/cli.py validate` and `bani-render`.
- Verify the colophon appears in both panels at 390px and 1280px widths.

**Phase 4 — Architect (follow-up, optional).**
- If contributors propose additional colophon sub-blocks (e.g., `acknowledgements`, `funders`, `license`), they enter through a new ADR — not by extending this one. The colophon's sub-block enumeration is a closed set in v4.

### F. What this ADR does NOT decide

- **The exact prose** is the Librarian's domain. §B paragraphs are *drafts to be ratified or rewritten*. The Architect's commitment is the schema and the inclusion of TMK-toned vision language; the words themselves the Librarian owns.
- **The Gravatar hash** — the Librarian resolves this from the public profile.
- **Whether the colophon is collapsible** — no. It is always expanded when the tutorial is visible. A future ADR may revisit if mobile screen-real-estate becomes a complaint.
- **A site-wide footer outside the tutorials** — out of scope. The colophon lives inside the empty panel state. When a subject is loaded, the colophon disappears with the rest of the tutorial.
- **A separate "About" route or modal** — out of scope. The colophon is the about-page; the empty panel is its venue. Adding a route would fragment the vision across two surfaces.

---

## Consequences

### Positive

- The site finally declares what it is. A first-time visitor reads the vision card and understands they have arrived at a particular kind of object — not a Wikipedia, not a YouTube playlist, not a Spotify-for-Carnatic — but a relational graph maintained by a human under a stated philosophy.- ADR-085's curation loop becomes visible to the rasika, not just to the agents in the repo. The "every reader is a potential author" commitment is structurally manifest in the deck.
- The contribute path is one tap from any empty panel. New contributors discover the project's source repo without leaving the site.
- The listening ethic is named. Rasikas who care about ad-free listening get a concrete tool (LibRedirect); rasikas who don't see one paragraph and move on. The site does not enforce, it invites.
- The author is identified, accountable, and reachable. The graph stops being anonymous infrastructure and becomes a maintained artefact with a face.
- The colophon is identical in both panels — alternating repetition (Property 4) is preserved. The two panels resolve into the same closing chord.

### Negative / accepted tradeoffs

- The empty panel becomes longer. On mobile, the rasika scrolls past chip catalogue → cross-panel seeds → view-section → colophon. This is acceptable: when the panel is loaded with a subject, the colophon disappears entirely.
- Schema version bump (3 → 4) is a breaking-change marker for any external tooling that reads `empty_panels.json`. There is no such tooling at present, so the cost is zero in practice; the bump is a discipline marker for future contributors.
- The Librarian must resolve the Gravatar hash. This is a one-time manual lookup that may need to be re-resolved if the author changes their Gravatar image. Acceptable; documented in §E Phase 3.
- The vision prose risks tonal drift across edits. The TMK citation anchors it: subsequent edits must preserve the "music is not the sounds but what they do to us" stance. If a future Librarian wants to replace the vision wholesale, they go through an ADR.

### Risks

- **GitHub URLs hardcoded.** If the repo moves (org rename, fork promotion), every `colophon.contribute.repo.url` and `ext_links` URL becomes stale. Mitigated: GitHub redirects for renamed repos work indefinitely; a future ADR can introduce a `repo_base` template variable if this becomes a real concern.
- **Gravatar dependency.** Gravatar is a third-party service. If it goes down, the avatar image breaks (alt text remains). Acceptable: the site degrades gracefully (`<img>` with broken src renders nothing visible; `alt={name}` is read by screen readers).
- **LibRedirect mention may date.** The extension's URL or status could change. Mitigated: the prose names the *category* of tool ("a browser extension that intercepts YouTube URLs") before the specific brand, so the paragraph remains coherent even if LibRedirect is replaced by a successor.
- **Tonal mismatch between TMK voice and operational voice.** The vision card is meditative; the contribute card is operational. The colophon's section ordering (vision → loop → contribute → listening → author) deliberately walks from contemplative to operational, mirroring TMK's own movement in *A Southern Music* from Experience → Context → History.

---

## Implementation

This ADR introduces no code and no data changes itself. It defines:

1. The `colophon` block schema and `schema_version: 4` bump.
2. The five sub-block schemas (`vision`, `curation_loop`, `contribute`, `listening_ethic`, `author`) with per-field validation rules.
3. The rendering placement (per-panel, beneath `view_section`, no filter interactivity).
4. The visual specification (avatar circle, GitHub icon, monospace diagram, ordered quickstart).
5. The phase plan (Coder before Librarian; renderer ships before content).
6. Draft prose for each sub-block, to be ratified or refined by the Librarian.

**Verification on landing (Phase 3 complete):**
- `python3 carnatic/cli.py validate` passes with `schema_version: 4`.
- The colophon renders below both panel tutorials.
- The avatar loads from Gravatar with the correct hash.
- The GitHub repo link opens to `vyaas/bani_flow`.
- LibRedirect is named and linked.
- The vision card cites TMK chapter 1 with the exact attribution shown in §B.1.
- All `ext_links` are HTTPS.
- The colophon disappears when a subject is loaded into either panel.

---

## Supersedes / Related

- **Extends** ADR-086 (empty panels): adds a fourth structural region (colophon) to the panel schema.
- **Extends** ADR-091 (yin-yang): preserves panel symmetry by rendering the colophon identically in both panels.
- **Extends** ADR-098 (concept anchoring): `ext_links` validation reused; `colophon` does not participate in tutorial-filter interactivity.
- **Realises** ADR-085 (curation loop): makes the loop visible to the rasika as one of five colophon sub-blocks.
- **Does not supersede** any prior ADR. The schema bump is additive.

---

## Closing note

The colophon is the place where the site stops being a tool and starts being a stance. Five forces — vision unspoken, loop invisible, no contribution path, ad-driven default interface, anonymous author — all dissolve into the same architectural answer: a single block at the foot of the help deck that says *here is what we are, here is who tends it, here is how you join in, and here is the listening this asks of you.* Once it lands, the rasika never has to ask "what is this site?" — the site has already answered, in the panel where they first arrived.
