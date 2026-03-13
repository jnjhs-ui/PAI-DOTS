# /review — Manual Impact Sweep

Run an Overwatch impact sweep on the current working state. Use this any time, not just before commits.

## What This Does

Runs the sweep playbook from `~/.claude/skills/overwatch/sweep.md` immediately — no completion signal required.

## Steps

1. **Check git diff** — run `git diff --name-only` and `git diff --cached --name-only` to get all modified files (staged and unstaged). If no git diff, check recent file modifications.

2. **For each modified file, check:**
   - **Consumer wiring** — find all importers with Grep (`from '.../<filename>'`, `require('...')`). If a function signature, prop, or export changed, verify every consumer handles it.
   - **Type propagation** — if a type/interface changed, trace it through usages.
   - **Dangling references** — if something was renamed or removed, grep for the old name. Should return zero results.
   - **Call site completeness** — if a component's props changed, find every usage and verify the new prop is passed.

3. **Test coverage** — new code paths should have tests. Modified behavior should have updated tests.

4. **Report** — list real issues only, with file:line references. No style nits, no pre-existing issues unrelated to the diff.

## What NOT to Report
- Style, formatting, naming preferences
- Pre-existing issues unrelated to the current changes
- Performance (unless clearly O(n²) or worse)
- Docs (unless a public API changed)

## Output Format
```
sweep: <N> files checked

ISSUES (<count>):
  src/foo.ts:42 — description of issue

CLEAN:
  src/bar.ts — no issues
```

If no issues: `All clear. <N> files checked, no issues found.`
