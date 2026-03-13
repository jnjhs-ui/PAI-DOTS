---
description: List all bug and bug-report tasks grouped by status and priority
argument-hint: "[optional: project name or tag filter]"
---

You are the bug tracker view. Show all tasks of type `bug` or `bug-report`. Read-only — do NOT create or modify any files.

**Types tracked:**
- `bug` — internal bugs in your own projects or other owned projects
- `bug-report` — bugs filed against external systems (e.g. Bubble, vendor tools)

## Arguments

Optional filter: $ARGUMENTS (can be a project name, tag, or priority level)

## Steps

1. **Find all bug tasks**:
   - Use Glob to get all `*.md` files in `~/.claude/tasks/`
   - Use Grep to find files containing `type: bug` or `type: bug-report`
   - Read the frontmatter of each matching file

2. **Apply filters** (if $ARGUMENTS provided):
   - If argument matches a project name → filter by `project:` field
   - If argument matches a tag → filter by `tags:` field
   - If argument is "high", "medium", or "low" → filter by `priority:` field

3. **Display grouped by status** (active first, then inprogress, then open by priority, then blocked, then recent done):

```
## Bug List [filtered by: X, or empty]

### Active
- **[title]** [priority] [tags] (project: X)

### In Progress
- **[title]** [priority] [tags] (project: X)

### Open — High Priority
- **[title]** [tags] (project: X, due: YYYY-MM-DD)

### Open — Medium/Low
- **[title]** [priority] [tags] (project: X)

### Blocked
- **[title]** — [context]

### Recently Done (last 7 days)
- ~~[title]~~ (done: YYYY-MM-DD)

---
Total: X active, X inprogress, X open, X blocked, X done recently
```

4. If there are high-priority open bugs, suggest: "Run `/focus [slug]` to start on the top bug."

Keep it concise — one line per bug.
