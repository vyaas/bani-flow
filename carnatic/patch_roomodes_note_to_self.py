#!/usr/bin/env python3
"""
patch_roomodes_note_to_self.py

Adds a "note to self" capability to every agent in .roomodes.

Each agent gains:
  1. Edit permission for `.roomodes` (scoped to their own slug section
     by instruction, not by regex — the file is one JSON blob).
  2. A `## Note to self` section in `customInstructions` that explains
     the constraint: edit ONLY your own section, use apply_diff surgically,
     never touch another agent's slug.

Usage:
    python3 carnatic/patch_roomodes_note_to_self.py [--dry-run]

With --dry-run: prints the transformed JSON to stdout, does not write.
Without --dry-run: writes back to .roomodes in place.
"""

import json
import sys
import copy
from pathlib import Path

ROOMODES_PATH = Path(".roomodes")

NOTE_TO_SELF_TEMPLATE = """\

---

## Note to self — learning log

You have the ability to edit your own section in `.roomodes` as you work.
Use this to record patterns, hard-won lessons, and standing rules that
emerge from real sessions — things you wish you had known at the start.

**Constraint:** You may ONLY edit the section whose `"slug"` is `"{slug}"`.
Never touch another agent's `roleDefinition`, `customInstructions`, or `groups`.
Use `apply_diff` surgically — never rewrite the whole file.

When you record a note:
- Append it under `## Note to self — learning log` in your own `customInstructions`.
- Format: `- YYYY-MM-DD: <one plain-prose sentence describing the pattern>`.
- Keep entries terse. This is a log, not an essay.
"""


def add_roomodes_edit_permission(groups: list) -> list:
    """
    Ensure the agent's groups list includes edit permission for .roomodes.

    Rules:
    - If the agent already has an unconstrained "edit" entry, .roomodes is
      already writable — add nothing to groups (instruction alone suffices).
    - If the agent has a constrained ["edit", {...fileRegex...}] entry,
      extend the regex to also match .roomodes.
    - If the agent has no edit entry at all, add a constrained one for
      .roomodes only.
    """
    groups = copy.deepcopy(groups)

    for i, g in enumerate(groups):
        # Unconstrained edit — already covers .roomodes
        if g == "edit":
            return groups

        # Constrained edit entry
        if isinstance(g, list) and len(g) == 2 and g[0] == "edit":
            opts = g[1]
            existing_regex = opts.get("fileRegex", "")
            existing_desc = opts.get("description", "")

            # Already covers .roomodes
            if r"\.roomodes" in existing_regex or ".roomodes" in existing_regex:
                return groups

            # Extend the regex: wrap existing in a group and OR with \.roomodes
            new_regex = f"({existing_regex}|\\.roomodes)"
            new_desc = existing_desc + ", .roomodes (own section only)"
            groups[i] = ["edit", {"fileRegex": new_regex, "description": new_desc}]
            return groups

    # No edit entry at all — add one for .roomodes only
    groups.append(["edit", {
        "fileRegex": "\\.roomodes",
        "description": ".roomodes (own section only)"
    }])
    return groups


def add_note_to_self_instructions(custom_instructions: str, slug: str) -> str:
    """
    Append the Note-to-self block to customInstructions if not already present.
    """
    marker = "## Note to self — learning log"
    if marker in custom_instructions:
        return custom_instructions  # idempotent
    return custom_instructions + NOTE_TO_SELF_TEMPLATE.format(slug=slug)


def transform(data: dict) -> tuple[dict, list[str]]:
    """
    Pure transformation: takes parsed .roomodes dict, returns (modified_dict, changelog).
    """
    data = copy.deepcopy(data)
    changelog = []

    for mode in data.get("customModes", []):
        slug = mode.get("slug", "unknown")

        # 1. Edit permissions
        original_groups = mode.get("groups", [])
        new_groups = add_roomodes_edit_permission(original_groups)
        if new_groups != original_groups:
            mode["groups"] = new_groups
            changelog.append(f"  [{slug}] groups: added .roomodes edit permission")
        else:
            changelog.append(f"  [{slug}] groups: .roomodes already writable (no change)")

        # 2. customInstructions
        original_instructions = mode.get("customInstructions", "")
        new_instructions = add_note_to_self_instructions(original_instructions, slug)
        if new_instructions != original_instructions:
            mode["customInstructions"] = new_instructions
            changelog.append(f"  [{slug}] customInstructions: appended 'Note to self' block")
        else:
            changelog.append(f"  [{slug}] customInstructions: 'Note to self' already present (no change)")

    return data, changelog


def main():
    dry_run = "--dry-run" in sys.argv

    raw = ROOMODES_PATH.read_text(encoding="utf-8")
    data = json.loads(raw)

    transformed, changelog = transform(data)

    output = json.dumps(transformed, indent=2, ensure_ascii=False)

    print("## patch_roomodes_note_to_self.py")
    print(f"   source: {ROOMODES_PATH}")
    print(f"   mode:   {'DRY RUN — no file written' if dry_run else 'LIVE — writing to disk'}")
    print()
    print("Changes:")
    for line in changelog:
        print(line)
    print()

    if dry_run:
        print("--- transformed .roomodes (stdout) ---")
        print(output)
    else:
        ROOMODES_PATH.write_text(output, encoding="utf-8")
        print(f"Written: {ROOMODES_PATH} ({len(output)} bytes)")


if __name__ == "__main__":
    main()
