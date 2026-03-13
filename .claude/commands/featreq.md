---
description: List all feature request tasks grouped by status and priority
argument-hint: "[optional: project name or tag filter]"
---

You are the feature request tracker view. Show all tasks of type `feature`. Read-only — do NOT create or modify any files.

## Arguments

Optional filter: $ARGUMENTS (can be a project name, tag, or priority level)

## Steps

1. **Find all feature tasks**:
   - Use Glob to get all `*.md` files in `~/.claude/tasks/`
   - Use Grep to find files containing `type: feature`
   - Read the frontmatter of each matching file

2. **Apply filters** (if $ARGUMENTS provided):
   - If argument matches a project name → filter by `project:` field
   - If argument matches a tag → filter by `tags:` field
   - If argument is "high", "medium", or "low" → filter by `priority:` field

3. **Display grouped by status** (active first, then inprogress, then open by priority, then blocked, then recent done):

```
## Feature Requests [filtered by: X, or empty]

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

### Recently Completed (last 14 days)
- ~~[title]~~ (done: YYYY-MM-DD)

---
Total: X active, X inprogress, X open, X blocked, X done recently
```

4. If there are open features linked to the current project (auto-detect via `basename $(git rev-parse --show-toplevel 2>/dev/null)`), highlight them.

Keep it concise — one line per feature.
