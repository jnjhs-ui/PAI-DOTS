#!/usr/bin/env bun
/**
 * init-devlog — Initialize a .devlog/ directory in the current project
 *
 * Usage: bun ~/.claude/tools/init-devlog.ts [--no-gitignore]
 *
 * Creates:
 *   .devlog/SESSION.md     — live session state (focus, pending resume)
 *   .devlog/YYYY-MM-DD.md  — today's log
 *   .gitignore entry       — unless --no-gitignore
 */

import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const noGitignore = args.includes('--no-gitignore');

const cwd = process.cwd();
const devlogDir = path.join(cwd, '.devlog');

// Check if already initialized
if (fs.existsSync(devlogDir)) {
  console.log(`  .devlog/ already exists at ${devlogDir}`);
  console.log('  Nothing to do.');
  process.exit(0);
}

// Create .devlog/
fs.mkdirSync(devlogDir, { recursive: true });
console.log(`  Created: .devlog/`);

// Create SESSION.md
const sessionContent = `# Session State

## FOCUS
None. Run \`/focus\` to set one.

## Pending Resume
None.

## Context
Project initialized with PAI-DOTS devlog.
`;
fs.writeFileSync(path.join(devlogDir, 'SESSION.md'), sessionContent);
console.log('  Created: .devlog/SESSION.md');

// Create today's devlog
const today = new Date().toISOString().slice(0, 10);
const todayContent = `# DevLog: ${today}

## Goal
[awaiting user direction]

## Constraints
[none yet]

---

## Session Log

`;
fs.writeFileSync(path.join(devlogDir, `${today}.md`), todayContent);
console.log(`  Created: .devlog/${today}.md`);

// Add to .gitignore
if (!noGitignore) {
  const gitignorePath = path.join(cwd, '.gitignore');
  const entry = '\n# PAI-DOTS devlog (session state, not for version control)\n.devlog/\n';

  if (fs.existsSync(gitignorePath)) {
    const existing = fs.readFileSync(gitignorePath, 'utf-8');
    if (!existing.includes('.devlog/')) {
      fs.appendFileSync(gitignorePath, entry);
      console.log('  Added .devlog/ to .gitignore');
    } else {
      console.log('  .gitignore already includes .devlog/ — skipped');
    }
  } else {
    fs.writeFileSync(gitignorePath, entry.trimStart());
    console.log('  Created .gitignore with .devlog/ entry');
  }
} else {
  console.log('  Skipped .gitignore (--no-gitignore)');
}

console.log('');
console.log(`  DevLog ready at ${devlogDir}`);
console.log('  Hooks will now write session events to this project.');
console.log('  Run /focus to set your first task.');
