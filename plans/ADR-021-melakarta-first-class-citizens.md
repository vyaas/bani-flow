# ADR-021: Melakarta Ragas as First-Class Graph Citizens

**Status:** Proposed
**Date:** 2026-04-12

---

## Context

### The symptom

Clicking a musician node in the graph reveals their lineage, their recordings, their
co-performers. The musician is a *strong centre* — a bounded world the rasika can
inhabit and traverse.

Clicking a raga in the Bani Flow panel currently takes the rasika *out* of the
experience — to a Wikipedia page in a new tab. There is no in-graph traversal. The
rasika cannot ask: *What are the janyas of Kharaharapriya? Which cakra does it belong
to? Which other melakartas share this cakra?* These are the natural questions of
someone immersed in the tradition.

### The structural gap

The current [`compositions.json`](../carnatic/data/compositions.json) raga schema has
two fields that gesture toward the Melakarta system:

```json
{
  "melakarta": 22,
  "parent_raga": "kharaharapriya"
}
```

But these are *annotations*, not structural edges:

- `melakarta` is an integer (1–72) pointing to **nothing** — there is no corresponding
  Mela object in the data. It is a label, not a link.
- `parent_raga` is a string ID — but it is inconsistently populated. Many janya ragas
  have `parent_raga: null` with the parent mentioned only in the free-text `notes`
  field (e.g. `"Janya of Kharaharapriya (22nd melakarta)"`). The relationship is
  buried in prose, not encoded as a traversable edge.
- There is **no `cakra` concept** anywhere in the schema. The 72 melakartas are
  grouped into 12 cakras of 6 each — this is the primary organisational structure of
  the Melakarta system, and it is entirely absent.
- There is **no `melakarta_ragas` collection** — no canonical list of the 72 Mela
  ragas as first-class objects. The only melakartas that exist as raga objects are
  those that happen to appear in our existing `ragas[]` array (currently: Todi/8,
  Natabhairavi/20, Keeravani/21, Kharaharapriya/22, Gowrimanohari/23,
  Harikambhoji/28, Shankarabharanam/29, Chakravakam/16, Vakulabharanam/14,
  Mayamalavagowla/15, Simhendramadhyamam/57, Pantuvarali/51, Kalyani/65).
  The other 59 melakartas do not exist as objects at all.

### The traversal gap

The current CLI ([`carnatic/cli.py`](../carnatic/cli.py)) has no raga-centric
traversal commands beyond `compositions-in-raga <raga_id>`. There is no way to ask:

- `janyas-of kharaharapriya` — which ragas have this as their parent?
- `mela-of abheri` — which melakarta is the parent of this janya?
- `cakra-of kharaharapriya` — which cakra does this mela belong to?
- `melas-in-cakra 4` — which 6 melakartas are in cakra 4?
- `is-mela kharaharapriya` — is this raga a melakarta?

These are the queries a student, scholar, or rasika would naturally ask. Without them,
the raga is not a traversable node — it is a tag.

### Why this matters for the tradition

The Melakarta system is the *grammar* of Carnatic music. Every raga is either a Mela
(a complete 7-note scale) or a Janya (derived from a Mela by omission, addition, or
vakra movement). The Cakra groups Melas by their Rishabha-Gandhara combination. This
three-level hierarchy — Cakra → Mela → Janya — is the structural spine of the
tradition. A knowledge graph that does not encode this spine cannot support the
immersive traversal the rasika deserves.

