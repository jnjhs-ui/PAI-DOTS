# Skill System

How to create and organize skills for PAI-DOTS.

## What Is a Skill?

A skill is a self-contained package of knowledge that Claude loads when relevant context is detected. Skills are `.md` files in `~/.claude/skills/<name>/`.

## Skill Structure

```
~/.claude/skills/<name>/
├── skill.md          # Main content (required)
└── [additional.md]   # Optional supplementary docs
```

### skill.md Format

```markdown
# Skill Name

Brief description of what this skill provides.

## When to Use

[Triggers — what context or user requests should activate this skill]

## [Domain-Specific Sections]

[The actual knowledge, patterns, procedures, code examples]

## Files

[List of files in this skill directory]
```

## Skill Types

### 1. Hook Skills (active)
Skills that include executable code triggered by hooks. Example: Overwatch (intent parsing, sweep trigger).

### 2. Reference Skills (passive)
Skills that provide knowledge Claude reads when relevant. Add your own domain-specific playbooks here.

### 3. Command Skills (interactive)
Skills that define slash commands. Example: task-system commands (/task, /done, /focus).

## Creating a New Skill

1. Create the directory: `mkdir -p ~/.claude/skills/<name>/`
2. Write `skill.md` with the knowledge you want Claude to have
3. If it needs hooks, add them to `~/.claude/hooks/` and wire in `settings.json`
4. If it needs commands, add `.md` files to `~/.claude/commands/`

## Best Practices

- **Keep skills focused** — one domain per skill
- **Use code examples** — concrete patterns over abstract descriptions
- **Include "when to use" triggers** — helps Claude know when to load the skill
- **Generic over specific** — skills should work across projects when possible
- **Progressive disclosure** — put the most important info first, details later
