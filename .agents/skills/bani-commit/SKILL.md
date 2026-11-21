---
name: bani-commit
description: Safely commit and push Bani Flow work with the repository's provenance, render, validation, test, staging, commit-message, branch, and push gates. Use whenever the user asks to commit, push, close out a session, create a well-formed Bani Flow commit, or run the pre-push checklist; also use for commit-only requests while honoring the request not to push.
---

# 🔱 Bani Commit — Git Closeout

Own the git closeout, not the implementation. Work from the repository root.
Preserve user work: commit only the intended change set, and stop rather than
guessing when provenance or scope is unclear.

## 1. Audit the worktree

```bash
git status --short
git diff --stat
git diff --cached --stat
git branch --show-current
```

Account for every modified, staged, and untracked path. Inspect targeted source
diffs as needed, but never read `carnatic/graph.html` or
`carnatic/data/graph.json` wholesale. If any file's provenance is unexplained,
stop and ask. Do not discard, overwrite, stage, or unstage unrelated user work
without permission.

Classify the intended changes as data, source/render code, tests, UI surface,
or documentation/configuration. This determines the required gates.

## 2. Activate the project environment

Use the checkout's venv before every `bani-*` or `python3 carnatic/` command;
never fall back to system Python or global pip:

```bash
if [ -d .venv ]; then
  source .venv/bin/activate
elif [ -d .bani-flow ]; then
  source .bani-flow/bin/activate
else
  echo "No project venv found" >&2
  exit 1
fi
```

Keep that environment active for all subsequent gate commands in the same
shell. In a new shell, activate it again.

## 3. Run the applicable push gates

| Intended change | Required before commit |
|---|---|
| Any data (`.json`) or application/render code | `bani-render`, then `python3 carnatic/cli.py validate` |
| Source code covered by the test suite | `pytest carnatic/tests/ -v` |
| UI layout or interaction | The above plus visual confirmation via `bani-serve` |
| UI map DOM hook or entry point | Keep `test_ui_surface_map_drift.py` green; update `UIMAP.md` with the change |
| Documentation or skill/configuration only | No render required; validate frontmatter/references and run relevant checks |

Run data/code gates in this order so validation reads fresh derived state:

```bash
bani-render
python3 carnatic/cli.py validate
pytest carnatic/tests/ -v  # when source behaviour is covered
```

A previous successful run counts only if no relevant input changed afterward;
otherwise rerun it. When coverage or classification is uncertain, prefer the
full render + validate + test gate. Review generated-artifact changes through
status, diff stats, and targeted checks — never hand-edit derived artifacts.

If a required gate fails or a required visual check has not happened, do not
commit or push. Report the exact failure and return implementation fixes to the
owning skill; never weaken a test, skip a hook, or hide a failure to close the
session.

## 4. Close memory loops when warranted

- Append one terse dated line to `carnatic/LEARNINGS.md` only if the session
  discovered a genuinely reusable pitfall or pattern.
- Update **Open questions** in `carnatic/OPERATIONS.md` if something was
  resolved or newly blocked; move resolved items to
  `plans/open-questions-archive.md`.

If these updates are data/code-adjacent and affect gate inputs, rerun the
appropriate gate afterward.

## 5. Stage and review exactly the intended commit

Prefer explicit paths over `git add .` or `git add -A`:

```bash
git add -- <path> [<path> ...]
git diff --cached --check
git diff --cached --stat
git status --short
```

Review the staged source diff and confirm it matches the user's request. Include
expected regenerated artifacts, but exclude unrelated user files. Existing
staged user changes are not automatically part of this commit; ask before
combining them. If nothing is staged, stop rather than creating an empty commit.

## 6. Choose the branch and commit message

Follow an explicitly requested branch. Otherwise commit to `main`; branch only
for a new paradigm, schema change, or independently revertable unit, using
`adr/NNN-slug`, `feature/<slug>`, or `data/<slug>` as appropriate.

For a trivial single-node/edge/recording data add with no schema implication, a
one-line message is acceptable. Everything else uses:

```text
<type>(<scope>): <imperative summary, ≤72 chars>

<what changed and why — one paragraph, plain prose>
[ADR: ADR-NNN]
```

Omit the ADR trailer when not applicable. Never use an empty body for a
non-trivial change. A user-supplied message is a preference, not permission to
skip validation or misclassify the change.

Types: `data` `tool` `render` `schema` `chore` `audit` `test` `fix`.

General scopes: `node` `lineage` `recording` `composition` `toolchain` `config`
`suite` `plans`.

Render scopes: `bani-panel` `musician-panel` `graph-view` `wheel` `player`
`theme`.

Create the commit only after the staged review and all gates pass. Do not use
`--no-verify`, amend an existing commit, or rewrite history unless the user
explicitly requests it.

## 7. Push only within the requested scope

Honor a commit-only request. When push is requested or is part of session
closeout, push the current branch to its upstream:

```bash
git push
```

If no upstream exists, confirm the intended remote and use
`git push -u origin HEAD` when `origin` is correct. Never force-push. If the
push is rejected, stop and report; do not automatically pull, rebase, or resolve
remote divergence.

Finish with `git log -1 --oneline` and `git status --short`. Report the commit
hash, branch, push destination, gates run, and any unrelated changes deliberately
left in the worktree.
