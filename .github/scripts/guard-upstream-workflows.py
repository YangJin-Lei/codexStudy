#!/usr/bin/env python3
"""Add openai/codex-only guards to upstream GitHub Actions workflows (CodexStudy fork)."""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
GUARD = "github.repository == 'openai/codex'"
SKIP = {"codexstudy-release.yml"}
JOB_START = re.compile(r"^  ([a-z][a-z0-9_-]*): \s*$")


def guard_job_block(lines: list[str], start: int) -> list[str]:
    """Insert guard after job name if missing."""
    i = start + 1
    while i < len(lines) and (lines[i].strip() == "" or lines[i].lstrip().startswith("#")):
        i += 1
    if i < len(lines) and "if:" in lines[i]:
        line = lines[i]
        if GUARD in line:
            return lines
        if line.strip().startswith("if:"):
            expr = line.split("if:", 1)[1].strip()
            lines[i] = f"    if: {GUARD} && ({expr})\n"
            return lines
    lines.insert(i, f"    if: {GUARD}\n")
    return lines


def process_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if "workflow_call:" in text and "on:" in text and text.find("workflow_call:") < text.find("jobs:"):
        return False
    lines = text.splitlines(keepends=True)
    if not any(GUARD in line for line in lines):
        header = (
            f"# Upstream-only on openai/codex. Disabled on CodexStudy fork "
            f"(use codexstudy-release.yml).\n"
        )
        if not lines[0].startswith("# Upstream-only"):
            lines.insert(1, header)

    in_jobs = False
    changed = False
    idx = 0
    while idx < len(lines):
        line = lines[idx]
        if line.strip() == "jobs:":
            in_jobs = True
            idx += 1
            continue
        if in_jobs:
            match = JOB_START.match(line)
            if match and match.group(1) not in {"needs", "steps", "strategy", "outputs"}:
                before = "".join(lines)
                lines = guard_job_block(lines, idx)
                if "".join(lines) != before:
                    changed = True
        idx += 1

    new_text = "".join(lines)
    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
        return True
    return changed


def main() -> None:
    updated = []
    for path in sorted(WORKFLOWS.glob("*.yml")):
        if path.name in SKIP:
            continue
        if process_file(path):
            updated.append(path.name)
    print("updated:", ", ".join(updated) if updated else "(none)")


if __name__ == "__main__":
    main()
