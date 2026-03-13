---
description: Show today's task dashboard — open tasks, active focus, due/overdue items, devlog summary
argument-hint: ""
---

You are the task dashboard. Show the user their day at a glance. Read-only — do NOT create or modify any files.

## Steps

1. **Get today's date** using Bash: `date +%Y-%m-%d`

2. **Read all task files** from `~/.claude/tasks/`:
   - Use Glob to find all `*.md` files in `~/.claude/tasks/`
   - Read each file and parse the YAML frontmatter (between `---` markers)
   - Collect: title, status, type, priority, tags, project, due, done, context

3. **Categorize tasks**:
   - **Overdue**: status is `open`, `inprogress`, or `active` AND `due` date is before today
   - **Active**: status is `active`
   - **In Progress**: status is `inprogress`
   - **High priority open**: status is `open`, priority is `high`
   - **Open**: status is `open` (medium/low priority)
   - **Blocked**: status is `blocked`
   - **Recently done**: status is `done` AND `done` date is within last 3 days

4. **Read devlog context** (if `.devlog/` exists in cwd):
   - Read `.devlog/SESSION.md` — extract current FOCUS line
   - Read today's `.devlog/YYYY-MM-DD.md` — extract last STATE or FOCUS event

5. **Display the dashboard**:

```
## Today: YYYY-MM-DD

### Active Focus
[from SESSION.md FOCUS line, or from active task, or "No active focus — run /focus to pick one up"]

### Overdue
- [title] (due: YYYY-MM-DD) [priority] [type] [project]
[or "None"]

### High Priority
- [title] [type] [tags] [project]
[or "None"]

### Open
- [title] [type] [priority] [tags] [project] [due if set]

### Blocked
- [title] — [context if set]
[or "None"]

### Recently Done (last 3 days)
- ~~[title]~~ (done: YYYY-MM-DD)
[or "None"]

---
Total: X active, X inprogress, X open, X blocked, X done recently
```

6. **If there are overdue or high-priority tasks with no active focus**, suggest: "Run `/focus [slug]` to pick one up."

Keep the output concise. One line per task. No file contents — just frontmatter summaries.

7. **Offer the visual dashboard**: At the end, mention: "Run `node ~/.claude/tasks/dashboard.js` to open the interactive dashboard in your browser (full CRUD, click to edit/done/focus)."
