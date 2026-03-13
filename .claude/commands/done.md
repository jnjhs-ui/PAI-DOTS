---
description: Mark a task as done — logs completion date and optionally writes MILESTONE to devlog
argument-hint: "[task slug or search term]"
---

You are the task closer. Mark a task as complete.

## Arguments

The user provided: $ARGUMENTS

## Steps

1. **Get today's date and time** using Bash: `date +%Y-%m-%d` and `date +%H:%M`

2. **Find the task**:
   - If $ARGUMENTS is provided, search `~/.claude/tasks/` for matching files:
     - Use Glob for `*$ARGUMENTS*.md` patterns
     - Also use Grep to search `title:` lines for the argument text
   - If multiple matches, list them and ask the user to pick one
   - If no matches, tell the user no matching task was found
   - If no arguments, list all `status: active` tasks first (most likely candidates), then `status: inprogress`, then `status: open`

3. **Read the task file** and parse its YAML frontmatter

4. **Update the task file**:
   - Change `status` to `done` (from whatever it was)
   - Set `done: YYYY-MM-DD` (today's date)
   - Append to the Notes section: `- YYYY-MM-DD HH:MM: Marked complete`

5. **Check for devlog** — does `.devlog/` exist in the current working directory?

   **If YES:**

   a. **Ensure today's devlog exists** — if `.devlog/YYYY-MM-DD.md` doesn't exist, create it with standard header

   b. **Append MILESTONE event** to today's devlog:
      ```
      ### HH:MM MILESTONE
      **Completed:** [task title]
      **Files:** [from task body if file paths mentioned, else "~/.claude/tasks/[filename]"]
      ```

   c. **Update SESSION.md if this was the active focus**:
      - Read `.devlog/SESSION.md`
      - If the FOCUS line matches this task's title:
        - If there's a Pending Resume, promote it to the new FOCUS
        - Otherwise, set FOCUS to "Completed [title]. Run /focus to pick next task."

   **If NO `.devlog/`:**
   - Skip devlog/SESSION.md writes
   - Just update the task file

6. **Confirm** with a brief summary:
   - Completed: [title]
   - Done date: YYYY-MM-DD
   - DevLog MILESTONE: yes/no
   - Suggest: "Run `/today` to see remaining tasks, or `/focus` to pick up the next one."
