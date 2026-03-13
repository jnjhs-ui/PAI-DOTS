# Overwatch Skill

A background system that tracks user intent, maintains session continuity, and triggers impact sweeps before commits.

## Purpose

The main agent focuses on doing work. Overwatch focuses on **remembering why** and **catching what was missed** — capturing user intent, tracking refinements, preserving context that survives compaction, and triggering a review sweep before completion signals.

## Components

### 1. Intent Tracking (parse-intent.ts)
Triggered on every user message via `UserPromptSubmit` hook. Classifies intent, appends to `intents.jsonl`, updates `SESSION.md`.

### 2. Session Init (session-init.ts)
Triggered on `SessionStart`. Checks devlog staleness, carries over intents across day boundaries, outputs context for main agent.

### 3. Completion Sweep + QA Gate
When `parse-intent.ts` detects a completion signal ("commit", "ship it", "manage the PR", etc.), it injects a system-reminder telling the main agent to run an impact sweep, then suggest a QA pass if the qa-agent skill is installed.

### 4. Sweep Playbook (sweep.md)
Reference material for the impact sweep — what to check, how to run it, what agent to use.

## What It Tracks

### User Intent Signals

| Signal Pattern | Intent Type | Example |
|----------------|-------------|---------|
| "I want...", "Can you...", "Let's..." | NEW_INTENT | "I want to add dark mode" |
| "Actually...", "Wait...", "No..." | REFINEMENT | "Actually make it system-aware" |
| "Why isn't...", "It's broken..." | DEBUG_INTENT | "Why isn't the button working?" |
| "What about...", "How does..." | RESEARCH | "How does the auth flow work?" |
| "commit", "ship it", "manage the PR" | COMPLETION_SIGNAL | "commit this and push" |
| "yes", "do it", "go ahead" | CONFIRMATION | User approved a plan |
| "no", "stop", "not that" | REJECTION | User blocked a direction |
| Numbers (1, 2, 3) or "first option" | CHOICE | User picked from options |

### Intent Lifecycle

```
NEW_INTENT → [REFINEMENT]* → COMPLETION_SIGNAL → (sweep) → (QA) → CONFIRMATION
```

## Output Format

Writes to `.devlog/intents.jsonl` (append-only):

```jsonl
{"ts":"2026-01-15T15:23:00Z","type":"NEW_INTENT","raw":"I want to add dark mode","parsed":"add dark mode","scope":"ui","id":"intent_001"}
{"ts":"2026-01-15T16:02:00Z","type":"COMPLETION_SIGNAL","raw":"commit this","parsed":"Completion: commit this","scope":"other"}
```

## Hook Integration

Configured in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "command": "bun ~/.claude/hooks/session-init.ts" }],
    "UserPromptSubmit": [{ "command": "bun ~/.claude/hooks/parse-intent.ts", "timeout": 5000 }]
  }
}
```

## Why Regex, Not LLM?

1. Intent parsing is simple classification — no deep reasoning needed
2. Runs on every user message — must be fast (<100ms)
3. Zero cost, deterministic, no API calls
4. The hooks use regex heuristics, not LLM inference
