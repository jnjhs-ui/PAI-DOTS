# PAI-DOTS

**Personal AI Infrastructure — DevLog + Overwatch + Tasks System for Claude Code**

> Built for the **[Claude Code VSCode extension](https://marketplace.visualstudio.com/items?itemName=Anthropic.claude-code)** — works with any Claude Code environment (terminal, IDE, CI), but optimized for the VSCode native integration.

> Inspired by [PAI](https://github.com/danielmiessler/PAI) by
> [Daniel Miessler](https://danielmiessler.com). PAI established the
> foundational patterns — skills-as-containers, hook-driven automation,
> CONSTITUTION-based identity, self-test health checks, and protection
> systems — that this project builds on. PAI-DOTS extends that foundation
> with intent classification, structured devlog events, impact sweep
> verification, and file-based task management.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        .devlog/                               │
│  SESSION.md · YYYY-MM-DD.md · intents.jsonl · events/*.jsonl  │
└─────────────────────────┬────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────┴─────┐   ┌────┴────┐   ┌──────┴──────┐
    │  Overwatch │   │  DevLog │   │ Task System │
    │  (hooks)   │   │ (proto) │   │  (commands) │
    ├───────────┤   ├─────────┤   ├─────────────┤
    │ Intent    │   │ Event   │   │ /task       │
    │ tracking  │   │ format  │   │ /today      │
    │           │   │         │   │ /focus      │
    │ Context   │   │ Session │   │ /done       │
    │ recovery  │   │ state   │   │ /buglist    │
    │           │   │         │   │ /featreq    │
    │ Sweep +   │   │ RAG     │   │             │
    │ QA gate   │   │ search  │   │ Dashboard   │
    └───────────┘   └─────────┘   └─────────────┘

    ┌─────────────┐   ┌───────────────────────────────────┐
    │    CORE     │   │        Your Skills Here            │
    │  (identity) │   │         (reference)                │
    ├─────────────┤   ├───────────────────────────────────┤
    │ CONSTITUTION│   │ Add domain-specific playbooks     │
    │ Skill System│   │ Claude loads when relevant         │
    │ Quick ref   │   │ See skills/CORE/SkillSystem.md    │
    └─────────────┘   └───────────────────────────────────┘

    ┌───────────────────────────────────────────────────────┐
    │                    Named Agents                        │
    │   .claude/agents/<name>/memory.md + .devlog/           │
    │   Persistent memory per agent, scoped session logs     │
    └───────────────────────────────────────────────────────┘
```

## Components

### Overwatch — The Watcher
Hooks that run on every session event. Classifies user intent (NEW_INTENT, REFINEMENT, COMPLETION_SIGNAL), preserves context through compaction, and triggers impact sweeps before commits.

### DevLog — The Memory
Append-only event log with structured types (FOCUS, PIVOT, DECISION, DEAD_END, MILESTONE, BLOCKER, INSIGHT, HANDOFF). SESSION.md is the live scratchpad. Python RAG search via ChromaDB for semantic queries across devlogs.

### Task System — The Organizer
File-based task management with YAML frontmatter. Each task is a markdown file in `~/.claude/tasks/`. Six slash commands (/task, /today, /focus, /done, /buglist, /featreq) bridge tasks to the DevLog — `/focus` writes FOCUS events, `/done` writes MILESTONEs. Includes a zero-dependency browser dashboard (`bun ~/.claude/tasks/dashboard.js`) with full CRUD. See `skills/task-system/skill.md` for the complete reference.

### CORE — The Identity
System philosophy and operating principles. Inspired by PAI's CONSTITUTION pattern. Defines how the AI should behave, what to verify, how memory works.

### Security Guards — The Shield
PreToolUse hooks that validate operations before execution. SecurityValidator blocks destructive commands and guards sensitive paths. AgentExecutionGuard warns on foreground agent spawns. Audit logs written to `~/.claude/logs/security/`.

### Named Agents — The Team
Each agent gets persistent memory (`memory.md`) and its own devlog. When launched, an agent reads its memory. When done, it writes back what it learned. Built-in personas: Architect, Engineer, Pentester, BrowserAgent, QATester. Supports parallel execution across multiple cores.

### Reference Skills
Add your own domain-specific playbooks to `skills/`. Claude loads them when working on related tasks. No hooks or commands — just knowledge. See `skills/CORE/SkillSystem.md` for how to create one.

---

## Quick Start

### macOS / Linux

**1. Clone**
```bash
git clone https://github.com/jnjhs-ui/PAI-DOTS.git ~/PAI-DOTS
```

**2. Install Bun** (skip if already installed)
```bash
curl -fsSL https://bun.sh/install | bash
```

**3. Link and verify**
```bash
bash ~/PAI-DOTS/.claude/tools/setup/bootstrap.sh
```

This creates the symlink (`~/.claude → ~/PAI-DOTS/.claude`) and runs the self-test. If you already have a `~/.claude` directory, back it up first.

**4. Start Claude Code**
```bash
claude
```

---

### Windows

**1. Clone** (PowerShell)
```powershell
git clone https://github.com/jnjhs-ui/PAI-DOTS.git $env:USERPROFILE\PAI-DOTS
```

**2. Install Bun** (skip if already installed)
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

**3. Create junction** — no admin required
```powershell
cmd /c mklink /J "%USERPROFILE%\.claude" "%USERPROFILE%\PAI-DOTS\.claude"
```

> **Note:** Use a junction (`mklink /J`), not a symbolic link. Junctions work without administrator elevation and are fully supported by Claude Code.

**4. Verify**

Open a new terminal (so Bun is in PATH), then:
```bash
bun ~/.claude/tools/self-test.ts
```

All checks should pass. If `bun` is not found, restart your terminal or add `%USERPROFILE%\.bun\bin` to your PATH manually.

**5. Start Claude Code**
```bash
claude
```

---

## Per-Project DevLog

PAI-DOTS hooks write session events to a `.devlog/` directory. If no project devlog exists, they fall back to `~/.claude/devlog/` — which works but loses project context.

**Run once per project, from the project root:**

```bash
cd ~/your-project
bun ~/.claude/tools/init-devlog.ts
```

Or from within Claude Code:

```
/init-devlog
```

This creates:
- `.devlog/SESSION.md` — live session state (current focus, pending resume)
- `.devlog/YYYY-MM-DD.md` — today's event log
- A `.gitignore` entry for `.devlog/` (session state is personal, not for version control)

After init, hooks automatically write FOCUS, DECISION, INSIGHT, MILESTONE, and other events to the project devlog. At session start, Claude loads the devlog context so it knows what you were working on.

---

## Updating

```
/update
```

Or manually:

```bash
cd ~/PAI-DOTS && git pull
```

Since `~/.claude` is a symlink, changes are live immediately.

---

## Task Dashboard

A zero-dependency browser UI for managing tasks. No database, no build step — just Bun serving flat markdown files.

```bash
bun ~/.claude/tasks/dashboard.js
```

Then open **http://127.0.0.1:3847** in your browser.

### Features

- **Full CRUD** — create, edit, delete tasks directly in the browser
- **Filtered views** — by status (open, active, in progress, blocked, done), priority, and type
- **DevLog integration** — if a `.devlog/` directory exists in the current working directory, setting a task to active writes a FOCUS event automatically
- **Keyboard shortcuts** — `n` new task, `?` help
- **Binds to 127.0.0.1 only** — local access, no external exposure

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--port <n>` | `3847` | Change the listen port |
| `--no-open` | — | Don't auto-open browser on start |

### Custom tasks directory

```bash
TASKS_DIR=/path/to/tasks bun ~/.claude/tasks/dashboard.js
```

By default it reads from `~/.claude/tasks/`. Point `TASKS_DIR` at any directory of task markdown files.

---

## Container Mode (Multi-Agent)

Run named agents in parallel Docker containers, each with its own Claude Code instance and isolated filesystem.

### Setup

```bash
cd ~/PAI-DOTS/docker
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY and WORKSPACE_PATH

docker compose build
docker compose up redis -d
```

### Usage

```bash
# Single agent
docker compose run --rm -e ONE_SHOT=true -e TASK="Run npm test" qa

# Multiple agents in parallel
docker compose up qa reviewer architect

# Dispatch via orchestrator
bun docker/orchestrator.ts --agent qa --task "Run tests" \
  --agent reviewer --task "Review the auth module"

# Broadcast to all agents
bun docker/orchestrator.ts --broadcast "Prepare for deploy"
```

### Agent Isolation

| Agent | Workspace | Tools |
|-------|-----------|-------|
| qa | read-only | Bash, Read, Glob, Grep |
| reviewer | read-only | Read, Glob, Grep |
| ops | **read-write** | Bash, Read, Glob, Grep, Write, Edit |
| hubspot | read-only | Bash, Read, Glob, Grep, WebFetch |
| scribe | read-only | Read, Glob, Grep |
| architect | read-only | Read, Glob, Grep |
| researcher | read-only | Read, Glob, Grep, WebFetch, WebSearch |
| codex | **read-write** | Bash, Read, Glob, Grep, Write, Edit |

Agents communicate results through Redis, not the filesystem. Read-only agents analyze and report — only ops and codex can modify files.

### Codex Agent (Host Mode)

The Codex agent uses the [OpenAI Codex CLI](https://github.com/openai/codex) instead of Claude. It can run in Docker or directly on the host.

```bash
# Start Redis
docker compose -f docker/docker-compose.yml up redis -d

# Start Codex runner on host
REDIS_URL=redis://localhost:6380 CODEX_CMD="codex --non-interactive" bun docker/codex-runner.ts

# Dispatch a task
bun docker/orchestrator.ts --agent codex --task "Summarize current git status"
```

**Environment variables:**

| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `CODEX_CMD` | Yes | — | Full CLI command (e.g. `codex --non-interactive`) |
| `REDIS_URL` | No | `redis://redis:6379` | Redis connection |
| `WORKSPACE_PATH` | No | `/workspace` | Working directory for Codex |
| `AGENT_TIMEOUT` | No | `300` | Per-task timeout (seconds) |
| `MAX_TURNS` | No | — | Passthrough if CLI supports it |

---

## Self-Test

```bash
bun ~/.claude/tools/self-test.ts
```

Verifies all hooks, skills, commands, and settings are present and valid.

---

## Runtime

| Requirement | Version |
|------------|---------|
| **Bun** | 1.0+ (for hooks) |
| **Claude Code** | 2.0+ |
| **Python** | 3.10+ (optional, for RAG search) |
| **Docker** | 20.0+ (optional, for container mode) |

---

## Credits

- **[PAI](https://github.com/danielmiessler/PAI)** by [Daniel Miessler](https://danielmiessler.com) — the foundational patterns (skills-as-containers, CONSTITUTION, hook system, self-test, protection) that this project builds on
- Built on [Claude Code](https://claude.ai/code) by Anthropic

---

## License

MIT — see [LICENSE](LICENSE)

---

## Version

1.6.0
