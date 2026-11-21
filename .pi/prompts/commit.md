---
description: Close the session — push gate, well-formed commit, push
argument-hint: "[type(scope): summary]"
---

Close out this session's work with the `bani-commit` skill. Read and follow
`.agents/skills/bani-commit/SKILL.md`; it is the single source of truth for the
provenance audit, validation gates, staging review, commit format, and push.
$ARGUMENTS

Treat supplied arguments as the requested commit-message summary, subject to the
skill's format rules. Honor an explicit commit-only request; otherwise complete
the closeout by pushing after all gates pass.
