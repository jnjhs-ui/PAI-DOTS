---
description: Create a new task in ~/.claude/tasks/ with YAML frontmatter
argument-hint: "[description] or leave blank for interactive mode"
---

You are the task creator. Create a new task file in `~/.claude/tasks/`.

## Arguments

The user may provide: $ARGUMENTS

## Task File Schema

```yaml
---
title: "string"
status: open           # open | inprogress | active | done | blocked | deferred
type: bug              # bug | feature | errand | follow-up | reminder | chore | bug-report
priority: medium       # high | medium | low
tags: []               # from taxonomy below
project: ""            # auto-detected from cwd git repo
created: YYYY-MM-DD
due: null              # optional deadline
done: null             # filled by /done
context: ""            # free-text origin/reason
---
```

## Tag Taxonomy

**Dev**: api, ui, db, security, infra, test, docs, config, sync, installer
**External**: bubble, vendor, goodspeed
**Personal**: personal, health, finance, meeting, learning
**Modifiers**: urgent, blocked, recurring

## Steps

1. **Get today's date** using Bash: `date +%Y-%m-%d`

2. **Parse the input**:
   - If `$ARGUMENTS` is provided, infer the task from natural language:
     - Extract the title from the description
     - Infer type from keywords (e.g. "fix"/"bug" → bug, "add"/"build" → feature, "buy"/"pick up" → errand, "email"/"message"/"call" → follow-up, "remember"/"don't forget" → reminder)
     - Infer priority from urgency cues ("urgent"/"asap"/"critical" → high, default → medium)
     - Infer tags from domain keywords
     - Extract due date if mentioned ("by Friday", "tomorrow", "next week", specific date)
   - If no arguments or the input is ambiguous, ask the user for:
     - Title (required)
     - Type: bug, feature, errand, follow-up, reminder, chore
     - Priority: high, medium, low
     - Due date (optional)
     - Tags (optional)

3. **Auto-detect project**:
   - Run `basename $(git rev-parse --show-toplevel 2>/dev/null) 2>/dev/null` to get the git repo name
   - If that works, use it as the `project` field
   - If not in a git repo, leave `project` empty

4. **Generate the filename**:
   - Format: `YYYY-MM-DD-slug.md` where slug is the title in kebab-case
   - Lowercase, replace spaces/special chars with hyphens, collapse multiple hyphens
   - Truncate slug to 50 characters max
   - Check if file exists; if so append `-2`, `-3` etc.

5. **Create the task file** using the Write tool at `~/.claude/tasks/YYYY-MM-DD-slug.md`:

```markdown
---
title: "[title]"
status: open
type: [type]
priority: [priority]
tags: [tags as yaml array]
project: [auto-detected or ""]
created: YYYY-MM-DD
due: [date or null]
done: null
context: ""
---

## Description
[expanded description or title restated]

## Acceptance Criteria
- [ ] [inferred from description, or "To be defined"]

## Notes
- YYYY-MM-DD: Created
```

6. **Confirm** by showing the file path and a brief summary of what was created.

7. **If high priority**, suggest: "Run `/focus [slug]` to start working on this."

Always ensure `~/.claude/tasks/` directory exists before writing (create with `mkdir -p` if needed).
