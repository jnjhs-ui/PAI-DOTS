# PAI-DOTS Constitution

Operating principles for the system. These are non-negotiable defaults — projects can extend but not contradict them.

---

## 1. Scaffolding > Model

The system architecture matters more than the underlying AI model. Well-structured hooks, persistent memory, and deterministic verification will outperform raw intelligence with no structure. Build the rails, then let the model run on them.

## 2. Verify Before Ship

Never commit without verification. The Overwatch sweep exists because AI agents optimize for momentum — they finish the task and declare done. The sweep catches what momentum skips: unwired consumers, missing type propagation, dangling references.

## 3. Code Before Prompts

Write code to solve problems. Use prompts to orchestrate code. If you can express logic deterministically (regex intent classification, file-based state, atomic writes), do that instead of asking the LLM to figure it out every time.

## 4. Memory is Infrastructure

Sessions die. Context compacts. Models forget. The DevLog protocol, SESSION.md, and agent memory files exist because **reliable AI requires persistent state**. Every hook writes to disk. Every session starts by reading what came before.

## 5. Own Every Error

If something is broken in the area you're working, fix it. Don't deflect with "that wasn't from our changes." If you touched the area, you own it. If you didn't touch it but found it, flag it and offer to fix it.

## 6. Intent Over Action

Track *why* the user asked for something, not just *what* they typed. The intent classification system (NEW_INTENT, REFINEMENT, COMPLETION_SIGNAL) preserves the narrative arc of a session. When context compacts, the intent history is what lets you resume intelligently.

## 7. Agents Have Memory

Named subagents (code-reviewer, researcher, qa) accumulate knowledge in `.claude/agents/<name>/memory.md`. Each agent has its own devlog. When launched, the agent's memory is injected as context. When done, the agent writes back what it learned.

## 8. Additive, Reversible Changes

Prefer additive changes over destructive ones. New fields should be nullable. Migrations should be reversible. Feature flags gate new behavior. This applies to both the projects you work on and PAI-DOTS itself.

## 9. UNIX Philosophy

Each hook does one thing well. session-start loads context. parse-intent classifies. capture-tool-events logs. session-end summarizes. They compose through the shared devlog directory, not through direct coupling.

## 10. CLI First

Every operation should work from the command line. `/task`, `/focus`, `/done`, `/today` — these are the interfaces. If it can't be invoked from the CLI, it can't be automated or tested.

---

## Session Lifecycle

```
SessionStart
  → session-start.ts (load devlog context)
  → session-init.ts (overwatch init, intent carryover)

User Message
  → parse-intent.ts (classify intent, update SESSION.md)

Tool Use
  → capture-tool-events.ts (log to JSONL)

Context Full
  → pre-compact.ts (inject recovery context)

Session End
  → session-end.ts (update SESSION.md, preserve pending resume)
```

## Memory Model

| Store | Type | Purpose |
|-------|------|---------|
| `.devlog/SESSION.md` | Overwrite | Current focus, live state (survives compaction) |
| `.devlog/YYYY-MM-DD.md` | Append | Daily event log (FOCUS, PIVOT, DECISION, MILESTONE...) |
| `.devlog/intents.jsonl` | Append | All classified user intents |
| `.devlog/events/*.jsonl` | Append | Tool call log (sanitized) |
| `.claude/agents/<name>/memory.md` | Overwrite | Per-agent persistent learnings |
| `.claude/agents/<name>/.devlog/` | Per-agent | Agent-scoped session logs |
