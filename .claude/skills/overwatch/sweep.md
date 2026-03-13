# Overwatch Sweep Playbook

Impact analysis before commit. Not a general code review — focused specifically on **what changed and what that change broke or missed**.

## When to Run

Automatically triggered when Overwatch detects a completion signal ("commit", "ship it", "manage the PR", etc.). Can also be invoked manually anytime.

## What to Check

1. **Consumer wiring** — For every modified file, find all importers. If you changed a function signature, added a prop, or modified an export — every consumer must be updated.
2. **Type propagation** — Changed a type/interface? Trace it through all usages. TypeScript will catch some of this, but not runtime-only patterns.
3. **Call site completeness** — Changed a component's props? Find every `<Component` render and verify the new prop is passed where needed.
4. **Dangling references** — Removed or renamed something? Grep for the old name across the entire codebase.
5. **Test coverage of changes** — New code paths should have tests. Modified behavior should have updated tests.

## What NOT to Check

- Style, formatting, naming opinions
- Pre-existing issues unrelated to the diff
- Performance unless the change is clearly O(n^2) or worse
- Documentation unless a public API changed

## How to Run

Use a Task agent:

```
Task tool:
  subagent_type: "feature-dev:code-reviewer"
  prompt: |
    Review the current git diff for impact completeness.

    1. Run `git diff --name-only` to get all modified files
    2. For each modified file, search the codebase for all importers:
       - Grep for `from '.../<filename>'` and `require('.../<filename>')`
    3. For any changed function signatures, props, types, or exports:
       - Verify every consumer handles the change
    4. For any removed/renamed identifiers:
       - Grep for the old name — should return zero results
    5. Check if new code paths have test coverage

    Report ONLY real issues with high confidence. Do not report style nits.
    Format: file:line — description of the issue
```

## Confidence Threshold

Only report issues you're confident about. The sweep exists to catch mechanical misses (missed call sites, unwired props), not to second-guess design decisions.

## Post-Sweep: QA Gate (Optional)

If the impact sweep passes clean, check if a QA agent is available:

```bash
# Check for qa-agent skill
ls ~/.claude/skills/qa-agent/ 2>/dev/null
```

If installed, suggest a quick smoke test before final commit:

1. **Run test suite** — `npm test` (or project equivalent)
2. **Type check** — `npm run type-check` (TypeScript projects)
3. **Critical path verification** — Invoke the qa-agent skill for pre-deployment smoke test

This is a suggestion, not a gate. The user can skip it with "just commit" or "skip QA".

### Why After Sweep, Not Before

The sweep catches mechanical issues (unwired props, broken imports). QA catches behavioral issues (broken flows, regressions). Running QA on code that has unwired imports is wasted effort — fix the mechanicals first, then verify behavior.
