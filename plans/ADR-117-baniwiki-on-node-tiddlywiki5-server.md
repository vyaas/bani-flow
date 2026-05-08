# ADR-117: BaniWiki on Node — TiddlyWiki5 server adoption

**Status**: Proposed
**Date**: 2026-05-08
**Agents**: graph-architect (proposer), carnatic-coder (downstream implementer if accepted)
**Depends on**: ADR-085 (self-replicating curation loop), ADR-095 (BaniWiki exploratory mapping)
**Supersedes (in part)**: ADR-095 §7 ("No multi-user / Node.js TiddlyWiki server")
**Companion ADRs**: ADR-118 (vocabulary), ADR-119 (mapper), ADR-120 (filter atlas), ADR-121 (phase-out)

---

## Context

ADR-095 sanctioned an *exploratory* mapping of Bani Flow onto a single-file TiddlyWiki5 (`baniwiki.html`). It deliberately deferred the question of TiddlyWiki's other deployment shape — `tiddlywiki` on Node.js, where each tiddler is its own file under `tiddlers/` and the wiki runs as a long-lived HTTP server.

That deferral is now the bottleneck. The single-file mode has two structural costs we cannot accept long-term:

1. **No external addressability.** A tiddler inside `baniwiki.html` lives at a URL fragment (`#:Musician/ariyakudi_ramanuja_iyengar`). External systems — search engines, citations, Wikipedia footnotes, ADRs in this very repo — cannot deep-link to a single tiddler with a stable HTTP URL. The whole HTML must be downloaded to address one tiddler.
2. **No per-tiddler version control.** A single 4 MB HTML file is a hostile diff target. A change to one musician shows as a noisy diff in the entire tiddler store JSON. Git stops being a useful audit trail of curation.

The Node.js TiddlyWiki5 deployment solves both:

- **One tiddler = one file** under `tiddlers/` (`.tid` for wikitext / metadata-bearing tiddlers, `.json` for JSON tiddlers, `.tid` + sidecar for binaries). Each is independently editable, diffable, and addressable.
- **HTTP routes per tiddler.** `tiddlywiki --listen` exposes `GET /recipes/default/tiddlers/<title>`, `PUT` for save, `DELETE` for delete. Stable URLs the rest of the web can link to.
- **Same wikitext, same filter DSL, same macro/widget system.** Nothing learned for the single-file mode is wasted; it all transfers.

Crucially, the user has stated the constraint explicitly: **"as many individual tiddlers as possible, as these enable easier external navigation than a single html file."** That is the deciding force.

This ADR commits BaniWiki to the **Node.js TiddlyWiki5 server** as its primary deployment, while preserving the single-file artefact as a **derived export** (TW5 supports `tiddlywiki --build index` to render the entire wiki to a single HTML on demand, exactly the artefact ADR-095 envisaged).

### Forces

| Force | Direction |
|---|---|
| **External addressability** | Each entity (musician, raga, composition, recording, lecdem, ADR) MUST have a stable, public-shareable HTTP URL. |
| **Per-tiddler diffs** | Curation work MUST appear as a per-entity file diff in `git log`, not as noise in a 4 MB blob. |
| **Authoring locality preserved** | A contributor MUST still be able to author entirely offline (no remote DB), even though the wiki is now served. The Node server runs against a local `tiddlers/` directory; `git pull` and `git push` are the sync layer. |
| **Single-file artefact preserved** | `baniwiki.html` (the ADR-095 deliverable) remains buildable as a *derived* artefact for share-by-attachment scenarios. It is no longer the canonical store. |
| **Function-based, not surgical** | Per the user's constitutional constraint: there are no surgical schema changes. Scripts produce the `tiddlers/` tree from `data/**` (forward) and reconstruct `data/**` from `tiddlers/` (inverse). The `tiddlers/` tree is a *projection*, not a hand-edited source — until ADR-121 phase-out flips canonicality. |
| **Per-file size and count manageable** | TiddlyWiki Node has been demonstrated on wikis with 50,000+ tiddlers. Our projected count (≈600 musicians + ragas + compositions + 5,000 recordings + ADRs ≈ 6,000 tiddlers initial, growing) is well within tested limits. |
| **Reversibility** | Until ADR-121 declares the phase-out complete, `data/**` remains canonical. The `tiddlers/` directory is regenerable from it at any time. |
| **Tooling ubiquity** | `npm install -g tiddlywiki` is a single command. No exotic infrastructure. CI builds the single-file artefact in seconds. |

