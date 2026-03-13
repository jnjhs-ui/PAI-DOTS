# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [1.6.0] - 2026-03-13

### Added
- PII/secret pre-commit hook — `validate-protected.ts` now runs automatically on every commit, blocking emails, API keys, and user-defined PII strings
- Email address detection added to secret scanner
- `pii_strings` array in `.protected.json` — add your real name, email, or any sensitive string; scanner blocks commits containing them
- `bootstrap.sh` installs the pre-commit hook and prompts to fill `pii_strings` on setup

## [1.5.0] - 2026-03-13

Initial public release.

### Includes
- Overwatch hooks: session init/end, intent classification, tool event capture, pre-compact context preservation
- Security hooks: PreToolUse validator (destructive command blocking, sensitive path enforcement), agent execution guard
- DevLog protocol: per-project `.devlog/` with SESSION.md, daily logs, intents.jsonl, events/*.jsonl; global fallback
- Task system: `/task`, `/today`, `/focus`, `/done`, `/buglist`, `/featreq` slash commands
- Task Dashboard: zero-dependency browser UI with CRUD, kanban, DevLog integration (http://127.0.0.1:3847)
- Docker multi-agent infrastructure: Dockerfile, docker-compose, agent-runner, orchestrator, Codex support
- Agent personas: Architect, Engineer, Pentester, BrowserAgent, QATester
- CORE skill: CONSTITUTION, SkillSystem, Overwatch skill
- Tools: `init-devlog`, `self-test`, `validate-protected`, `bootstrap.sh`
- Python RAG search for devlogs (ChromaDB + sentence-transformers)
