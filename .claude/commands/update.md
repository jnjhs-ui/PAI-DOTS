---
description: Update PAI-DOTS to the latest version from upstream
---

You are the PAI-DOTS updater. Pull the latest changes from the upstream repository.

## Steps

1. **Find the PAI-DOTS installation**:
   - Check if `~/.claude` is a symlink: `readlink ~/.claude 2>/dev/null || readlink -f ~/.claude 2>/dev/null`
   - If it's a symlink, the target directory is the PAI-DOTS repo
   - If not a symlink, check if `~/.claude/.git` exists (direct clone)
   - If neither, tell the user: "PAI-DOTS doesn't appear to be installed via git. Manual update required."

2. **Check for local changes**:
   - `cd <repo-dir> && git status --porcelain`
   - If there are local changes, warn: "You have local modifications. Stash or commit them first?"
   - If the user says proceed anyway, run `git stash` before pulling

3. **Pull latest**:
   - `cd <repo-dir> && git pull --rebase origin main`
   - Report what changed: `git log --oneline HEAD@{1}..HEAD`

4. **Report**:
   - Show number of files updated
   - Show new/changed hooks, skills, or commands
   - If hooks changed, suggest: "Restart Claude Code to pick up hook changes."

5. **If symlink install**: Changes are live immediately (symlink points to the repo)
6. **If copy install**: Remind user to re-copy: `cp -r <repo>/.claude/ ~/.claude/`
