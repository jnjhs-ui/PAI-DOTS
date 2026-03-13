# /init-devlog — Initialize DevLog for Current Project

Set up `.devlog/` in the current working directory so hooks write session events here instead of the global fallback.

## Steps

1. **Check** if `.devlog/` already exists in the current directory — if so, report it and stop

2. **Run the init script**:
   ```bash
   bun ~/.claude/tools/init-devlog.ts
   ```

3. **Confirm what was created**:
   - `.devlog/SESSION.md` — tracks current focus and pending resume
   - `.devlog/YYYY-MM-DD.md` — today's session log
   - `.gitignore` entry for `.devlog/` (devlog is personal session state, not for version control)

4. **Report** and suggest next step:
   > DevLog initialized. Hooks will now write to `.devlog/` in this project.
   > Run `/focus` to set your first task, or `/today` to see open tasks.

## When to use

Run this once per project, from the project root directory. After init, all PAI-DOTS hooks (session start, intent tracking, tool events, completion sweeps) write to this project's devlog instead of the global fallback at `~/.claude/devlog/`.
