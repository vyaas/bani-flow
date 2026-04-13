# Contributing to GSTree

Thank you for your interest in GSTree! Contributions of all kinds are welcome:
data corrections, new lineage edges, new tradition instances, code improvements,
and documentation fixes.

---

## Ways to contribute

### 1. Data corrections and additions (Carnatic)

The most impactful contributions are improvements to `carnatic/data/musicians.json`.

**To correct an existing edge or node:**

Open an issue describing the correction with a source URL (Wikipedia, book, etc.).
If you are comfortable with JSON, submit a pull request directly.

**To add a musician or lineage edge:**

1. Check that the musician clears the significance threshold described in
   [`carnatic/README.md`](carnatic/README.md) — Sangeetha Kalanidhi recipient,
   or a necessary topological link between two significant nodes.
2. Add the node to `nodes[]` and any edges to `edges[]` in `musicians.json`.
3. Run `python3 carnatic/render.py` and verify the graph looks correct.
4. Submit a pull request with the updated `musicians.json` and regenerated `graph.html`.

**To add YouTube recordings:**

Annotate each link with the video title (the agent/contributor cannot identify
a recording from its URL alone). See the YouTube recording format in
[`carnatic/README.md`](carnatic/README.md).

### 2. New tradition instances

GSTree is designed to generalise. To add a new tradition (e.g. Hindustani,
jazz, ballet, martial arts):

1. Create a new top-level directory: `hindustani/`, `jazz/`, etc.
2. Copy the data model from `carnatic/data/musicians.json` — adapt node fields
   and era/instrument vocabularies to your tradition.
3. Copy and adapt `render.py` (colours, shapes, label tiers).
4. Add a `README.md` in the new directory explaining the tradition and its
   significance criteria.
5. Open a pull request. Include at least 10 nodes and 8 edges so the graph
   is meaningful from the start.

### 3. Code improvements

- `render.py` — HTML/CSS/JS improvements, new layout options, accessibility
- `crawl.py` — better Wikipedia extraction, support for non-English Wikipedias
- `serve.py` — any improvements to the local server
- New tooling: tests, CI, linting

### 4. Documentation

Corrections to any `README.md`, `CONTRIBUTING.md`, or inline docstrings are
always welcome.

---

## Development setup

```bash
git clone https://github.com/vyaas/bani-flow.git
cd bani-flow
pip install -e ".[dev]"
```

The `[dev]` extras install `pytest` and `ruff`.

```bash
# Lint
ruff check .

# Run tests (if any exist)
pytest
```

---

## Pull request guidelines

- **One concern per PR.** Data changes and code changes should be separate PRs.
- **Regenerate `graph.html`** after any change to `musicians.json` or `render.py`.
  Include the regenerated file in the PR.
- **Cite your sources.** Every new edge needs a `source_url` pointing to a
  Wikipedia page or other verifiable source.
- **Follow the confidence scale** defined in [`carnatic/README.md`](carnatic/README.md).
  Speculative edges (confidence < 0.70) must carry a `note` explaining the uncertainty.
- **Do not hand-edit `graph.html`.** It is a derived artefact — always regenerate
  via `python3 carnatic/render.py`.

---

## Code style

- Python: formatted with `ruff` (line length 100, target Python 3.10).
- JSON: 2-space indent, `ensure_ascii=False` (non-ASCII names are preserved as-is).
- Commit messages: imperative mood, present tense (`Add Lalgudi Jayaraman node`,
  not `Added` or `Adding`).

---

## Reporting issues

Use [GitHub Issues](https://github.com/vyaas/bani-flow/issues). For data issues,
please include:

- The node `id` or edge `(source, target)` pair in question
- The correction you are proposing
- A source URL

---

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
