![Bani Flow — navigate the Carnatic landscape](screenshots/screenshot_01.png)

# Bani Flow

**Navigate the Carnatic classical music landscape** — lineages, timelines, ragas, and recordings, all woven together in a single browser page. No server. No database. No framework.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)

---

## Start listening in 30 seconds

```bash
git clone https://github.com/vyaas/bani_flow.git
cd bani_flow
pip install -e .
gstree-render && gstree-serve   # opens http://localhost:8765/graph.html
```

YouTube embeds require a real origin — always open via the local server, not `file://`.

---

## Three ways to explore

### Guru-Shishya Parampara
The teacher-student lineage as a force-directed graph. Every node is a musician; every edge is a transmission of sound and style across generations — from the Trinity to the present day.

- **Click a node** → sidebar shows lineage, era, instrument, *bani*; neighbourhood highlighted
- **Click an edge** → guru→shishya pair, relationship note, confidence, source
- **Green border** → node has recordings attached; click any track to open a floating YouTube player
- **Filter chips** → narrow by era or instrument

### Timeline of Innovators
The same musicians laid out on a horizontal time axis — birth year left to right, era in vertical lanes. Reveals who was alive at the same time, who overlapped, who never met.

### Raga Wheel
The 72 melakarta ragas arranged as a wheel, grouped by *cakra*. Click a melakarta to expand its janya ragas; click a janya to see compositions; click a composition to see every musician in the graph who has performed it.

---

## Bani Flow — the connective tissue

**Bani Flow** is the search that ties all three views together. Type any composition or raga into the search bar and the graph instantly:

1. Highlights every musician who has a recorded performance of that piece
2. Builds a **listening trail** in the left sidebar — one entry per performance, sorted chronologically, with timestamp links that jump straight to that moment in the concert video
3. Shows co-performers bracketed under each primary artist

This is the core idea: start with a raga, follow it through generations of performers, listen to how each *bani* shapes the same melodic material differently.

---

## What's in the archive

| Entity | Count (approx.) |
|---|---|
| Musicians | 80+ nodes across six eras |
| Guru→shishya edges | 100+ sourced relationships |
| Structured concert recordings | 9 concerts (1932–1973) |
| Ragas | 100+ including all 72 melakartas |
| Compositions | 200+ with composer, raga, tala |

Recordings are deduplication-aware: the same YouTube video can appear under multiple musicians (e.g. a duet), and the same composition can have multiple versions by the same artist — each version is a distinct, timestamped entry.

---

## Visual legend

| Visual property | Meaning |
|---|---|
| **Node colour** | Era — Trinity → Bridge → Golden Age → Disseminator → Living Pillars → Contemporary |
| **Node shape** | Instrument — ellipse = vocal, diamond = veena, rectangle = violin, … |
| **Node size** | Degree centrality — more connections = larger |
| **Green border** | Node has recordings |
| **Edge thickness** | Confidence of the guru→shishya relationship |

---

## Repository layout

```
bani_flow/
  README.md                 ← this file
  pyproject.toml            ← pip install
  carnatic/
    render.py               ← builds graph.html from all data files
    serve.py                ← zero-dep local server; opens browser automatically
    cli.py                  ← read-only CLI (stats, lookups, validation)
    write_cli.py            ← atomic write CLI (add musician, edge, recording, …)
    data/
      musicians.json        ← nodes + edges + youtube entries (canonical)
      compositions.json     ← ragas, composers, compositions
      recordings/           ← one JSON file per structured concert recording
    render/
      templates/            ← bani_flow.js, graph_view.js, raga_wheel.js, …
```

---

## License

[MIT](LICENSE) © Bani Flow Contributors
