# PAI-DOTS

**Version:** 1.0.0
**Runtime:** Bun

Personal AI Infrastructure — DevLog + Overwatch + Tasks System for Claude Code.

## Quick Reference

### Slash Commands

| Command | Purpose |
|---------|---------|
| `/task [description]` | Create a new task |
| `/today` | Show today's dashboard (open tasks, focus, due items) |
| `/focus [slug]` | Set a task as active focus (updates devlog + SESSION.md) |
| `/done [slug]` | Mark a task complete (logs MILESTONE) |
| `/buglist` | List all bug tasks by status/priority |
| `/featreq` | List all feature requests by status/priority |
| `/update` | Pull latest PAI-DOTS changes |

### Hooks (automatic)

| Event | Hook | What It Does |
|-------|------|-------------|
| SessionStart | session-start.ts | Loads devlog context into session |
| SessionStart | session-init.ts | Overwatch init, intent carryover |
| UserPromptSubmit | parse-intent.ts | Classifies intent, triggers sweep on completion |
| PostToolUse | capture-tool-events.ts | Logs tool calls to JSONL |
| PreCompact | pre-compact.ts | Preserves context through compaction |
| Stop | session-end.ts | Updates SESSION.md with session summary |

### Agent Memory

Named agents store persistent memory at `.claude/agents/<name>/`:
- `memory.md` — Accumulated learnings
- `.devlog/SESSION.md` — Agent's last session state
- `.devlog/YYYY-MM-DD.md` — Agent's daily event log

### DevLog Event Types

| Event | When | Format |
|-------|------|--------|
| FOCUS | Starting a task | Task, intent, files, success criteria |
| PIVOT | Changing direction | Was doing, trigger, switching to |
| DECISION | Chose between alternatives | Choice, rationale, rejected options |
| DEAD_END | Approach failed | Tried, why it failed, lesson |
| MILESTONE | Completed something | What, files |
| BLOCKER | Can't proceed | Blocked by, needs |
| INSIGHT | Discovered something non-obvious | Learned, implication |
| HANDOFF | Passing to another agent | To, task |

## Links

- [CONSTITUTION](CONSTITUTION.md) — Operating principles
- [SkillSystem](SkillSystem.md) — How to create skills
- [Sweep Playbook](../overwatch/sweep.md) — Impact analysis before commit
- [Task System](../task-system/skill.md) — File-based task management + DevLog integration
