# Named Agents

Each subdirectory is a named agent with persistent memory and its own devlog.

## Structure

```
agents/
├── <agent-name>/
│   ├── agent.md           # Agent personality, instructions, capabilities
│   ├── memory.md          # Persistent learnings (survives sessions)
│   └── .devlog/           # Agent-scoped session logs
│       ├── SESSION.md     # Agent's last session state
│       └── YYYY-MM-DD.md  # Agent's daily event log
```

## How It Works

1. When a Task agent is launched with a name matching a directory here, the system injects that agent's `memory.md` as context
2. The agent's hooks scope devlog writes to its own `.devlog/` directory
3. When the agent completes, it writes back what it learned to `memory.md`

## Creating an Agent

```bash
mkdir -p ~/.claude/agents/code-reviewer/.devlog
```

Then create `agent.md` with the agent's personality and instructions.

## Built-in Agents

Create these as needed:

| Agent | Purpose |
|-------|---------|
| `code-reviewer` | Impact sweep, code quality, security |
| `researcher` | Codebase exploration, documentation |
| `qa` | Test execution, smoke testing, regression checks |
| `architect` | Design decisions, architecture review |
