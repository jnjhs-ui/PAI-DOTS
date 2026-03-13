---
description: Set a task as active focus — bridges task system to devlog FOCUS events and SESSION.md
argument-hint: "[task slug or search term]"
---

You are the focus manager. This command bridges the task system with the devlog protocol.

## Arguments

The user provided: $ARGUMENTS

## Steps

1. **Get today's date and time** using Bash: `date +%Y-%m-%d` and `date +%H:%M`

2. **Find the task**:
   - If $ARGUMENTS is provided, search `~/.claude/tasks/` for matching files:
     - Use Glob for `*$ARGUMENTS*.md` patterns
     - Also use Grep to search `title:` lines for the argument text
   - If multiple matches, list them and ask the user to pick one
   - If no matches, tell the user and suggest `/task` to create one
   - If no arguments, list all `status: open`, `status: inprogress`, or `status: active` tasks and ask user to pick

3. **Read the task file** and parse its YAML frontmatter and body

4. **Deactivate any other active task**:
   - Use Grep to find any files in `~/.claude/tasks/` containing `status: active`
   - For each one that is NOT the target task, change `status: active` to `status: open`
   - Only one task should be active at a time

5. **Update the target task file**:
   - Change `status` to `active` (if not already)
   - Append to the Notes section: `- YYYY-MM-DD HH:MM: Set as active focus`

6. **Check for devlog** — does `.devlog/` exist in the current working directory?

   **If YES (project context available):**

   a. **Check existing SESSION.md focus**:
      - Read `.devlog/SESSION.md`
      - If it has a FOCUS line that isn't "Session ended" or "Waiting for next task":
        - Append a PIVOT event to today's devlog:
          ```
          ### HH:MM PIVOT
          **Was doing:** [previous focus from SESSION.md]
          **User said:** Switched focus via /focus command
          **Switching to:** [new task title]
          **Resume after:** Check previous task status
          ```

   b. **Ensure today's devlog exists** — if `.devlog/YYYY-MM-DD.md` doesn't exist, create it:
      ```markdown
      # DevLog: YYYY-MM-DD

      ## Goal
      [awaiting user direction]

      ## Constraints
      [none yet]

      ---

      ## Session Log

      ```

   c. **Append FOCUS event** to today's devlog:
      ```
      ### HH:MM FOCUS
      **Task:** [task title]
      **Intent:** [first line of Description section, or "Working on [type]: [title]"]
      **File(s):** [from task body if file paths mentioned, else "~/.claude/tasks/[filename]"]
      **Success looks like:** [first Acceptance Criterion if present, else "[title] marked done"]
      ```

   d. **Overwrite SESSION.md**:
      ```markdown
      # Active Session

      **FOCUS:** [task title]
      **Intent:** [first line of description]
      **File(s):** [from task or "~/.claude/tasks/[filename]"]
      **Success:** [from acceptance criteria or "[title] complete"]
      **Started:** HH:MM

      ## Pending Resume
      [previous focus if there was one, otherwise "none"]

      ## Quick Context
      - Task: ~/.claude/tasks/[filename]
      - Type: [type] | Priority: [priority] | Tags: [tags]
      - [first acceptance criterion if present]
      ```

   **If NO `.devlog/` (no project context):**
   - Skip all devlog/SESSION.md writes
   - Just update the task file

7. **Confirm** with a brief summary:
   - Task now active: [title]
   - DevLog updated: yes/no
   - Previous focus moved to Pending Resume: [title or "none"]
   - Suggest: "You're now focused on [title]. When done, run `/done [slug]`."
