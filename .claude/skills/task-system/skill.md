# Task System Skill

The **T** and **S** in DOTS. File-based task management with YAML frontmatter, slash commands, devlog integration, and a browser dashboard.

## How It Works

Tasks are markdown files in `~/.claude/tasks/` with YAML frontmatter. The system is designed around three layers:

1. **Storage** — plain markdown files, one per task, human-readable and git-friendly
2. **Commands** — slash commands that create, query, and update tasks
3. **Integration** — `/focus` and `/done` bridge to the DevLog protocol (FOCUS/MILESTONE events, SESSION.md updates)

## Task File Schema

```yaml
---
title: "Fix login redirect loop"
status: open           # open | active | done | blocked | deferred
type: bug              # bug | feature | errand | follow-up | reminder | chore | bug-report
priority: medium       # high | medium | low
tags: [auth, ui]       # from taxonomy
project: "my-app"      # auto-detected from git repo
created: 2026-02-27
due: null              # optional deadline
done: null             # filled by /done
context: ""            # free-text origin/reason
---

## Description
User gets stuck in a redirect loop after login when session cookie is expired.

## Acceptance Criteria
- [ ] Login redirects to dashboard on success
- [ ] Expired sessions redirect to login page cleanly

## Notes
- 2026-02-27: Created
```

## Filename Convention

`YYYY-MM-DD-slug.md` — date-prefixed, kebab-case slug from title, max 50 chars. Example: `2026-02-27-fix-login-redirect-loop.md`

## Commands

| Command | Purpose |
|---------|---------|
| `/task [description]` | Create a new task. Infers type, priority, tags from natural language. |
| `/today` | Dashboard view — active focus, overdue, high priority, open, blocked, recently done. |
| `/focus [slug]` | Set a task as active. Deactivates previous. Writes FOCUS event to devlog, updates SESSION.md. |
| `/done [slug]` | Mark task complete. Sets done date. Writes MILESTONE to devlog. Promotes Pending Resume if present. |
| `/buglist [filter]` | Filter tasks by type `bug` or `bug-report`. Group by status and priority. |
| `/featreq [filter]` | Filter tasks by type `feature-request`. Group by status and priority. |

## Tag Taxonomy

**Dev:** api, ui, db, security, infra, test, docs, config, sync, installer
**External:** bubble, vendor
**Personal:** personal, health, finance, meeting, learning
**Modifiers:** urgent, blocked, recurring

## DevLog Integration

The task system connects to the DevLog protocol through two commands:

### /focus → FOCUS event
When you run `/focus`, it:
1. Sets the task status to `active`
2. Deactivates any other active task
3. Writes a FOCUS event to today's devlog
4. Overwrites SESSION.md with the new focus
5. If there was a previous focus, writes a PIVOT event and stores it in Pending Resume

### /done → MILESTONE event
When you run `/done`, it:
1. Sets the task status to `done` with today's date
2. Writes a MILESTONE event to today's devlog
3. If this was the active focus in SESSION.md, promotes Pending Resume or clears focus

## Browser Dashboard

Run the interactive dashboard:

```bash
bun ~/.claude/tasks/dashboard.js
# or
node ~/.claude/tasks/dashboard.js
```

Opens at `http://127.0.0.1:3847` (localhost only). Provides:
- Full CRUD UI for tasks (create, edit, delete)
- Click-to-focus and click-to-done
- Filtering by status, type, priority, project
- DevLog integration (writes FOCUS events from the UI)

## Status Lifecycle

```
open → active → done
  │       │
  │       └→ blocked → open (when unblocked)
  │
  └→ deferred (parked indefinitely)
```

Only one task can be `active` at a time. `/focus` enforces this.

## Best Practices

- Use `/task` for quick capture, refine details later
- Keep one task `active` at a time via `/focus`
- Run `/today` at the start of each session to orient
- High-priority items surface automatically in `/today`
- `/done` closes the loop — always mark tasks complete, don't just abandon them