The Wikipedia page on the Melakarta system
([`https://en.wikipedia.org/wiki/Melakarta`](https://en.wikipedia.org/wiki/Melakarta))
provides the canonical breakdown: 72 melakartas, 12 cakras, with names, numbers, and
janya listings. This is the authoritative source for the data migration.

---

## Forces in tension

1. **Raga as strong centre** — A raga must be a traversable node, not a label. The
   rasika who searches for Kharaharapriya must be able to navigate to its janyas, its
   cakra, and its sibling melakartas — without leaving the graph.

2. **Fidelity to the oral tradition** — The Melakarta system is not a theoretical
   abstraction. It is the framework within which every guru teaches every student.
   "Kharaharapriya is the 22nd melakarta, in the 4th cakra (Veda), and its janyas
   include Reetigowla, Sriraga, Abheri, Mukhari" — this is the kind of statement a
   guru makes in the first lesson. The graph must encode it.

3. **Backward compatibility** — The existing `ragas[]` array in `compositions.json`
   must not be broken. Existing `raga_id` references in recordings, compositions, and
   youtube entries must continue to resolve. The 13 melakartas already in `ragas[]`
   must be enriched, not replaced.

4. **Scalability without fragmentation** — Adding 72 Mela objects must not create a
   parallel, disconnected data structure. The Mela objects must be the same kind of
   object as the existing raga objects — they live in the same `ragas[]` array, with
   the same schema, enriched with Mela-specific fields.

5. **Queryability** — Every structural decision must support at least one concrete
   query a rasika or scholar would actually ask. The three-level hierarchy must be
   traversable in both directions: top-down (cakra → melas → janyas) and bottom-up
   (janya → mela → cakra).

6. **Repair of existing data** — The `parent_raga` field is currently inconsistently
   populated. The migration must repair all existing janya ragas to have a correct
   `parent_raga` pointing to a Mela object in `ragas[]`. The free-text `notes` field
   is not a substitute for a structural edge.

---

## Pattern

### **Levels of Scale** (Alexander, Pattern 5)

The Melakarta system has three natural levels of scale:

```
Level 1: Cakra (1–12)  — the broadest grouping, by Ri-Ga combination
Level 2: Mela (1–72)   — the complete 7-note scale; the structural spine
Level 3: Janya         — derived ragas; the living repertoire
```

Good structure at every level reinforces good structure at every other level. The
current schema has only a partial Level 2 (13 of 72 Melas) and an inconsistent Level 3
(many janyas with `parent_raga: null`). Level 1 (Cakra) is entirely absent.

The fix instates all three levels as first-class citizens of the schema.

### **Strong Centres** (Alexander, Pattern 1)

A Mela raga is a **strong centre** — it is the tonal universe from which a family of
janyas is derived. A Cakra is a **strong centre** — it is the grouping principle that
gives the Mela its identity within the 72-fold system. The current schema treats Melas
as integers and Cakras as non-existent. The fix makes both into traversable objects.

### **Boundaries** (Alexander, Pattern 13)

The boundary between a Mela and its Janyas is the most important structural boundary
in Carnatic music theory. The `parent_raga` field is the edge that encodes this
boundary. It must be consistently populated for all janya ragas — not buried in prose.

### **Gradients** (Alexander, Pattern 9)

The traversal gradient runs from broad to specific: Cakra → Mela → Janya. The CLI
commands must support traversal in both directions along this gradient. A rasika
starting from a janya must be able to climb to the Mela and then to the Cakra. A
student starting from a Cakra must be able to descend to all 6 Melas and then to all
their Janyas.

---

## Decision

### 1. Schema enrichment — `ragas[]` objects gain two new fields

Add two new optional fields to the raga object schema:

| field | type | notes |
|---|---|---|
| `is_melakarta` | bool | `true` if this raga is one of the 72 melakartas. Absent or `false` for janya ragas. |
| `cakra` | int \| null | Cakra number (1–12) for melakarta ragas. `null` for janya ragas. |

The existing `melakarta` field (int | null) is **retained** — it is the melakarta
number for both Mela ragas (their own number) and Janya ragas (their parent's number,
currently used inconsistently). For Mela ragas, `melakarta` equals their own number.
For Janya ragas, `melakarta` is deprecated in favour of `parent_raga` (see below).

The existing `parent_raga` field (string | null) is **retained and enforced** — it
must be set for all janya ragas. The migration repairs all existing janyas that have
`parent_raga: null` but mention a parent in `notes`.

#### Before (current Mela raga object — Kharaharapriya)

```json
{
  "id": "kharaharapriya",
  "name": "Kharaharapriya",
  "aliases": ["Kara Harapriya"],
  "melakarta": 22,
  "parent_raga": null,
  "sources": [
    {
      "url": "https://en.wikipedia.org/wiki/Kharaharapriya",
      "label": "Wikipedia",
      "type": "wikipedia"
    }
  ],
  "notes": "22nd melakarta; equivalent to the Dorian mode; parent of many important janya ragas..."
}
```

#### After (enriched Mela raga object — Kharaharapriya)

```json
{
  "id": "kharaharapriya",
  "name": "Kharaharapriya",
  "aliases": ["Kara Harapriya"],
  "melakarta": 22,
  "is_melakarta": true,
  "cakra": 4,
  "parent_raga": null,
  "sources": [
    {
      "url": "https://en.wikipedia.org/wiki/Kharaharapriya",
      "label": "Wikipedia",
      "type": "wikipedia"
    }
  ],
  "notes": "22nd melakarta; Cakra 4 (Veda); equivalent to the Dorian mode; parent of many important janya ragas including Reetigowla, Sriraga, Abheri, Mukhari, Devamritavarshini, Manirangu, Devagandhari, Kaanada, Huseni, Dwijavanthi, Atana, Dhenuka, Kannada, Kurinji, Maund, Narayanagowla, Jayantasena, Manji"
}
```

#### Before (current Janya raga object — Reetigowla, with broken parent_raga)

```json
{
  "id": "reetigowla",
  "name": "Reetigowla",
  "aliases": ["Ritigaula", "Reethigowla", "Reethi Gowla"],
  "melakarta": null,
  "parent_raga": "kharaharapriya",
  "sources": [...],
  "notes": "Janya of Kharaharapriya (22nd melakarta)..."
}
```

*(Reetigowla already has `parent_raga` set — this is the correct state. The migration
repairs ragas that have `parent_raga: null` despite having a known parent.)*

#### After (repaired Janya raga object — Atana, currently broken)

```json
{
  "id": "atana",
  "name": "Atana",
  "aliases": ["Adana"],
  "melakarta": null,
  "is_melakarta": false,
  "parent_raga": "kharaharapriya",
  "sources": [
    {
      "url": "https://en.wikipedia.org/wiki/Atana",
      "label": "Wikipedia",
      "type": "wikipedia"
    }
  ],
  "notes": "Janya of Kharaharapriya (22nd melakarta). Bold heroic character. Frequently used for Tyagaraja kritis."
}
```

### 2. New `melakarta_ragas` collection — all 72 Melas as raga objects

Add all 72 melakarta ragas to the `ragas[]` array. The 13 already present are enriched
in place (add `is_melakarta: true`, `cakra: N`). The remaining 59 are added as new
objects with the same schema.

**Cakra structure** (from Wikipedia/Melakarta):

| Cakra | Name | Melas | Ri-Ga combination |
|---|---|---|---|
| 1 | Indu | 1–6 | R1 G1 |
| 2 | Netra | 7–12 | R1 G2 |
| 3 | Agni | 13–18 | R1 G3 |
| 4 | Veda | 19–24 | R2 G2 |
| 5 | Bana | 25–30 | R2 G3 |
| 6 | Rutu | 31–36 | R3 G3 |
| 7 | Rishi | 37–42 | R2 G2 (M2) |
| 8 | Vasu | 43–48 | R2 G3 (M2) |
| 9 | Brahma | 49–54 | R3 G3 (M2) |
| 10 | Disi | 55–60 | R1 G1 (M2) |
| 11 | Rudra | 61–66 | R1 G2 (M2) |
| 12 | Aditya | 67–72 | R1 G3 (M2) |

Each new Mela raga object follows the same schema as existing raga objects, with:
- `is_melakarta: true`
- `cakra: N` (1–12)
- `melakarta: N` (1–72, their own number)
- `parent_raga: null` (Melas have no parent)
- `sources`: Wikipedia Melakarta page as primary source, individual raga page where it exists
- `notes`: arohana/avarohana, cakra membership, notable janya ragas

**Spelling reconciliation**: The Wikipedia Melakarta page uses specific spellings for
all 72 names. The Librarian must reconcile these against existing raga IDs and aliases
in `ragas[]`. Where a Mela already exists under a different spelling (e.g. `todi` vs
`hanumatodi`), the existing ID is preserved and the Wikipedia spelling is added to
`aliases[]`. The `id` field is **never renamed**.

**Example — Mela 8 (Hanumatodi), already in ragas[] as `todi`:**

```json
{
  "id": "todi",
  "name": "Todi",
  "aliases": ["Hanumatodi", "Suddha Todi"],
  "melakarta": 8,
  "is_melakarta": true,
  "cakra": 2,
  "parent_raga": null,
  "sources": [
    {
      "url": "https://en.wikipedia.org/wiki/Todi_(Carnatic_raga)",
      "label": "Wikipedia",
      "type": "wikipedia"
    },
    {
      "url": "https://en.wikipedia.org/wiki/Melakarta",
      "label": "Wikipedia — Melakarta system",
      "type": "wikipedia"
    }
  ],
  "notes": "8th melakarta (Hanumatodi); Cakra 2 (Netra); one of the most expansive ragas in the Carnatic canon; evokes pathos, longing, and deep introspection; a favourite for extended alapana; parent of Ahiri, Varali, Punnagavarali among others"
}
```

### 3. Repair `parent_raga` for all existing janya ragas

The following ragas currently have `parent_raga: null` despite having a known parent
mentioned in their `notes` field. The migration sets `parent_raga` to the correct
Mela raga ID for each:

| raga id | current `parent_raga` | correct `parent_raga` | evidence |
|---|---|---|---|
| `nata` | `null` | `shankarabharanam` | notes: "Janya of Dheerashankarabharanam (29th melakarta)" |
| `gowla` | `null` | `kharaharapriya` | notes: "Janya of Kharaharapriya (22nd melakarta)" |
| `arabhi` | `null` | `shankarabharanam` | notes: "Janya of Dheerashankarabharanam (29th melakarta)" |
| `varali` | `null` | `todi` | notes: "Janya of Tanarupi (6th melakarta)" — Tanarupi is Mela 6; `todi` is Mela 8; **see note below** |
| `sri` | `null` | `kharaharapriya` | notes: "Janya of Kharaharapriya (22nd melakarta)" |
| `bhairavi` | `null` | `natabhairavi` | notes: "Janya of Natabhairavi (20th melakarta)" |
| `sindhu_bhairavi` | `null` | `natabhairavi` | notes: "Janya of Natabhairavi (20th melakarta)" |
| `kambhoji` | `null` | `harikambhoji` | notes: "Janya of Harikambhoji (28th melakarta)" |
| `begada` | `null` | `harikambhoji` | notes: "Janya of Harikambhoji (28th melakarta)" |
| `saveri` | `null` | `shankarabharanam` | notes: "Janya of Dheerashankarabharanam (29th melakarta)" |
| `kedaram` | `null` | `harikambhoji` | notes: "Janya of Harikambhoji (28th melakarta)" |
| `ahiri` | `null` | `vakulabharanam` | notes: "Janya of Vakulabharanam (14th melakarta)" |
| `atana` | `null` | `kharaharapriya` | notes: "Janya of Kharaharapriya (22nd melakarta)" |
| `dhenuka` | `null` | `kharaharapriya` | notes: "Janya of Kharaharapriya (22nd melakarta)" |
| `hamir_kalyani` | `null` | `kalyani` | notes: "Janya of Kalyani (65th melakarta)" |
| `jonepuri` | `null` | `natabhairavi` | notes: "Janya of Natabhairavi (20th melakarta)" |
| `kannada` | `null` | `kharaharapriya` | notes: "Janya of Kharaharapriya (22nd melakarta)" |
| `kannada_gowla` | `null` | `mayamalavagowla` | notes: "Janya of Mayamalavagowla (15th melakarta)" |
| `karnataka_kapi` | `null` | `harikambhoji` | notes: "Janya raga distinct from Kapi" — parent unspecified; **flag for Librarian** |
| `kurinji` | `null` | `kharaharapriya` | notes: "Janya of Kharaharapriya (22nd melakarta)" |
| `maund` | `null` | `kharaharapriya` | notes: "Janya of Kharaharapriya (22nd melakarta)" |
| `nalinakanthi` | `null` | `shankarabharanam` | notes: "Janya of Shankarabharanam (29th melakarta)" |
| `neelambari` | `null` | `shankarabharanam` | notes: "Janya of Shankarabharanam (29th melakarta)" |
| `padi` | `null` | `mayamalavagowla` | notes: "Janya of Mayamalavagowla (15th melakarta)" |
| `purvi` | `null` | `kamavardhini` | notes: "Corresponds to Hindustani Purvi" — parent unspecified; **flag for Librarian** |
| `ravi_chandrika` | `null` | `shankarabharanam` | notes: "Janya of Shankarabharanam (29th melakarta)" |
| `simhavahini` | `null` | `shankarabharanam` | notes: "Janya of Shankarabharanam (29th melakarta)" |
| `suruti` | `null` | `kharaharapriya` | notes: "Janya of Kharaharapriya (22nd melakarta)" |
| `yadukulakhamboji` | `null` | `harikambhoji` | notes: "Janya of Harikambhoji (28th melakarta)" |
| `yaman_kalyan` | `null` | `kalyani` | notes: "Related to Carnatic Kalyani" — **flag for Librarian** |
| `yamuna_kalyani` | `null` | `kalyani` | notes: "Janya of Kalyani (65th melakarta)" |
| `gambhira_nattai` | `null` | `mayamalavagowla` | notes: "Janya of Mayamalavagowla (15th melakarta)" |
| `darbari_kanada` | `null` | `natabhairavi` | notes: "Janya of Natabhairavi (20th melakarta)" |
| `poorvikalyani` | `null` | `kalyani` | notes: "Janya of Kalyani (65th melakarta)" |

> **Note on Varali and Tanarupi**: The `notes` field says "Janya of Tanarupi (6th
> melakarta)". Tanarupi is Mela 6 — it does not yet exist as a raga object. The
> Librarian must add Tanarupi as a Mela raga object (id: `tanarupi`, melakarta: 6,
> cakra: 1) before setting `varali.parent_raga = "tanarupi"`. The existing
> `punnagavarali` already has `parent_raga: "tanarupi"` — so `tanarupi` is already
> referenced but not yet defined as an object. This is a referential integrity gap
> that the migration must close.

> **Note on duplicate IDs**: `compositions.json` currently has two entries for
> `muthuswami_dikshitar` in the `composers[]` array (lines 1659 and 1770). This is a
> pre-existing data integrity issue. The Librarian must deduplicate before the
> migration.

### 4. New CLI traversal commands

The following commands are added to [`carnatic/cli.py`](../carnatic/cli.py):

```bash
# Raga-centric traversal
python3 carnatic/cli.py is-mela          <raga_id>
# → exits 0 if is_melakarta=true, exits 1 otherwise; prints "YES — Mela N, Cakra M (Name)" or "NO — janya of <parent>"

python3 carnatic/cli.py janyas-of        <mela_raga_id>
# → lists all ragas with parent_raga == mela_raga_id

python3 carnatic/cli.py mela-of          <janya_raga_id>
# → prints the parent mela raga object (compact summary)

python3 carnatic/cli.py cakra-of         <raga_id>
# → prints the cakra number and name for a mela raga, or climbs to parent for a janya

python3 carnatic/cli.py melas-in-cakra   <cakra_number>
# → lists all 6 mela ragas in the given cakra (1–12)

python3 carnatic/cli.py get-raga         <id>  [--json]
# → existing command; now also shows is_melakarta, cakra, and janyas count
```

#### Example outputs

```
$ python3 carnatic/cli.py is-mela kharaharapriya
YES — Mela 22, Cakra 4 (Veda)

$ python3 carnatic/cli.py janyas-of kharaharapriya
Janyas of Kharaharapriya (Mela 22):
  reetigowla       Reetigowla
  sriraga          Sriraga
  gowla            Gowla
  sri              Sri
  atana            Atana
  dhenuka          Dhenuka
  devamritavarshini  Devamritavarshini
  manirangu        Manirangu
  devagandhari     Devagandhari
  kaanada          Kaanada
  huseni           Huseni
  dwijavanthi      Dwijavanthi
  kannada          Kannada
  kurinji          Kurinji
  maund            Maund
  narayanagowla    Narayanagowla
  jayantasena      Jayantasena
  manji            Manji
  suruti           Suruti
  (18 total)

$ python3 carnatic/cli.py mela-of abheri
Parent mela: natabhairavi (Natabhairavi) — Mela 20, Cakra 4 (Veda)

$ python3 carnatic/cli.py cakra-of kharaharapriya
Cakra 4 — Veda (Melas 19–24)

$ python3 carnatic/cli.py melas-in-cakra 4
Cakra 4 — Veda (Melas 19–24):
  19  natabhairavi     Natabhairavi
  20  natabhairavi     Natabhairavi   ← already in ragas[]
  21  keeravani        Keeravani      ← already in ragas[]
  22  kharaharapriya   Kharaharapriya ← already in ragas[]
  23  gowrimanohari    Gowrimanohari  ← already in ragas[]
  24  varunapriya      Varunapriya    ← new object needed
```

### 5. Wikipedia extraction script

The Carnatic Coder writes a one-shot Python script
`carnatic/playlists/extract_melakarta_wikipedia.py` that:

1. Fetches `https://en.wikipedia.org/wiki/Melakarta` (using the existing disk cache
   pattern from [`carnatic/crawl.py`](../carnatic/crawl.py))
2. Parses the 72-row table: number, name, cakra, arohana, avarohana, notable janyas
3. Emits a JSON array of 72 Mela objects in the `ragas[]` schema shape
4. Reconciles against existing `ragas[]` IDs: for each Mela, checks if an object with
   `melakarta == N` already exists; if so, outputs a patch (add `is_melakarta`, `cakra`);
   if not, outputs a new object
5. Flags spelling mismatches between the Wikipedia name and the existing `name` field
6. Flags the `tanarupi` referential integrity gap
7. Outputs two files:
   - `carnatic/data/melakarta_patch.json` — patches for existing 13 Mela ragas
   - `carnatic/data/melakarta_new.json` — 59 new Mela raga objects

The Librarian reviews both files, reconciles spellings, and applies them via
`write_cli.py add-raga` (for new objects) and `write_cli.py patch-raga` (for existing
objects, once that command is added — see Implementation below).

### 6. New `write_cli.py` command: `patch-raga`

The Carnatic Coder adds a `patch-raga` command to
[`carnatic/write_cli.py`](../carnatic/write_cli.py):

```bash
python3 carnatic/write_cli.py patch-raga \
    --id <raga_id> \
    --field <field> \
    --value <value>
# Permitted fields: name, parent_raga, melakarta, is_melakarta, cakra, notes
# (id and sources are immutable via this command)
```

This is needed to:
- Set `is_melakarta: true` and `cakra: N` on existing Mela ragas
- Repair `parent_raga` on existing janya ragas
- Update `notes` to include cakra membership

---

## Consequences

### Queries this enables

| Query | Before | After |
|---|---|---|
| `is-mela kharaharapriya` | Not possible | `YES — Mela 22, Cakra 4 (Veda)` |
| `janyas-of kharaharapriya` | Not possible | Lists 18+ janya ragas with IDs and names |
| `mela-of abheri` | Not possible | `natabhairavi — Mela 20, Cakra 4 (Veda)` |
| `cakra-of todi` | Not possible | `Cakra 2 — Netra (Melas 7–12)` |
| `melas-in-cakra 4` | Not possible | Lists Natabhairavi, Keeravani, Kharaharapriya, Gowrimanohari, Varunapriya, Mararanjani |
| `compositions-in-raga kharaharapriya` | Works (direct compositions only) | Works (unchanged) |
| "Which ragas are janyas of Shankarabharanam?" | Read `notes` free text manually | `janyas-of shankarabharanam` |
| "Is Kalyani a melakarta?" | Read `melakarta` integer field | `is-mela kalyani` → `YES — Mela 65, Cakra 11 (Rudra)` |

### What this enables beyond the current data

- **Raga-centric navigation in the UI** — ADR-020 gave ragas a first-class header in
  the Bani Flow panel. ADR-021 gives that header something to navigate *to*: the
  Carnatic Coder can now add a "Janyas" section below the raga header, listing all
  janya ragas as clickable links that trigger a new Bani Flow search. The data
  structure is the prerequisite for this UI affordance.

- **Mela as a hub node** — Once all 72 Melas are in `ragas[]`, the Bani Flow search
  can surface them. Searching "Kharaharapriya" shows not just compositions in that
  raga, but also its 18+ janyas — each of which can be clicked to show *their*
  compositions. This is the raga equivalent of clicking a musician node and seeing
  their shishyas.

- **Cakra as a grouping principle** — The `melas-in-cakra` command enables a new
  query pattern: "show me all ragas in the Veda cakra". This is how a student learns
  the system — by cakra, not by number. The UI can eventually render a cakra wheel.

- **Referential integrity enforcement** — Once all 72 Melas are in `ragas[]`, the
  `write_cli.py add-raga` command can validate that any `parent_raga` value references
  a known Mela (i.e. a raga with `is_melakarta: true`). This closes the referential
  integrity gap that currently allows `punnagavarali.parent_raga = "tanarupi"` to
  reference a non-existent object.

### What this forecloses

- **`melakarta` as the primary parent reference for janyas** — The `melakarta` integer
  field on janya ragas (e.g. `"melakarta": null`) is deprecated in favour of
  `parent_raga`. The integer is retained on Mela ragas (their own number) but should
  not be used on janya ragas going forward. The `notes` free-text pattern
  "Janya of X (Nth melakarta)" is also deprecated as the primary encoding — it
  remains as human-readable context but the structural fact is in `parent_raga`.

- **Bhashanga ragas with multiple parents** — Some ragas (e.g. `kapi`, `behag`,
  `ahiri`) are classified as bhashanga — they admit notes from outside their parent
  Mela. The current schema has one `parent_raga` field. Bhashanga ragas have a
  *primary* parent Mela and one or more *secondary* Melas from which they borrow.
  This ADR does not model secondary parents — `parent_raga` is the primary Mela only.
  Secondary borrowings are recorded in `notes`. A future ADR may add
  `secondary_parents: []` if the UI needs to traverse them.

### Interaction with ADR-020 (raga/composition header parity)

ADR-020 gave ragas a first-class header in the Bani Flow panel with a Wikipedia link.
ADR-021 enriches the data that header can display: `is_melakarta`, `cakra`, and the
janya count. The Carnatic Coder implementing ADR-020 should leave a hook in the
`#bani-subject-sub` row for these fields — they will be populated once ADR-021 data
is in place.

---

## Implementation

### Agent assignments

| Task | Agent | File(s) |
|---|---|---|
| Write extraction script | Carnatic Coder | `carnatic/playlists/extract_melakarta_wikipedia.py` |
| Add `patch-raga` to write_cli | Carnatic Coder | `carnatic/write_cli.py` |
| Add CLI traversal commands | Carnatic Coder | `carnatic/cli.py` |
| Add `graph_api.py` traversal methods | Carnatic Coder | `carnatic/graph_api.py` |
| Run extraction script, review output | Librarian | `carnatic/data/melakarta_patch.json`, `carnatic/data/melakarta_new.json` |
| Apply patches to existing 13 Mela ragas | Librarian | `compositions.json` via `write_cli.py patch-raga` |
| Add 59 new Mela raga objects | Librarian | `compositions.json` via `write_cli.py add-raga` |
| Repair `parent_raga` on 34 janya ragas | Librarian | `compositions.json` via `write_cli.py patch-raga` |
| Deduplicate `muthuswami_dikshitar` in composers[] | Librarian | `compositions.json` via `apply_diff` |
| Regenerate graph.html | Carnatic Coder | `python3 carnatic/render.py` |

### Carnatic Coder — detailed instructions

#### Step 1: `extract_melakarta_wikipedia.py`

Write a script at [`carnatic/playlists/extract_melakarta_wikipedia.py`](../carnatic/playlists/extract_melakarta_wikipedia.py) that:

1. Fetches `https://en.wikipedia.org/wiki/Melakarta` using the disk-cache pattern
   from [`carnatic/crawl.py`](../carnatic/crawl.py) (cache dir:
   `carnatic/data/cache/`, key = MD5 of URL).
2. Parses the HTML table of 72 melakartas. Each row contains: number (1–72), name,
   cakra number, arohana, avarohana. Extract all five fields.
3. Loads [`carnatic/data/compositions.json`](../carnatic/data/compositions.json) and
   builds a lookup: `{melakarta_number: raga_object}` for all ragas with
   `melakarta != null`.
4. For each of the 72 Melas:
   - If a raga object with `melakarta == N` already exists: emit a **patch record**
     `{"op": "patch", "id": existing_id, "fields": {"is_melakarta": true, "cakra": C}}`
   - If no raga object exists: emit a **new record** in the full raga schema shape
     (id = snake_case of Wikipedia name, name = Wikipedia name, melakarta = N,
     is_melakarta = true, cakra = C, parent_raga = null, aliases = [],
     sources = [{url: Wikipedia Melakarta page, label: "Wikipedia — Melakarta",
     type: "wikipedia"}], notes = "Nth melakarta; Cakra C (Name); arohana …;
     avarohana …")
5. Flags any case where the Wikipedia name differs from the existing `name` field —
   prints a warning line: `SPELLING MISMATCH: existing='X' wikipedia='Y' id='Z'`
6. Flags the `tanarupi` referential integrity gap:
   `INTEGRITY GAP: punnagavarali.parent_raga="tanarupi" but tanarupi not in ragas[]`
7. Flags `karnataka_kapi`, `purvi`, `yaman_kalyan` as needing Librarian review
   (parent unspecified in notes).
8. Writes two output files:
   - `carnatic/data/melakarta_patch.json` — array of patch records
   - `carnatic/data/melakarta_new.json` — array of new raga objects
9. Prints a summary: `N patches, M new objects, K spelling mismatches, J flags`

#### Step 2: `patch-raga` command in `write_cli.py`

Add to [`carnatic/write_cli.py`](../carnatic/write_cli.py):

```python
# cmd: patch-raga
# --id <raga_id> --field <field> --value <value>
# Permitted fields: name, parent_raga, melakarta, is_melakarta, cakra, notes
# Validates: id must exist in ragas[]; field must be in permitted list;
#   if field == parent_raga, value must be an existing raga id or "null"
#   if field == is_melakarta, value must be "true" or "false"
#   if field == cakra or melakarta, value must be an integer string
# Atomic write: temp file + rename
# Output prefix: [RAGA~]
```

#### Step 3: CLI traversal commands in `cli.py`

Add to [`carnatic/cli.py`](../carnatic/cli.py):

```
is-mela          <raga_id>
janyas-of        <mela_raga_id>
mela-of          <janya_raga_id>
cakra-of         <raga_id>
melas-in-cakra   <cakra_number>
```

Each command delegates to a new method on `CarnaticGraph` (see Step 4).

#### Step 4: `graph_api.py` traversal methods

Add to [`carnatic/graph_api.py`](../carnatic/graph_api.py):

```python
def is_melakarta(self, raga_id: str) -> bool:
    """Return True if the raga has is_melakarta=True."""

def get_janyas_of(self, mela_raga_id: str) -> list[dict]:
    """Return all ragas with parent_raga == mela_raga_id."""

def get_mela_of(self, janya_raga_id: str) -> dict | None:
    """Return the parent mela raga object for a janya raga."""

def get_cakra_of(self, raga_id: str) -> int | None:
    """Return the cakra number for a raga (climbs to parent if janya)."""

def get_melas_in_cakra(self, cakra: int) -> list[dict]:
    """Return all mela ragas with cakra == N, sorted by melakarta number."""
```

#### Step 5: Update `READYOU.md`

Update [`carnatic/data/READYOU.md`](../carnatic/data/READYOU.md) to:
- Add `is_melakarta` and `cakra` to the raga schema table
- Add the five new CLI commands to the Read methods section
- Add `patch-raga` to the Write methods section

---

### Librarian — database completion notes

After the Carnatic Coder delivers the extraction script and `patch-raga` command, the
Librarian executes the following work package in order.

#### Phase 0: Pre-flight

```bash
python3 carnatic/cli.py stats          # record baseline counts
python3 carnatic/cli.py validate       # confirm no pre-existing errors
```

Fix the pre-existing `muthuswami_dikshitar` duplicate in `composers[]` before
proceeding. Use `apply_diff` to remove the second occurrence (lines ~1770–1782 of
`compositions.json`).

#### Phase 1: Run extraction script

```bash
python3 carnatic/playlists/extract_melakarta_wikipedia.py
```

Review `carnatic/data/melakarta_patch.json` and `carnatic/data/melakarta_new.json`.
For each spelling mismatch flagged, decide: keep existing `name` (add Wikipedia
spelling to `aliases[]`) or update `name` (add old spelling to `aliases[]`). The
governing principle: use the spelling most familiar to a practising musician.

#### Phase 2: Add Tanarupi (Mela 6) — prerequisite for Varali

Before patching `varali.parent_raga`, Tanarupi must exist as a raga object:

```bash
python3 carnatic/write_cli.py add-raga \
    --id tanarupi \
    --name "Tanarupi" \
    --melakarta 6 \
    --source-url "https://en.wikipedia.org/wiki/Melakarta" \
    --source-label "Wikipedia — Melakarta" \
    --source-type wikipedia \
    --notes "6th melakarta; Cakra 1 (Indu); arohana S R1 G1 M1 P D1 N1 S, avarohana S N1 D1 P M1 G1 R1 S; parent of Varali and Punnagavarali"
```

Then patch `is_melakarta` and `cakra`:

```bash
python3 carnatic/write_cli.py patch-raga --id tanarupi --field is_melakarta --value true
python3 carnatic/write_cli.py patch-raga --id tanarupi --field cakra --value 1
```

#### Phase 3: Patch existing 13 Mela ragas

For each of the 13 melakartas already in `ragas[]`, apply the patch records from
`melakarta_patch.json`:

```bash
# Example — Kharaharapriya
python3 carnatic/write_cli.py patch-raga --id kharaharapriya --field is_melakarta --value true
python3 carnatic/write_cli.py patch-raga --id kharaharapriya --field cakra --value 4

# Example — Todi (Mela 8, Cakra 2)
python3 carnatic/write_cli.py patch-raga --id todi --field is_melakarta --value true
python3 carnatic/write_cli.py patch-raga --id todi --field cakra --value 2

# Repeat for: natabhairavi(4), keeravani(4), gowrimanohari(4), harikambhoji(5),
#   shankarabharanam(5), chakravakam(3), vakulabharanam(3), mayamalavagowla(3),
#   simhendramadhyamam(10), pantuvarali(9), kalyani(11)
```

Full cakra assignments for existing Mela ragas:

| id | melakarta | cakra |
|---|---|---|
| `todi` | 8 | 2 |
| `mayamalavagowla` | 15 | 3 |
| `chakravakam` | 16 | 3 |
| `natabhairavi` | 20 | 4 |
| `keeravani` | 21 | 4 |
| `kharaharapriya` | 22 | 4 |
| `gowrimanohari` | 23 | 4 |
| `harikambhoji` | 28 | 5 |
| `shankarabharanam` | 29 | 5 |
| `pantuvarali` | 51 | 9 |
| `simhendramadhyamam` | 57 | 10 |
| `kalyani` | 65 | 11 |
| `vakulabharanam` | 14 | 3 |

#### Phase 4: Add 59 new Mela raga objects

Apply all new-object records from `melakarta_new.json` using `write_cli.py add-raga`.
The script generates the correct `--notes` text from the Wikipedia arohana/avarohana.
After adding each batch of 6 (one cakra), run `python3 carnatic/cli.py validate`.

Priority order — add cakras that have the most existing janya ragas first, so
`parent_raga` repairs can proceed:

1. Cakra 4 (Veda, Melas 19–24) — missing: Varunapriya(24), Mararanjani(19)
2. Cakra 5 (Bana, Melas 25–30) — missing: Ramapriya(25), Gamanasrama(26), Syamalangi(27)
3. Cakra 3 (Agni, Melas 13–18) — missing: Gayakapriya(13), Chakravakam already present(16), Suryakantam(17), Hatakambari(18)
4. Remaining cakras in numerical order

#### Phase 5: Repair `parent_raga` on 34 janya ragas

After all Mela objects exist, apply the repairs from the table in Decision §3:

```bash
# Batch — ragas whose parent is kharaharapriya
for id in gowla sri atana dhenuka kannada kurinji maund narayanagowla suruti; do
    python3 carnatic/write_cli.py patch-raga --id $id --field parent_raga --value kharaharapriya
done

# Batch — ragas whose parent is shankarabharanam
for id in nata arabhi saveri nalinakanthi neelambari ravi_chandrika simhavahini; do
    python3 carnatic/write_cli.py patch-raga --id $id --field parent_raga --value shankarabharanam
done

# Batch — ragas whose parent is harikambhoji
for id in kambhoji begada kedaram yadukulakhamboji; do
    python3 carnatic/write_cli.py patch-raga --id $id --field parent_raga --value harikambhoji
done

# Batch — ragas whose parent is natabhairavi
for id in bhairavi sindhu_bhairavi jonepuri darbari_kanada; do
    python3 carnatic/write_cli.py patch-raga --id $id --field parent_raga --value natabhairavi
done

# Batch — ragas whose parent is mayamalavagowla
for id in kannada_gowla padi gambhira_nattai; do
    python3 carnatic/write_cli.py patch-raga --id $id --field parent_raga --value mayamalavagowla
done

# Batch — ragas whose parent is kalyani
for id in hamir_kalyani yamuna_kalyani poorvikalyani; do
    python3 carnatic/write_cli.py patch-raga --id $id --field parent_raga --value kalyani
done

# Individual repairs
python3 carnatic/write_cli.py patch-raga --id varali --field parent_raga --value tanarupi
python3 carnatic/write_cli.py patch-raga --id ahiri --field parent_raga --value vakulabharanam

# Flagged — require Librarian research before patching:
# karnataka_kapi — parent unspecified; research needed
# purvi          — "Corresponds to Hindustani Purvi"; likely Kamavardhini (51); verify
# yaman_kalyan   — "Related to Carnatic Kalyani"; bhashanga; verify parent
```

#### Phase 6: Validate and regenerate

```bash
python3 carnatic/cli.py validate
python3 carnatic/render.py
python3 carnatic/cli.py stats   # confirm raga count increased by ~59
```

#### Phase 7: Smoke-test traversal

```bash
python3 carnatic/cli.py is-mela kharaharapriya
python3 carnatic/cli.py janyas-of kharaharapriya
python3 carnatic/cli.py mela-of abheri
python3 carnatic/cli.py cakra-of todi
python3 carnatic/cli.py melas-in-cakra 4
```

---

## Verification checklist

- [ ] `ragas[]` contains exactly 72 objects with `is_melakarta: true`
- [ ] All 72 Mela objects have `cakra` set (1–12)
- [ ] All 72 Mela objects have `melakarta` set (1–72, their own number)
- [ ] All 72 Mela objects have `parent_raga: null`
- [ ] `tanarupi` exists as a raga object with `melakarta: 6`, `is_melakarta: true`
- [ ] `punnagavarali.parent_raga == "tanarupi"` (was already set; verify not broken)
- [ ] `varali.parent_raga == "tanarupi"` (repaired)
- [ ] All 34 janya ragas in the repair table have `parent_raga` set to a valid Mela id
- [ ] `muthuswami_dikshitar` appears exactly once in `composers[]`
- [ ] `python3 carnatic/cli.py validate` exits 0
- [ ] `python3 carnatic/cli.py janyas-of kharaharapriya` returns ≥ 15 ragas
- [ ] `python3 carnatic/cli.py melas-in-cakra 4` returns exactly 6 ragas
- [ ] `python3 carnatic/cli.py is-mela abheri` exits 1 (abheri is a janya)
- [ ] `python3 carnatic/cli.py is-mela kharaharapriya` exits 0