---

## Pattern

**Christopher Alexander, Property 12, *Levels of Scale*.** ADR-095's single-file artefact collapses every level — the corpus, the tiddler, the field — into one file. The Node.js deployment restores the missing scale: **directory → file → tiddler → field**. Each level is independently addressable, independently diffable, independently editable. The structure becomes legible.

**Pattern 95, *A Pattern Language*: Building Complex.** A single building cannot serve every purpose; a complex of buildings, each specialised, sharing a courtyard, can. The single-file `baniwiki.html` is one building. The Node deployment is the complex: many small buildings (tiddler files), one courtyard (the served wiki), one shared infrastructure (TW5's filter and render engine). The single-file artefact remains — as one building among many, exported on demand.

**ADR-085's locality property is preserved, not weakened.** The Node server runs on `localhost`. The `tiddlers/` directory is a directory of files. Git is the sync substrate. There is no central server, no database, no authentication boundary. Locality survives; only the *shape* of the local store changes from "one HTML file" to "one directory of small files."

**Convergence with the existing repository shape.** `data/musicians/<id>.json`, `data/ragas/<id>.json`, `data/compositions/<id>.json`, `data/recordings/<id>.json`, `plans/ADR-NNN-*.md` are *already* a per-entity file tree. The Node TiddlyWiki layout is the same shape with TW-aware metadata. The migration is a re-projection, not a reorganisation.

---

## Decision

**Adopt TiddlyWiki5 on Node.js as BaniWiki's canonical deployment.** Each tiddler lives as its own file under a generated `baniwiki/tiddlers/` directory. The wiki runs locally via `tiddlywiki baniwiki/ --listen host=127.0.0.1 port=8765`. The single-file `baniwiki.html` is preserved as a *derived* artefact via `tiddlywiki baniwiki/ --build index`.

This decision **supersedes ADR-095 §7** (no Node, no multi-user) on the no-Node clause only. The "no multi-user" clause stands: BaniWiki remains a single-user, local-first system. The Node server is a *local* server, not a hosted one.

### 1 — Layout

The exploratory branch `baniwiki/exploration` (opened by ADR-095) gains a new top-level directory:

```
baniwiki/
  tiddlywiki.info              # TW5 wiki configuration (plugins, themes, build targets)
  tiddlers/                    # generated; one file per tiddler
    Musician/
      ariyakudi_ramanuja_iyengar.tid
      ...
    Raga/
      kharaharapriya.tid
      ...
    Composition/
      parulanna_matta.tid
      ...
    Recording/
      <id>.tid
    Concert/
      <id>.tid
    Lecdem/
      <id>.tid
    Tala/
      adi.tid
    Mela/
      kharaharapriya.tid
    ADR/
      117.tid
    Doc/
      Claude.tid
    System/
      SchemaVersion.tid
      ...
  output/                       # generated; ignored by git
    index.html                  # the single-file artefact, on demand
```

`baniwiki/tiddlers/` is **gitignored** during the exploratory phase (regenerable from `data/**`). Once ADR-121 phase-out flips canonicality, `baniwiki/tiddlers/` becomes git-tracked and `data/**` becomes the regenerable projection.

The directory **subfolders under `tiddlers/`** correspond to the tag namespaces defined in ADR-118. TW5 reads tiddlers recursively from `tiddlers/`; subfolders are organisational only and do not affect tiddler titles or filtering.

### 2 — Server entry points

Two new console scripts (registered in `pyproject.toml`, but each is a thin wrapper around `tiddlywiki` Node CLI):

- `bani-wiki-serve` → `tiddlywiki baniwiki/ --listen host=127.0.0.1 port=8765`
- `bani-wiki-build` → `tiddlywiki baniwiki/ --build index` (produces `baniwiki/output/index.html`)

These sit alongside the existing `bani-serve` and `bani-render`. They do not replace them yet; ADR-121 stages that retirement.

### 3 — Authoring routes (the loop, restated)

With TW5 on Node, the ADR-085 loop becomes:

| Step | Single-file mode (ADR-095) | Node mode (this ADR) |
|---|---|---|
| Read | open `baniwiki.html` | `bani-wiki-serve`, browse `http://127.0.0.1:8765/#:Musician/<id>` |
| Author | TW editor in browser, Save Changes downloads new HTML | TW editor in browser, Save fires `PUT /recipes/default/tiddlers/<title>`, file written to `tiddlers/<Type>/<id>.tid` |
| Validate | JS validator macro before save | same JS validator macro, server-side write only succeeds if validator passes |
| Persist | overwrite the HTML on disk | `git add baniwiki/tiddlers/<Type>/<id>.tid && git commit` (Librarian protocol) |
| Round-trip back to `data/**` | `baniwiki-roundtrip` parses HTML | `baniwiki-roundtrip` reads the `tiddlers/` directory (simpler — no HTML parse) |
| Re-render | TW re-renders on tiddler change | TW re-renders on tiddler change, *and* every browser holding the wiki open is hot-updated via TW's sync adaptor |

The win in Node mode: **persistence is a file write, not a download-and-replace.** The contributor's flow becomes: "edit in browser → save → `git status` shows the new file → commit." This is closer to the Librarian's existing discipline than the single-file flow.

### 4 — External addressability (the central win)

Every tiddler is reachable at:

```
http://<host>/#:<encoded title>
```

Examples after deployment:
- `https://baniwiki.example/#:Musician/ariyakudi_ramanuja_iyengar`
- `https://baniwiki.example/#:Raga/kharaharapriya`
- `https://baniwiki.example/#:Composition/parulanna_matta`
- `https://baniwiki.example/#:ADR/117`

These URLs are **stable** because tiddler titles are stable (Librarian hard rule: never rename a node ID). They can be cited from Wikipedia, from external blogs, from the project's own ADRs, from social posts.

The single-file artefact retains `#:` fragment navigation but is not externally indexable per-tiddler. Search engines see one HTML; Node mode lets them see one URL per tiddler.

### 5 — What stays out of scope for this ADR

- **Hosting choice.** Whether the served wiki lives on GitHub Pages (single-file build only — Pages is static), on a cheap VM, on a Raspberry Pi, or only on `localhost` is a separate decision (likely an ops-flavoured ADR after migration is committed).
- **Auth.** TW5 Node has basic-auth; we do not configure it during the exploration. Local-first means no auth needed locally.
- **Multi-writer concurrency.** The exploration is single-writer. Concurrent edits are a future problem (TW5 has documented strategies; not ours yet).
- **TW plugins beyond core.** Choice of which community plugins to install (TOC, markdown, mathjax) is deferred to ADR-118 (vocabulary) and ADR-119 (mapper) where the need surfaces.
- **The vocabulary itself.** What tags, what field names, what title patterns — that is ADR-118.
- **The mapper code.** That is ADR-119.

### 6 — Acceptance criteria

This ADR is **implemented** when:

1. `npm install -g tiddlywiki` and `bani-wiki-serve` together produce a running TW5 instance backed by a `tiddlers/` directory generated from `data/**`.
2. `bani-wiki-build` produces `baniwiki/output/index.html` byte-comparable in shape (not bytes) to the artefact ADR-095 §3 produced. Both single-file modes are reachable.
3. A contributor can deep-link to at least one tiddler of every type (musician, raga, composition, recording, lecdem, ADR) via a `#:` URL and have it load directly.
4. `git diff` after editing one musician in the browser shows a one-file diff under `baniwiki/tiddlers/Musician/<id>.tid`, *not* a multi-MB diff.
5. The mapper round-trip from ADR-119 passes against the directory layout (not just against the single-file shell).

---

## Consequences

### Positive

- **Stable per-entity URLs** become available to the wider web. The Carnatic tradition's lineage, ragas, and recordings get permanent, citeable addresses.
- **Git becomes the audit trail again.** Every curation decision is one diff, one commit, one author, one date — exactly the Librarian's existing discipline, now extended to the served wiki.
- **TW5's full feature set is unlocked.** Plugins, themes, server-side filter evaluation, sync adaptors, multi-browser hot updates — all only available in Node mode.
- **The single-file artefact survives as an export.** No capability is lost; one is added.
- **The ADR-085 loop is mechanically simpler.** No "download replacement HTML" step; saves are file writes.

### Negative / accepted tradeoffs

- **Two runtimes in the toolchain.** Python (`bani-render`, `cli.py`, `writer.py`) and Node (`tiddlywiki`). Mitigated by the fact that both are single-command installs and we already have `bani-serve` (Python HTTP) co-existing with browser JS.
- **Tiddler count grows from "1 HTML file" to "thousands of small files."** Filesystem cost is negligible (each tiddler is < 4 KB); git cost is well-amortised over per-entity diffs.
- **CI complexity.** GitHub Actions must install Node and TW5 in addition to Python. Two-line addition to the workflow.
- **Two artefacts to keep in sync** during the exploration (`graph.html` from `bani-render`, served wiki from `bani-wiki-serve`). Mitigated by ADR-121 staging the retirement.

### Risks (and mitigations)

- **TW5 Node version churn.** *Mitigated* by pinning `tiddlywiki` version in `package.json` (a new file at repo root; tiny).
- **Contributors confused by two authoring surfaces.** *Mitigated* by clear documentation: "during the exploration, `data/**` is canonical; BaniWiki is a window onto it. After ADR-121, BaniWiki is canonical; `data/**` is a window onto it."
- **The Node server becomes a fork of the project.** *Mitigated* by treating it identically to `graph.html` today: a derived artefact whose source is `data/**`.

---

## Implementation

This ADR enables the work; ADR-118, ADR-119, ADR-120, ADR-121 specify it. Implementation here is just the scaffolding.

### Phase 0 — Acceptance

1. **Architect** (this ADR): authored.
2. **User**: reviews; marks `Accepted` if the Node deployment is sanctioned. Acceptance commits us to the *deployment shape*, not yet to the vocabulary, the mapper details, or the phase-out timeline (those are the companion ADRs).

### Phase 1 — Scaffolding (Coder, after ADR-118 and ADR-119 are also accepted)

3. Add `package.json` with `tiddlywiki` pinned.
4. Add `baniwiki/tiddlywiki.info` per TW5 docs (declare core plugins, the `index` build target, the markdown plugin).
5. Add `baniwiki/tiddlers/` to `.gitignore` (regenerable from `data/**` until ADR-121 flips it).
6. Add console scripts `bani-wiki-serve` and `bani-wiki-build` to `pyproject.toml`.
7. Update `.github/workflows/deploy-pages.yml` to additionally build the single-file BaniWiki artefact (ADR-121 will decide which artefact Pages serves).

### Phase 2 — Integration with mapper (ADR-119)

8. The mapper writes to `baniwiki/tiddlers/<Type>/<id>.tid` rather than to a tiddler-store JSON inside an HTML file.
9. The round-trip reads from `baniwiki/tiddlers/` directly — much simpler than HTML parsing.

### Phase 3 — Loop verification

10. Coder confirms the §6 acceptance criteria.
11. Librarian performs an end-to-end edit-via-browser → save → git diff → round-trip → `data/**` smoke test.

---

## Open questions

1. **Hosting after the exploration.** Local-first is fine for the exploration; if BaniWiki becomes the primary public artefact (ADR-121 success), we need a server. Cheapest option likely: keep GitHub Pages serving the single-file artefact for the public, and run the Node server only locally for authoring. To be revisited.
2. **Sync adaptor choice.** TW5 supports multiple sync adaptors (HTTP via the bundled server, the file-system adaptor, the GitHub adaptor). Default is the bundled HTTP sync; that is what we choose unless §6 testing reveals a friction.
3. **`.tid` vs `.json` for entity tiddlers.** ADR-118 will decide per type. JSON tiddlers (`type: application/json`) are most natural for entities whose body *is* a JSON object; `.tid` files with rich fields suit ADRs and docs.
4. **CI cost.** Adding Node + TW5 install to CI is small but non-zero. Measure.
5. **Whether to host the served wiki anywhere public.** Open question, deliberately deferred.

---

## Closing note

ADR-095 said: "find out, on a branch, what TiddlyWiki would mean for us." This ADR says: "we found out enough to know we want the deployment shape that gives every tiddler its own URL and its own file, because that is the shape that makes the Carnatic tradition citable from outside our walls."

The single-file artefact remains. It is no longer the only artefact.
